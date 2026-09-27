/**
 * Intrusion Probability controller (thesis section 4): Mamdani, 12 rules.
 *
 *   inputs   NP    packet count in a flow   [0, 15]     Gaussians
 *            Rate  packets per second       [0, 3000]   Gaussians
 *            We    weight (in x out packets) [0, 250]   Gaussians
 *   output   IP    intrusion probability    [0, 100]    four Gaussians
 *
 *   rule strength    min                        (eq. 4.8)
 *   implication      clip at the rule strength
 *   aggregation      max                        (eq. 4.9)
 *   defuzzification  centre of gravity (eq. 4.10) as a sum with step 0.2
 *
 * The assignment writes the Gaussians as exp(-(x - c)^2 / k); FuzzyIS "gauss"
 * terms take [sigma, center] with sigma = sqrt(k / 2).
 */
const engine = require("../engine");

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const ranges = {
  packets: { min: 0, max: 15 },
  rate: { min: 0, max: 3000 },
  weight: { min: 0, max: 250 },
};

const gauss = (center, sigma) => ({ type: "gauss", params: [sigma, center] });

const variables = {
  NP: engine.defineVariable("NP", [0, 15], {
    low: gauss(3, 2.5), // k = 12.5
    medium: gauss(9.5, 1.5), // k = 4.5
    high: gauss(15, 2), // k = 8
  }),
  Rate: engine.defineVariable("Rate", [0, 3000], {
    low: gauss(15, 20), // k = 800
    medium: gauss(150, 50), // k = 5000
    high: gauss(1500, 500), // k = 500000
  }),
  We: engine.defineVariable("We", [0, 250], {
    low: gauss(1, 40), // k = 3200
    medium: gauss(141.5, 10), // k = 200
    high: gauss(245, 35), // k = 2450
  }),
  IP: engine.defineVariable("IP", [0, 100], {
    none: gauss(0, 12), // k = 288
    low: gauss(30, 10), // k = 200
    medium: gauss(60, 12), // k = 288
    high: gauss(100, 15), // k = 450
  }),
};

// Rule base: [NP, Rate, We] -> IP
const rules = [
  [["medium", "low", "medium"], "none"], //  1
  [["low", "low", "medium"], "none"], //  2
  [["medium", "medium", "medium"], "low"], //  3
  [["medium", "low", "low"], "medium"], //  4
  [["low", "medium", "low"], "medium"], //  5
  [["high", "low", "high"], "medium"], //  6
  [["low", "high", "medium"], "medium"], //  7
  [["high", "high", "low"], "high"], //  8
  [["high", "high", "high"], "high"], //  9
  [["high", "medium", "high"], "high"], // 10
  [["medium", "high", "high"], "high"], // 11
  [["low", "high", "low"], "high"], // 12
];

// Input keys (packets, rate, weight) are the API / UI names of NP, Rate, We.
const system = engine.defineSystem({
  name: "Intrusion Probability Controller",
  inputs: [
    { key: "packets", symbol: "NP", variable: variables.NP },
    { key: "rate", symbol: "Rate", variable: variables.Rate },
    { key: "weight", symbol: "We", variable: variables.We },
  ],
  output: variables.IP,
  rules,
});

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

const TNORM = "min";
const COG_STEP = 0.2;

function calculate(inputs) {
  // 1. Fuzzification
  const memberships = {
    packets: engine.fuzzify(variables.NP, inputs.packets),
    rate: engine.fuzzify(variables.Rate, inputs.rate),
    weight: engine.fuzzify(variables.We, inputs.weight),
  };
  // 2. Rule strength (min)
  const evaluations = engine.evaluateRules(system, memberships, TNORM);
  // 3. Clip heights and aggregated set (max-min)
  const activations = engine.mamdaniActivations(variables.IP, evaluations);
  const union = engine.aggregatedUnion(variables.IP, activations);
  // 4. Discrete centre of gravity
  const { value: centroid, series } = engine.discreteCentroid(union, variables.IP.range, COG_STEP);
  const value = centroid ?? 0;

  const outputMemberships = engine.fuzzify(variables.IP, value);
  return {
    value,
    dominantTerm: engine.argmaxTerm(outputMemberships) ?? "N/A",
    membershipData: { ...memberships, intrusion: outputMemberships },
    ruleOutputs: activations,
    ruleEvaluations: engine.publicRuleEvaluations(evaluations),
    aggregatedOutput: series,
  };
}

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

function membershipFunctions() {
  return {
    inputs: {
      packets: engine.sampleVariable(variables.NP, 0.05, ranges.packets.max),
      rate: engine.sampleVariable(variables.Rate, 5, ranges.rate.max),
      weight: engine.sampleVariable(variables.We, 0.5, ranges.weight.max),
    },
    output: {
      intrusion: engine.sampleVariable(variables.IP, 0.5, 100),
    },
    meta: {
      inputKeys: ["packets", "rate", "weight"],
      inputDomains: ranges,
      outputKey: "intrusion",
    },
  };
}

module.exports = {
  system,
  variables,
  ranges,
  calculate,
  membershipFunctions,
};

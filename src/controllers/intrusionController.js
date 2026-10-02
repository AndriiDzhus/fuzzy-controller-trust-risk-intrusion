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
 *
 * Two variants share this code:
 *   base     the expert model of the assignment (BASE_PARAMS)
 *   trained  the model found by the genetic algorithm (src/training/genetic.js):
 *            new Gaussians of all variables and a new structure of the 12 rules.
 *            Its Rate input is on the logarithmic scale lg(1 + pps), [0, 7],
 *            because Rate in CICIoT2023 spans 0 … 8·10⁶ pps.
 *            Parameters come from trained/intrusion.json.
 */
const engine = require("../engine");
const trainedFile = require("./trained/intrusion.json");

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const INPUTS = [
  { symbol: "NP", key: "packets" },
  { symbol: "Rate", key: "rate" },
  { symbol: "We", key: "weight" },
];
const INPUT_TERMS = ["low", "medium", "high"];
const OUTPUT_TERMS = ["none", "low", "medium", "high"];

const gauss = (center, sigma) => ({ type: "gauss", params: [sigma, center] });

/** Expert model of the assignment. */
const BASE_PARAMS = {
  rateScale: "linear",
  ranges: {
    packets: { min: 0, max: 15 },
    rate: { min: 0, max: 3000 },
    weight: { min: 0, max: 250 },
  },
  inputs: {
    NP: {
      low: gauss(3, 2.5), // k = 12.5
      medium: gauss(9.5, 1.5), // k = 4.5
      high: gauss(15, 2), // k = 8
    },
    Rate: {
      low: gauss(15, 20), // k = 800
      medium: gauss(150, 50), // k = 5000
      high: gauss(1500, 500), // k = 500000
    },
    We: {
      low: gauss(1, 40), // k = 3200
      medium: gauss(141.5, 10), // k = 200
      high: gauss(245, 35), // k = 2450
    },
  },
  output: {
    none: gauss(0, 12), // k = 288
    low: gauss(30, 10), // k = 200
    medium: gauss(60, 12), // k = 288
    high: gauss(100, 15), // k = 450
  },
  // Rule base: [NP, Rate, We] -> IP
  rules: [
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
  ],
};

/** Log scale of the trained model: lg(1 + pps). */
const LOG_RATE_MAX = 7;
const toLogRate = (pps) => Math.log10(1 + Math.max(0, pps));

const TNORM = "min";
const COG_STEP = 0.2;

/**
 * Builds a controller from membership parameters and a rule base.
 * @param {typeof BASE_PARAMS} params
 * @param {{variant: string, training?: object}} meta
 */
function buildModel(params, meta = { variant: "base" }) {
  const { ranges } = params;
  const variables = {};
  INPUTS.forEach(({ symbol, key }) => {
    variables[symbol] = engine.defineVariable(
      symbol,
      [ranges[key].min, ranges[key].max],
      params.inputs[symbol]
    );
  });
  variables.IP = engine.defineVariable("IP", [0, 100], params.output);

  // Input keys (packets, rate, weight) are the API / UI names of NP, Rate, We.
  const system = engine.defineSystem({
    name: "Intrusion Probability Controller",
    inputs: INPUTS.map(({ key, symbol }) => ({ key, symbol, variable: variables[symbol] })),
    output: variables.IP,
    rules: params.rules,
  });

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

  function membershipFunctions() {
    return {
      inputs: {
        packets: engine.sampleVariable(variables.NP, 0.05, ranges.packets.max),
        rate: engine.sampleVariable(
          variables.Rate,
          params.rateScale === "log10p1" ? 0.01 : 5,
          ranges.rate.max
        ),
        weight: engine.sampleVariable(variables.We, 0.5, ranges.weight.max),
      },
      output: {
        intrusion: engine.sampleVariable(variables.IP, 0.5, 100),
      },
      meta: {
        variant: meta.variant,
        rateScale: params.rateScale,
        inputKeys: INPUTS.map(({ key }) => key),
        inputDomains: ranges,
        outputKey: "intrusion",
        params,
        training: meta.training || null,
      },
    };
  }

  return {
    variant: meta.variant,
    params,
    system,
    variables,
    ranges,
    rules: params.rules,
    calculate,
    membershipFunctions,
    training: meta.training || null,
  };
}

const base = buildModel(BASE_PARAMS, { variant: "base" });

// trained/intrusion.json holds {status: "untrained"} until the genetic
// optimisation has been run (npm run train:intrusion).
const trained =
  trainedFile && trainedFile.status === "trained"
    ? buildModel(trainedFile.params, { variant: "trained", training: trainedFile.training })
    : null;

module.exports = {
  // The base model keeps the original interface of the module.
  system: base.system,
  variables: base.variables,
  ranges: base.ranges,
  calculate: base.calculate,
  membershipFunctions: base.membershipFunctions,
  // Variants and the pieces the genetic optimisation needs.
  variants: { base, trained },
  buildModel,
  BASE_PARAMS,
  INPUTS,
  INPUT_TERMS,
  OUTPUT_TERMS,
  TNORM,
  COG_STEP,
  LOG_RATE_MAX,
  toLogRate,
};

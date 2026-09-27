/**
 * Security Risk controller (thesis section 3): Sugeno of zero order, 6 rules.
 *
 *   inputs   EC   energy consumption  [0, 0.05] kWh/GB  triangles
 *            TP   transmit power      [0, 40] dBm       triangles
 *            Lat  latency             [0, 10] ms        triangles
 *   output   SR   security risk       singletons {0, 20, 40, 60, 80, 100}
 *
 *   rule weight       w = mu(EC)·mu(TP)·mu(Lat)  algebraic product (eq. 3.5)
 *   normalisation     w̄ = w / Σ w                (eq. 3.6–3.7)
 *   consequents       Y = w̄ ⊙ C                  (eq. 3.8–3.9)
 *   output            SR = Σ Y = Σ w̄·c           (full contraction of Y)
 *
 * The rule base is sparse by design (6 of 27 combinations). When no rule fires
 * the controller reports noRuleFired instead of inventing a value.
 */
const engine = require("../engine");

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const ranges = {
  energy: { min: 0, max: 0.05 },
  strength: { min: 0, max: 40 },
  response: { min: 0, max: 10 },
};

// Assignment terms: L = left shoulder, M = triangle, H = right ramp. On the
// validated domain [0, max] these triangles coincide with the assignment's
// piecewise formulas.
function lowMediumHigh(peak, max) {
  return {
    low: { type: "triangle", params: [0, 0, peak] },
    medium: { type: "triangle", params: [0, peak, max] },
    high: { type: "triangle", params: [peak, max, max] },
  };
}

const variables = {
  EC: engine.defineVariable("EC", [0, 0.05], lowMediumHigh(0.025, 0.05)),
  TP: engine.defineVariable("TP", [0, 40], lowMediumHigh(20, 40)),
  Lat: engine.defineVariable("Lat", [0, 10], lowMediumHigh(5, 10)),
  SR: engine.defineVariable("SR", [0, 100], {
    none: { type: "singleton", params: [0] },
    veryLow: { type: "singleton", params: [20] },
    low: { type: "singleton", params: [40] },
    medium: { type: "singleton", params: [60] },
    high: { type: "singleton", params: [80] },
    veryHigh: { type: "singleton", params: [100] },
  }),
};

// Rule base, table 3.1: [EC, TP, Lat] -> SR
const rules = [
  [["low", "low", "low"], "none"],
  [["medium", "medium", "medium"], "veryLow"],
  [["high", "low", "low"], "low"],
  [["medium", "high", "medium"], "medium"],
  [["high", "medium", "high"], "high"],
  [["high", "high", "high"], "veryHigh"],
];

// Input keys (energy, strength, response) are the API / UI names of EC, TP, Lat.
const system = engine.defineSystem({
  name: "Security Risk Controller",
  inputs: [
    { key: "energy", symbol: "EC", variable: variables.EC },
    { key: "strength", symbol: "TP", variable: variables.TP },
    { key: "response", symbol: "Lat", variable: variables.Lat },
  ],
  output: variables.SR,
  rules,
});

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

const TNORM = "product";

function calculate(inputs) {
  // Layer 1. Fuzzification
  const memberships = {
    energy: engine.fuzzify(variables.EC, inputs.energy),
    strength: engine.fuzzify(variables.TP, inputs.strength),
    response: engine.fuzzify(variables.Lat, inputs.response),
  };
  // Layer 2. Rule weights (algebraic product)
  const evaluations = engine.evaluateRules(system, memberships, TNORM);
  // Layers 3–5. Normalisation, weighted consequents, weighted sum
  const sugeno = engine.sugenoWeightedSum(variables.SR, evaluations);

  return {
    value: sugeno.value,
    // Singleton with the largest rule weight; ties keep the term order.
    dominantTerm: sugeno.noRuleFired ? null : engine.argmaxTerm(sugeno.weights),
    noRuleFired: sugeno.noRuleFired,
    membershipData: { ...memberships, risk: sugeno.normalizedWeights },
    ruleOutputs: sugeno.weights,
    normalizedOutputs: sugeno.normalizedWeights,
    weightedConsequents: sugeno.weightedConsequents,
    ruleEvaluations: engine.publicRuleEvaluations(evaluations),
  };
}

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

function membershipFunctions() {
  return {
    inputs: {
      energy: engine.sampleVariable(variables.EC, 0.0005, ranges.energy.max),
      strength: engine.sampleVariable(variables.TP, 0.2, ranges.strength.max),
      response: engine.sampleVariable(variables.Lat, 0.05, ranges.response.max),
    },
    output: {
      risk: {},
    },
    meta: {
      inputKeys: ["energy", "strength", "response"],
      inputDomains: ranges,
      outputKey: "risk",
      singletonValues: engine.singletonPositions(variables.SR),
      tnorm: TNORM,
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

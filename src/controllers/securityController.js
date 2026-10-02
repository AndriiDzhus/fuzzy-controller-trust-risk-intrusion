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
 *
 * Two variants share this code:
 *   base     the expert model of the assignment (BASE_PARAMS)
 *   trained  the same 6 rules after ANFIS training (src/training/anfis.js):
 *            new break points of the input triangles and new consequents.
 *            Parameters come from trained/security.json.
 */
const engine = require("../engine");
const trainedFile = require("./trained/security.json");

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const ranges = {
  energy: { min: 0, max: 0.05 },
  strength: { min: 0, max: 40 },
  response: { min: 0, max: 10 },
};

/** Input variables: symbol, API key and universe. */
const INPUTS = [
  { symbol: "EC", key: "energy", range: [0, 0.05], chartStep: 0.0005 },
  { symbol: "TP", key: "strength", range: [0, 40], chartStep: 0.2 },
  { symbol: "Lat", key: "response", range: [0, 10], chartStep: 0.05 },
];

const OUTPUT_TERMS = ["none", "veryLow", "low", "medium", "high", "veryHigh"];

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

/** Expert model of the assignment. */
const BASE_PARAMS = {
  inputs: {
    EC: lowMediumHigh(0.025, 0.05),
    TP: lowMediumHigh(20, 40),
    Lat: lowMediumHigh(5, 10),
  },
  consequents: { none: 0, veryLow: 20, low: 40, medium: 60, high: 80, veryHigh: 100 },
};

// Rule base, table 3.1: [EC, TP, Lat] -> SR. Fixed: training keeps the mask.
const rules = [
  [["low", "low", "low"], "none"],
  [["medium", "medium", "medium"], "veryLow"],
  [["high", "low", "low"], "low"],
  [["medium", "high", "medium"], "medium"],
  [["high", "medium", "high"], "high"],
  [["high", "high", "high"], "veryHigh"],
];

const TNORM = "product";

/**
 * Builds a controller from membership parameters and consequents.
 * @param {typeof BASE_PARAMS} params
 * @param {{variant: string, training?: object}} meta
 */
function buildModel(params, meta = { variant: "base" }) {
  const variables = {};
  INPUTS.forEach(({ symbol, range }) => {
    variables[symbol] = engine.defineVariable(symbol, range, params.inputs[symbol]);
  });
  const singletons = {};
  OUTPUT_TERMS.forEach((term) => {
    singletons[term] = { type: "singleton", params: [params.consequents[term]] };
  });
  variables.SR = engine.defineVariable("SR", [0, 100], singletons);

  // Input keys (energy, strength, response) are the API / UI names of EC, TP, Lat.
  const system = engine.defineSystem({
    name: "Security Risk Controller",
    inputs: INPUTS.map(({ key, symbol }) => ({ key, symbol, variable: variables[symbol] })),
    output: variables.SR,
    rules,
  });

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

  function membershipFunctions() {
    const inputsData = {};
    INPUTS.forEach(({ key, symbol, range, chartStep }) => {
      inputsData[key] = engine.sampleVariable(variables[symbol], chartStep, range[1]);
    });
    return {
      inputs: inputsData,
      output: {
        risk: {},
      },
      meta: {
        variant: meta.variant,
        inputKeys: INPUTS.map(({ key }) => key),
        inputDomains: ranges,
        outputKey: "risk",
        singletonValues: engine.singletonPositions(variables.SR),
        tnorm: TNORM,
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
    rules,
    calculate,
    membershipFunctions,
    training: meta.training || null,
  };
}

const base = buildModel(BASE_PARAMS, { variant: "base" });

// trained/security.json holds {status: "untrained"} until the ANFIS training
// has been run (npm run train:security) on expert-labelled data.
const trained =
  trainedFile && trainedFile.status === "trained"
    ? buildModel(trainedFile.params, { variant: "trained", training: trainedFile.training })
    : null;

module.exports = {
  // The base model keeps the original interface of the module.
  system: base.system,
  variables: base.variables,
  ranges,
  calculate: base.calculate,
  membershipFunctions: base.membershipFunctions,
  // Variants and the pieces the ANFIS training needs.
  variants: { base, trained },
  buildModel,
  BASE_PARAMS,
  INPUTS,
  OUTPUT_TERMS,
  rules,
};

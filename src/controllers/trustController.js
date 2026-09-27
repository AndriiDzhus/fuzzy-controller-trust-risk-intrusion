/**
 * Trust Index controller (thesis section 2): Mamdani, 27 rules.
 *
 *   inputs   ER  SYN error rate (serror_rate)       [0, 1]    trapezoids
 *            CC  connection count per 2 s (count)   [0, 200]  trapezoids
 *            BS  log10 of source bytes (src_bytes)  [0, 12]   trapezoids
 *   output   TI  trust index                        [0, 100]  five triangles
 *
 *   rule strength    min                         (eq. 2.16)
 *   implication      clip at the rule strength   (eq. 2.17)
 *   aggregation      max                         (eq. 2.18)
 *   defuzzification  exact analytic centre of gravity of the clipped
 *                    polygon                     (eq. 2.22–2.28)
 *
 * Term names are PascalCase, as in the first FuzzyIS version of the model.
 */
const engine = require("../engine");

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

const ranges = {
  errors: { min: 0, max: 1 },
  connections: { min: 0, max: 200 },
  bytes: { min: 0, max: 12 },
};

const variables = {
  ER: engine.defineVariable("ER", [0, 1], {
    Low: { type: "trapeze", params: [0, 0, 0.05, 0.15] },
    Medium: { type: "trapeze", params: [0.05, 0.15, 0.4, 0.6] },
    High: { type: "trapeze", params: [0.4, 0.6, 1, 1] },
  }),
  CC: engine.defineVariable("CC", [0, 200], {
    Low: { type: "trapeze", params: [0, 0, 15, 30] },
    Medium: { type: "trapeze", params: [15, 30, 80, 120] },
    High: { type: "trapeze", params: [80, 120, 200, 200] },
  }),
  BS: engine.defineVariable("BS", [0, 12], {
    Low: { type: "trapeze", params: [0, 0, 4, 6.5] },
    Medium: { type: "trapeze", params: [4, 6.5, 9, 11] },
    High: { type: "trapeze", params: [9, 11, 12, 12] },
  }),
  TI: engine.defineVariable("TI", [0, 100], {
    VeryLow: { type: "triangle", params: [0, 0, 25] },
    Low: { type: "triangle", params: [0, 25, 50] },
    Medium: { type: "triangle", params: [25, 50, 75] },
    High: { type: "triangle", params: [50, 75, 100] },
    VeryHigh: { type: "triangle", params: [75, 100, 100] },
  }),
};

// Rule base, table 2.1: [ER, CC, BS] -> TI
const rules = [
  [["Low", "Low", "Low"], "VeryHigh"], //  1
  [["Low", "Low", "Medium"], "High"], //  2
  [["Low", "Low", "High"], "Medium"], //  3
  [["Low", "Medium", "Low"], "High"], //  4
  [["Low", "Medium", "Medium"], "Medium"], //  5
  [["Low", "Medium", "High"], "Low"], //  6
  [["Low", "High", "Low"], "Low"], //  7
  [["Low", "High", "Medium"], "Low"], //  8
  [["Low", "High", "High"], "VeryLow"], //  9
  [["Medium", "Low", "Low"], "Medium"], // 10
  [["Medium", "Low", "Medium"], "Medium"], // 11
  [["Medium", "Low", "High"], "Low"], // 12
  [["Medium", "Medium", "Low"], "Low"], // 13
  [["Medium", "Medium", "Medium"], "Low"], // 14
  [["Medium", "Medium", "High"], "VeryLow"], // 15
  [["Medium", "High", "Low"], "VeryLow"], // 16
  [["Medium", "High", "Medium"], "VeryLow"], // 17
  [["Medium", "High", "High"], "VeryLow"], // 18
  [["High", "Low", "Low"], "Low"], // 19
  [["High", "Low", "Medium"], "VeryLow"], // 20
  [["High", "Low", "High"], "VeryLow"], // 21
  [["High", "Medium", "Low"], "VeryLow"], // 22
  [["High", "Medium", "Medium"], "VeryLow"], // 23
  [["High", "Medium", "High"], "VeryLow"], // 24
  [["High", "High", "Low"], "VeryLow"], // 25
  [["High", "High", "Medium"], "VeryLow"], // 26
  [["High", "High", "High"], "VeryLow"], // 27
];

// Input keys (errors, connections, bytes) are the API / UI names.
const system = engine.defineSystem({
  name: "Trust Index Controller",
  inputs: [
    { key: "errors", symbol: "ER", variable: variables.ER },
    { key: "connections", symbol: "CC", variable: variables.CC },
    { key: "bytes", symbol: "BS", variable: variables.BS },
  ],
  output: variables.TI,
  rules,
});

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

const TNORM = "min";
const FALLBACK_COG_STEP = 0.2;

/** Aggregated set sampled for the chart, including the polygon corners. */
function sampleAggregatedSet(union, activations) {
  const [start, end] = variables.TI.range;
  const xs = new Set();
  for (let i = 0; i <= 100; i += 1) xs.add(start + (i / 100) * (end - start));
  engine.aggregatedBreakPoints(variables.TI, activations).forEach((x) => xs.add(x));
  return [...xs].sort((a, b) => a - b).map((x) => ({ x, y: union.valueAt(x) }));
}

function calculate(inputs) {
  // 1. Fuzzification
  const memberships = {
    errors: engine.fuzzify(variables.ER, inputs.errors),
    connections: engine.fuzzify(variables.CC, inputs.connections),
    bytes: engine.fuzzify(variables.BS, inputs.bytes),
  };
  // 2. Rule strength (min)
  const evaluations = engine.evaluateRules(system, memberships, TNORM);
  // 3. Clip heights and aggregated set (max-min)
  const activations = engine.mamdaniActivations(variables.TI, evaluations);
  const union = engine.aggregatedUnion(variables.TI, activations);
  // 4. Exact centre of gravity
  const exact = engine.exactCentroid(union, variables.TI, activations);
  const value =
    exact ?? engine.discreteCentroid(union, variables.TI.range, FALLBACK_COG_STEP).value ?? 0;

  const outputMemberships = engine.fuzzify(variables.TI, value);
  return {
    value,
    dominantTerm: engine.argmaxTerm(outputMemberships) ?? "N/A",
    membershipData: { ...memberships, trustIndex: outputMemberships },
    ruleOutputs: activations,
    ruleEvaluations: engine.publicRuleEvaluations(evaluations),
    aggregatedOutput: sampleAggregatedSet(union, activations),
  };
}

// ---------------------------------------------------------------------------
// Chart data
// ---------------------------------------------------------------------------

function membershipFunctions() {
  return {
    inputs: {
      errors: engine.sampleVariable(variables.ER, 0.01, ranges.errors.max),
      connections: engine.sampleVariable(variables.CC, 1, ranges.connections.max),
      bytes: engine.sampleVariable(variables.BS, 0.05, ranges.bytes.max),
    },
    output: {
      trustIndex: engine.sampleVariable(variables.TI, 1, 100),
    },
    meta: {
      inputKeys: ["errors", "connections", "bytes"],
      outputKey: "trustIndex",
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

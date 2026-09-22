const fuzzyis = require("fuzzyis");
const CorrectedTerm = require("fuzzyis/lib/CorrectedTerm");
const UnionOfTerms = require("fuzzyis/lib/UnionOfTerms");
const mfTypes = require("fuzzyis/lib/mfTypes");

// Import required components from fuzzyis
const { LinguisticVariable, Term, Rule, FIS } = fuzzyis;

function trapezoidalMF(x, a, b, c, d) {
  if (x < a || x > d) return 0;
  if (x >= b && x <= c) return 1;
  if (x >= a && x < b) return (x - a) / (b - a || 1);
  if (x > c && x <= d) return (d - x) / (d - c || 1);
  return 0;
}

function triangularMF(x, a, b, c) {
  if (x < a || x > c) return 0;
  if (a === b) {
    if (x >= a && x <= c) return (c - x) / (c - a || 1);
  } else if (b === c) {
    if (x >= a && x <= b) return (x - a) / (b - a || 1);
  } else {
    if (x >= a && x <= b) return (x - a) / (b - a || 1);
    if (x > b && x <= c) return (c - x) / (c - b || 1);
  }
  return 0;
}

// fuzzyis divides by (maxLeft - left) and yields NaN on left-shoulder
// terms like [0, 0, 30, 50] when the input is exactly 0.
mfTypes.trapeze = trapezoidalMF;
mfTypes.triangle = triangularMF;

// --- Fuzzy Logic Controller Implementation using FuzzyIS ---

// Create a new fuzzy inference system
const fuzzySystem = new FIS("Trust Index Controller");

// Create input linguistic variables
const errors = new LinguisticVariable("errors", [0, 1]);
const connections = new LinguisticVariable("connections", [0, 200]);
const bytes = new LinguisticVariable("bytes", [0, 12]);

// Create output linguistic variable
const trustIndex = new LinguisticVariable("trustIndex", [0, 100]);

// Error rate ER (serror_rate), domain [0, 1]
errors.addTerm(new Term("Low", "trapeze", [0, 0, 0.05, 0.15]));
errors.addTerm(new Term("Medium", "trapeze", [0.05, 0.15, 0.4, 0.6]));
errors.addTerm(new Term("High", "trapeze", [0.4, 0.6, 1, 1]));

// Connection count CC (count), domain [0, 200]
connections.addTerm(new Term("Low", "trapeze", [0, 0, 15, 30]));
connections.addTerm(new Term("Medium", "trapeze", [15, 30, 80, 120]));
connections.addTerm(new Term("High", "trapeze", [80, 120, 200, 200]));

// Source bytes BS as log10(src_bytes), domain [0, 12]
bytes.addTerm(new Term("Low", "trapeze", [0, 0, 4, 6.5]));
bytes.addTerm(new Term("Medium", "trapeze", [4, 6.5, 9, 11]));
bytes.addTerm(new Term("High", "trapeze", [9, 11, 12, 12]));

// Trust Index TI
trustIndex.addTerm(new Term("VeryLow", "triangle", [0, 0, 25]));
trustIndex.addTerm(new Term("Low", "triangle", [0, 25, 50]));
trustIndex.addTerm(new Term("Medium", "triangle", [25, 50, 75]));
trustIndex.addTerm(new Term("High", "triangle", [50, 75, 100]));
trustIndex.addTerm(new Term("VeryHigh", "triangle", [75, 100, 100]));

// Add variables to the system
fuzzySystem.addInput(errors);
fuzzySystem.addInput(connections);
fuzzySystem.addInput(bytes);
fuzzySystem.addOutput(trustIndex);

// Create fuzzy inference rules based on the rule table
// Order: [E, C, B] -> [T]
fuzzySystem.rules = [
  // ER = Low
  new Rule(["Low", "Low", "Low"], ["VeryHigh"], "and"),       // 1
  new Rule(["Low", "Low", "Medium"], ["High"], "and"),        // 2
  new Rule(["Low", "Low", "High"], ["Medium"], "and"),        // 3
  new Rule(["Low", "Medium", "Low"], ["High"], "and"),        // 4
  new Rule(["Low", "Medium", "Medium"], ["Medium"], "and"),   // 5
  new Rule(["Low", "Medium", "High"], ["Low"], "and"),        // 6
  new Rule(["Low", "High", "Low"], ["Low"], "and"),           // 7
  new Rule(["Low", "High", "Medium"], ["Low"], "and"),        // 8
  new Rule(["Low", "High", "High"], ["VeryLow"], "and"),      // 9

  // ER = Medium
  new Rule(["Medium", "Low", "Low"], ["Medium"], "and"),      // 10
  new Rule(["Medium", "Low", "Medium"], ["Medium"], "and"),   // 11
  new Rule(["Medium", "Low", "High"], ["Low"], "and"),        // 12
  new Rule(["Medium", "Medium", "Low"], ["Low"], "and"),      // 13
  new Rule(["Medium", "Medium", "Medium"], ["Low"], "and"),   // 14
  new Rule(["Medium", "Medium", "High"], ["VeryLow"], "and"), // 15
  new Rule(["Medium", "High", "Low"], ["VeryLow"], "and"),    // 16
  new Rule(["Medium", "High", "Medium"], ["VeryLow"], "and"), // 17
  new Rule(["Medium", "High", "High"], ["VeryLow"], "and"),   // 18

  // ER = High
  new Rule(["High", "Low", "Low"], ["Low"], "and"),           // 19
  new Rule(["High", "Low", "Medium"], ["VeryLow"], "and"),    // 20
  new Rule(["High", "Low", "High"], ["VeryLow"], "and"),      // 21
  new Rule(["High", "Medium", "Low"], ["VeryLow"], "and"),    // 22
  new Rule(["High", "Medium", "Medium"], ["VeryLow"], "and"), // 23
  new Rule(["High", "Medium", "High"], ["VeryLow"], "and"),   // 24
  new Rule(["High", "High", "Low"], ["VeryLow"], "and"),      // 25
  new Rule(["High", "High", "Medium"], ["VeryLow"], "and"),   // 26
  new Rule(["High", "High", "High"], ["VeryLow"], "and"),     // 27
];

// Membership function parameters for visualization
const membershipParams = {
  errors: {
    Low: { type: "trapeze", params: [0, 0, 0.05, 0.15] },
    Medium: { type: "trapeze", params: [0.05, 0.15, 0.4, 0.6] },
    High: { type: "trapeze", params: [0.4, 0.6, 1, 1] },
  },
  connections: {
    Low: { type: "trapeze", params: [0, 0, 15, 30] },
    Medium: { type: "trapeze", params: [15, 30, 80, 120] },
    High: { type: "trapeze", params: [80, 120, 200, 200] },
  },
  bytes: {
    Low: { type: "trapeze", params: [0, 0, 4, 6.5] },
    Medium: { type: "trapeze", params: [4, 6.5, 9, 11] },
    High: { type: "trapeze", params: [9, 11, 12, 12] },
  },
  trustIndex: {
    VeryLow: { type: "triangle", params: [0, 0, 25] },
    Low: { type: "triangle", params: [0, 25, 50] },
    Medium: { type: "triangle", params: [25, 50, 75] },
    High: { type: "triangle", params: [50, 75, 100] },
    VeryHigh: { type: "triangle", params: [75, 100, 100] },
  },
};

function buildOutputUnion() {
  const output = fuzzySystem.outputs[0];
  const corrected = fuzzySystem.rules.map((rule) => {
    const term = output.findTerm(rule.conclusions[0]);
    return new CorrectedTerm(term, rule.beliefDegree || 0);
  });
  return new UnionOfTerms(corrected);
}

function inferTrustUnion(errorsVal, connectionsVal, bytesVal) {
  fuzzySystem.getPreciseOutput([errorsVal, connectionsVal, bytesVal]);
  return buildOutputUnion();
}

function centerOfGravity(union, range = [0, 100], step = 0.2) {
  const [start, end] = range;
  let numerator = 0;
  let denominator = 0;
  for (let x = start; x <= end + 1e-9; x += step) {
    const mu = union.valueAt(x);
    numerator += x * mu;
    denominator += mu;
  }
  if (denominator === 0) return 0;
  return Math.min(end, Math.max(start, numerator / denominator));
}

function calculateTrustIndex(errorsVal, connectionsVal, bytesVal) {
  const union = inferTrustUnion(errorsVal, connectionsVal, bytesVal);
  return centerOfGravity(union, fuzzySystem.outputs[0].range);
}

function getOutputTermActivations() {
  const activations = {};
  fuzzySystem.rules.forEach((rule) => {
    const term = rule.conclusions[0];
    if (!term) return;
    activations[term] = Math.max(activations[term] || 0, Number(rule.beliefDegree) || 0);
  });
  return activations;
}

function roundMu(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function getTrustRuleEvaluations(membershipData) {
  const inputs = [
    { key: "errors", symbol: "ER", terms: membershipData.errors || {} },
    { key: "connections", symbol: "CC", terms: membershipData.connections || {} },
    { key: "bytes", symbol: "BS", terms: membershipData.bytes || {} },
  ];
  return fuzzySystem.rules.map((rule, index) => {
    const conditions = inputs.map((input, i) => ({
      key: input.key,
      symbol: input.symbol,
      term: rule.conditions[i],
      mu: roundMu(input.terms[rule.conditions[i]]),
    }));
    return {
      index: index + 1,
      conditions,
      out: rule.conclusions[0],
      alpha: roundMu(Math.min(...conditions.map((item) => item.mu))),
    };
  });
}

function sampleAggregatedOutput(union, range, points = 100) {
  const [start, end] = range;
  const series = [];
  for (let i = 0; i <= points; i += 1) {
    const x = start + (i / points) * (end - start);
    series.push({ x, y: union.valueAt(x) });
  }
  return series;
}

function getAggregatedOutput(errorsVal, connectionsVal, bytesVal) {
  const union =
    Number.isFinite(errorsVal) &&
    Number.isFinite(connectionsVal) &&
    Number.isFinite(bytesVal)
      ? inferTrustUnion(errorsVal, connectionsVal, bytesVal)
      : buildOutputUnion();
  return sampleAggregatedOutput(union, fuzzySystem.outputs[0].range, 100);
}

// Calculate membership degrees
function calculateMembershipValues(variable, value) {
  const memberships = {};
  const params = membershipParams[variable] || {};
  Object.entries(params).forEach(([term, cfg]) => {
    memberships[term] =
      cfg.type === "trapeze"
        ? trapezoidalMF(value, ...cfg.params)
        : triangularMF(value, ...cfg.params);
  });
  return memberships;
}

// Find the most active linguistic term
function getMostActiveTerm(memberships) {
  let maxMembership = -1;
  let mostActiveTerm = "N/A";
  
  for (const [term, value] of Object.entries(memberships)) {
    if (value > maxMembership) {
      maxMembership = value;
      mostActiveTerm = term;
    }
  }
  
  return mostActiveTerm;
}

// Export functions and data
module.exports = {
  fuzzySystem,
  calculateTrustIndex,
  centerOfGravity,
  getAggregatedOutput,
  getOutputTermActivations,
  getTrustRuleEvaluations,
  calculateMembershipValues,
  getMostActiveTerm,
  membershipParams,
  trapezoidalMF,
  triangularMF,
};

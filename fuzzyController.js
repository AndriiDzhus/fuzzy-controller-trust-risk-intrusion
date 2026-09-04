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
const errors = new LinguisticVariable("errors", [0, 100]);
const connections = new LinguisticVariable("connections", [0, 100]);
const bytes = new LinguisticVariable("bytes", [0, 100]);

// Create output linguistic variable
const trustIndex = new LinguisticVariable("trustIndex", [0, 100]);

// Add terms for Errors (E) - error count
errors.addTerm(new Term("Low", "trapeze", [0, 0, 30, 50]));
errors.addTerm(new Term("Medium", "trapeze", [30, 50, 70, 90]));
errors.addTerm(new Term("High", "trapeze", [70, 90, 100, 100]));

// Add terms for Connections (C) - connection count
connections.addTerm(new Term("Low", "trapeze", [0, 0, 10, 30]));
connections.addTerm(new Term("Medium", "trapeze", [10, 30, 50, 70]));
connections.addTerm(new Term("High", "trapeze", [50, 70, 100, 100]));

// Add terms for Bytes (B) - byte count
bytes.addTerm(new Term("Low", "trapeze", [0, 0, 20, 40]));
bytes.addTerm(new Term("Medium", "trapeze", [20, 40, 60, 80]));
bytes.addTerm(new Term("High", "trapeze", [60, 80, 100, 100]));

// Add terms for Trust Index (T)
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
  // E = Low
  new Rule(["Low", "Low", "Low"], ["VeryHigh"], "and"),        // 1
  new Rule(["Low", "Low", "Medium"], ["VeryHigh"], "and"),     // 2
  new Rule(["Low", "Low", "High"], ["VeryHigh"], "and"),       // 3
  new Rule(["Low", "Medium", "Low"], ["VeryHigh"], "and"),     // 4
  new Rule(["Low", "Medium", "Medium"], ["VeryHigh"], "and"),  // 5
  new Rule(["Low", "Medium", "High"], ["High"], "and"),        // 6
  new Rule(["Low", "High", "Low"], ["High"], "and"),           // 7
  new Rule(["Low", "High", "Medium"], ["High"], "and"),        // 8
  new Rule(["Low", "High", "High"], ["High"], "and"),          // 9

  // E = Medium
  new Rule(["Medium", "Low", "Low"], ["High"], "and"),         // 10
  new Rule(["Medium", "Low", "Medium"], ["High"], "and"),      // 11
  new Rule(["Medium", "Low", "High"], ["Medium"], "and"),      // 12
  new Rule(["Medium", "Medium", "Low"], ["Medium"], "and"),    // 13
  new Rule(["Medium", "Medium", "Medium"], ["Medium"], "and"), // 14
  new Rule(["Medium", "Medium", "High"], ["Medium"], "and"),   // 15
  new Rule(["Medium", "High", "Low"], ["Medium"], "and"),      // 16
  new Rule(["Medium", "High", "Medium"], ["Low"], "and"),      // 17
  new Rule(["Medium", "High", "High"], ["Low"], "and"),        // 18

  // E = High
  new Rule(["High", "Low", "Low"], ["Low"], "and"),            // 19
  new Rule(["High", "Low", "Medium"], ["Low"], "and"),         // 20
  new Rule(["High", "Low", "High"], ["Low"], "and"),           // 21
  new Rule(["High", "Medium", "Low"], ["Low"], "and"),         // 22
  new Rule(["High", "Medium", "Medium"], ["VeryLow"], "and"),  // 23
  new Rule(["High", "Medium", "High"], ["VeryLow"], "and"),    // 24
  new Rule(["High", "High", "Low"], ["VeryLow"], "and"),       // 25
  new Rule(["High", "High", "Medium"], ["VeryLow"], "and"),    // 26
  new Rule(["High", "High", "High"], ["VeryLow"], "and"),      // 27
];

// Membership function parameters for visualization
const membershipParams = {
  errors: {
    Low: { type: "trapeze", params: [0, 0, 30, 50] },
    Medium: { type: "trapeze", params: [30, 50, 70, 90] },
    High: { type: "trapeze", params: [70, 90, 100, 100] },
  },
  connections: {
    Low: { type: "trapeze", params: [0, 0, 10, 30] },
    Medium: { type: "trapeze", params: [10, 30, 50, 70] },
    High: { type: "trapeze", params: [50, 70, 100, 100] },
  },
  bytes: {
    Low: { type: "trapeze", params: [0, 0, 20, 40] },
    Medium: { type: "trapeze", params: [20, 40, 60, 80] },
    High: { type: "trapeze", params: [60, 80, 100, 100] },
  },
  trustIndex: {
    VeryLow: { type: "triangle", params: [0, 0, 25] },
    Low: { type: "triangle", params: [0, 25, 50] },
    Medium: { type: "triangle", params: [25, 50, 75] },
    High: { type: "triangle", params: [50, 75, 100] },
    VeryHigh: { type: "triangle", params: [75, 100, 100] },
  },
};

// Calculate the trust index
function calculateTrustIndex(errorsVal, connectionsVal, bytesVal) {
  try {
    // Run fuzzy inference with fuzzyis
    const result = fuzzySystem.getPreciseOutput([
      errorsVal,
      connectionsVal,
      bytesVal,
    ]);
    
    return result[0]; // Return the first (and only) value from the result array
  } catch (error) {
    console.error("Error in fuzzy inference:", error);
    throw error;
  }
}

function buildOutputUnion() {
  const output = fuzzySystem.outputs[0];
  const corrected = fuzzySystem.rules.map((rule) => {
    const term = output.findTerm(rule.conclusions[0]);
    return new CorrectedTerm(term, rule.beliefDegree || 0);
  });
  return new UnionOfTerms(corrected);
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
  if (
    Number.isFinite(errorsVal) &&
    Number.isFinite(connectionsVal) &&
    Number.isFinite(bytesVal)
  ) {
    calculateTrustIndex(errorsVal, connectionsVal, bytesVal);
  }
  const union = buildOutputUnion();
  return sampleAggregatedOutput(union, fuzzySystem.outputs[0].range, 100);
}

// Calculate membership degrees
function calculateMembershipValues(variable, value) {
  const memberships = {};
  
  if (variable === "errors") {
    memberships.Low = trapezoidalMF(value, 0, 0, 30, 50);
    memberships.Medium = trapezoidalMF(value, 30, 50, 70, 90);
    memberships.High = trapezoidalMF(value, 70, 90, 100, 100);
  } else if (variable === "connections") {
    memberships.Low = trapezoidalMF(value, 0, 0, 10, 30);
    memberships.Medium = trapezoidalMF(value, 10, 30, 50, 70);
    memberships.High = trapezoidalMF(value, 50, 70, 100, 100);
  } else if (variable === "bytes") {
    memberships.Low = trapezoidalMF(value, 0, 0, 20, 40);
    memberships.Medium = trapezoidalMF(value, 20, 40, 60, 80);
    memberships.High = trapezoidalMF(value, 60, 80, 100, 100);
  } else if (variable === "trustIndex") {
    memberships.VeryLow = triangularMF(value, 0, 0, 25);
    memberships.Low = triangularMF(value, 0, 25, 50);
    memberships.Medium = triangularMF(value, 25, 50, 75);
    memberships.High = triangularMF(value, 50, 75, 100);
    memberships.VeryHigh = triangularMF(value, 75, 100, 100);
  }
  
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
  getAggregatedOutput,
  calculateMembershipValues,
  getMostActiveTerm,
  membershipParams,
  trapezoidalMF,
  triangularMF,
};

/**
 * Mamdani inference after the rule strengths are known:
 *   clip height per output term  Omega_m = max strength of its rules
 *   aggregated set               mu_agg(y) = max_m min(Omega_m, mu_m(y))
 *   defuzzification              centre of gravity, exact or discrete
 */
const CorrectedTerm = require("fuzzyis/lib/CorrectedTerm");
const UnionOfTerms = require("fuzzyis/lib/UnionOfTerms");
const { zeroByTerm } = require("./inference");
const { gridPoints } = require("./sampling");

/** Clip height of every output term (eq. 2.21): max strength of its rules. */
function mamdaniActivations(outputVariable, evaluations) {
  const activations = zeroByTerm(outputVariable);
  evaluations.forEach((rule) => {
    activations[rule.out] = Math.max(activations[rule.out] || 0, rule.strength);
  });
  return activations;
}

/**
 * Implication and aggregation (eq. 2.17–2.18, 4.9): every output term clipped
 * at its height (FuzzyIS CorrectedTerm), then the pointwise max (UnionOfTerms).
 */
function aggregatedUnion(outputVariable, activations) {
  return new UnionOfTerms(
    outputVariable.terms.map((term) => new CorrectedTerm(term, activations[term.name] || 0))
  );
}

/** Straight pieces [x0, y0, x1, y1] of a triangular or trapezoidal term. */
function termSegments(term) {
  const p = term.mfParams;
  const pieces = [];
  if (term.mfType === "triangle") {
    const [a, b, c] = p;
    if (b > a) pieces.push([a, 0, b, 1]);
    if (c > b) pieces.push([b, 1, c, 0]);
  } else if (term.mfType === "trapeze") {
    const [a, b, c, d] = p;
    if (b > a) pieces.push([a, 0, b, 1]);
    if (c > b) pieces.push([b, 1, c, 1]);
    if (d > c) pieces.push([c, 1, d, 0]);
  } else {
    throw new Error(`exact centroid needs piecewise-linear terms, got "${term.mfType}"`);
  }
  return pieces;
}

/**
 * Break points of the aggregated polygon (eq. 2.22–2.25): term vertices,
 * crossings of term slopes with the clip levels and crossings of two slopes.
 * Between neighbouring break points mu_agg is strictly linear.
 */
function aggregatedBreakPoints(outputVariable, activations) {
  const [start, end] = outputVariable.range;
  const segments = outputVariable.terms.flatMap(termSegments);
  const levels = Object.values(activations).filter((level) => level > 0 && level < 1);
  const points = new Set([start, end]);
  const add = (x) => {
    if (Number.isFinite(x) && x >= start - 1e-12 && x <= end + 1e-12) {
      points.add(Math.min(end, Math.max(start, x)));
    }
  };

  segments.forEach(([x0, y0, x1, y1]) => {
    add(x0);
    add(x1);
    const slope = (y1 - y0) / (x1 - x0);
    levels.forEach((level) => {
      if (level > Math.min(y0, y1) && level < Math.max(y0, y1)) add(x0 + (level - y0) / slope);
    });
  });

  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      const [ax0, ay0, ax1, ay1] = segments[i];
      const [bx0, by0, bx1, by1] = segments[j];
      const ka = (ay1 - ay0) / (ax1 - ax0);
      const kb = (by1 - by0) / (bx1 - bx0);
      if (Math.abs(ka - kb) < 1e-12) continue;
      const x = (by0 - kb * bx0 - (ay0 - ka * ax0)) / (ka - kb);
      if (x >= Math.max(ax0, bx0) && x <= Math.min(ax1, bx1)) add(x);
    }
  }

  return [...points].sort((a, b) => a - b);
}

/**
 * Exact centre of gravity of a piecewise-linear aggregated set (eq. 2.26–2.28).
 * On [y_{s-1}, y_s] mu = A_s·y + B_s, therefore
 *   moment = Σ A_s/3 (y_s³ − y_{s−1}³) + B_s/2 (y_s² − y_{s−1}²)
 *   area   = Σ A_s/2 (y_s² − y_{s−1}²) + B_s (y_s − y_{s−1})
 *   y*     = moment / area
 * @returns {number|null} null when the area is zero (no rule fired)
 */
function exactCentroid(union, outputVariable, activations) {
  const [start, end] = outputVariable.range;
  const points = aggregatedBreakPoints(outputVariable, activations);
  let moment = 0;
  let area = 0;
  for (let s = 1; s < points.length; s += 1) {
    const x0 = points[s - 1];
    const x1 = points[s];
    if (x1 - x0 < 1e-12) continue;
    const y0 = union.valueAt(x0);
    const y1 = union.valueAt(x1);
    const A = (y1 - y0) / (x1 - x0);
    const B = y0 - A * x0;
    moment += (A / 3) * (x1 ** 3 - x0 ** 3) + (B / 2) * (x1 ** 2 - x0 ** 2);
    area += (A / 2) * (x1 ** 2 - x0 ** 2) + B * (x1 - x0);
  }
  if (area <= 1e-15) return null;
  return Math.min(end, Math.max(start, moment / area));
}

/**
 * Discrete centre of gravity y* = Σ y·mu(y) / Σ mu(y) on a uniform grid
 * (eq. 2.9; eq. 4.10 with the integral replaced by a sum).
 * @returns {{value: number|null, series: Array<{x: number, y: number}>}}
 */
function discreteCentroid(union, range, step) {
  let numerator = 0;
  let denominator = 0;
  const series = gridPoints(range, step).map((x) => {
    const y = union.valueAt(x);
    numerator += x * y;
    denominator += y;
    return { x, y };
  });
  return { value: denominator === 0 ? null : numerator / denominator, series };
}

module.exports = {
  mamdaniActivations,
  aggregatedUnion,
  aggregatedBreakPoints,
  exactCentroid,
  discreteCentroid,
};

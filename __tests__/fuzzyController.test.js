const {
  calculateTrustIndex,
  centerOfGravity,
  getAggregatedOutput,
  getOutputTermActivations,
  calculateMembershipValues,
  getMostActiveTerm,
  getTrustRuleEvaluations,
  trapezoidalMF,
  triangularMF,
} = require("../fuzzyController");

const MID = { er: 0.25, cc: 50, bs: 7.5 };

describe("Trust controller primitives", () => {
  test("trapezoidalMF returns expected values", () => {
    expect(trapezoidalMF(-1, 0, 0, 20, 40)).toBe(0);
    expect(trapezoidalMF(10, 0, 0, 20, 40)).toBe(1);
    expect(trapezoidalMF(30, 0, 0, 20, 40)).toBeCloseTo(0.5, 5);
  });

  test("triangularMF returns expected values", () => {
    expect(triangularMF(25, 0, 25, 50)).toBe(1);
    expect(triangularMF(12.5, 0, 25, 50)).toBeCloseTo(0.5, 5);
    expect(triangularMF(60, 0, 25, 50)).toBe(0);
  });
});

describe("Trust controller calculations", () => {
  test("all-low NSL-KDD inputs yield very high trust", () => {
    const allZero = calculateTrustIndex(0, 0, 0);
    expect(allZero).toBeGreaterThan(80);
    expect(getMostActiveTerm(calculateMembershipValues("trustIndex", allZero))).toBe("VeryHigh");
  });

  test("zero error rate does not collapse trust to 0", () => {
    const atZero = calculateTrustIndex(0, 15, 4);
    const nearZero = calculateTrustIndex(0.01, 15, 4);
    expect(atZero).toBeGreaterThan(50);
    expect(atZero).toBeCloseTo(nearZero, 0);
  });

  test("medium-peak inputs stay in range and fire Low", () => {
    const value = calculateTrustIndex(MID.er, MID.cc, MID.bs);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
    expect(getMostActiveTerm(calculateMembershipValues("trustIndex", value))).toBe("Low");
  });

  test("NSL-KDD membership peaks match the assignment terms", () => {
    expect(calculateMembershipValues("errors", 0).Low).toBe(1);
    expect(calculateMembershipValues("errors", 0.1).Low).toBeCloseTo(0.5, 5);
    expect(calculateMembershipValues("errors", 0.25).Medium).toBe(1);
    expect(calculateMembershipValues("connections", 50).Medium).toBe(1);
    expect(calculateMembershipValues("connections", 120).High).toBe(1);
    expect(calculateMembershipValues("bytes", 7.5).Medium).toBe(1);
    expect(calculateMembershipValues("bytes", 11).High).toBe(1);
  });

  test("membership values return known terms", () => {
    const memberships = calculateMembershipValues("trustIndex", 62.5);
    expect(memberships).toHaveProperty("Low");
    expect(memberships).toHaveProperty("Medium");
    expect(memberships).toHaveProperty("High");
  });

  test("getMostActiveTerm returns one of existing terms", () => {
    const memberships = calculateMembershipValues("trustIndex", 62.5);
    const term = getMostActiveTerm(memberships);
    expect(Object.keys(memberships)).toContain(term);
  });

  test("rule evaluations use min of condition memberships", () => {
    calculateTrustIndex(MID.er, MID.cc, MID.bs);
    const rules = getTrustRuleEvaluations({
      errors: calculateMembershipValues("errors", MID.er),
      connections: calculateMembershipValues("connections", MID.cc),
      bytes: calculateMembershipValues("bytes", MID.bs),
    });

    expect(rules).toHaveLength(27);
    expect(rules[13].out).toBe("Low");
    expect(rules[13].alpha).toBeCloseTo(1, 5);
    expect(rules[0].out).toBe("VeryHigh");
    expect(rules[26].out).toBe("VeryLow");
    rules.forEach((rule) => {
      const expected = Math.min(...rule.conditions.map((item) => item.mu));
      expect(rule.alpha).toBeCloseTo(expected, 6);
    });
  });

  test("output term activations follow the fired conclusions", () => {
    calculateTrustIndex(MID.er, MID.cc, MID.bs);
    const activations = getOutputTermActivations();
    expect(activations.Low).toBeCloseTo(1, 5);
    expect(activations.Medium || 0).toBe(0);
    expect(activations.VeryLow || 0).toBe(0);
  });

  test("aggregated output comes from fuzzyis UnionOfTerms after inference", () => {
    const value = calculateTrustIndex(MID.er, MID.cc, MID.bs);
    const series = getAggregatedOutput();
    let numerator = 0;
    let denominator = 0;
    series.forEach((point) => {
      numerator += point.x * point.y;
      denominator += point.y;
    });

    expect(series.length).toBeGreaterThanOrEqual(101);
    expect(series[0]).toEqual({ x: 0, y: 0 });
    expect(denominator).toBeGreaterThan(0);
    expect(Math.max(...series.map((p) => p.y))).toBeCloseTo(1, 5);
    expect(value).toBeCloseTo(numerator / denominator, 0);
  });

  test("center of gravity is the first moment of the aggregated set", () => {
    calculateTrustIndex(0.8, 20, 11.5);
    const series = getAggregatedOutput();
    const union = {
      valueAt: (x) => {
        const point = series.find((item) => Math.abs(item.x - x) < 1e-9);
        return point ? point.y : 0;
      },
    };
    const fromSeries = centerOfGravity(union, [0, 100], 1);
    expect(calculateTrustIndex(0.8, 20, 11.5)).toBeCloseTo(fromSeries, 0);
  });

  test("defuzzification is the exact analytic centroid (eq. 2.26–2.28)", () => {
    const { triangularMF: tri } = require("../fuzzyController");
    const T = {
      VeryLow: [0, 0, 25],
      Low: [0, 25, 50],
      Medium: [25, 50, 75],
      High: [50, 75, 100],
      VeryHigh: [75, 100, 100],
    };
    const cases = [
      [0.02, 10, 2],
      [0.1, 20, 5],
      [0.3, 50, 7],
      [0.5, 100, 10],
      [0.08, 25, 5.5],
      [0.12, 60, 8],
    ];
    cases.forEach(([er, cc, bs]) => {
      const value = calculateTrustIndex(er, cc, bs);
      const alpha = getOutputTermActivations();
      const mu = (x) =>
        Math.max(0, ...Object.entries(alpha).map(([term, a]) => Math.min(a, tri(x, ...T[term]))));
      // Reference: very fine trapezoidal integration of the same polygon.
      const N = 100000;
      let moment = 0;
      let area = 0;
      for (let i = 0; i < N; i += 1) {
        const x0 = (100 * i) / N;
        const x1 = (100 * (i + 1)) / N;
        const m0 = mu(x0);
        const m1 = mu(x1);
        area += ((x1 - x0) * (m0 + m1)) / 2;
        moment += ((x1 - x0) * (x0 * m0 + x1 * m1)) / 2;
      }
      expect(value).toBeCloseTo(moment / area, 6);
    });
  });

  test("single fully-fired VeryHigh term gives the triangle centroid 275/3", () => {
    expect(calculateTrustIndex(0, 0, 0)).toBeCloseTo(275 / 3, 9);
  });
});

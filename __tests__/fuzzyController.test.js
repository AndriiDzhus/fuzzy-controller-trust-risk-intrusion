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
  test("zero errors keeps high trust instead of collapsing to 0", () => {
    const atZero = calculateTrustIndex(0, 50, 50);
    const nearZero = calculateTrustIndex(0.1, 50, 50);
    const allZero = calculateTrustIndex(0, 0, 0);

    expect(atZero).toBeGreaterThan(70);
    expect(atZero).toBeCloseTo(nearZero, 0);
    expect(allZero).toBeGreaterThan(80);
    expect(getMostActiveTerm(calculateMembershipValues("trustIndex", atZero))).toMatch(/High/);
  });

  test("calculateTrustIndex returns value in range", () => {
    const value = calculateTrustIndex(50, 50, 50);
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThanOrEqual(100);
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
    calculateTrustIndex(50, 50, 50);
    const rules = getTrustRuleEvaluations({
      errors: calculateMembershipValues("errors", 50),
      connections: calculateMembershipValues("connections", 50),
      bytes: calculateMembershipValues("bytes", 50),
    });

    expect(rules).toHaveLength(27);
    expect(rules[13].out).toBe("Medium");
    expect(rules[13].alpha).toBeCloseTo(1, 5);
    rules.forEach((rule) => {
      const expected = Math.min(...rule.conditions.map((item) => item.mu));
      expect(rule.alpha).toBeCloseTo(expected, 6);
    });
  });

  test("output term activations follow the fired conclusions", () => {
    calculateTrustIndex(50, 50, 50);
    const activations = getOutputTermActivations();
    expect(activations.Medium).toBeCloseTo(1, 5);
    expect(activations.Low).toBe(0);
    expect(activations.VeryLow).toBe(0);
  });

  test("aggregated output comes from fuzzyis UnionOfTerms after inference", () => {
    const value = calculateTrustIndex(50, 50, 50);
    const series = getAggregatedOutput();
    let numerator = 0;
    let denominator = 0;
    series.forEach((point) => {
      numerator += point.x * point.y;
      denominator += point.y;
    });

    expect(series.length).toBe(101);
    expect(series[0]).toEqual({ x: 0, y: 0 });
    expect(denominator).toBeGreaterThan(0);
    expect(Math.max(...series.map((p) => p.y))).toBeCloseTo(1, 5);
    expect(value).toBeCloseTo(numerator / denominator, 0);
  });

  test("center of gravity is the first moment of the aggregated set", () => {
    calculateTrustIndex(80, 20, 90);
    const series = getAggregatedOutput();
    const union = {
      valueAt: (x) => {
        const point = series.find((item) => Math.abs(item.x - x) < 1e-9);
        return point ? point.y : 0;
      },
    };
    const fromSeries = centerOfGravity(union, [0, 100], 1);
    expect(calculateTrustIndex(80, 20, 90)).toBeCloseTo(fromSeries, 0);
  });
});

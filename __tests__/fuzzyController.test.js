const {
  calculateTrustIndex,
  getAggregatedOutput,
  calculateMembershipValues,
  getMostActiveTerm,
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

  test("aggregated output comes from fuzzyis UnionOfTerms after inference", () => {
    const value = calculateTrustIndex(50, 50, 50);
    const series = getAggregatedOutput();
    const atValue = series.find((p) => Math.abs(p.x - value) < 0.6);

    expect(series.length).toBe(101);
    expect(series[0]).toEqual({ x: 0, y: 0 });
    expect(atValue.y).toBeGreaterThan(0.9);
    expect(Math.max(...series.map((p) => p.y))).toBeCloseTo(1, 5);
  });
});

const { calculateSecurity } = require("../controllers");

describe("Security controller logic", () => {
  test("optimal scenario should produce low risk", () => {
    const result = calculateSecurity({ energy: 10, strength: 90, response: 10 });
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(["none", "veryLow", "low"]).toContain(result.dominantTerm);
  });

  test("critical scenario should produce high risk", () => {
    const result = calculateSecurity({ energy: 90, strength: 10, response: 90 });
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(["high", "veryHigh"]).toContain(result.dominantTerm);
  });

  test("result is deterministic", () => {
    const a = calculateSecurity({ energy: 55.5, strength: 33.3, response: 77.7 }).value;
    const b = calculateSecurity({ energy: 55.5, strength: 33.3, response: 77.7 }).value;
    expect(a).toBeCloseTo(b, 10);
  });

  test("sparse-rule gap uses neutral fallback risk", () => {
    const result = calculateSecurity({ energy: 25, strength: 50, response: 75 });
    expect(result.value).toBeCloseTo(50, 10);
    expect(result.dominantTerm).toBe("medium");
  });

  test("membership functions include risk output curves for chart rendering", () => {
    const { controllers } = require("../controllers");
    const mf = controllers.security.membershipFunctions();

    expect(Object.keys(mf.output.risk)).toEqual([
      "none",
      "veryLow",
      "low",
      "medium",
      "high",
      "veryHigh",
    ]);
    expect(mf.output.risk.low.length).toBeGreaterThan(0);
    expect(mf.output.risk.low.some((point) => point.y > 0)).toBe(true);
  });
});

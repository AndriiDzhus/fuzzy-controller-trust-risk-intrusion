const { calculateIntrusion } = require("../controllers");

describe("Intrusion controller logic", () => {
  test("low-traffic stable scenario should avoid high intrusion", () => {
    const result = calculateIntrusion({ packets: 15, rate: 55, delivery: 20 });
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(result.dominantTerm).toBe("low");
  });

  test("intrusion level matches I membership at the defuzzified value", () => {
    const result = calculateIntrusion({ packets: 15, rate: 55, delivery: 20 });
    expect(result.value).toBeGreaterThan(15);
    expect(result.value).toBeLessThan(50);
    expect(result.ruleOutputs.none).toBeGreaterThan(result.ruleOutputs.low);
    expect(result.dominantTerm).toBe("low");
  });

  test("high packet risky scenario should incline to high intrusion", () => {
    const result = calculateIntrusion({ packets: 95, rate: 20, delivery: 65 });
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(["medium", "high"]).toContain(result.dominantTerm);
  });

  test("defuzzification memberships evaluate I at the crisp result", () => {
    const result = calculateIntrusion({ packets: 15, rate: 55, delivery: 20 });
    expect(result.membershipData.intrusion).not.toEqual(result.ruleOutputs);
    const top = Object.entries(result.membershipData.intrusion).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe(result.dominantTerm);
  });

  test("aggregated output is the clipped I set used for centroid", () => {
    const result = calculateIntrusion({ packets: 15, rate: 55, delivery: 20 });
    expect(result.aggregatedOutput.length).toBeGreaterThan(100);
    expect(result.aggregatedOutput[0]).toEqual({ x: 0, y: expect.any(Number) });
    expect(Math.max(...result.aggregatedOutput.map((p) => p.y))).toBeGreaterThan(0);
  });

  test("rule evaluations use min of condition memberships", () => {
    const result = calculateIntrusion({ packets: 15, rate: 55, delivery: 20 });
    expect(result.ruleEvaluations).toHaveLength(12);
    result.ruleEvaluations.forEach((rule) => {
      const expected = Math.min(...rule.conditions.map((item) => item.mu));
      expect(rule.alpha).toBeCloseTo(expected, 6);
    });
    const byOut = {};
    result.ruleEvaluations.forEach((rule) => {
      byOut[rule.out] = Math.max(byOut[rule.out] || 0, rule.alpha);
    });
    Object.entries(result.ruleOutputs).forEach(([term, alpha]) => {
      expect(byOut[term] || 0).toBeCloseTo(alpha, 6);
    });
  });

  test("result is deterministic", () => {
    const a = calculateIntrusion({ packets: 72.2, rate: 41.7, delivery: 60.4 }).value;
    const b = calculateIntrusion({ packets: 72.2, rate: 41.7, delivery: 60.4 }).value;
    expect(a).toBeCloseTo(b, 10);
  });
});

const { intrusionController } = require("../src/controllers");

const calculateIntrusion = intrusionController.calculate;

const nonePeak = { packets: 9.5, rate: 15, weight: 141.5 };
const lowPeak = { packets: 9.5, rate: 150, weight: 141.5 };
const highPeak = { packets: 15, rate: 1500, weight: 245 };

describe("Intrusion controller logic", () => {
  test("medium-low-medium peak fires absent intrusion", () => {
    const result = calculateIntrusion(nonePeak);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThan(20);
    expect(result.dominantTerm).toBe("none");
    expect(result.ruleOutputs.none).toBeGreaterThan(0.9);
  });

  test("medium-medium-medium peak fires low intrusion", () => {
    const result = calculateIntrusion(lowPeak);
    expect(result.value).toBeGreaterThan(15);
    expect(result.value).toBeLessThan(50);
    expect(result.dominantTerm).toBe("low");
    expect(result.ruleOutputs.low).toBeGreaterThan(0.9);
  });

  test("high-rate heavy flow inclines to high intrusion", () => {
    const result = calculateIntrusion(highPeak);
    expect(result.value).toBeGreaterThan(70);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(result.dominantTerm).toBe("high");
    expect(result.ruleOutputs.high).toBeGreaterThan(0.9);
  });

  test("intrusion level matches IP membership at the defuzzified value", () => {
    const result = calculateIntrusion(lowPeak);
    expect(result.membershipData.intrusion).not.toEqual(result.ruleOutputs);
    const top = Object.entries(result.membershipData.intrusion).sort((a, b) => b[1] - a[1])[0][0];
    expect(top).toBe(result.dominantTerm);
  });

  test("aggregated output is the clipped IP set used for centroid", () => {
    const result = calculateIntrusion(lowPeak);
    expect(result.aggregatedOutput.length).toBeGreaterThan(100);
    expect(result.aggregatedOutput[0]).toEqual({ x: 0, y: expect.any(Number) });
    expect(Math.max(...result.aggregatedOutput.map((p) => p.y))).toBeGreaterThan(0);
  });

  test("rule evaluations use min of condition memberships", () => {
    const result = calculateIntrusion(nonePeak);
    expect(result.ruleEvaluations).toHaveLength(12);
    expect(result.ruleEvaluations[0]).toMatchObject({
      out: "none",
      conditions: [
        { symbol: "NP", term: "medium" },
        { symbol: "Rate", term: "low" },
        { symbol: "We", term: "medium" },
      ],
    });
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
    const a = calculateIntrusion({ packets: 12.2, rate: 140, weight: 160.4 }).value;
    const b = calculateIntrusion({ packets: 12.2, rate: 140, weight: 160.4 }).value;
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("Intrusion COG grid", () => {
  test("aggregated output covers the whole universe [0, 100] with step 0.2", () => {
    const result = calculateIntrusion({ packets: 14, rate: 1500, weight: 240 });
    expect(result.aggregatedOutput).toHaveLength(501);
    expect(result.aggregatedOutput.at(-1).x).toBe(100);
  });
});

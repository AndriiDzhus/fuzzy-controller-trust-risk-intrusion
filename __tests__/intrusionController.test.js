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

  test("result is deterministic", () => {
    const a = calculateIntrusion({ packets: 72.2, rate: 41.7, delivery: 60.4 }).value;
    const b = calculateIntrusion({ packets: 72.2, rate: 41.7, delivery: 60.4 }).value;
    expect(a).toBeCloseTo(b, 10);
  });
});

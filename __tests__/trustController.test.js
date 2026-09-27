const { trapezoidalMF, triangularMF, fuzzify } = require("../src/engine");
const trust = require("../src/controllers/trustController");

const calc = (errors, connections, bytes) => trust.calculate({ errors, connections, bytes });
const MID = { errors: 0.25, connections: 50, bytes: 7.5 };

describe("Membership function primitives", () => {
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
    const result = calc(0, 0, 0);
    expect(result.value).toBeGreaterThan(80);
    expect(result.dominantTerm).toBe("VeryHigh");
  });

  test("zero error rate does not collapse trust to 0", () => {
    const atZero = calc(0, 15, 4).value;
    const nearZero = calc(0.01, 15, 4).value;
    expect(atZero).toBeGreaterThan(50);
    expect(atZero).toBeCloseTo(nearZero, 0);
  });

  test("medium-peak inputs stay in range and fire Low", () => {
    const result = trust.calculate(MID);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(result.dominantTerm).toBe("Low");
  });

  test("NSL-KDD membership peaks match the assignment terms", () => {
    const { ER, CC, BS } = trust.variables;
    expect(fuzzify(ER, 0).Low).toBe(1);
    expect(fuzzify(ER, 0.1).Low).toBeCloseTo(0.5, 5);
    expect(fuzzify(ER, 0.25).Medium).toBe(1);
    expect(fuzzify(CC, 50).Medium).toBe(1);
    expect(fuzzify(CC, 120).High).toBe(1);
    expect(fuzzify(BS, 7.5).Medium).toBe(1);
    expect(fuzzify(BS, 11).High).toBe(1);
  });

  test("output memberships at TI* contain every output term", () => {
    const result = trust.calculate(MID);
    expect(Object.keys(result.membershipData.trustIndex)).toEqual([
      "VeryLow",
      "Low",
      "Medium",
      "High",
      "VeryHigh",
    ]);
  });

  test("rule evaluations use min of condition memberships", () => {
    const rules = trust.calculate(MID).ruleEvaluations;
    expect(rules).toHaveLength(27);
    expect(rules[13].out).toBe("Low");
    expect(rules[13].alpha).toBeCloseTo(1, 5);
    expect(rules[0].out).toBe("VeryHigh");
    expect(rules[26].out).toBe("VeryLow");
    rules.forEach((rule) => {
      expect(rule.tnorm).toBe("min");
      const expected = Math.min(...rule.conditions.map((item) => item.mu));
      expect(rule.alpha).toBeCloseTo(expected, 6);
    });
  });

  test("clip heights follow the fired conclusions", () => {
    const activations = trust.calculate(MID).ruleOutputs;
    expect(activations.Low).toBeCloseTo(1, 5);
    expect(activations.Medium).toBe(0);
    expect(activations.VeryLow).toBe(0);
  });

  test("aggregated output is the clipped max-min set", () => {
    const result = trust.calculate(MID);
    const series = result.aggregatedOutput;
    expect(series.length).toBeGreaterThanOrEqual(101);
    expect(series[0]).toEqual({ x: 0, y: 0 });
    expect(Math.max(...series.map((p) => p.y))).toBeCloseTo(1, 5);
    let numerator = 0;
    let denominator = 0;
    series.forEach((point) => {
      numerator += point.x * point.y;
      denominator += point.y;
    });
    expect(result.value).toBeCloseTo(numerator / denominator, 0);
  });

  test("defuzzification is the exact analytic centroid (eq. 2.26–2.28)", () => {
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
      const result = calc(er, cc, bs);
      const alpha = result.ruleOutputs;
      const mu = (x) =>
        Math.max(0, ...Object.entries(alpha).map(([term, a]) => Math.min(a, triangularMF(x, ...T[term]))));
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
      expect(result.value).toBeCloseTo(moment / area, 6);
    });
  });

  test("single fully-fired VeryHigh term gives the triangle centroid 275/3", () => {
    expect(calc(0, 0, 0).value).toBeCloseTo(275 / 3, 9);
  });
});

const { calculateSecurity } = require("../controllers");
const { ANCHOR_RULES, train, setWeights, loadWeights } = require("../anfis/securityAnfis");

describe("Security ANFIS", () => {
  beforeAll(() => {
    setWeights(train({ samples: 800, seed: 42 }));
  });

  test("assignment mode still leaves the default 50/50/50 uncovered", () => {
    const result = calculateSecurity({ energy: 50, strength: 50, response: 50 });
    expect(result.noRuleFired).toBe(true);
    expect(result.value).toBeNull();
    expect(result.mode).toBe("assignment");
  });

  test("ANFIS mode always returns a risk on uncovered inputs", () => {
    const result = calculateSecurity({
      energy: 50,
      strength: 50,
      response: 50,
      mode: "anfis",
    });
    expect(result.noRuleFired).toBe(false);
    expect(result.value).toBeGreaterThanOrEqual(0);
    expect(result.value).toBeLessThanOrEqual(100);
    expect(result.mode).toBe("anfis");
    expect(result.dominantTerm).toBeTruthy();
  });

  test.each(ANCHOR_RULES.map((rule) => [rule.E, rule.S, rule.T, rule.r]))(
    "ANFIS stays close to assignment anchor %s/%s/%s = %i",
    (E, S, T, target) => {
      const peaks = {
        energy: { low: 0, medium: 40, high: 100 }[E],
        strength: { low: 0, medium: 60, high: 100 }[S],
        response: { low: 0, medium: 50, high: 100 }[T],
      };
      const result = calculateSecurity({ ...peaks, mode: "anfis" });
      expect(Math.abs(result.value - target)).toBeLessThan(3);
    }
  );

  test("training with the same seed is deterministic", () => {
    const a = train({ samples: 200, seed: 7 });
    const b = train({ samples: 200, seed: 7 });
    expect(a.consequents).toEqual(b.consequents);
  });

  test("saved weights expose 27 rules", () => {
    const weights = loadWeights();
    expect(weights.consequents).toHaveLength(27);
    expect(weights.rules).toHaveLength(27);
    expect(weights.rules.filter((rule) => rule.anchor)).toHaveLength(6);
  });
});

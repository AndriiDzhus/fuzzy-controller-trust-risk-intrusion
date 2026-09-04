const { calculateSecurity, controllers } = require("../controllers");

// Assignment piecewise MFs from docs/tasks/security (formulas as written).
const assignment = {
  E: {
    low: (x) => (x <= 0 ? 1 : x <= 20 ? (20 - x) / (20 - 0) : 0),
    medium: (x) => {
      if (x <= 10 || x >= 70) return 0;
      if (x <= 40) return (x - 10) / (40 - 10);
      return (70 - x) / (70 - 40);
    },
    high: (x) => (x <= 50 ? 0 : x <= 100 ? (x - 50) / (100 - 50) : 1),
  },
  S: {
    low: (x) => (x <= 0 ? 1 : x <= 50 ? (50 - x) / (50 - 0) : 0),
    medium: (x) => {
      if (x <= 30 || x >= 90) return 0;
      if (x <= 60) return (x - 30) / (60 - 30);
      return (90 - x) / (90 - 60);
    },
    high: (x) => (x <= 70 ? 0 : x <= 100 ? (x - 70) / (100 - 70) : 1),
  },
  T: {
    low: (x) => (x <= 0 ? 1 : x <= 20 ? (20 - x) / (20 - 0) : 0),
    medium: (x) => {
      if (x <= 10 || x >= 90) return 0;
      if (x <= 50) return (x - 10) / (50 - 10);
      return (90 - x) / (90 - 50);
    },
    high: (x) => (x <= 80 ? 0 : x <= 100 ? (x - 80) / (100 - 80) : 1),
  },
};

const SINGletons = {
  none: 0,
  veryLow: 20,
  low: 40,
  medium: 60,
  high: 80,
  veryHigh: 100,
};

const RULES = [
  { E: "low", S: "high", T: "low", out: "none" },
  { E: "low", S: "high", T: "medium", out: "veryLow" },
  { E: "medium", S: "medium", T: "low", out: "low" },
  { E: "medium", S: "low", T: "medium", out: "medium" },
  { E: "high", S: "medium", T: "high", out: "high" },
  { E: "high", S: "low", T: "high", out: "veryHigh" },
];

function assignmentInfer(energy, strength, response) {
  const fuzzy = {
    energy: {
      low: assignment.E.low(energy),
      medium: assignment.E.medium(energy),
      high: assignment.E.high(energy),
    },
    strength: {
      low: assignment.S.low(strength),
      medium: assignment.S.medium(strength),
      high: assignment.S.high(strength),
    },
    response: {
      low: assignment.T.low(response),
      medium: assignment.T.medium(response),
      high: assignment.T.high(response),
    },
  };

  const ruleOutputs = {
    none: 0,
    veryLow: 0,
    low: 0,
    medium: 0,
    high: 0,
    veryHigh: 0,
  };

  RULES.forEach((rule) => {
    const alpha = Math.min(fuzzy.energy[rule.E], fuzzy.strength[rule.S], fuzzy.response[rule.T]);
    ruleOutputs[rule.out] = Math.max(ruleOutputs[rule.out], alpha);
  });

  let numerator = 0;
  let denominator = 0;
  Object.entries(ruleOutputs).forEach(([term, mu]) => {
    numerator += SINGletons[term] * mu;
    denominator += mu;
  });

  return {
    value: denominator === 0 ? null : numerator / denominator,
    ruleOutputs,
    fuzzy,
  };
}

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

  test("sparse-rule gap does not invent a risk value", () => {
    const result = calculateSecurity({ energy: 25, strength: 50, response: 75 });
    expect(result.value).toBeNull();
    expect(result.dominantTerm).toBeNull();
    expect(result.noRuleFired).toBe(true);
    expect(Object.values(result.ruleOutputs).every((mu) => mu === 0)).toBe(true);
  });

  test("membership functions include risk output curves for chart rendering", () => {
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

describe("Security assignment compliance", () => {
  test("input memberships match assignment formulas on [0, 100]", () => {
    const mf = controllers.security.membershipFunctions();
    const map = {
      energy: assignment.E,
      strength: assignment.S,
      response: assignment.T,
    };

    for (const [input, terms] of Object.entries(map)) {
      for (const [term, fn] of Object.entries(terms)) {
        const series = mf.inputs[input][term];
        expect(series).toBeDefined();
        series.forEach((point) => {
          expect(point.y).toBeCloseTo(fn(point.x), 10);
        });
      }
    }
  });

  test("output terms are assignment singletons", () => {
    expect(controllers.security.membershipFunctions().meta.singletonValues).toEqual(SINGletons);
  });

  test.each([
    ["R1 Немає", { energy: 0, strength: 100, response: 0 }, 0, "none"],
    ["R2 Дуже малий", { energy: 0, strength: 100, response: 50 }, 20, "veryLow"],
    ["R3 Малий", { energy: 40, strength: 60, response: 0 }, 40, "low"],
    ["R4 Середній", { energy: 40, strength: 0, response: 50 }, 60, "medium"],
    ["R5 Великий", { energy: 100, strength: 60, response: 100 }, 80, "high"],
    ["R6 Дуже великий", { energy: 100, strength: 0, response: 100 }, 100, "veryHigh"],
  ])("%s fires alone and yields the singleton", (_name, inputs, expected, term) => {
    const result = calculateSecurity(inputs);
    const expectedInfer = assignmentInfer(inputs.energy, inputs.strength, inputs.response);

    expect(result.value).toBeCloseTo(expected, 10);
    expect(result.dominantTerm).toBe(term);
    expect(result.value).toBeCloseTo(expectedInfer.value, 10);
    expect(result.ruleOutputs[term]).toBeCloseTo(1, 10);
    Object.entries(result.ruleOutputs).forEach(([name, mu]) => {
      if (name !== term) expect(mu).toBeCloseTo(0, 10);
    });
  });

  test("overlapping rules 1+2 use Sugeno weighted average", () => {
    const inputs = { energy: 0, strength: 100, response: 15 };
    const result = calculateSecurity(inputs);
    const expected = assignmentInfer(0, 100, 15);
    expect(result.value).toBeCloseTo(expected.value, 10);
    expect(result.value).toBeCloseTo(20 / 3, 10);
    expect(result.dominantTerm).toBe("none");
  });

  test("overlapping rules 5+6 use Sugeno weighted average", () => {
    const inputs = { energy: 100, strength: 40, response: 100 };
    const result = calculateSecurity(inputs);
    const expected = assignmentInfer(100, 40, 100);
    expect(result.value).toBeCloseTo(expected.value, 10);
    expect(result.value).toBeCloseTo(87.5, 10);
    expect(result.dominantTerm).toBe("high");
  });

  test("docs rule table matches the assignment", () => {
    const fs = require("fs");
    const path = require("path");
    const vm = require("vm");
    const code = fs.readFileSync(path.join(__dirname, "../public/controller-docs.js"), "utf8");
    const context = {
      window: {},
      document: { getElementById: () => null, createElement: () => ({}) },
    };
    vm.createContext(context);
    vm.runInContext(code, context);

    expect(context.window.controllerDocs.security.rules.rows).toEqual([
      ["low", "high", "low", "none"],
      ["low", "high", "medium", "veryLow"],
      ["medium", "medium", "low", "low"],
      ["medium", "low", "medium", "medium"],
      ["high", "medium", "high", "high"],
      ["high", "low", "high", "veryHigh"],
    ]);
  });
});

const { calculateSecurity, controllers } = require("../controllers");

// Assignment piecewise MFs from docs/tasks/security/2_security_controller_data_updated.
const assignment = {
  EC: {
    low: (x) => (x <= 0 ? 1 : x <= 0.025 ? 1 - x / 0.025 : 0),
    medium: (x) => {
      if (x < 0 || x > 0.05) return 0;
      if (x <= 0.025) return x / 0.025;
      return (0.05 - x) / 0.025;
    },
    high: (x) => (x < 0.025 ? 0 : x <= 0.05 ? (x - 0.025) / 0.025 : 1),
  },
  TP: {
    low: (x) => (x <= 0 ? 1 : x <= 20 ? 1 - x / 20 : 0),
    medium: (x) => {
      if (x < 0 || x > 40) return 0;
      if (x <= 20) return x / 20;
      return (40 - x) / 20;
    },
    high: (x) => (x < 20 ? 0 : x <= 40 ? (x - 20) / 20 : 1),
  },
  Lat: {
    low: (x) => (x <= 0 ? 1 : x <= 5 ? 1 - x / 5 : 0),
    medium: (x) => {
      if (x < 0 || x > 10) return 0;
      if (x <= 5) return x / 5;
      return (10 - x) / 5;
    },
    high: (x) => (x < 5 ? 0 : x <= 10 ? (x - 5) / 5 : 1),
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
  { EC: "low", TP: "low", Lat: "low", out: "none" },
  { EC: "medium", TP: "medium", Lat: "medium", out: "veryLow" },
  { EC: "high", TP: "low", Lat: "low", out: "low" },
  { EC: "medium", TP: "high", Lat: "medium", out: "medium" },
  { EC: "high", TP: "medium", Lat: "high", out: "high" },
  { EC: "high", TP: "high", Lat: "high", out: "veryHigh" },
];

function assignmentInfer(energy, strength, response) {
  const fuzzy = {
    energy: {
      low: assignment.EC.low(energy),
      medium: assignment.EC.medium(energy),
      high: assignment.EC.high(energy),
    },
    strength: {
      low: assignment.TP.low(strength),
      medium: assignment.TP.medium(strength),
      high: assignment.TP.high(strength),
    },
    response: {
      low: assignment.Lat.low(response),
      medium: assignment.Lat.medium(response),
      high: assignment.Lat.high(response),
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
    const alpha = Math.min(fuzzy.energy[rule.EC], fuzzy.strength[rule.TP], fuzzy.response[rule.Lat]);
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
  test("all-low inputs produce no risk", () => {
    const result = calculateSecurity({ energy: 0, strength: 0, response: 0 });
    expect(result.value).toBeCloseTo(0, 10);
    expect(result.dominantTerm).toBe("none");
  });

  test("all-high inputs produce very high risk", () => {
    const result = calculateSecurity({ energy: 0.05, strength: 40, response: 10 });
    expect(result.value).toBeCloseTo(100, 10);
    expect(result.dominantTerm).toBe("veryHigh");
  });

  test("result is deterministic", () => {
    const a = calculateSecurity({ energy: 0.012, strength: 28, response: 2.7 }).value;
    const b = calculateSecurity({ energy: 0.012, strength: 28, response: 2.7 }).value;
    expect(a).toBeCloseTo(b, 10);
  });

  test("rule evaluations use min of condition memberships", () => {
    const result = calculateSecurity({ energy: 0, strength: 0, response: 0 });
    expect(result.ruleEvaluations).toHaveLength(6);
    expect(result.ruleEvaluations[0].conditions.map((item) => item.symbol)).toEqual(["EC", "TP", "Lat"]);
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

  test("sparse-rule gap does not invent a risk value", () => {
    const result = calculateSecurity({ energy: 0.025, strength: 0, response: 0 });
    expect(result.value).toBeNull();
    expect(result.dominantTerm).toBeNull();
    expect(result.noRuleFired).toBe(true);
    expect(Object.values(result.ruleOutputs).every((mu) => mu === 0)).toBe(true);
  });

  test("risk output is drawn as assignment singletons, not triangle curves", () => {
    const mf = controllers.security.membershipFunctions();
    expect(mf.output.risk).toEqual({});
    expect(mf.meta.singletonValues).toEqual(SINGletons);
  });
});

describe("Security assignment compliance", () => {
  test("input memberships match assignment formulas on their domains", () => {
    const mf = controllers.security.membershipFunctions();
    const map = {
      energy: assignment.EC,
      strength: assignment.TP,
      response: assignment.Lat,
    };

    for (const [input, terms] of Object.entries(map)) {
      for (const [term, fn] of Object.entries(terms)) {
        const series = mf.inputs[input][term];
        expect(series).toBeDefined();
        expect(series.length).toBeGreaterThan(10);
        series.forEach((point) => {
          expect(point.y).toBeCloseTo(fn(point.x), 10);
        });
      }
    }

    expect(mf.inputs.energy.low.at(-1).x).toBeCloseTo(0.05, 10);
    expect(mf.inputs.strength.low.at(-1).x).toBeCloseTo(40, 10);
    expect(mf.inputs.response.low.at(-1).x).toBeCloseTo(10, 10);
  });

  test("output terms are assignment singletons", () => {
    expect(controllers.security.membershipFunctions().meta.singletonValues).toEqual(SINGletons);
  });

  test.each([
    ["R1 Немає", { energy: 0, strength: 0, response: 0 }, 0, "none"],
    ["R2 Дуже малий", { energy: 0.025, strength: 20, response: 5 }, 20, "veryLow"],
    ["R3 Малий", { energy: 0.05, strength: 0, response: 0 }, 40, "low"],
    ["R4 Середній", { energy: 0.025, strength: 40, response: 5 }, 60, "medium"],
    ["R5 Великий", { energy: 0.05, strength: 20, response: 10 }, 80, "high"],
    ["R6 Дуже великий", { energy: 0.05, strength: 40, response: 10 }, 100, "veryHigh"],
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
    const inputs = { energy: 0.0125, strength: 10, response: 2.5 };
    const result = calculateSecurity(inputs);
    const expected = assignmentInfer(0.0125, 10, 2.5);
    expect(result.value).toBeCloseTo(expected.value, 10);
    expect(result.value).toBeCloseTo(10, 10);
    expect(result.dominantTerm).toBe("none");
  });

  test("overlapping rules 5+6 use Sugeno weighted average", () => {
    const inputs = { energy: 0.05, strength: 30, response: 10 };
    const result = calculateSecurity(inputs);
    const expected = assignmentInfer(0.05, 30, 10);
    expect(result.value).toBeCloseTo(expected.value, 10);
    expect(result.value).toBeCloseTo(90, 10);
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

    expect(context.window.controllerDocs.security.rules.columns.map((col) => col.key)).toEqual([
      "EC",
      "TP",
      "Lat",
      "SR",
    ]);
    expect(context.window.controllerDocs.security.rules.rows).toEqual([
      ["low", "low", "low", "none"],
      ["medium", "medium", "medium", "veryLow"],
      ["high", "low", "low", "low"],
      ["medium", "high", "medium", "medium"],
      ["high", "medium", "high", "high"],
      ["high", "high", "high", "veryHigh"],
    ]);
  });
});

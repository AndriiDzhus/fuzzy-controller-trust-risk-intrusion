const { FIS, LinguisticVariable, Term, Rule } = require("fuzzyis");
const mfTypes = require("fuzzyis/lib/mfTypes");
const engine = require("../src/engine");
const {
  controllers,
  trustController: trust,
  securityController: security,
  intrusionController: intrusion,
} = require("../src/controllers");

describe("Models are described with FuzzyIS", () => {
  test.each([
    ["trust", trust.system, 27],
    ["security", security.system, 6],
    ["intrusion", intrusion.system, 12],
  ])("%s is a FuzzyIS FIS with its rule base", (_name, system, ruleCount) => {
    expect(system).toBeInstanceOf(FIS);
    expect(system.inputs).toHaveLength(3);
    expect(system.outputs).toHaveLength(1);
    expect(system.rules).toHaveLength(ruleCount);
    [...system.inputs, ...system.outputs].forEach((variable) => {
      expect(variable).toBeInstanceOf(LinguisticVariable);
      variable.terms.forEach((term) => expect(term).toBeInstanceOf(Term));
    });
    system.rules.forEach((rule) => expect(rule).toBeInstanceOf(Rule));
  });

  test("the FuzzyIS library itself is not patched", () => {
    // Shoulder terms still give NaN in the library's own trapeze at x = 0 ...
    expect(Number.isNaN(mfTypes.trapeze(0, 0, 0, 15, 30))).toBe(true);
    // ... while SafeTerm handles them.
    const term = new engine.SafeTerm("Low", "trapeze", [0, 0, 15, 30]);
    expect(term.valueAt(0)).toBe(1);
  });

  test("Gaussian terms use the FuzzyIS [sigma, center] order", () => {
    const term = intrusion.variables.Rate.terms.find((t) => t.name === "high");
    expect(term.mfType).toBe("gauss");
    expect(term.mfParams).toEqual([500, 1500]);
    expect(term.valueAt(1500)).toBe(1);
    expect(term.valueAt(2000)).toBeCloseTo(engine.gaussianMF(2000, 1500, 500), 12);
  });

  test("Security output is a set of FuzzyIS singletons", () => {
    security.variables.SR.terms.forEach((term) => expect(term.mfType).toBe("singleton"));
    expect(engine.singletonPositions(security.variables.SR)).toEqual({
      none: 0,
      veryLow: 20,
      low: 40,
      medium: 60,
      high: 80,
      veryHigh: 100,
    });
  });
});

describe("Inference is pure", () => {
  test("calculations do not write rule strengths into the FuzzyIS rules", () => {
    controllers.trust.calculate({ errors: 0.3, connections: 50, bytes: 7 });
    controllers.intrusion.calculate({ packets: 9, rate: 150, weight: 140 });
    controllers.security.calculate({ energy: 0.02, strength: 20, response: 5 });
    [trust.system, security.system, intrusion.system].forEach((system) => {
      system.rules.forEach((rule) => expect(rule.beliefDegree).toBeUndefined());
    });
  });

  test("interleaved trust calculations do not affect each other", () => {
    const a = { errors: 0.02, connections: 10, bytes: 2 };
    const b = { errors: 0.8, connections: 150, bytes: 11 };
    const aAlone = controllers.trust.calculate(a);
    controllers.trust.calculate(b);
    const aAgain = controllers.trust.calculate(a);
    expect(aAgain.value).toBe(aAlone.value);
    expect(aAgain.ruleOutputs).toEqual(aAlone.ruleOutputs);
  });
});

describe("Engine steps", () => {
  const out = engine.defineVariable("y", [0, 100], {
    A: { type: "triangle", params: [0, 50, 100] },
  });

  test("exact centroid of a symmetric clipped triangle is its axis", () => {
    const union = engine.aggregatedUnion(out, { A: 0.4 });
    expect(engine.exactCentroid(union, out, { A: 0.4 })).toBeCloseTo(50, 12);
  });

  test("exact centroid of a right triangle is two thirds along", () => {
    const right = engine.defineVariable("y", [0, 100], {
      R: { type: "triangle", params: [70, 100, 100] },
    });
    const union = engine.aggregatedUnion(right, { R: 1 });
    expect(engine.exactCentroid(union, right, { R: 1 })).toBeCloseTo(90, 12);
  });

  test("exact centroid is null when no rule fired", () => {
    const union = engine.aggregatedUnion(out, { A: 0 });
    expect(engine.exactCentroid(union, out, { A: 0 })).toBeNull();
  });

  test("grid points come from an integer counter and reach the end", () => {
    const xs = engine.gridPoints([0, 100], 0.2);
    expect(xs).toHaveLength(501);
    expect(xs[0]).toBe(0);
    expect(xs.at(-1)).toBe(100);
    expect(xs[3]).toBe(0.6);
  });

  test("t-norms", () => {
    expect(engine.T_NORMS.min([0.5, 0.8, 0.2])).toBe(0.2);
    expect(engine.T_NORMS.product([0.5, 0.8, 0.2])).toBeCloseTo(0.08, 12);
  });

  test("Sugeno weighted sum normalises the weights", () => {
    const evaluations = [
      { index: 1, out: "none", strength: 0.3 },
      { index: 2, out: "veryHigh", strength: 0.1 },
    ];
    const result = engine.sugenoWeightedSum(security.variables.SR, evaluations);
    expect(result.value).toBeCloseTo(25, 12);
    expect(result.normalizedWeights.none).toBeCloseTo(0.75, 12);
    expect(result.normalizedWeights.veryHigh).toBeCloseTo(0.25, 12);
  });
});

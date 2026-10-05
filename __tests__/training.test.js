/**
 * Training of the Security (ANFIS) and Intrusion (genetic algorithm)
 * controllers, the model variants in the API and the docs of trained models.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const request = require("supertest");
const app = require("../server");
const { controllers, securityController, intrusionController } = require("../src/controllers");
const { gridPoints } = require("../src/engine");
const anfis = require("../src/training/anfis");
const genetic = require("../src/training/genetic");
const { createRandom, leastSquares, regressionMetrics } = require("../src/training/utils");

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const securitySpec = { inputs: securityController.INPUTS, rules: securityController.rules };

/** A "teacher" Sugeno model with other break points and consequents. */
const TEACHER = {
  inputs: {
    EC: {
      low: { type: "triangle", params: [0, 0, 0.03] },
      medium: { type: "triangle", params: [0.005, 0.028, 0.048] },
      high: { type: "trapeze", params: [0.022, 0.045, 0.05, 0.05] },
    },
    TP: {
      low: { type: "triangle", params: [0, 0, 24] },
      medium: { type: "triangle", params: [4, 18, 36] },
      high: { type: "trapeze", params: [15, 35, 40, 40] },
    },
    Lat: {
      low: { type: "triangle", params: [0, 0, 6] },
      medium: { type: "triangle", params: [1, 4.5, 9] },
      high: { type: "trapeze", params: [4, 9, 10, 10] },
    },
  },
  consequents: { none: 5, veryLow: 25, low: 30, medium: 70, high: 75, veryHigh: 95 },
};

function teacherSamples(n, seed = 7) {
  const rnd = createRandom(seed);
  const teacher = securityController.buildModel(TEACHER, { variant: "teacher" });
  const samples = [];
  while (samples.length < n) {
    const x = [rnd.uniform(0.01, 0.05), rnd.uniform(10, 35), rnd.uniform(1, 10)];
    const { value } = teacher.calculate({ energy: x[0], strength: x[1], response: x[2] });
    if (value !== null) samples.push({ x, y: value });
  }
  return samples;
}

const intrusionSpec = {
  inputs: [
    { symbol: "NP", range: [0, 15] },
    { symbol: "Rate", range: [0, 3000] },
    { symbol: "We", range: [0, 250] },
  ],
  inputTerms: intrusionController.INPUT_TERMS,
  outputTerms: intrusionController.OUTPUT_TERMS,
  outputRange: [0, 100],
  sigmaMin: 0.01,
  // Rate "low" (15) and "medium" (150) of the expert model are 4.5 % of the
  // pps universe apart.
  minCenterGap: 0.04,
};

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

describe("training utilities", () => {
  test("seeded random numbers are reproducible", () => {
    const a = createRandom(3);
    const b = createRandom(3);
    const xs = Array.from({ length: 5 }, () => a.next());
    expect(Array.from({ length: 5 }, () => b.next())).toEqual(xs);
    xs.forEach((x) => {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    });
  });

  test("least squares recovers exact coefficients", () => {
    const A = [
      [1, 0, 2],
      [0, 1, 1],
      [1, 1, 0],
      [2, 1, 1],
    ];
    const theta = [3, -1, 0.5];
    const y = A.map((row) => row.reduce((acc, v, i) => acc + v * theta[i], 0));
    leastSquares(A, y).forEach((v, i) => expect(v).toBeCloseTo(theta[i], 10));
  });

  test("regression metrics", () => {
    const m = regressionMetrics([1, 2, 3], [1, 2, 5]);
    expect(m.rmse).toBeCloseTo(Math.sqrt(4 / 3), 12);
    expect(m.mae).toBeCloseTo(2 / 3, 12);
  });
});

// ---------------------------------------------------------------------------
// ANFIS
// ---------------------------------------------------------------------------

describe("ANFIS (Security)", () => {
  const initialState = () => {
    const state = { premise: {}, consequents: [3, 22, 41, 58, 83, 97] };
    securitySpec.inputs.forEach(({ symbol, range }) => {
      state.premise[symbol] = anfis.project(anfis.toNormalized(TEACHER.inputs[symbol], range));
    });
    return state;
  };

  test("normalised break points round-trip to the controller params", () => {
    securitySpec.inputs.forEach(({ symbol, range }) => {
      const physical = anfis.toPhysical(anfis.toNormalized(TEACHER.inputs[symbol], range), range);
      expect(physical.medium.params).toEqual(TEACHER.inputs[symbol].medium.params.map((v) => expect.closeTo(v, 5)));
      expect(physical.high.params).toEqual(TEACHER.inputs[symbol].high.params.map((v) => expect.closeTo(v, 5)));
    });
  });

  test("the base model is unchanged by the constraint projection", () => {
    securitySpec.inputs.forEach(({ symbol, range }) => {
      const p = anfis.toNormalized(securityController.BASE_PARAMS.inputs[symbol], range);
      expect(anfis.project(p)).toEqual(p);
    });
  });

  test("forward pass equals the controller of the app", () => {
    const samples = teacherSamples(50);
    const state = { premise: {}, consequents: [5, 25, 30, 70, 75, 95] };
    securitySpec.inputs.forEach(({ symbol, range }) => {
      state.premise[symbol] = anfis.toNormalized(TEACHER.inputs[symbol], range);
    });
    samples.forEach((s) => {
      expect(anfis.forward(state, securitySpec, s.x).y).toBeCloseTo(s.y, 9);
    });
  });

  test("analytic subgradients match finite differences", () => {
    const train = teacherSamples(300);
    const state = initialState();
    const error = (st) => {
      let sum = 0;
      let n = 0;
      train.forEach((s) => {
        const f = anfis.forward(st, securitySpec, s.x);
        if (f.sum > 0) {
          sum += 0.5 * (f.y - s.y) ** 2;
          n += 1;
        }
      });
      return sum / n;
    };
    const grad = anfis.premiseGradient(state, securitySpec, train);
    ["EC", "TP", "Lat"].forEach((symbol) => {
      ["L", "M", "H"].forEach((key) => {
        state.premise[symbol][key].forEach((_, q) => {
          const h = 1e-6;
          const plus = JSON.parse(JSON.stringify(state));
          const minus = JSON.parse(JSON.stringify(state));
          plus.premise[symbol][key][q] += h;
          minus.premise[symbol][key][q] -= h;
          const numeric = (error(plus) - error(minus)) / (2 * h);
          expect(grad[symbol][key][q]).toBeCloseTo(numeric, 3);
        });
      });
    });
  });

  test("training never leaves an input without a fired rule where the expert model has one", () => {
    const samples = teacherSamples(300, 3);
    const grid = [];
    for (let a = 0; a <= 0.05; a += 0.005) for (let b = 0; b <= 40; b += 4) for (let c = 0; c <= 10; c += 1) grid.push([a, b, c]);
    const result = anfis.trainAnfis({
      spec: securitySpec,
      initial: securityController.BASE_PARAMS,
      train: samples,
      coverage: grid,
      options: { epochs: 60 },
    });
    const baseModel = securityController.variants.base;
    const trained = securityController.buildModel(result.params, { variant: "trained" });
    grid.forEach(([energy, strength, response]) => {
      if (!baseModel.calculate({ energy, strength, response }).noRuleFired) {
        expect(trained.calculate({ energy, strength, response }).noRuleFired).toBe(false);
      }
    });
  });

  test("hybrid training recovers a teacher model and keeps the 6-rule mask", () => {
    const samples = teacherSamples(600);
    const result = anfis.trainAnfis({
      spec: securitySpec,
      initial: securityController.BASE_PARAMS,
      train: samples.slice(0, 420),
      test: samples.slice(420),
      options: { epochs: 150 },
    });
    expect(result.metrics.base.train.rmse).toBeGreaterThan(5);
    // Coverage is kept on every accepted step, so the fit is not exact, but
    // far better than the expert start.
    expect(result.metrics.trained.train.rmse).toBeLessThan(0.15 * result.metrics.base.train.rmse);
    expect(result.metrics.trained.test.rmse).toBeLessThan(0.15 * result.metrics.base.test.rmse);
    expect(result.metrics.trained.train.notFired).toBe(0);
    // Learning curve: the best epoch is never worse than the first one.
    expect(result.history[0].epoch).toBe(0);
    expect(result.history[result.best.epoch].epoch).toBe(result.best.epoch);
    expect(result.history[result.best.epoch].trainRmse).toBeLessThanOrEqual(result.history[1].trainRmse);
    expect(result.history[1].trainRmse).toBeLessThanOrEqual(result.history[0].trainRmse);

    // The trained params build a working controller with the same rules.
    const model = securityController.buildModel(result.params, { variant: "trained" });
    expect(model.system.rules).toHaveLength(6);
    expect(model.rules).toEqual(securityController.rules);
    const predicted = result.predict(samples.slice(420, 440));
    samples.slice(420, 440).forEach((s, i) => {
      const { value } = model.calculate({ energy: s.x[0], strength: s.x[1], response: s.x[2] });
      expect(value).toBeCloseTo(predicted[i], 1);
    });

    // Consequents stay inside the universe of SR.
    Object.values(result.params.consequents).forEach((c) => {
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(100);
    });
  });
});

// ---------------------------------------------------------------------------
// Genetic algorithm
// ---------------------------------------------------------------------------

describe("genetic optimisation (Intrusion)", () => {
  const base = intrusionController.BASE_PARAMS;

  test("chromosome has 74 genes and round-trips the base model", () => {
    expect(genetic.CHROMOSOME_LENGTH).toBe(74);
    const ch = genetic.encode(base, intrusionSpec);
    expect(ch.real).toHaveLength(26);
    expect(ch.rules).toHaveLength(48);
    const decoded = genetic.decode(ch, intrusionSpec);
    expect(decoded.rules).toEqual(base.rules);
    Object.entries(base.inputs).forEach(([symbol, terms]) => {
      Object.entries(terms).forEach(([term, cfg]) => {
        expect(decoded.inputs[symbol][term].params).toEqual(cfg.params);
      });
    });
  });

  test("fitness inference equals the Mamdani controller of the app", () => {
    const ch = genetic.encode(base, intrusionSpec);
    const rnd = createRandom(1);
    const samples = Array.from({ length: 40 }, () => ({
      x: [rnd.uniform(0, 15), rnd.uniform(0, 3000), rnd.uniform(0, 250)],
      y: 0,
    }));
    const predicted = genetic.predict(ch, genetic.toColumns(samples), genetic.gridOf([0, 100], 0.2));
    samples.forEach((s, i) => {
      const { value } = intrusionController.calculate({ packets: s.x[0], rate: s.x[1], weight: s.x[2] });
      // Same grid (0.2); the GA caches centroids by clip heights rounded to 1e-4.
      expect(Math.abs(predicted[i] - value)).toBeLessThan(0.01);
    });
  });

  test("validation orders the terms without changing the controller", () => {
    const rnd = createRandom(5);
    const ch = genetic.encode(base, intrusionSpec);
    // Swap the NP terms "low" and "high" in the genes only.
    [ch.real[0], ch.real[4]] = [ch.real[4], ch.real[0]];
    [ch.real[1], ch.real[5]] = [ch.real[5], ch.real[1]];
    for (let m = 0; m < 12; m += 1) {
      const g = ch.rules[m * 4];
      ch.rules[m * 4] = g === 0 ? 2 : g === 2 ? 0 : g;
    }
    const samples = Array.from({ length: 30 }, () => ({
      x: [rnd.uniform(0, 15), rnd.uniform(0, 3000), rnd.uniform(0, 250)],
      y: 0,
    }));
    const data = genetic.toColumns(samples);
    const grid = genetic.gridOf([0, 100], 0.5);
    const before = genetic.predict(ch, data, grid);
    genetic.validate(ch, intrusionSpec, rnd);
    const after = genetic.predict(ch, data, grid);
    after.forEach((v, i) => expect(v).toBeCloseTo(before[i], 9));
    expect(genetic.decode(ch, intrusionSpec).rules).toEqual(base.rules);
    // Centres ascending in every variable.
    for (let block = 0; block < 4; block += 1) {
      const n = block < 3 ? 3 : 4;
      const start = block * 6;
      for (let t = 1; t < n; t += 1) {
        expect(ch.real[start + 2 * t]).toBeGreaterThanOrEqual(ch.real[start + 2 * (t - 1)]);
      }
    }
  });

  test("validation removes duplicate premises and keeps σ positive", () => {
    const rnd = createRandom(9);
    const ch = genetic.encode(base, intrusionSpec);
    for (let m = 0; m < 12; m += 1) {
      ch.rules[m * 4] = 0;
      ch.rules[m * 4 + 1] = 0;
      ch.rules[m * 4 + 2] = 0;
    }
    ch.real[1] = -5;
    genetic.validate(ch, intrusionSpec, rnd);
    const premises = new Set();
    for (let m = 0; m < 12; m += 1) {
      premises.add(`${ch.rules[m * 4]}${ch.rules[m * 4 + 1]}${ch.rules[m * 4 + 2]}`);
    }
    expect(premises.size).toBe(12);
    for (let g = 1; g < 26; g += 2) expect(ch.real[g]).toBeGreaterThan(0);
  });

  test("evolution improves on the expert chromosome and is reproducible", () => {
    // Synthetic target: a controller with other rules and shifted Gaussians.
    const teacher = intrusionController.buildModel(
      {
        ...base,
        rules: base.rules.map(([c, o], i) => [c, intrusionController.OUTPUT_TERMS[(i * 3) % 4]]),
      },
      { variant: "teacher" }
    );
    const rnd = createRandom(11);
    const samples = Array.from({ length: 300 }, () => {
      const x = [rnd.uniform(0, 15), rnd.uniform(0, 3000), rnd.uniform(0, 250)];
      return { x, y: teacher.calculate({ packets: x[0], rate: x[1], weight: x[2] }).value };
    });
    const options = { initialPopulation: 30, populationSize: 12, generations: 15, seed: 4, gridStep: 1 };
    const run = () =>
      genetic.evolve({ spec: intrusionSpec, initial: base, train: samples.slice(0, 200), validation: samples.slice(200), options });
    const first = run();
    expect(first.best.rmse).toBeLessThan(first.expert.rmse);
    expect(first.history[first.history.length - 1].bestRmse).toBeLessThanOrEqual(first.history[0].bestRmse);
    expect(first.params.rules).toHaveLength(12);
    const second = run();
    expect(second.best.rmse).toBe(first.best.rmse);
    expect(second.params).toEqual(first.params);
  });
});

// ---------------------------------------------------------------------------
// Variants in the registry and the API
// ---------------------------------------------------------------------------

describe("model variants", () => {
  const trainedIntrusion = require("../src/controllers/trained/intrusion.json");
  const trainedSecurity = require("../src/controllers/trained/security.json");

  test("base variant is the original model", () => {
    expect(controllers.intrusion.variant("base").calculate).toBe(intrusionController.calculate);
    expect(controllers.security.variant("base").calculate).toBe(securityController.calculate);
    expect(controllers.trust.variant("trained")).toBeNull();
    expect(controllers.intrusion.variant("unknown")).toBeNull();
  });

  test("available variants follow the trained files", () => {
    expect(controllers.security.availableVariants().includes("trained")).toBe(trainedSecurity.status === "trained");
    expect(controllers.intrusion.availableVariants().includes("trained")).toBe(trainedIntrusion.status === "trained");
  });

  test("GET /models lists the variants", async () => {
    const response = await request(app).get("/api/controllers/intrusion/models");
    expect(response.status).toBe(200);
    expect(response.body.available).toContain("base");
    const missing = await request(app).get("/api/controllers/nope/models");
    expect(missing.status).toBe(404);
  });

  test("unknown model gives 404", async () => {
    const response = await request(app).post("/api/controllers/security/calculate?model=zzz").send({
      energy: 0.02,
      strength: 20,
      response: 5,
    });
    expect(response.status).toBe(404);
  });

  const describeTrained = trainedIntrusion.status === "trained" ? describe : describe.skip;
  describeTrained("trained intrusion model", () => {
    test("uses the log scale of Rate and 12 rules", () => {
      const model = controllers.intrusion.variant("trained");
      expect(model.ranges.rate).toEqual({ min: 0, max: 7 });
      expect(intrusionController.variants.trained.rules).toHaveLength(12);
    });

    test("API calculates with ?model=trained and validates the log range", async () => {
      const ok = await request(app)
        .post("/api/controllers/intrusion/calculate?model=trained")
        .send({ packets: 9.5, rate: 4, weight: 141.55 });
      expect(ok.status).toBe(200);
      expect(ok.body.value).toBeGreaterThanOrEqual(0);
      expect(ok.body.value).toBeLessThanOrEqual(100);
      const tooBig = await request(app)
        .post("/api/controllers/intrusion/calculate?model=trained")
        .send({ packets: 9.5, rate: 1500, weight: 141.55 });
      expect(tooBig.status).toBe(400);
      const mf = await request(app).get("/api/controllers/intrusion/membership-functions?model=trained");
      expect(mf.body.meta.variant).toBe("trained");
      expect(mf.body.meta.training.history.length).toBeGreaterThan(1);
    });

    test("stored metrics show the improvement over the expert model", () => {
      const { metrics } = trainedIntrusion.training;
      expect(metrics.trained.test.rmse).toBeLessThan(metrics.base.test.rmse);
    });
  });
});

// ---------------------------------------------------------------------------
// Docs of trained models
// ---------------------------------------------------------------------------

function loadDocsContext() {
  const context = {
    window: {},
    document: {
      readyState: "complete",
      documentElement: { style: { setProperty() {} } },
      getElementById: () => null,
      createElement: () => ({}),
      addEventListener: () => {},
    },
  };
  vm.createContext(context);
  ["term-colors.js", "controller-docs.js"].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public", file), "utf8"), context);
  });
  return context.window;
}

function pieceValue(docTerm, symbol, x) {
  const ops = { "<": (a, b) => a < b, "≤": (a, b) => a <= b, ">": (a, b) => a > b, "≥": (a, b) => a >= b };
  const matches = ([, condition]) => {
    const [left, right] = condition.split(symbol).map((p) => p.trim());
    if (left) {
      const [, num, op] = left.match(/^([-\d.]+)\s*([<≤>≥])$/);
      if (!ops[op](Number(num), x)) return false;
    }
    if (right) {
      const [, op, num] = right.match(/^([<≤>≥])\s*([-\d.]+)$/);
      if (!ops[op](x, Number(num))) return false;
    }
    return true;
  };
  const piece = docTerm.pieces.find(matches);
  if (!piece) throw new Error(`${symbol} ${docTerm.term}: no piece covers ${x}`);
  return new Function("x", `return ${piece[0].replace(/−/g, "-").split(symbol).join("(x)")};`)(x);
}

describe("docs of trained models", () => {
  const win = loadDocsContext();

  test("security: trained triangles, singletons and the same rules", () => {
    const model = securityController.buildModel(TEACHER, { variant: "trained" });
    const docs = win.buildTrainedDocs("security", model.membershipFunctions().meta.params);
    ["EC", "TP", "Lat"].forEach((symbol, i) => {
      const variable = model.variables[symbol];
      const [start, end] = variable.range;
      gridPoints([start, end], (end - start) / 200).forEach((x) => {
        docs.inputs[i].terms.forEach((docTerm) => {
          const term = variable.terms.find((t) => t.name === docTerm.term);
          expect(pieceValue(docTerm, symbol, x)).toBeCloseTo(term.valueAt(x), 3);
        });
      });
    });
    expect(docs.output.terms.map((t) => t.singleton)).toEqual([5, 25, 30, 70, 75, 95]);
    expect(docs.rules.rows).toEqual(win.controllerDocs.security.rules.rows);
    expect(docs.interpretationHtml).toContain("security.training.rulesTitle");
  });

  const trainedFile = require("../src/controllers/trained/intrusion.json");
  (trainedFile.status === "trained" ? test : test.skip)("intrusion: trained Gaussians and rules", () => {
    const model = intrusionController.variants.trained;
    const docs = win.buildTrainedDocs("intrusion", model.membershipFunctions().meta.params);
    expect(docs.inputs[1].domain).toEqual([0, 7]);
    ["NP", "Rate", "We"].forEach((symbol, i) => {
      docs.inputs[i].terms.forEach((docTerm) => {
        const [sigma, center] = model.variables[symbol].terms.find((t) => t.name === docTerm.term).mfParams;
        expect(docTerm.gaussian.center).toBeCloseTo(center, 9);
        expect(Number(docTerm.gaussian.denom)).toBeCloseTo(2 * sigma * sigma, 1);
      });
    });
    expect(docs.rules.rows).toEqual(model.rules.map(([c, o]) => [...c, o]));
    // The base docs stay untouched.
    expect(win.controllerDocs.intrusion.inputs[1].domain).toEqual([0, 3000]);
  });
});

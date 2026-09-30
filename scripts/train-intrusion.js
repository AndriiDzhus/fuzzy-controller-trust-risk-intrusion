#!/usr/bin/env node
/**
 * Genetic optimisation of the Intrusion controller.
 *
 *   npm run train:intrusion
 *   node scripts/train-intrusion.js [--generations 200] [--population 50] [--seed 42] [--dry-run]
 *
 * Data (built by scripts/data/prepare_datasets.py from CICIoT2023):
 *   data/intrusion/intrusion_train.csv        fitness is computed here
 *   data/intrusion/intrusion_validation.csv   watched during the evolution
 *   data/intrusion/intrusion_test.csv         final check only
 *   data/intrusion/label_to_ip.csv            expert target IP for every label
 *
 * Inputs: NP = Number, Rate = lg(1 + Rate) (log scale), We = Weight.
 * Writes src/controllers/trained/intrusion.json, which the app loads as the
 * "trained" variant.
 */
const fs = require("fs");
const path = require("path");
const intrusion = require("../src/controllers/intrusionController");
const { evolve, CHROMOSOME_LENGTH } = require("../src/training/genetic");
const { readCsv, cellNumber, regressionMetrics, round } = require("../src/training/utils");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data/intrusion");

function parseArgs(argv) {
  const args = {
    generations: 200,
    population: 50,
    initialPopulation: 150,
    seed: 42,
    out: path.join(root, "src/controllers/trained/intrusion.json"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--generations") args.generations = Number(argv[++i]);
    else if (flag === "--population") args.population = Number(argv[++i]);
    else if (flag === "--initial-population") args.initialPopulation = Number(argv[++i]);
    else if (flag === "--seed") args.seed = Number(argv[++i]);
    else if (flag === "--out") args.out = path.resolve(argv[++i]);
    else if (flag === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

const TRAINED_RANGES = {
  packets: { min: 0, max: 15 },
  rate: { min: 0, max: intrusion.LOG_RATE_MAX },
  weight: { min: 0, max: 250 },
};
const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));

function loadMapping() {
  const file = path.join(dataDir, "label_to_ip.csv");
  const mapping = {};
  readCsv(file).forEach((row) => {
    const ip = cellNumber(row.IP_target);
    if (ip === null || ip < 0 || ip > 100) {
      throw new Error(`label_to_ip.csv: IP_target of ${row.label} must be a number within [0, 100]`);
    }
    mapping[row.label] = { ip, category: row.category };
  });
  return mapping;
}

function loadSplit(name, mapping) {
  const file = path.join(dataDir, `intrusion_${name}.csv`);
  return readCsv(file).map((row) => {
    if (!mapping[row.label]) throw new Error(`label ${row.label} is missing in label_to_ip.csv`);
    const np = cellNumber(row.NP);
    const pps = cellNumber(row.Rate);
    const we = cellNumber(row.We);
    return {
      label: row.label,
      category: row.category,
      raw: { np, pps, we },
      // Inputs of the trained model: log scale for Rate, clipped to the universes.
      x: [
        clamp(np, TRAINED_RANGES.packets),
        clamp(intrusion.toLogRate(pps), TRAINED_RANGES.rate),
        clamp(we, TRAINED_RANGES.weight),
      ],
      y: mapping[row.label].ip,
    };
  });
}

// ---------------------------------------------------------------------------
// Initial chromosome: the expert model with Rate moved to the log scale
// ---------------------------------------------------------------------------

/**
 * A Gaussian (c, σ) in pps becomes (lg(1 + c), σ / ((1 + c) ln 10)) on the log
 * scale: the same centre and the same local slope around it.
 */
function expertInLogScale() {
  const base = intrusion.BASE_PARAMS;
  const rate = {};
  Object.entries(base.inputs.Rate).forEach(([term, { params: [sigma, center] }]) => {
    const c = intrusion.toLogRate(center);
    const s = Math.max(0.05, sigma / ((1 + center) * Math.LN10));
    rate[term] = { type: "gauss", params: [round(s, 4), round(c, 4)] };
  });
  return { ...base, inputs: { ...base.inputs, Rate: rate } };
}

// ---------------------------------------------------------------------------
// Metrics of an app model on a split
// ---------------------------------------------------------------------------

const TERM_CENTRES = { none: 0, low: 30, medium: 60, high: 100 };

/** Output term closest to a target value (by the centres of the base model). */
function targetTerm(y) {
  let best = null;
  Object.entries(TERM_CENTRES).forEach(([term, c]) => {
    if (best === null || Math.abs(y - c) < Math.abs(y - TERM_CENTRES[best])) best = term;
  });
  return best;
}

function modelMetrics(model, samples, toInputs) {
  const predicted = [];
  const target = [];
  let termHits = 0;
  const detection = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const byCategory = {};
  samples.forEach((s) => {
    const result = model.calculate(toInputs(s));
    predicted.push(result.value);
    target.push(s.y);
    if (result.dominantTerm === targetTerm(s.y)) termHits += 1;
    const attack = s.category !== "Benign";
    const alarm = result.value >= 50;
    if (attack && alarm) detection.tp += 1;
    else if (attack) detection.fn += 1;
    else if (alarm) detection.fp += 1;
    else detection.tn += 1;
    const cat = (byCategory[s.category] = byCategory[s.category] || { n: 0, sum: 0, target: s.y });
    cat.n += 1;
    cat.sum += result.value;
  });
  const reg = regressionMetrics(predicted, target);
  const { tp, fp, tn, fn } = detection;
  const precision = tp + fp ? tp / (tp + fp) : 0;
  const recall = tp + fn ? tp / (tp + fn) : 0;
  const categories = {};
  Object.entries(byCategory)
    .sort(([a], [b]) => a.localeCompare(b))
    .forEach(([cat, v]) => {
      categories[cat] = { n: v.n, meanIP: round(v.sum / v.n, 2) };
    });
  return {
    n: reg.n,
    rmse: round(reg.rmse, 4),
    mae: round(reg.mae, 4),
    r2: reg.r2 == null ? null : round(reg.r2, 4),
    termAccuracy: round(termHits / samples.length, 4),
    detection: {
      threshold: 50,
      accuracy: round((tp + tn) / samples.length, 4),
      // Mean of the detection rates of attacks and of benign traffic: robust
      // to the attack-heavy class balance.
      balancedAccuracy: round(((tp + fn ? tp / (tp + fn) : 0) + (tn + fp ? tn / (tn + fp) : 0)) / 2, 4),
      precision: round(precision, 4),
      recall: round(recall, 4),
      f1: round(precision + recall ? (2 * precision * recall) / (precision + recall) : 0, 4),
      ...detection,
    },
    meanIPByCategory: categories,
  };
}

// Base model: Rate in pps limited to its universe [0, 3000], as in the app.
const baseInputs = (s) => ({
  packets: clamp(s.raw.np, intrusion.ranges.packets),
  rate: clamp(s.raw.pps, intrusion.ranges.rate),
  weight: clamp(s.raw.we, intrusion.ranges.weight),
});
const trainedInputs = (s) => ({ packets: s.x[0], rate: s.x[1], weight: s.x[2] });

function line(name, m) {
  return (
    `${name.padEnd(18)} RMSE ${m.rmse.toFixed(2).padStart(6)}  MAE ${m.mae.toFixed(2).padStart(6)}  ` +
    `R² ${m.r2 == null ? "  —  " : m.r2.toFixed(3)}  term acc ${(100 * m.termAccuracy).toFixed(1)}%  ` +
    `detect bal.acc ${(100 * m.detection.balancedAccuracy).toFixed(1)}%  F1 ${(100 * m.detection.f1).toFixed(1)}%`
  );
}

// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs(process.argv.slice(2));
  const mapping = loadMapping();
  const train = loadSplit("train", mapping);
  const validation = loadSplit("validation", mapping);
  const test = loadSplit("test", mapping);
  console.log(`data: train ${train.length}, validation ${validation.length}, test ${test.length}`);
  console.log(`chromosome: ${CHROMOSOME_LENGTH} genes; population N0 = ${args.initialPopulation}, N = ${args.population}`);

  const spec = {
    inputs: [
      { symbol: "NP", range: [TRAINED_RANGES.packets.min, TRAINED_RANGES.packets.max] },
      { symbol: "Rate", range: [TRAINED_RANGES.rate.min, TRAINED_RANGES.rate.max] },
      { symbol: "We", range: [TRAINED_RANGES.weight.min, TRAINED_RANGES.weight.max] },
    ],
    inputTerms: intrusion.INPUT_TERMS,
    outputTerms: intrusion.OUTPUT_TERMS,
    outputRange: [0, 100],
    sigmaMin: 0.01,
    minCenterGap: 0.1,
  };
  const options = {
    initialPopulation: args.initialPopulation,
    populationSize: args.population,
    generations: args.generations,
    seed: args.seed,
  };

  const started = Date.now();
  const result = evolve({
    spec,
    initial: expertInLogScale(),
    train,
    validation,
    options,
    onGeneration: (e) => {
      if (e.generation % 10 === 0) {
        console.log(
          `gen ${String(e.generation).padStart(4)}  best RMSE ${e.bestRmse.toFixed(3)}  ` +
            `mean ${e.meanRmse.toFixed(3)}  validation ${e.validationRmse.toFixed(3)}`
        );
      }
    },
  });
  const seconds = (Date.now() - started) / 1000;
  console.log(`\n${result.history.length - 1} generations, ${seconds.toFixed(1)} s`);

  const params = { rateScale: "log10p1", ranges: TRAINED_RANGES, ...result.params };
  const trainedModel = intrusion.buildModel(params, { variant: "trained" });
  const baseModel = intrusion.variants.base;
  const expertLogModel = intrusion.buildModel(
    { rateScale: "log10p1", ranges: TRAINED_RANGES, ...expertInLogScale() },
    { variant: "expert-log" }
  );

  const metrics = { base: {}, expertLog: {}, trained: {} };
  [["train", train], ["validation", validation], ["test", test]].forEach(([name, samples]) => {
    metrics.base[name] = modelMetrics(baseModel, samples, baseInputs);
    metrics.expertLog[name] = modelMetrics(expertLogModel, samples, trainedInputs);
    metrics.trained[name] = modelMetrics(trainedModel, samples, trainedInputs);
  });

  console.log("");
  ["train", "validation", "test"].forEach((name) => {
    console.log(line(`base ${name}`, metrics.base[name]));
    console.log(line(`trained ${name}`, metrics.trained[name]));
  });
  console.log("\nmean IP by category (test): base → trained");
  Object.keys(metrics.trained.test.meanIPByCategory).forEach((cat) => {
    const b = metrics.base.test.meanIPByCategory[cat].meanIP;
    const t = metrics.trained.test.meanIPByCategory[cat].meanIP;
    const target = test.find((s) => s.category === cat)?.y;
    console.log(`  ${cat.padEnd(11)} target ${String(target).padStart(3)}   ${b.toFixed(1).padStart(5)} → ${t.toFixed(1)}`);
  });
  console.log("\nrules:");
  params.rules.forEach(([c, o], i) => console.log(`  ${String(i + 1).padStart(2)}. NP ${c[0]}, Rate ${c[1]}, We ${c[2]} → IP ${o}`));

  if (args.dryRun) {
    console.log("\n(dry run: nothing saved)");
    return;
  }

  const output = {
    status: "trained",
    params,
    training: {
      method: "Genetic algorithm: tournament selection, arithmetic + two-point crossover, Gaussian + index mutation",
      createdAt: new Date().toISOString(),
      datasets: {
        train: "data/intrusion/intrusion_train.csv",
        validation: "data/intrusion/intrusion_validation.csv",
        test: "data/intrusion/intrusion_test.csv",
        target: "data/intrusion/label_to_ip.csv",
      },
      targetByLabel: Object.fromEntries(Object.entries(mapping).map(([label, v]) => [label, v.ip])),
      categoryByLabel: Object.fromEntries(Object.entries(mapping).map(([label, v]) => [label, v.category])),
      samples: { train: train.length, validation: validation.length, test: test.length },
      chromosomeLength: CHROMOSOME_LENGTH,
      options: { ...options, generationsRun: result.history.length - 1 },
      fitness: { expert: round(result.expert.fitness, 6), best: round(result.best.fitness, 6) },
      metrics,
      history: result.history.map((h) => ({
        generation: h.generation,
        bestRmse: round(h.bestRmse, 4),
        meanRmse: round(h.meanRmse, 4),
        validationRmse: h.validationRmse == null ? null : round(h.validationRmse, 4),
      })),
    },
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nsaved ${path.relative(root, args.out)}`);
}

main();

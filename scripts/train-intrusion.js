#!/usr/bin/env node
/**
 * Genetic optimisation of the Intrusion controller.
 *
 *   npm run train:intrusion
 *   node scripts/train-intrusion.js [--full] [--generations 200] [--population 200] [--initial-population 300]
 *                                    [--target-rmse 0] [--seed 42] [--log-rate] [--dry-run]
 *
 * --log-rate trains with Rate on the lg(1 + pps) scale (for real traffic with a
 * wide spread of pps); without it Rate is in pps as in the theory.
 *
 * Data: data/intrusion.csv (the dataset the app ships; NP, Rate, We, IP,
 * label, category, split). With --full, the big CICIoT2023 sample built by
 * scripts/data/prepare_datasets.py:
 *   data/full/intrusion/intrusion.csv      NP, Rate, We, label, category, split
 *                                          (train: fitness; validation: watched; test: final check)
 *   data/full/intrusion/label_to_ip.csv    expert target IP for every label
 *
 * Inputs: NP = Number, Rate (pps, or lg(1 + Rate) with --log-rate), We = Weight.
 * Writes src/controllers/trained/intrusion.json, which the app loads as the
 * "trained" variant.
 */
const fs = require("fs");
const path = require("path");
const intrusion = require("../src/controllers/intrusionController");
const { CHROMOSOME_LENGTH } = require("../src/training/genetic");
const { runTraining, METHODS } = require("../src/training/session");
const { readCsv, cellNumber } = require("../src/training/utils");

const root = path.join(__dirname, "..");
const dataDir = path.join(root, "data/full/intrusion");
const appData = path.join(root, "data/intrusion.csv");

function parseArgs(argv) {
  const d = METHODS.intrusion.defaultOptions;
  const args = {
    generations: d.generations,
    population: d.populationSize,
    initialPopulation: d.initialPopulation,
    targetRmse: d.targetRmse,
    seed: d.seed,
    logRate: d.logRate,
    full: false,
    out: path.join(root, "src/controllers/trained/intrusion.json"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--full") args.full = true;
    else if (flag === "--log-rate") args.logRate = 1;
    else if (flag === "--generations") args.generations = Number(argv[++i]);
    else if (flag === "--population") args.population = Number(argv[++i]);
    else if (flag === "--initial-population") args.initialPopulation = Number(argv[++i]);
    else if (flag === "--target-rmse") args.targetRmse = Number(argv[++i]);
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

/** data/full/intrusion/intrusion.csv: IP comes from label_to_ip.csv. */
function loadFull(mapping) {
  const bySplit = { train: [], validation: [], test: [] };
  readCsv(path.join(dataDir, "intrusion.csv")).forEach((row) => {
    if (!mapping[row.label]) throw new Error(`label ${row.label} is missing in label_to_ip.csv`);
    (bySplit[row.split] || bySplit.train).push({
      label: row.label,
      category: row.category,
      raw: { NP: cellNumber(row.NP), Rate: cellNumber(row.Rate), We: cellNumber(row.We) },
      y: mapping[row.label].ip,
    });
  });
  return bySplit;
}

/** data/intrusion.csv: IP is in the file; the mapping is derived from it. */
function loadApp() {
  const bySplit = { train: [], validation: [], test: [] };
  const mapping = {};
  readCsv(appData).forEach((row) => {
    const y = cellNumber(row.IP);
    if (y === null || y < 0 || y > 100) throw new Error(`intrusion.csv: IP of ${row.label} must be a number within [0, 100]`);
    mapping[row.label] = { ip: y, category: row.category };
    (bySplit[row.split] || bySplit.train).push({
      label: row.label,
      category: row.category,
      raw: { NP: cellNumber(row.NP), Rate: cellNumber(row.Rate), We: cellNumber(row.We) },
      y,
    });
  });
  return { bySplit, mapping };
}

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
  let mapping;
  let bySplit;
  if (args.full) {
    mapping = loadMapping();
    bySplit = loadFull(mapping);
  } else {
    ({ mapping, bySplit } = loadApp());
  }
  const datasetName = args.full ? "data/full/intrusion/intrusion.csv" : "data/intrusion.csv";
  console.log(`data: ${datasetName}: train ${bySplit.train.length}, validation ${bySplit.validation.length}, test ${bySplit.test.length}`);
  console.log(`chromosome: ${CHROMOSOME_LENGTH} genes; population N0 = ${args.initialPopulation}, N = ${args.population}`);

  const options = {
    initialPopulation: args.initialPopulation,
    populationSize: args.population,
    generations: args.generations,
    targetRmse: args.targetRmse,
    seed: args.seed,
    logRate: args.logRate,
  };

  runTraining({
    controller: "intrusion",
    bySplit,
    options,
    datasetName,
    onProgress: (e) => {
      if (e.generation % 10 === 0) {
        console.log(
          `gen ${String(e.generation).padStart(4)}  best RMSE ${e.bestRmse.toFixed(3)}  ` +
            `mean ${e.meanRmse.toFixed(3)}  validation ${e.validationRmse.toFixed(3)}`
        );
      }
    },
  })
    .then((result) => report(result, args, mapping))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

function report(result, args, mapping) {
  const { params, training } = result;
  console.log(`\n${training.steps} generations (${training.stopReason}), ${training.seconds} s`);
  const { metrics } = training;
  console.log("");
  ["train", "validation", "test"].forEach((name) => {
    console.log(line(`base ${name}`, metrics.base[name]));
    console.log(line(`trained ${name}`, metrics.trained[name]));
  });
  console.log("\nmean IP by category (test): base → trained");
  Object.keys(metrics.trained.test.meanIPByCategory).forEach((cat) => {
    const b = metrics.base.test.meanIPByCategory[cat].meanIP;
    const t = metrics.trained.test.meanIPByCategory[cat].meanIP;
    const targets = [...new Set(Object.values(mapping).filter((v) => v.category === cat).map((v) => v.ip))].sort((a, b) => a - b);
    console.log(`  ${cat.padEnd(11)} target ${targets.join("/").padStart(6)}   ${b.toFixed(1).padStart(5)} → ${t.toFixed(1)}`);
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
      ...training,
      datasets: args.full
        ? { all: "data/full/intrusion/intrusion.csv", target: "data/full/intrusion/label_to_ip.csv" }
        : { all: "data/intrusion.csv" },
      targetByLabel: Object.fromEntries(Object.entries(mapping).map(([label, v]) => [label, v.ip])),
      categoryByLabel: Object.fromEntries(Object.entries(mapping).map(([label, v]) => [label, v.category])),
    },
    changes: result.changes,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nsaved ${path.relative(root, args.out)}`);
}

main();

#!/usr/bin/env node
/**
 * Genetic optimisation of the Intrusion controller.
 *
 *   npm run train:intrusion
 *   node scripts/train-intrusion.js [--data <csv>] [--generations 100] [--population 100]
 *                                    [--initial-population 150] [--target-rmse 0] [--seed 42] [--dry-run]
 *
 * Data: data/intrusion.csv (the dataset the app ships): NP, Rate, We, IP; an
 * optional split column (train / validation / test), otherwise the rows are
 * divided 70/15/15 as the app does it.
 * Writes src/controllers/trained/intrusion.json, which the app loads as the
 * "trained" variant.
 */
const fs = require("fs");
const path = require("path");
const intrusion = require("../src/controllers/intrusionController");
const { CHROMOSOME_LENGTH } = require("../src/training/genetic");
const { runTraining, METHODS } = require("../src/training/session");
const datasets = require("../src/training/datasets");

const root = path.join(__dirname, "..");
const appData = path.join(root, "data/intrusion.csv");

function parseArgs(argv) {
  const d = METHODS.intrusion.defaultOptions;
  const args = {
    generations: d.generations,
    population: d.populationSize,
    initialPopulation: d.initialPopulation,
    targetRmse: d.targetRmse,
    seed: d.seed,
    data: appData,
    out: path.join(root, "src/controllers/trained/intrusion.json"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--data") args.data = path.resolve(argv[++i]);
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

/** The dataset file; the split is assigned as the app does it. */
function loadData(file) {
  const table = datasets.tableFromCsv(fs.readFileSync(file, "utf8"));
  const prepared = datasets.prepareDataset("intrusion", table);
  if (!prepared.ok) throw new Error(`intrusion.csv: ${prepared.error}`);
  const bySplit = {};
  Object.entries(prepared.bySplit).forEach(([name, rows]) => {
    bySplit[name] = rows.map(({ raw, y, label, category }) => ({ raw, y, label, category }));
  });
  return bySplit;
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
  const bySplit = loadData(args.data);
  const datasetName = path.relative(root, args.data);
  console.log(`data: ${datasetName}: train ${bySplit.train.length}, validation ${bySplit.validation.length}, test ${bySplit.test.length}`);
  console.log(`chromosome: ${CHROMOSOME_LENGTH} genes; population N0 = ${args.initialPopulation}, N = ${args.population}`);

  const options = {
    initialPopulation: args.initialPopulation,
    populationSize: args.population,
    generations: args.generations,
    targetRmse: args.targetRmse,
    seed: args.seed,
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
            `mean ${e.meanRmse.toFixed(3)}  validation ${e.validationRmse == null ? "—" : e.validationRmse.toFixed(3)}`
        );
      }
    },
  })
    .then((result) => report(result, args))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

function report(result, args) {
  const { params, training } = result;
  console.log(`\n${training.steps} generations (${training.stopReason}), ${training.seconds} s`);
  const { metrics } = training;
  console.log("");
  ["train", "validation", "test"].forEach((name) => {
    console.log(line(`base ${name}`, metrics.base[name]));
    console.log(line(`trained ${name}`, metrics.trained[name]));
  });
  const byCategory = metrics.trained.test.meanIPByCategory;
  if (byCategory) console.log("\nmean IP by category (test): base → trained");
  Object.keys(byCategory || {}).forEach((cat) => {
    const b = metrics.base.test.meanIPByCategory[cat].meanIP;
    const t = metrics.trained.test.meanIPByCategory[cat].meanIP;
    console.log(`  ${cat.padEnd(11)} ${b.toFixed(1).padStart(5)} → ${t.toFixed(1)}`);
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
      dataset: datasetName,
    },
    changes: result.changes,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nsaved ${path.relative(root, args.out)}`);
}

main();

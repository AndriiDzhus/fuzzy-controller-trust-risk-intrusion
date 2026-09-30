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
const { CHROMOSOME_LENGTH } = require("../src/training/genetic");
const { runTraining } = require("../src/training/session");
const { readCsv, cellNumber } = require("../src/training/utils");

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
    return {
      label: row.label,
      category: row.category,
      raw: { NP: cellNumber(row.NP), Rate: cellNumber(row.Rate), We: cellNumber(row.We) },
      y: mapping[row.label].ip,
    };
  });
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
  const mapping = loadMapping();
  const bySplit = {
    train: loadSplit("train", mapping),
    validation: loadSplit("validation", mapping),
    test: loadSplit("test", mapping),
  };
  console.log(`data: train ${bySplit.train.length}, validation ${bySplit.validation.length}, test ${bySplit.test.length}`);
  console.log(`chromosome: ${CHROMOSOME_LENGTH} genes; population N0 = ${args.initialPopulation}, N = ${args.population}`);

  const options = {
    initialPopulation: args.initialPopulation,
    populationSize: args.population,
    generations: args.generations,
    seed: args.seed,
  };

  runTraining({
    controller: "intrusion",
    bySplit,
    options,
    datasetName: "data/intrusion/intrusion_*.csv",
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
      datasets: {
        train: "data/intrusion/intrusion_train.csv",
        validation: "data/intrusion/intrusion_validation.csv",
        test: "data/intrusion/intrusion_test.csv",
        target: "data/intrusion/label_to_ip.csv",
      },
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

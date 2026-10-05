#!/usr/bin/env node
/**
 * ANFIS training of the Security controller.
 *
 *   npm run train:security
 *   node scripts/train-security.js [--size 20|50|100|500 | --data <csv>] [--target SR] [--epochs 100] [--dry-run]
 *
 * Reads one of the four datasets the app ships (data/security-20|50|100|500.csv,
 * --size, default 50): EC, TP, Lat and the target SR. The rows are divided 70/30
 * as the app does it. Rows with an empty target are skipped. Writes
 * src/controllers/trained/security.json (the trained parameters, metrics and
 * learning curve), which the app loads as the "trained" variant.
 *
 * --target SR_base trains on the output of the base model itself; it only
 * checks the pipeline (the error is ~0 from the start) and is never saved.
 */
const fs = require("fs");
const path = require("path");
const { runTraining, METHODS } = require("../src/training/session");
const { readCsv } = require("../src/training/utils");
const datasets = require("../src/training/datasets");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    data: path.join(root, datasets.datasetFile("security", datasets.DEFAULT_DATASET_SIZE.security)),
    target: "SR",
    epochs: METHODS.security.defaultOptions.epochs,
    out: path.join(root, "src/controllers/trained/security.json"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--size") {
      const size = Number(argv[++i]);
      if (!datasets.isDatasetSize("security", size)) throw new Error(`--size must be one of ${datasets.DATASET_SIZES.join(", ")}`);
      args.data = path.join(root, datasets.datasetFile("security", size));
    } else if (flag === "--data") args.data = path.resolve(argv[++i]);
    else if (flag === "--target") args.target = argv[++i];
    else if (flag === "--epochs") args.epochs = Number(argv[++i]);
    else if (flag === "--out") args.out = path.resolve(argv[++i]);
    else if (flag === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (args.target === "SR_base") args.dryRun = true;
  return args;
}

/**
 * Rows of the file with `target` as SR; the split comes from the file's split
 * column when present, otherwise it is assigned as the app does it (70/30).
 */
function loadSamples(file, target) {
  const rows = readCsv(file);
  const records = rows.map((row) => ({ EC: row.EC, TP: row.TP, Lat: row.Lat, SR: row[target], split: row.split }));
  const prepared = datasets.prepareDataset("security", { header: ["EC", "TP", "Lat", "SR", "split"], records });
  if (!prepared.ok) {
    if (prepared.error === "tooFewRows") return { train: prepared.bySplit?.train || [], test: [], total: rows.length, skipped: prepared.skipped };
    throw new Error(`${path.relative(root, file)}: ${prepared.error}`);
  }
  const pick = (name) => (prepared.bySplit[name] || []).map(({ raw, y }) => ({ raw, y }));
  return { train: pick("train"), test: pick("test"), total: rows.length, skipped: prepared.skipped };
}

function fmt(metrics) {
  if (!metrics || metrics.rmse == null) return "—";
  const r2 = metrics.r2 == null ? "—" : metrics.r2.toFixed(3);
  return `RMSE ${metrics.rmse.toFixed(2)}  MAE ${metrics.mae.toFixed(2)}  R² ${r2}  (n=${metrics.n}, no rule: ${metrics.notFired})`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { train, test, total, skipped } = loadSamples(args.data, args.target);
  console.log(`data: ${path.relative(root, args.data)}  target: ${args.target}`);
  console.log(`rows: ${total}, used ${train.length} train + ${test.length} test, skipped ${skipped} without target`);
  if (train.length < 30) {
    console.error(
      `\nToo few labelled rows (${train.length} in train). Fill the ${args.target} column of\n` +
        `${path.relative(root, args.data)} (values 0–100) and run the training again.`
    );
    process.exit(1);
  }

  runTraining({
    controller: "security",
    bySplit: { train, test },
    options: { epochs: args.epochs },
    datasetName: path.relative(root, args.data),
  })
    .then((result) => report(result, args))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

function report(result, args) {
  const { params, training } = result;
  console.log(`\nepochs run: ${training.steps} (${training.stopReason}), best epoch: ${training.bestEpoch}, ${training.seconds} s`);
  console.log(`base     train  ${fmt(training.metrics.base.train)}`);
  console.log(`base     test   ${fmt(training.metrics.base.test)}`);
  console.log(`trained  train  ${fmt(training.metrics.trained.train)}`);
  console.log(`trained  test   ${fmt(training.metrics.trained.test)}`);
  console.log("\nconsequents:", JSON.stringify(params.consequents));
  Object.entries(params.inputs).forEach(([symbol, terms]) => {
    const text = Object.entries(terms)
      .map(([term, cfg]) => `${term} [${cfg.params.join(", ")}]`)
      .join("  ");
    console.log(`${symbol.padEnd(4)} ${text}`);
  });

  if (args.dryRun) {
    console.log("\n(dry run: nothing saved)");
    return;
  }

  const output = {
    status: "trained",
    params,
    training: { ...training, target: args.target },
    changes: result.changes,
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nsaved ${path.relative(root, args.out)}`);
}

main();

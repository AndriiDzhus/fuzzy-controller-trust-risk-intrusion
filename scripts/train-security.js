#!/usr/bin/env node
/**
 * ANFIS training of the Security controller.
 *
 *   npm run train:security
 *   node scripts/train-security.js [--data <csv>] [--target SR_expert] [--epochs 200] [--dry-run]
 *
 * Reads data/security/security_labeling.csv: EC, TP, Lat, the expert target
 * SR_expert and the train / test split. Rows with an empty target are skipped.
 * Writes src/controllers/trained/security.json (the trained parameters, metrics
 * and learning curve), which the app loads as the "trained" variant.
 *
 * --target SR_base trains on the output of the base model itself; it only
 * checks the pipeline (the error is ~0 from the start) and is never saved.
 */
const fs = require("fs");
const path = require("path");
const { runTraining, securityCoverage } = require("../src/training/session");
const { readCsv, cellNumber } = require("../src/training/utils");

const root = path.join(__dirname, "..");

function parseArgs(argv) {
  const args = {
    data: path.join(root, "data/security/security_labeling.csv"),
    target: "SR_expert",
    epochs: 200,
    out: path.join(root, "src/controllers/trained/security.json"),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--data") args.data = path.resolve(argv[++i]);
    else if (flag === "--target") args.target = argv[++i];
    else if (flag === "--epochs") args.epochs = Number(argv[++i]);
    else if (flag === "--out") args.out = path.resolve(argv[++i]);
    else if (flag === "--dry-run") args.dryRun = true;
    else throw new Error(`unknown argument ${flag}`);
  }
  if (args.target !== "SR_expert") args.dryRun = true;
  return args;
}

function loadSamples(file, target) {
  const rows = readCsv(file);
  const samples = { train: [], test: [] };
  let skipped = 0;
  rows.forEach((row) => {
    const x = [cellNumber(row.EC), cellNumber(row.TP), cellNumber(row.Lat)];
    const y = cellNumber(row[target]);
    if (x.some((v) => v === null) || y === null) {
      skipped += 1;
      return;
    }
    if (y < 0 || y > 100) throw new Error(`${target} must be within [0, 100], row_id ${row.row_id}: ${y}`);
    samples[row.split === "test" ? "test" : "train"].push({
      id: Number(row.row_id),
      raw: { EC: x[0], TP: x[1], Lat: x[2] },
      y,
    });
  });
  return { ...samples, total: rows.length, skipped };
}

/** Coverage inputs: all 1000 rows of the 6G dataset plus a grid (no targets). */
function coveragePoints() {
  const file = path.join(root, "data/security/security_6g.csv");
  const rows = fs.existsSync(file)
    ? readCsv(file).map((r) => [cellNumber(r.EC), cellNumber(r.TP), cellNumber(r.Lat)])
    : [];
  return securityCoverage(rows);
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
    coverage: coveragePoints(),
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

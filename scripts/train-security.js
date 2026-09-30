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
const security = require("../src/controllers/securityController");
const { trainAnfis } = require("../src/training/anfis");
const { readCsv, cellNumber, round } = require("../src/training/utils");

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
    samples[row.split === "test" ? "test" : "train"].push({ id: Number(row.row_id), x, y });
  });
  return { ...samples, total: rows.length, skipped };
}

/**
 * Inputs where the trained model must keep a fired rule: all 1000 rows of the
 * 6G dataset and a 12×12×12 grid over the box they span (no targets used).
 */
function coveragePoints() {
  const file = path.join(root, "data/security/security_6g.csv");
  const rows = fs.existsSync(file)
    ? readCsv(file).map((r) => [cellNumber(r.EC), cellNumber(r.TP), cellNumber(r.Lat)])
    : [];
  if (!rows.length) return [];
  const lo = [0, 1, 2].map((i) => Math.min(...rows.map((r) => r[i])));
  const hi = [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i])));
  const n = 12;
  const axis = (i) => Array.from({ length: n }, (_, k) => lo[i] + ((hi[i] - lo[i]) * k) / (n - 1));
  const grid = [];
  axis(0).forEach((a) => axis(1).forEach((b) => axis(2).forEach((c) => grid.push([a, b, c]))));
  return [...rows, ...grid];
}

function fmt(metrics) {
  if (!metrics || metrics.rmse == null) return "—";
  const r2 = metrics.r2 == null ? "—" : metrics.r2.toFixed(3);
  return `RMSE ${metrics.rmse.toFixed(2)}  MAE ${metrics.mae.toFixed(2)}  R² ${r2}  (n=${metrics.n}, no rule: ${metrics.notFired})`;
}

function roundMetrics(m) {
  if (!m) return null;
  return {
    n: m.n,
    rmse: m.rmse == null ? null : round(m.rmse, 4),
    mae: m.mae == null ? null : round(m.mae, 4),
    r2: m.r2 == null ? null : round(m.r2, 4),
    notFired: m.notFired,
  };
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

  const spec = { inputs: security.INPUTS, rules: security.rules };
  const coverage = coveragePoints();
  const started = Date.now();
  const result = trainAnfis({
    spec,
    initial: security.BASE_PARAMS,
    train,
    test,
    coverage,
    options: { epochs: args.epochs },
  });
  const seconds = (Date.now() - started) / 1000;

  console.log(`\nepochs run: ${result.history.length}, best epoch: ${result.best.epoch}, ${seconds.toFixed(1)} s`);
  console.log(`base     train  ${fmt(result.metrics.base.train)}`);
  console.log(`base     test   ${fmt(result.metrics.base.test)}`);
  console.log(`trained  train  ${fmt(result.metrics.trained.train)}`);
  console.log(`trained  test   ${fmt(result.metrics.trained.test)}`);
  console.log("\nconsequents:", JSON.stringify(result.params.consequents));
  Object.entries(result.params.inputs).forEach(([symbol, terms]) => {
    const text = Object.entries(terms)
      .map(([term, { params }]) => `${term} [${params.join(", ")}]`)
      .join("  ");
    console.log(`${symbol.padEnd(4)} ${text}`);
  });

  if (args.dryRun) {
    console.log("\n(dry run: nothing saved)");
    return;
  }

  const output = {
    status: "trained",
    params: result.params,
    training: {
      method: "ANFIS hybrid: least squares (consequents) + gradient descent (premises)",
      createdAt: new Date().toISOString(),
      dataset: path.relative(root, args.data),
      target: args.target,
      samples: { train: train.length, test: test.length },
      epochs: result.history.length,
      bestEpoch: result.best.epoch,
      metrics: {
        base: { train: roundMetrics(result.metrics.base.train), test: roundMetrics(result.metrics.base.test) },
        trained: {
          train: roundMetrics(result.metrics.trained.train),
          test: roundMetrics(result.metrics.trained.test),
        },
      },
      history: result.history.map((h) => ({
        epoch: h.epoch,
        trainRmse: round(h.trainRmse, 4),
        testRmse: h.testRmse == null ? null : round(h.testRmse, 4),
      })),
    },
  };
  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nsaved ${path.relative(root, args.out)}`);
}

main();

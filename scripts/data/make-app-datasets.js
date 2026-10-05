#!/usr/bin/env node
/**
 * Builds the small datasets the app ships (data/security.csv, data/intrusion.csv)
 * from the full ones in data/full/. These are what the training block downloads
 * and what a lecturer edits and uploads back.
 *
 *   npm run data:app                    # targets from the expert controllers (default)
 *   npm run data:app -- --target expert # targets from the expert labelling files
 *
 * Deterministic: rows are picked by position after sorting, no random numbers.
 *
 * --target model (default): the target of every row is the output of the
 *   expert controller itself, rounded (SR to 1, IP to 0.1). This reproduces
 *   the MATLAB experiments of the thesis (fig. 3.10–3.14, 4.10–4.12), where
 *   the reference data came from the controller: the training error stays at
 *   the rounding noise (≈ 0.3 for SR, ≈ 0.03 for IP) and the curve is flat.
 * --target expert: SR = SR_expert, else SR_proposed, else SR_base of
 *   data/full/security/security_labeling.csv; IP = label_to_ip.csv by class.
 *
 * data/security.csv   EC, TP, Lat, SR, split, row_id
 *   200 of the 250 labelled rows (140 train / 60 test). Every dominant rule
 *   keeps its share, rare rules are kept whole, so all six rules fire.
 * data/intrusion.csv  NP, Rate, We, IP, label, category, split
 *   30 rows per category of CICIoT2023 (8 categories, 240 rows): 20 train,
 *   5 validation and 5 test rows of data/full/intrusion/intrusion.csv, spread
 *   over the whole range of Rate within the category.
 */
const fs = require("fs");
const path = require("path");
const { readCsv, cellNumber } = require("../../src/training/utils");
const security = require("../../src/controllers/securityController");
const intrusion = require("../../src/controllers/intrusionController");

const root = path.join(__dirname, "..", "..");
const FULL = path.join(root, "data", "full");

function parseArgs(argv) {
  const args = { target: "model", securityRows: 200, intrusionPerCategory: 30 };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--target") args.target = argv[++i];
    else if (flag === "--security-rows") args.securityRows = Number(argv[++i]);
    else if (flag === "--intrusion-per-category") args.intrusionPerCategory = Number(argv[++i]);
    else throw new Error(`unknown argument ${flag}`);
  }
  if (!["model", "expert"].includes(args.target)) throw new Error("--target must be model or expert");
  return args;
}

function writeCsv(file, header, rows) {
  const text = [header, ...rows].map((r) => r.join(",")).join("\n");
  fs.writeFileSync(file, `${text}\n`);
}

/** n rows evenly spaced over a sorted list (all of them when n >= length). */
function spread(rows, n) {
  if (n >= rows.length) return rows.slice();
  if (n <= 0) return [];
  if (n === 1) return [rows[Math.floor(rows.length / 2)]];
  return Array.from({ length: n }, (_, i) => rows[Math.round((i * (rows.length - 1)) / (n - 1))]);
}

/** Integer shares of `total` proportional to weights (largest remainder). */
function largestRemainder(weights, total) {
  const sum = Object.values(weights).reduce((a, b) => a + b, 0);
  const raw = {};
  const shares = {};
  Object.entries(weights).forEach(([k, w]) => {
    raw[k] = (total * w) / sum;
    shares[k] = Math.floor(raw[k]);
  });
  const left = total - Object.values(shares).reduce((a, b) => a + b, 0);
  Object.keys(raw)
    .sort((a, b) => raw[b] - shares[b] - (raw[a] - shares[a]))
    .slice(0, left)
    .forEach((k) => (shares[k] += 1));
  return shares;
}

const fmt = (v, digits) => (Math.round(v * 10 ** digits) / 10 ** digits).toString();

function buildSecurity({ target, securityRows }) {
  const rows = readCsv(path.join(FULL, "security", "security_labeling.csv"));
  const labelled = rows
    .map((r) => {
      const ec = cellNumber(r.EC);
      const tp = cellNumber(r.TP);
      const lat = cellNumber(r.Lat);
      let sr;
      if (target === "model") sr = Math.round(security.calculate({ energy: ec, strength: tp, response: lat }).value);
      else sr = ["SR_expert", "SR_proposed", "SR_base"].map((c) => cellNumber(r[c])).find((v) => v !== null);
      return sr === undefined || sr === null ? null : { ...r, SR: sr };
    })
    .filter(Boolean);
  const out = [];
  Object.entries({ train: 0.7, test: 0.3 }).forEach(([split, share]) => {
    const ofSplit = labelled.filter((r) => r.split === split);
    const want = Math.round(securityRows * share);
    const byRule = {};
    ofSplit.forEach((r) => (byRule[r.dominant_rule] = byRule[r.dominant_rule] || []).push(r));
    // Rare rules (≤ 5 rows) are kept whole; the rest share the remainder.
    const keep = Object.fromEntries(Object.entries(byRule).filter(([, v]) => v.length <= 5));
    const rest = Object.fromEntries(Object.entries(byRule).filter(([k]) => !keep[k]).map(([k, v]) => [k, v.length]));
    const kept = Object.values(keep).reduce((a, v) => a + v.length, 0);
    const shares = largestRemainder(rest, want - kept);
    Object.keys(byRule)
      .sort()
      .forEach((rule) => {
        const group = byRule[rule].slice().sort((a, b) => Number(a.SR) - Number(b.SR) || Number(a.row_id) - Number(b.row_id));
        out.push(...(keep[rule] ? group : spread(group, shares[rule])));
      });
  });
  out.sort((a, b) => Number(a.row_id) - Number(b.row_id));
  const header = ["EC", "TP", "Lat", "SR", "split", "row_id"];
  writeCsv(path.join(root, "data", "security.csv"), header, out.map((r) => [r.EC, r.TP, r.Lat, fmt(Number(r.SR), 1), r.split, r.row_id]));
  const train = out.filter((r) => r.split === "train").length;
  console.log(`data/security.csv: ${out.length} rows (${train} train / ${out.length - train} test), target: ${target}`);
}

function buildIntrusion({ target, intrusionPerCategory }) {
  const mapping = {};
  readCsv(path.join(FULL, "intrusion", "label_to_ip.csv")).forEach((r) => (mapping[r.label] = cellNumber(r.IP_target)));
  const all = readCsv(path.join(FULL, "intrusion", "intrusion.csv"));
  const perSplit = { train: Math.round((intrusionPerCategory * 2) / 3) };
  const rest = intrusionPerCategory - perSplit.train;
  perSplit.validation = Math.floor(rest / 2);
  perSplit.test = rest - perSplit.validation;
  const out = [];
  Object.entries(perSplit).forEach(([split, n]) => {
    const byCat = {};
    all.filter((r) => r.split === split).forEach((r) => (byCat[r.category] = byCat[r.category] || []).push(r));
    Object.keys(byCat)
      .sort()
      .forEach((cat) => {
        const group = byCat[cat].slice().sort((a, b) => Number(a.Rate) - Number(b.Rate) || a.label.localeCompare(b.label));
        spread(group, n).forEach((r) => {
          const np = cellNumber(r.NP);
          const rate = cellNumber(r.Rate);
          const we = cellNumber(r.We);
          // The expert model reads Rate inside its universe (0–3000 pps).
          const ip =
            target === "model"
              ? fmt(intrusion.calculate({ packets: np, rate: Math.min(rate, intrusion.ranges.rate.max), weight: we }).value, 1)
              : String(mapping[r.label]);
          out.push([r.NP, r.Rate, r.We, ip, r.label, r.category, split]);
        });
      });
  });
  const order = { train: 0, validation: 1, test: 2 };
  out.sort((a, b) => order[a[6]] - order[b[6]] || a[5].localeCompare(b[5]) || Number(a[1]) - Number(b[1]));
  writeCsv(path.join(root, "data", "intrusion.csv"), ["NP", "Rate", "We", "IP", "label", "category", "split"], out);
  const counts = Object.fromEntries(Object.keys(order).map((s) => [s, out.filter((r) => r[6] === s).length]));
  console.log(`data/intrusion.csv: ${out.length} rows (${counts.train} train / ${counts.validation} validation / ${counts.test} test), target: ${target}`);
}

const args = parseArgs(process.argv.slice(2));
buildSecurity(args);
buildIntrusion(args);

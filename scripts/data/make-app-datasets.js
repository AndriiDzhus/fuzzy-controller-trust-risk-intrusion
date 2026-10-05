#!/usr/bin/env node
/**
 * Builds the datasets the app ships, four sizes per controller:
 *   data/security-{20,50,100,500}.csv   EC, TP, Lat, SR   (ANFIS)
 *   data/intrusion-{20,50,100,500}.csv  NP, Rate, We, IP  (genetic algorithm)
 * The files differ only in the number of rows: each one covers all the working
 * ranges of the inputs and every rule of the controller (see `design`). The
 * user picks one in the training block; a lecturer edits it and uploads it back.
 *
 *   npm run data:app
 *
 * Four columns each: the three inputs and the target. No split column: the app
 * divides the rows 70/30 (Security) or 70/15/15 (Intrusion) itself,
 * deterministically.
 *
 * The target comes from an "expert of the dataset": the expert controller with
 * a few parameters changed (Security: three singletons by 6 points and the peaks
 * of the "medium" triangles; Intrusion: output centres and input centres, and
 * two rules with another conclusion) plus measurement noise. The expert model
 * is therefore clearly off the data, the changes are what the training can
 * recover (visible in "what changed"), and the noise sets the floor of the
 * learning curve close to the MATLAB experiments of the thesis (ANFIS 0.361,
 * GA 0.0297 -> 0.0186).
 */
const fs = require("fs");
const path = require("path");
const { createRandom } = require("../../src/training/utils");
const security = require("../../src/controllers/securityController");
const intrusion = require("../../src/controllers/intrusionController");

const root = path.join(__dirname, "..", "..");
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const fix = (v, digits) => Number(v.toFixed(digits));
const deep = (o) => JSON.parse(JSON.stringify(o));

function writeCsv(file, header, rows) {
  fs.writeFileSync(file, `${[header, ...rows].map((r) => r.join(",")).join("\n")}\n`);
}

/** The "expert of the dataset" for Security: a few parameters off the model. */
const SECURITY_SHIFTS = {
  consequents: { veryLow: 26, medium: 54, high: 86 },
  // Peaks of the "medium" triangles move, their supports stay: the training
  // keeps the coverage of the thesis model and learns a break point only
  // from rows inside its support (a subgradient is zero outside), so these
  // are the shifts it can actually recover.
  inputs: { EC: { medium: [0, 0.032, 0.05] }, TP: { medium: [0, 25, 40] }, Lat: { medium: [0, 6.5, 10] } },
};
function securityExpert(shifts = SECURITY_SHIFTS) {
  const params = deep(security.BASE_PARAMS);
  Object.assign(params.consequents, shifts.consequents);
  Object.entries(shifts.inputs).forEach(([symbol, terms]) =>
    Object.entries(terms).forEach(([term, p]) => (params.inputs[symbol][term].params = p))
  );
  return security.buildModel(params, { variant: "dataset" });
}

/** The "expert of the dataset" for Intrusion: centres (c) moved, widths kept. */
const INTRUSION_SHIFTS = {
  output: { none: 3.5, low: 28 },
  inputs: { NP: { low: 3.45 }, We: { high: 238 } },
  // two rules with another conclusion than in the thesis: 1 (none -> low), 3 (low -> none)
  rules: { 1: "low", 3: "none" },
};
const INTRUSION_NOISE = 0.0175;
const SECURITY_NOISE = 0.37; // default std of the noise added to SR (see SECURITY_PLAN)
function intrusionExpert(shifts = INTRUSION_SHIFTS) {
  const params = deep(intrusion.BASE_PARAMS);
  Object.entries(shifts.output).forEach(([term, c]) => (params.output[term].params[1] = c));
  Object.entries(shifts.inputs).forEach(([symbol, terms]) =>
    Object.entries(terms).forEach(([term, c]) => (params.inputs[symbol][term].params[1] = c))
  );
  // Rules of the dataset expert that differ from the thesis: { index (1-based): output term }
  Object.entries(shifts.rules || {}).forEach(([index, out]) => (params.rules[Number(index) - 1][1] = out));
  return intrusion.buildModel(params, { variant: "dataset" });
}

// ---------------------------------------------------------------------------
// Sampling design: every size covers all the working ranges
// ---------------------------------------------------------------------------

/**
 * Space-filling design on [0, 1]^d: the first rows are "anchors" (one near the
 * peaks of the terms of each rule, so that every rule fires in every file),
 * the rest is a Latin hypercube (each input range is cut into as many strata
 * as there are rows, one row per stratum), so even 20 rows span every range.
 */
function design(n, dims, anchors, rnd) {
  const points = anchors.slice(0, n).map((a) => a.map((u) => clamp(u + (rnd.next() - 0.5) * 0.06, 0, 1)));
  const rest = n - points.length;
  const columns = [];
  for (let d = 0; d < dims; d += 1) {
    const strata = rnd.shuffle(Array.from({ length: rest }, (_, k) => k));
    columns.push(strata.map((k) => (k + rnd.next()) / rest));
  }
  for (let k = 0; k < rest; k += 1) points.push(columns.map((col) => col[k]));
  // Rows in a random order: any split of the file is representative.
  return rnd.shuffle(points);
}

const SIZES = [20, 50, 100, 500];

// ---------------------------------------------------------------------------
// Security: EC 0.01–0.05, TP 10–35, Lat 1–10
// ---------------------------------------------------------------------------

const SECURITY_RANGES = { EC: [0.01, 0.05], TP: [10, 35], Lat: [1, 10] };
const SECURITY_PEAK = { // peak of the terms (thesis): low 0, medium mid, high max of the universe
  EC: { low: 0, medium: 0.025, high: 0.05 },
  TP: { low: 0, medium: 20, high: 40 },
  Lat: { low: 0, medium: 5, high: 10 },
};
const unit = ([lo, hi], v) => clamp((v - lo) / (hi - lo), 0, 1);

function securityAnchors() {
  return security.rules.map(([terms]) =>
    ["EC", "TP", "Lat"].map((symbol, k) => unit(SECURITY_RANGES[symbol], SECURITY_PEAK[symbol][terms[k]]))
  );
}

function securityRows(n, seed, expert = securityExpert(), noise = SECURITY_NOISE) {
  const rnd = createRandom(seed);
  return design(n, 3, securityAnchors(), rnd).map(([a, b, c]) => {
    const ec = fix(SECURITY_RANGES.EC[0] + a * (SECURITY_RANGES.EC[1] - SECURITY_RANGES.EC[0]), 4);
    const tp = fix(SECURITY_RANGES.TP[0] + b * (SECURITY_RANGES.TP[1] - SECURITY_RANGES.TP[0]), 2);
    const lat = fix(SECURITY_RANGES.Lat[0] + c * (SECURITY_RANGES.Lat[1] - SECURITY_RANGES.Lat[0]), 2);
    const y = expert.calculate({ energy: ec, strength: tp, response: lat }).value + rnd.normal() * noise;
    return [ec, tp, lat, fix(clamp(y, 0, 100), 1)];
  });
}

// ---------------------------------------------------------------------------
// Intrusion: NP 0–15, Rate 0–3000 (log scale), We 0–250
// ---------------------------------------------------------------------------

const RATE_LOG_MAX = Math.log10(3001);
const rateUnit = (pps) => Math.log10(1 + pps) / RATE_LOG_MAX;

function intrusionAnchors() {
  const input = intrusion.BASE_PARAMS.inputs;
  const centre = (symbol, term) => input[symbol][term].params[1];
  return intrusion.BASE_PARAMS.rules.map(([[np, rate, we]]) => [
    clamp(centre("NP", np) / 15, 0, 1),
    rateUnit(centre("Rate", rate)),
    clamp(centre("We", we) / 250, 0, 1),
  ]);
}

function intrusionRows(n, seed, expert = intrusionExpert(), noise = INTRUSION_NOISE) {
  const rnd = createRandom(seed);
  return design(n, 3, intrusionAnchors(), rnd).map(([a, b, c]) => {
    const np = fix(a * 15, 2);
    // Rate is spread on the logarithmic scale: the three orders of magnitude of
    // the terms (15 / 150 / 1500 pps) are represented alike.
    const rate = fix(10 ** (b * RATE_LOG_MAX) - 1, 1);
    const we = fix(c * 250, 2);
    const y = expert.calculate({ packets: np, rate, weight: we }).value + rnd.normal() * noise;
    return [np, rate, we, fix(clamp(y, 0, 100), 4)];
  });
}

/**
 * The seed and the noise of each file. The training result of a small file
 * depends on how the 70/30 (70/15/15) split falls (rows of the changed rules
 * in the training part or not), so a seed is chosen per size from a scan:
 *   Security  ANFIS ends at ≈ 0.36 on train and test (MATLAB 0.361), the
 *             20-row file overfits a little (6 test rows)
 *   Intrusion the GA finds both changed rules and ends at 0.03–0.07 on all
 *             three parts, errors of the same order as the MATLAB 0.0186
 */
const SECURITY_PLAN = {
  20: { seed: 40, noise: 0.45 },
  50: { seed: 1, noise: 0.45 },
  100: { seed: 3, noise: 0.36 },
  500: { seed: 2, noise: 0.37 },
};
const INTRUSION_PLAN = {
  20: { seed: 120, noise: INTRUSION_NOISE },
  50: { seed: 45, noise: INTRUSION_NOISE },
  100: { seed: 41, noise: INTRUSION_NOISE },
  500: { seed: 2, noise: INTRUSION_NOISE },
};

function build() {
  SIZES.forEach((n) => {
    const sec = SECURITY_PLAN[n];
    writeCsv(path.join(root, "data", `security-${n}.csv`), ["EC", "TP", "Lat", "SR"], securityRows(n, sec.seed, undefined, sec.noise));
    const intr = INTRUSION_PLAN[n];
    writeCsv(path.join(root, "data", `intrusion-${n}.csv`), ["NP", "Rate", "We", "IP"], intrusionRows(n, intr.seed, undefined, intr.noise));
    console.log(`data/security-${n}.csv, data/intrusion-${n}.csv: ${n} rows each`);
  });
}

if (require.main === module) build();

module.exports = { SIZES, securityRows, intrusionRows, securityExpert, intrusionExpert, SECURITY_SHIFTS, INTRUSION_SHIFTS, SECURITY_NOISE, INTRUSION_NOISE };

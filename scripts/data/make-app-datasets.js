#!/usr/bin/env node
/**
 * Builds the datasets the app ships: data/security.csv (200 rows) and
 * data/intrusion.csv (500 rows). These are what the training block downloads
 * and what a lecturer edits and uploads back.
 *
 *   npm run data:app
 *
 * Both files have four columns: the three inputs of the controller and the
 * target. No split column: the app divides the rows 70/30 (Security) or
 * 70/15/15 (Intrusion) itself, deterministically.
 *
 * The inputs are drawn uniformly over the working ranges of the controllers
 * (seeded, so the files are reproducible). The target comes from an "expert
 * of the dataset": the expert controller with a few parameters shifted
 * (singletons / output centres by 6–12 points, some break points or centres
 * of the input terms) plus measurement noise (σ = 0.3 for SR, 0.02 for IP).
 * The expert model is therefore clearly off the data, the shifted parameters
 * are something the training can recover (visible in "what changed"), and
 * the noise keeps the learning curve from being a flat line, with a floor
 * close to the MATLAB experiments of the thesis (ANFIS 0.361, GA 0.0186).
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
  inputs: { EC: { medium: [0, 0.032, 0.05] }, TP: { low: [0, 0, 16] }, Lat: { low: [0, 0, 4], high: [6.5, 10, 10] } },
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
};
const INTRUSION_NOISE = 0.0175;
const SECURITY_NOISE = 0.22; // std of the noise added to SR
function intrusionExpert(shifts = INTRUSION_SHIFTS) {
  const params = deep(intrusion.BASE_PARAMS);
  Object.entries(shifts.output).forEach(([term, c]) => (params.output[term].params[1] = c));
  Object.entries(shifts.inputs).forEach(([symbol, terms]) =>
    Object.entries(terms).forEach(([term, c]) => (params.inputs[symbol][term].params[1] = c))
  );
  return intrusion.buildModel(params, { variant: "dataset" });
}

function buildSecurity(n = 200, seed = 42, expert = securityExpert()) {
  const rnd = createRandom(seed);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const ec = fix(rnd.uniform(0.01, 0.05), 4);
    const tp = fix(rnd.uniform(10, 35), 2);
    const lat = fix(rnd.uniform(1, 10), 2);
    const y = expert.calculate({ energy: ec, strength: tp, response: lat }).value + rnd.normal() * SECURITY_NOISE;
    rows.push([ec, tp, lat, fix(clamp(y, 0, 100), 1)]);
  }
  writeCsv(path.join(root, "data", "security.csv"), ["EC", "TP", "Lat", "SR"], rows);
  console.log(`data/security.csv: ${rows.length} rows`);
}

function buildIntrusion(n = 500, seed = 42, expert = intrusionExpert(), noise = INTRUSION_NOISE) {
  const rnd = createRandom(seed + 1);
  const rows = [];
  for (let i = 0; i < n; i += 1) {
    const np = fix(rnd.uniform(0, 15), 2);
    // Rate: uniform on the logarithmic scale, so that the three orders of
    // magnitude of the terms (15 / 150 / 1500 pps) are represented alike.
    const rate = fix(10 ** rnd.uniform(0, Math.log10(3001)) - 1, 1);
    const we = fix(rnd.uniform(0, 250), 2);
    const y = expert.calculate({ packets: np, rate, weight: we }).value + rnd.normal() * noise;
    rows.push([np, rate, we, fix(clamp(y, 0, 100), 4)]);
  }
  writeCsv(path.join(root, "data", "intrusion.csv"), ["NP", "Rate", "We", "IP"], rows);
  console.log(`data/intrusion.csv: ${rows.length} rows`);
}

if (require.main === module) {
  buildSecurity();
  buildIntrusion();
}

module.exports = { buildSecurity, buildIntrusion, securityExpert, intrusionExpert, SECURITY_SHIFTS, INTRUSION_SHIFTS };

/**
 * Helpers shared by the ANFIS (Security) and genetic (Intrusion) training:
 * a seeded random generator, a small CSV reader, error metrics and a linear
 * solver for the least-squares step.
 */
const fs = require("fs");

// ---------------------------------------------------------------------------
// Seeded random numbers (mulberry32), so every training run is reproducible.
// ---------------------------------------------------------------------------

function createRandom(seed = 42) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  let spare = null;
  return {
    /** uniform on [0, 1) */
    next,
    /** uniform on [min, max) */
    uniform: (min, max) => min + (max - min) * next(),
    /** integer on [0, n) */
    int: (n) => Math.floor(next() * n),
    /** standard normal N(0, 1), Box–Muller */
    normal: () => {
      if (spare !== null) {
        const value = spare;
        spare = null;
        return value;
      }
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      const r = Math.sqrt(-2 * Math.log(u));
      spare = r * Math.sin(2 * Math.PI * v);
      return r * Math.cos(2 * Math.PI * v);
    },
    /** Fisher–Yates shuffle of a copy */
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };
}

// ---------------------------------------------------------------------------
// CSV (comma separated, header row, no quoted commas: our datasets only)
// ---------------------------------------------------------------------------

function parseCsv(text) {
  const lines = text.replace(/\r/g, "").split("\n").filter((line) => line.trim() !== "");
  const header = lines[0].split(",").map((cell) => cell.trim());
  return lines.slice(1).map((line) => {
    const cells = line.split(",");
    const row = {};
    header.forEach((name, i) => {
      row[name] = (cells[i] ?? "").trim();
    });
    return row;
  });
}

function readCsv(path) {
  return parseCsv(fs.readFileSync(path, "utf8"));
}

/** Number from a CSV cell; "" and non-numbers give null. */
function cellNumber(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim().replace(",", ".");
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * @param {number[]} predicted
 * @param {number[]} target
 * @returns {{n, rmse, mae, r2}}
 */
function regressionMetrics(predicted, target) {
  const n = target.length;
  if (n === 0) return { n: 0, rmse: null, mae: null, r2: null };
  let se = 0;
  let ae = 0;
  let mean = 0;
  target.forEach((t) => {
    mean += t / n;
  });
  let tss = 0;
  for (let i = 0; i < n; i += 1) {
    const d = predicted[i] - target[i];
    se += d * d;
    ae += Math.abs(d);
    tss += (target[i] - mean) ** 2;
  }
  return {
    n,
    rmse: Math.sqrt(se / n),
    mae: ae / n,
    r2: tss > 0 ? 1 - se / tss : null,
  };
}

function rmse(predicted, target) {
  return regressionMetrics(predicted, target).rmse;
}

// ---------------------------------------------------------------------------
// Linear algebra
// ---------------------------------------------------------------------------

/** Solves A x = b (A square) by Gaussian elimination with partial pivoting. */
function solveLinear(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let r = col + 1; r < n; r += 1) {
      if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    }
    if (Math.abs(M[pivot][col]) < 1e-14) throw new Error("singular system in least squares");
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = col + 1; r < n; r += 1) {
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c += 1) M[r][c] -= f * M[col][c];
    }
  }
  const x = new Array(n).fill(0);
  for (let r = n - 1; r >= 0; r -= 1) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c += 1) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x;
}

/**
 * Least squares for A theta ≈ y (eq. 3.11–3.12): theta = (AᵀA)⁻¹ Aᵀ y.
 * A small Tikhonov term ridge·||theta − prior||² keeps the system solvable when
 * a rule barely fires in the data; ridge = 0 gives the plain estimator.
 */
function leastSquares(A, y, { ridge = 0, prior = null } = {}) {
  const k = A[0].length;
  const AtA = Array.from({ length: k }, () => new Array(k).fill(0));
  const Aty = new Array(k).fill(0);
  A.forEach((row, n) => {
    for (let i = 0; i < k; i += 1) {
      Aty[i] += row[i] * y[n];
      for (let j = 0; j < k; j += 1) AtA[i][j] += row[i] * row[j];
    }
  });
  for (let i = 0; i < k; i += 1) {
    AtA[i][i] += ridge;
    Aty[i] += ridge * (prior ? prior[i] : 0);
  }
  return solveLinear(AtA, Aty);
}

const round = (value, digits = 6) => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

module.exports = {
  createRandom,
  parseCsv,
  readCsv,
  cellNumber,
  regressionMetrics,
  rmse,
  solveLinear,
  leastSquares,
  round,
};

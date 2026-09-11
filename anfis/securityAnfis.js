const TERMS = ["low", "medium", "high"];

const ANCHOR_RULES = [
  { E: "low", S: "high", T: "low", r: 0 },
  { E: "low", S: "high", T: "medium", r: 20 },
  { E: "medium", S: "medium", T: "low", r: 40 },
  { E: "medium", S: "low", T: "medium", r: 60 },
  { E: "high", S: "medium", T: "high", r: 80 },
  { E: "high", S: "low", T: "high", r: 100 },
];

const TEACHER_TABLE = {
  "low/low/low": 40,
  "low/low/medium": 60,
  "low/low/high": 60,
  "low/medium/low": 20,
  "low/medium/medium": 40,
  "low/medium/high": 40,
  "low/high/low": 0,
  "low/high/medium": 20,
  "low/high/high": 40,
  "medium/low/low": 40,
  "medium/low/medium": 60,
  "medium/low/high": 80,
  "medium/medium/low": 40,
  "medium/medium/medium": 60,
  "medium/medium/high": 60,
  "medium/high/low": 20,
  "medium/high/medium": 40,
  "medium/high/high": 40,
  "high/low/low": 80,
  "high/low/medium": 80,
  "high/low/high": 100,
  "high/medium/low": 60,
  "high/medium/medium": 80,
  "high/medium/high": 80,
  "high/high/low": 40,
  "high/high/medium": 60,
  "high/high/high": 60,
};

const INITIAL_MFS = {
  E: { low: [0, 12], medium: [40, 16], high: [100, 20] },
  S: { low: [0, 20], medium: [60, 16], high: [100, 14] },
  T: { low: [0, 10], medium: [50, 20], high: [100, 10] },
};

const TERM_PEAKS = {
  E: { low: 0, medium: 40, high: 100 },
  S: { low: 0, medium: 60, high: 100 },
  T: { low: 0, medium: 50, high: 100 },
};

const RISK_SINGLETONS = {
  none: 0,
  veryLow: 20,
  low: 40,
  medium: 60,
  high: 80,
  veryHigh: 100,
};

function ruleKey(E, S, T) {
  return `${E}/${S}/${T}`;
}

function allRules() {
  const rules = [];
  TERMS.forEach((E) => {
    TERMS.forEach((S) => {
      TERMS.forEach((T) => {
        rules.push({ E, S, T, key: ruleKey(E, S, T) });
      });
    });
  });
  return rules;
}

function isAnchorKey(key) {
  return ANCHOR_RULES.some((rule) => ruleKey(rule.E, rule.S, rule.T) === key);
}

function gaussian(x, center, sigma) {
  const s = Math.max(Number(sigma) || 1, 1e-3);
  return Math.exp(-((x - center) ** 2) / (2 * s * s));
}

function premiseMemberships(mfs, energy, strength, response) {
  return {
    energy: {
      low: gaussian(energy, ...mfs.E.low),
      medium: gaussian(energy, ...mfs.E.medium),
      high: gaussian(energy, ...mfs.E.high),
    },
    strength: {
      low: gaussian(strength, ...mfs.S.low),
      medium: gaussian(strength, ...mfs.S.medium),
      high: gaussian(strength, ...mfs.S.high),
    },
    response: {
      low: gaussian(response, ...mfs.T.low),
      medium: gaussian(response, ...mfs.T.medium),
      high: gaussian(response, ...mfs.T.high),
    },
  };
}

function ruleFiring(mu, rule) {
  return mu.energy[rule.E] * mu.strength[rule.S] * mu.response[rule.T];
}

function infer(inputs, weights) {
  const rules = allRules();
  const mu = premiseMemberships(weights.mfs, inputs.energy, inputs.strength, inputs.response);
  const firings = rules.map((rule) => ruleFiring(mu, rule));
  const sum = firings.reduce((acc, value) => acc + value, 0);
  const normalized = firings.map((value) => (sum === 0 ? 0 : value / sum));
  const consequents = weights.consequents;
  let value = 0;
  normalized.forEach((weight, index) => {
    value += weight * consequents[index];
  });

  return {
    value: Math.min(100, Math.max(0, value)),
    mu,
    rules,
    firings,
    normalized,
  };
}

function teacherValue(energy, strength, response) {
  const teacherWeights = {
    mfs: INITIAL_MFS,
    consequents: allRules().map((rule) => TEACHER_TABLE[rule.key]),
  };
  return infer({ energy, strength, response }, teacherWeights).value;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateDataset(count = 800, seed = 42) {
  const rng = mulberry32(seed);
  const samples = [];

  allRules().forEach((rule) => {
    samples.push({
      energy: TERM_PEAKS.E[rule.E],
      strength: TERM_PEAKS.S[rule.S],
      response: TERM_PEAKS.T[rule.T],
      r: TEACHER_TABLE[rule.key],
      weight: isAnchorKey(rule.key) ? 24 : 8,
    });
  });

  for (let i = 0; i < count; i += 1) {
    const energy = rng() * 100;
    const strength = rng() * 100;
    const response = rng() * 100;
    samples.push({
      energy,
      strength,
      response,
      r: teacherValue(energy, strength, response),
      weight: 1,
    });
  }

  return samples;
}

function solveLinearSystem(matrix, vector) {
  const n = vector.length;
  const aug = matrix.map((row, i) => [...row, vector[i]]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[pivot][col])) pivot = row;
    }
    if (Math.abs(aug[pivot][col]) < 1e-12) continue;
    if (pivot !== col) {
      const tmp = aug[col];
      aug[col] = aug[pivot];
      aug[pivot] = tmp;
    }
    const div = aug[col][col];
    for (let j = col; j <= n; j += 1) aug[col][j] /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = aug[row][col];
      for (let j = col; j <= n; j += 1) aug[row][j] -= factor * aug[col][j];
    }
  }

  return aug.map((row) => row[n]);
}

function fitConsequents(dataset, mfs) {
  const rules = allRules();
  const n = rules.length;
  const ata = Array.from({ length: n }, () => Array(n).fill(0));
  const aty = Array(n).fill(0);

  dataset.forEach((sample) => {
    const result = infer(sample, { mfs, consequents: Array(n).fill(0) });
    const x = result.normalized;
    const weight = sample.weight || 1;
    for (let i = 0; i < n; i += 1) {
      aty[i] += weight * x[i] * sample.r;
      for (let j = 0; j < n; j += 1) {
        ata[i][j] += weight * x[i] * x[j];
      }
    }
  });

  for (let i = 0; i < n; i += 1) ata[i][i] += 1e-6;
  return solveLinearSystem(ata, aty).map((value) => Math.min(100, Math.max(0, value)));
}

function train({ samples = 800, seed = 42 } = {}) {
  const dataset = generateDataset(samples, seed);
  const consequents = fitConsequents(dataset, INITIAL_MFS);
  return {
    version: 1,
    seed,
    samples,
    mfs: INITIAL_MFS,
    consequents,
    teacherTable: TEACHER_TABLE,
    rules: allRules().map((rule, index) => ({
      ...rule,
      r: consequents[index],
      teacher: TEACHER_TABLE[rule.key],
      anchor: isAnchorKey(rule.key),
    })),
  };
}

function nearestRiskTerm(value) {
  let best = "medium";
  let bestDist = Infinity;
  Object.entries(RISK_SINGLETONS).forEach(([term, center]) => {
    const dist = Math.abs(center - value);
    if (dist < bestDist) {
      bestDist = dist;
      best = term;
    }
  });
  return best;
}

function binRuleOutputs(inference, weights) {
  const ruleOutputs = {
    none: 0,
    veryLow: 0,
    low: 0,
    medium: 0,
    high: 0,
    veryHigh: 0,
  };

  inference.rules.forEach((rule, index) => {
    const term = nearestRiskTerm(weights.consequents[index]);
    ruleOutputs[term] = Math.max(ruleOutputs[term], inference.firings[index]);
    void rule;
  });

  return ruleOutputs;
}

let cachedWeights = null;

function loadWeights() {
  if (cachedWeights) return cachedWeights;
  try {
    cachedWeights = require("./security-weights.json");
  } catch {
    cachedWeights = train({ samples: 800, seed: 42 });
  }
  return cachedWeights;
}

function setWeights(weights) {
  cachedWeights = weights;
}

function calculateAnfis(inputs, weights = loadWeights()) {
  const inference = infer(inputs, weights);
  const ruleOutputs = binRuleOutputs(inference, weights);
  return {
    value: inference.value,
    dominantTerm: nearestRiskTerm(inference.value),
    noRuleFired: false,
    mode: "anfis",
    membershipData: {
      energy: inference.mu.energy,
      strength: inference.mu.strength,
      response: inference.mu.response,
      risk: ruleOutputs,
    },
    ruleOutputs,
  };
}

function anfisMembershipSeries(mfs) {
  const sample = (fn) => {
    const out = [];
    for (let x = 0; x <= 100; x += 1) out.push({ x, y: fn(x) });
    return out;
  };

  return {
    inputs: {
      energy: {
        low: sample((x) => gaussian(x, ...mfs.E.low)),
        medium: sample((x) => gaussian(x, ...mfs.E.medium)),
        high: sample((x) => gaussian(x, ...mfs.E.high)),
      },
      strength: {
        low: sample((x) => gaussian(x, ...mfs.S.low)),
        medium: sample((x) => gaussian(x, ...mfs.S.medium)),
        high: sample((x) => gaussian(x, ...mfs.S.high)),
      },
      response: {
        low: sample((x) => gaussian(x, ...mfs.T.low)),
        medium: sample((x) => gaussian(x, ...mfs.T.medium)),
        high: sample((x) => gaussian(x, ...mfs.T.high)),
      },
    },
    output: {
      risk: {},
    },
    meta: {
      inputKeys: ["energy", "strength", "response"],
      outputKey: "risk",
      singletonValues: RISK_SINGLETONS,
      mode: "anfis",
    },
  };
}

module.exports = {
  TERMS,
  ANCHOR_RULES,
  TEACHER_TABLE,
  INITIAL_MFS,
  RISK_SINGLETONS,
  allRules,
  infer,
  teacherValue,
  generateDataset,
  train,
  loadWeights,
  setWeights,
  calculateAnfis,
  anfisMembershipSeries,
  nearestRiskTerm,
};

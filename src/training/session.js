/**
 * A training session of one controller on a prepared dataset, used by the
 * CLI scripts, the API (server-sent progress) and the browser worker of the
 * static build.
 *
 *   security   ANFIS (src/training/anfis.js): epochs
 *   intrusion  genetic algorithm (src/training/genetic.js): generations
 *
 * runTraining() drives the step generator of the method, reports every step
 * through onProgress, can be stopped between steps and returns one result
 * shape for both methods:
 *   {
 *     controller, method, params,           // params build the trained model
 *     training: { method, createdAt, datasetName, samples, options, steps,
 *                 stopReason, bestEpoch?, fitness?, metrics: {base, trained},
 *                 history },
 *     changes                                // diff expert -> trained (UI)
 *   }
 */
const security = require("../controllers/securityController");
const intrusion = require("../controllers/intrusionController");
const { evolveSteps, CHROMOSOME_LENGTH } = require("./genetic");
const { trainAnfisSteps } = require("./anfis");
const { regressionMetrics, round } = require("./utils");

// ---------------------------------------------------------------------------
// Intrusion: Rate scale of the trained model. The theory works in pps (linear,
// the universe of the expert model, 0–3000). With real CICIoT2023 traffic the
// option logRate = 1 trains on lg(1 + pps) instead: 95 % of the rows have
// Rate < 150 pps and the linear Gaussians see all of them as "small".
// ---------------------------------------------------------------------------

const TRAINED_INTRUSION_RANGES = {
  packets: { min: 0, max: 15 },
  rate: { min: 0, max: intrusion.LOG_RATE_MAX },
  weight: { min: 0, max: 250 },
};
const clamp = (v, { min, max }) => Math.min(max, Math.max(min, v));

/**
 * A Gaussian (c, σ) in pps becomes (lg(1 + c), σ / ((1 + c) ln 10)) on the log
 * scale: the same centre and the same local slope around it.
 */
function expertIntrusionInLogScale() {
  const base = intrusion.BASE_PARAMS;
  const rate = {};
  Object.entries(base.inputs.Rate).forEach(([term, { params: [sigma, center] }]) => {
    const c = intrusion.toLogRate(center);
    const s = Math.max(0.05, sigma / ((1 + center) * Math.LN10));
    rate[term] = { type: "gauss", params: [round(s, 4), round(c, 4)] };
  });
  return { ...base, rateScale: "log10p1", ranges: TRAINED_INTRUSION_RANGES, inputs: { ...base.inputs, Rate: rate } };
}

const useLogRate = (opts) => Number(opts && opts.logRate) === 1;
const intrusionRanges = (opts) => (useLogRate(opts) ? TRAINED_INTRUSION_RANGES : intrusion.BASE_PARAMS.ranges);

/** Inputs of the trained Intrusion model for a raw sample (log or linear Rate). */
function intrusionTrainedX(raw, opts) {
  const ranges = intrusionRanges(opts);
  return [
    clamp(raw.NP, ranges.packets),
    clamp(useLogRate(opts) ? intrusion.toLogRate(raw.Rate) : raw.Rate, ranges.rate),
    clamp(raw.We, ranges.weight),
  ];
}

/** Inputs of the base Intrusion model (pps limited to its universe). */
function intrusionBaseInputs(raw) {
  return {
    packets: clamp(raw.NP, intrusion.ranges.packets),
    rate: clamp(raw.Rate, intrusion.ranges.rate),
    weight: clamp(raw.We, intrusion.ranges.weight),
  };
}

function securityX(raw) {
  return [
    clamp(raw.EC, security.ranges.energy),
    clamp(raw.TP, security.ranges.strength),
    clamp(raw.Lat, security.ranges.response),
  ];
}

// ---------------------------------------------------------------------------
// Method descriptions
// ---------------------------------------------------------------------------

const METHODS = {
  intrusion: {
    method: "ga",
    stepName: "generation",
    describe: "Genetic algorithm: tournament selection, arithmetic + two-point crossover, Gaussian + index mutation",
    // Theory (4.3.5): N0 random chromosomes, the N < N0 best of them form the
    // working population; stop after the given generations or at an acceptable
    // RMSE (targetRmse, 0 = off). N = 200 as in the MATLAB tuning of the thesis.
    // logRate: 0 — Rate in pps as in the theory; 1 — lg(1 + pps) (real traffic).
    defaultOptions: { initialPopulation: 300, populationSize: 200, generations: 200, targetRmse: 0, seed: 42, logRate: 0 },
    module: intrusion,
    toX: intrusionTrainedX,
    toBaseInputs: intrusionBaseInputs,
    toTrainedInputs: (x) => ({ packets: x[0], rate: x[1], weight: x[2] }),
    baseParams: () => intrusion.BASE_PARAMS,
    initialParams: (opts) => (useLogRate(opts) ? expertIntrusionInLogScale() : intrusion.BASE_PARAMS),
    finalParams: (result, opts) => ({
      rateScale: useLogRate(opts) ? "log10p1" : "linear",
      ranges: intrusionRanges(opts),
      ...result.params,
    }),
    spec: (opts) => ({
      inputs: [
        { symbol: "NP", range: [0, 15] },
        { symbol: "Rate", range: [0, intrusionRanges(opts).rate.max] },
        { symbol: "We", range: [0, 250] },
      ],
      inputTerms: intrusion.INPUT_TERMS,
      outputTerms: intrusion.OUTPUT_TERMS,
      outputRange: [0, 100],
      sigmaMin: 0.01,
      minCenterGap: 0.1,
    }),
    splits: ["train", "validation", "test"],
    steps: ({ spec, initial, bySplit, options }) =>
      evolveSteps({ spec, initial, train: bySplit.train, validation: bySplit.validation || [], options }),
  },
  security: {
    method: "anfis",
    stepName: "epoch",
    describe: "ANFIS hybrid: least squares (consequents) + gradient descent (premises)",
    // 100 epochs as in the MATLAB anfis run of the thesis (fig. 3.10).
    defaultOptions: { epochs: 100 },
    module: security,
    toX: securityX,
    toBaseInputs: (raw) => {
      const x = securityX(raw);
      return { energy: x[0], strength: x[1], response: x[2] };
    },
    toTrainedInputs: (x) => ({ energy: x[0], strength: x[1], response: x[2] }),
    baseParams: () => security.BASE_PARAMS,
    initialParams: () => security.BASE_PARAMS,
    finalParams: (result) => result.params,
    spec: () => ({ inputs: security.INPUTS, rules: security.rules }),
    splits: ["train", "test"],
    // Coverage: every input row of the dataset (train and test) plus a grid
    // over the box they span, unless the caller passes its own points.
    coverage: (splits) => securityCoverage([...splits.train, ...(splits.test || [])].map((s) => s.x)),
    steps: ({ spec, initial, bySplit, options, coverage }) =>
      trainAnfisSteps({ spec, initial, train: bySplit.train, test: bySplit.test || [], coverage: coverage || [], options }),
  },
};

function methodOf(controller) {
  const method = METHODS[controller];
  if (!method) throw new Error(`controller "${controller}" has no training method`);
  return method;
}

// ---------------------------------------------------------------------------
// Metrics of an app model on a split
// ---------------------------------------------------------------------------

const IP_TERM_CENTRES = { none: 0, low: 30, medium: 60, high: 100 };

/** Output term closest to a target value (by the centres of the base model). */
function targetTerm(y) {
  let best = null;
  Object.entries(IP_TERM_CENTRES).forEach(([term, c]) => {
    if (best === null || Math.abs(y - c) < Math.abs(y - IP_TERM_CENTRES[best])) best = term;
  });
  return best;
}

/**
 * @param {string} controller
 * @param {{calculate: Function}} model
 * @param {Array} samples prepared samples (raw, y, category)
 * @param {(sample) => object} toInputs
 */
function modelMetrics(controller, model, samples, toInputs) {
  const predicted = [];
  const target = [];
  let notFired = 0;
  let termHits = 0;
  const detection = { tp: 0, fp: 0, tn: 0, fn: 0 };
  const byCategory = {};
  samples.forEach((s) => {
    const result = model.calculate(toInputs(s));
    if (result.noRuleFired || result.value === null) {
      notFired += 1;
      return;
    }
    predicted.push(result.value);
    target.push(s.y);
    if (controller === "intrusion") {
      if (result.dominantTerm === targetTerm(s.y)) termHits += 1;
      const attack = s.category ? s.category !== "Benign" : s.y >= 50;
      const alarm = result.value >= 50;
      if (attack && alarm) detection.tp += 1;
      else if (attack) detection.fn += 1;
      else if (alarm) detection.fp += 1;
      else detection.tn += 1;
      if (s.category) {
        const cat = (byCategory[s.category] = byCategory[s.category] || { n: 0, sum: 0 });
        cat.n += 1;
        cat.sum += result.value;
      }
    }
  });
  const reg = regressionMetrics(predicted, target);
  const out = {
    n: reg.n,
    rmse: reg.rmse == null ? null : round(reg.rmse, 4),
    mae: reg.mae == null ? null : round(reg.mae, 4),
    r2: reg.r2 == null ? null : round(reg.r2, 4),
    notFired,
  };
  if (controller === "intrusion" && reg.n) {
    const { tp, fp, tn, fn } = detection;
    const precision = tp + fp ? tp / (tp + fp) : 0;
    const recall = tp + fn ? tp / (tp + fn) : 0;
    const specificity = tn + fp ? tn / (tn + fp) : 0;
    out.termAccuracy = round(termHits / reg.n, 4);
    out.detection = {
      threshold: 50,
      accuracy: round((tp + tn) / reg.n, 4),
      balancedAccuracy: round((recall + specificity) / 2, 4),
      precision: round(precision, 4),
      recall: round(recall, 4),
      f1: round(precision + recall ? (2 * precision * recall) / (precision + recall) : 0, 4),
      tp, fp, tn, fn,
    };
    const categories = {};
    Object.keys(byCategory)
      .sort()
      .forEach((cat) => {
        categories[cat] = { n: byCategory[cat].n, meanIP: round(byCategory[cat].sum / byCategory[cat].n, 2) };
      });
    if (Object.keys(categories).length) out.meanIPByCategory = categories;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Diff expert -> trained (what the UI shows as "what changed")
// ---------------------------------------------------------------------------

function paramsDiff(controller, baseParams, trainedParams) {
  const digits = (v) => Math.round(v * 1e4) / 1e4;
  const variables = [];
  let changedParams = 0;
  // A shoulder written as a triangle [a, b, c] compares with a trapezoid as
  // [a, b, b, c], so the columns of the two line up.
  const asType = (cfg, type) => {
    if (!cfg) return null;
    if (cfg.type === "triangle" && type === "trapeze") {
      const [a, b, c] = cfg.params;
      return [a, b, b, c];
    }
    return cfg.params;
  };
  const compareTerms = (symbol, before, after, kind) => {
    const terms = Object.keys(after).map((term) => {
      const b = before[term] ? asType(before[term], after[term].type).map(digits) : null;
      const a = after[term].params.map(digits);
      const changed = !b || b.length !== a.length || b.some((v, i) => Math.abs(v - a[i]) > 1e-9);
      if (changed) changedParams += a.filter((v, i) => !b || Math.abs(v - b[i]) > 1e-9).length;
      return { term, type: after[term].type, before: b, after: a, changed };
    });
    variables.push({ symbol, kind, terms });
  };
  if (controller === "intrusion") {
    Object.keys(trainedParams.inputs).forEach((symbol) => {
      compareTerms(symbol, baseParams.inputs[symbol], trainedParams.inputs[symbol], "input");
    });
    compareTerms("IP", baseParams.output, trainedParams.output, "output");
  } else {
    Object.keys(trainedParams.inputs).forEach((symbol) => {
      compareTerms(symbol, baseParams.inputs[symbol], trainedParams.inputs[symbol], "input");
    });
    const consequents = Object.keys(trainedParams.consequents).map((term) => {
      const b = digits(baseParams.consequents[term]);
      const a = digits(trainedParams.consequents[term]);
      const changed = Math.abs(a - b) > 1e-9;
      if (changed) changedParams += 1;
      return { term, type: "singleton", before: [b], after: [a], changed };
    });
    variables.push({ symbol: "SR", kind: "output", terms: consequents });
  }
  const rules = [];
  if (trainedParams.rules) {
    trainedParams.rules.forEach(([conditions, out], i) => {
      const base = baseParams.rules[i];
      const changed = !base || base[1] !== out || base[0].some((t, k) => t !== conditions[k]);
      if (changed) rules.push({ index: i + 1, before: base ? { conditions: base[0], out: base[1] } : null, after: { conditions, out } });
    });
  }
  return { variables, rules, changedParams, changedRules: rules.length };
}

// ---------------------------------------------------------------------------
// Params validation (params come from the browser / a saved file)
// ---------------------------------------------------------------------------

const isNumberArray = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => Number.isFinite(v));

function validateParams(controller, params) {
  const method = methodOf(controller);
  const errors = [];
  if (!params || typeof params !== "object") return ["params must be an object"];
  const base = method.baseParams();
  const inputTerms = Object.keys(base.inputs[Object.keys(base.inputs)[0]]);
  Object.keys(base.inputs).forEach((symbol) => {
    const terms = params.inputs?.[symbol];
    if (!terms || typeof terms !== "object") {
      errors.push(`inputs.${symbol} is missing`);
      return;
    }
    inputTerms.forEach((term) => {
      const cfg = terms[term];
      const ok =
        cfg &&
        ((cfg.type === "gauss" && isNumberArray(cfg.params, 2) && cfg.params[0] > 0) ||
          (cfg.type === "triangle" && isNumberArray(cfg.params, 3)) ||
          (cfg.type === "trapeze" && isNumberArray(cfg.params, 4)));
      if (!ok) errors.push(`inputs.${symbol}.${term} is invalid`);
    });
  });
  if (controller === "intrusion") {
    Object.keys(base.output).forEach((term) => {
      const cfg = params.output?.[term];
      if (!(cfg && cfg.type === "gauss" && isNumberArray(cfg.params, 2) && cfg.params[0] > 0)) errors.push(`output.${term} is invalid`);
    });
    if (!Array.isArray(params.rules) || params.rules.length !== base.rules.length) errors.push("rules must have 12 entries");
    else {
      params.rules.forEach((rule, i) => {
        const ok =
          Array.isArray(rule) &&
          Array.isArray(rule[0]) &&
          rule[0].length === 3 &&
          rule[0].every((t) => intrusion.INPUT_TERMS.includes(t)) &&
          intrusion.OUTPUT_TERMS.includes(rule[1]);
        if (!ok) errors.push(`rules[${i}] is invalid`);
      });
    }
    if (params.rateScale !== undefined && !["linear", "log10p1"].includes(params.rateScale)) errors.push("rateScale is invalid");
    const ranges = params.ranges || base.ranges;
    ["packets", "rate", "weight"].forEach((key) => {
      const r = ranges[key];
      if (!(r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.max > r.min)) errors.push(`ranges.${key} is invalid`);
    });
  } else {
    Object.keys(base.consequents).forEach((term) => {
      const v = params.consequents?.[term];
      if (!(Number.isFinite(v) && v >= 0 && v <= 100)) errors.push(`consequents.${term} is invalid`);
    });
  }
  return errors;
}

/** Builds an app model from validated params (full params for intrusion). */
function buildModelFromParams(controller, params, meta = { variant: "custom" }) {
  const method = methodOf(controller);
  const errors = validateParams(controller, params);
  if (errors.length) throw new Error(`invalid params: ${errors.join("; ")}`);
  const full =
    controller === "intrusion"
      ? { ...intrusion.BASE_PARAMS, rateScale: "linear", ...params, ranges: params.ranges || intrusion.BASE_PARAMS.ranges }
      : params;
  return method.module.buildModel(full, meta);
}

// ---------------------------------------------------------------------------
// The session
// ---------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {string} args.controller security | intrusion
 * @param {object} args.bySplit prepared samples per split (datasets.prepareDataset)
 * @param {object} [args.options] method options (generations, epochs, ...)
 * @param {string} [args.datasetName]
 * @param {number[][]} [args.coverage] ANFIS coverage inputs (see anfis.js); by
 *   default the method derives them from the dataset itself
 * @param {(entry: object, info: {step: number}) => void} [args.onProgress]
 * @param {() => boolean} [args.shouldStop] polled after every step
 * @param {() => Promise<void>} [args.yieldEach] awaited after every step, so an
 *   event loop (server, worker) can deliver progress and stop requests
 * @returns {Promise<object>} the result (see the file header)
 */
async function runTraining({
  controller,
  bySplit,
  options = {},
  datasetName = "",
  coverage = [],
  onProgress = null,
  shouldStop = () => false,
  yieldEach = null,
}) {
  const method = methodOf(controller);
  const opts = { ...method.defaultOptions, ...options };
  const spec = method.spec(opts);
  const initial = method.initialParams(opts);
  const samples = {};
  const splits = {};
  method.splits.forEach((name) => {
    splits[name] = (bySplit[name] || []).map((s) => ({ ...s, x: method.toX(s.raw, opts) }));
    samples[name] = splits[name].length;
  });
  if (!splits.train.length) throw new Error("the training split is empty");

  if (!coverage.length && method.coverage) coverage = method.coverage(splits);

  const started = Date.now();
  const steps = method.steps({ spec, initial, bySplit: splits, options: opts, coverage });
  let step = steps.next();
  let count = 0;
  while (!step.done) {
    count += 1;
    if (onProgress) onProgress(step.value, { step: count });
    if (yieldEach) await yieldEach();
    step = steps.next(Boolean(shouldStop()));
  }
  const raw = step.value;
  const seconds = (Date.now() - started) / 1000;

  const params = method.finalParams(raw, opts);
  const trainedModel = method.module.buildModel(params, { variant: "trained" });
  const baseModel = method.module.variants.base;
  const metrics = { base: {}, trained: {} };
  method.splits.forEach((name) => {
    if (!splits[name].length) return;
    metrics.base[name] = modelMetrics(controller, baseModel, splits[name], (s) => method.toBaseInputs(s.raw));
    metrics.trained[name] = modelMetrics(controller, trainedModel, splits[name], (s) => method.toTrainedInputs(s.x));
  });
  const history = raw.history.map((h) => {
    const entry = {};
    Object.entries(h).forEach(([k, v]) => {
      entry[k] = typeof v === "number" ? round(v, 4) : v;
    });
    return entry;
  });
  const last = history[history.length - 1] || {};

  const training = {
    method: method.describe,
    methodKey: method.method,
    stepName: method.stepName,
    createdAt: new Date().toISOString(),
    datasetName,
    samples,
    options: opts,
    // Both histories start with step 0 (the expert model).
    steps: history.length - 1,
    stopReason: last.stopReason || null,
    seconds: round(seconds, 1),
    metrics,
    history,
  };
  if (method.method === "ga") {
    training.chromosomeLength = CHROMOSOME_LENGTH;
    training.fitness = { expert: round(raw.expert.fitness, 6), best: round(raw.best.fitness, 6) };
  } else {
    training.bestEpoch = raw.best.epoch;
  }

  return {
    controller,
    method: method.method,
    params,
    training,
    // For Intrusion the comparison is made in the units of the trained model:
    // with logRate the expert model is converted to the log scale first.
    changes: paramsDiff(controller, method.initialParams(opts), params),
  };
}

/**
 * Inputs where the trained Security model must keep a fired rule: the rows
 * given (the dataset inputs) and a 12×12×12 grid over the box they span.
 */
function securityCoverage(rows = [], n = 12) {
  const lo = rows.length ? [0, 1, 2].map((i) => Math.min(...rows.map((r) => r[i]))) : [0.01, 10, 1];
  const hi = rows.length ? [0, 1, 2].map((i) => Math.max(...rows.map((r) => r[i]))) : [0.05, 35, 10];
  const axis = (i) => Array.from({ length: n }, (_, k) => lo[i] + ((hi[i] - lo[i]) * k) / (n - 1));
  const grid = [];
  axis(0).forEach((a) => axis(1).forEach((b) => axis(2).forEach((c) => grid.push([a, b, c]))));
  return [...rows, ...grid];
}

module.exports = {
  METHODS,
  securityCoverage,
  TRAINED_INTRUSION_RANGES,
  expertIntrusionInLogScale,
  intrusionTrainedX,
  intrusionBaseInputs,
  modelMetrics,
  targetTerm,
  paramsDiff,
  validateParams,
  buildModelFromParams,
  runTraining,
  methodOf,
};

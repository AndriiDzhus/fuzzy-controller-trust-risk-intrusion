/**
 * Genetic optimisation of the Intrusion controller (thesis section 4.3.4–4.3.5).
 *
 * Chromosome H = [H_in | H_out | H_rules], 74 genes (eq. 4.3–4.7):
 *   H_in     18 real genes   (c, σ) of 3 inputs × 3 Gaussian terms
 *   H_out     8 real genes   (c, σ) of 4 output Gaussian terms
 *   H_rules  48 integer genes 12 rules × (NP term, Rate term, We term, IP term)
 *
 * Fitness (eq. 4.11–4.12): the controller encoded by the chromosome runs the
 * Mamdani inference (min, clip, max, centre of gravity) on the training set;
 *   RMSE = sqrt(1/N Σ (y_n − y*_n)²),   F = 1 / (1 + RMSE)
 * (1 + RMSE instead of RMSE keeps F finite for a perfect fit).
 *
 * Operators:
 *   selection   tournament
 *   crossover   arithmetic for the real part (eq. 4.13),
 *               two-point for the rule part, cut between whole rules
 *   mutation    Gaussian noise for real genes (eq. 4.14),
 *               random re-assignment of a term index for rule genes
 *   validation  σ ≥ ε, centres inside the universe, terms ordered
 *               (low < medium < high: no inversions) and at least
 *               minCenterGap · span apart, no two rules with the same premise
 *   survivors   the best N of parents and offspring (elitist)
 *
 * The centre of gravity is computed as a sum on a uniform grid (eq. 4.10);
 * the grid step here (0.5) is coarser than in the app (0.2) for speed, the
 * final metrics are computed by the app model itself.
 */
const { createRandom, regressionMetrics } = require("./utils");

const N_IN = 3; // inputs
const T_IN = 3; // terms per input
const T_OUT = 4; // output terms
const N_RULES = 12;
const IN_GENES = N_IN * T_IN * 2; // 18
const OUT_GENES = T_OUT * 2; // 8
const REAL_GENES = IN_GENES + OUT_GENES; // 26
const RULE_GENES = N_RULES * 4; // 48

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

/**
 * Controller params -> chromosome.
 * @param {object} params {inputs: {sym: {term: {params: [σ, c]}}}, output, rules}
 * @param {object} spec {inputs: [{symbol}], inputTerms, outputTerms}
 */
function encode(params, spec) {
  const real = new Float64Array(REAL_GENES);
  let g = 0;
  spec.inputs.forEach(({ symbol }) => {
    spec.inputTerms.forEach((term) => {
      const [sigma, center] = params.inputs[symbol][term].params;
      real[g++] = center;
      real[g++] = sigma;
    });
  });
  spec.outputTerms.forEach((term) => {
    const [sigma, center] = params.output[term].params;
    real[g++] = center;
    real[g++] = sigma;
  });
  const rules = new Int8Array(RULE_GENES);
  params.rules.forEach(([conditions, out], m) => {
    conditions.forEach((term, i) => {
      rules[m * 4 + i] = spec.inputTerms.indexOf(term);
    });
    rules[m * 4 + 3] = spec.outputTerms.indexOf(out);
  });
  return { real, rules, fitness: null, rmse: null };
}

/** Chromosome -> controller params (gauss terms, rules with term names). */
function decode(ch, spec, digits = 4) {
  const r = (v) => Math.round(v * 10 ** digits) / 10 ** digits;
  const inputs = {};
  let g = 0;
  spec.inputs.forEach(({ symbol }) => {
    inputs[symbol] = {};
    spec.inputTerms.forEach((term) => {
      const center = ch.real[g++];
      const sigma = ch.real[g++];
      inputs[symbol][term] = { type: "gauss", params: [r(sigma), r(center)] };
    });
  });
  const output = {};
  spec.outputTerms.forEach((term) => {
    const center = ch.real[g++];
    const sigma = ch.real[g++];
    output[term] = { type: "gauss", params: [r(sigma), r(center)] };
  });
  const rules = [];
  for (let m = 0; m < N_RULES; m += 1) {
    rules.push([
      [0, 1, 2].map((i) => spec.inputTerms[ch.rules[m * 4 + i]]),
      spec.outputTerms[ch.rules[m * 4 + 3]],
    ]);
  }
  return { inputs, output, rules };
}

function clone(ch) {
  return { real: Float64Array.from(ch.real), rules: Int8Array.from(ch.rules), fitness: ch.fitness, rmse: ch.rmse };
}

/** Universe [min, max] of every real gene's variable. */
function geneRanges(spec) {
  const out = [];
  spec.inputs.forEach(({ range }) => {
    for (let t = 0; t < T_IN; t += 1) out.push(range, range);
  });
  for (let t = 0; t < T_OUT; t += 1) out.push(spec.outputRange, spec.outputRange);
  return out;
}

// ---------------------------------------------------------------------------
// Validation (repair)
// ---------------------------------------------------------------------------

/**
 * Keeps the chromosome meaningful:
 *  - centres inside the universe, σ within [ε·span, 0.6·span]
 *  - terms of every variable sorted by centre; rule genes are remapped so the
 *    controller behaves the same, only the names follow the order
 *  - no two rules share the same premise (a duplicate gets a new random one)
 */
function validate(ch, spec, rnd) {
  const blocks = [
    ...spec.inputs.map(({ range }, i) => ({ start: i * T_IN * 2, n: T_IN, range, ruleSlot: i })),
    { start: IN_GENES, n: T_OUT, range: spec.outputRange, ruleSlot: 3 },
  ];
  blocks.forEach(({ start, n, range: [min, max], ruleSlot }) => {
    const span = max - min;
    const terms = [];
    for (let t = 0; t < n; t += 1) {
      const c = Math.min(max, Math.max(min, ch.real[start + 2 * t]));
      const s = Math.min(0.6 * span, Math.max(spec.sigmaMin * span, Math.abs(ch.real[start + 2 * t + 1])));
      terms.push({ c, s, old: t });
    }
    terms.sort((a, b) => a.c - b.c || a.old - b.old);
    // Neighbouring centres keep a minimal distance, so the terms stay
    // distinguishable (no two "different" terms in the same place).
    const gap = (spec.minCenterGap || 0) * span;
    for (let t = 1; t < n; t += 1) terms[t].c = Math.max(terms[t].c, terms[t - 1].c + gap);
    if (terms[n - 1].c > max) {
      terms[n - 1].c = max;
      for (let t = n - 2; t >= 0; t -= 1) terms[t].c = Math.min(terms[t].c, terms[t + 1].c - gap);
    }
    const remap = new Array(n);
    terms.forEach((term, rank) => {
      ch.real[start + 2 * rank] = term.c;
      ch.real[start + 2 * rank + 1] = term.s;
      remap[term.old] = rank;
    });
    for (let m = 0; m < N_RULES; m += 1) {
      ch.rules[m * 4 + ruleSlot] = remap[ch.rules[m * 4 + ruleSlot]];
    }
  });

  const seen = new Set();
  for (let m = 0; m < N_RULES; m += 1) {
    let key = ch.rules[m * 4] * 9 + ch.rules[m * 4 + 1] * 3 + ch.rules[m * 4 + 2];
    let guard = 0;
    while (seen.has(key) && guard < 100) {
      for (let i = 0; i < 3; i += 1) ch.rules[m * 4 + i] = rnd.int(T_IN);
      key = ch.rules[m * 4] * 9 + ch.rules[m * 4 + 1] * 3 + ch.rules[m * 4 + 2];
      guard += 1;
    }
    seen.add(key);
  }
  return ch;
}

// ---------------------------------------------------------------------------
// Fitness: Mamdani inference of the encoded controller
// ---------------------------------------------------------------------------

/**
 * @param {{real, rules}} ch
 * @param {{x: Float64Array[], n: number}} data columns x[0..2] of length n
 * @param {Float64Array} grid output grid for the centre of gravity
 * @returns {Float64Array} crisp outputs
 */
function predict(ch, data, grid) {
  const { real, rules } = ch;
  const G = grid.length;
  // Output terms sampled on the grid (depend on the chromosome only).
  const outMu = [];
  for (let t = 0; t < T_OUT; t += 1) {
    const c = real[IN_GENES + 2 * t];
    const s = real[IN_GENES + 2 * t + 1];
    const k = 1 / (2 * s * s);
    const row = new Float64Array(G);
    for (let q = 0; q < G; q += 1) row[q] = Math.exp(-((grid[q] - c) ** 2) * k);
    outMu.push(row);
  }
  const inC = new Float64Array(9);
  const inK = new Float64Array(9);
  for (let j = 0; j < 9; j += 1) {
    inC[j] = real[2 * j];
    inK[j] = 1 / (2 * real[2 * j + 1] ** 2);
  }

  const out = new Float64Array(data.n);
  const mu = new Float64Array(9);
  const h = new Float64Array(T_OUT);
  for (let n = 0; n < data.n; n += 1) {
    for (let i = 0; i < N_IN; i += 1) {
      const x = data.x[i][n];
      for (let t = 0; t < T_IN; t += 1) {
        const j = i * T_IN + t;
        mu[j] = Math.exp(-((x - inC[j]) ** 2) * inK[j]);
      }
    }
    h.fill(0);
    for (let m = 0; m < N_RULES; m += 1) {
      const b = m * 4;
      let s = mu[rules[b]];
      const s2 = mu[3 + rules[b + 1]];
      const s3 = mu[6 + rules[b + 2]];
      if (s2 < s) s = s2;
      if (s3 < s) s = s3;
      if (s > h[rules[b + 3]]) h[rules[b + 3]] = s;
    }
    let num = 0;
    let den = 0;
    for (let q = 0; q < G; q += 1) {
      let m = 0;
      for (let t = 0; t < T_OUT; t += 1) {
        const v = outMu[t][q] < h[t] ? outMu[t][q] : h[t];
        if (v > m) m = v;
      }
      num += grid[q] * m;
      den += m;
    }
    out[n] = den > 0 ? num / den : 0;
  }
  return out;
}

function rmseOf(pred, y) {
  let se = 0;
  for (let n = 0; n < y.length; n += 1) se += (pred[n] - y[n]) ** 2;
  return Math.sqrt(se / y.length);
}

function evaluate(ch, data, grid) {
  ch.rmse = rmseOf(predict(ch, data, grid), data.y);
  ch.fitness = 1 / (1 + ch.rmse);
  return ch;
}

// ---------------------------------------------------------------------------
// Operators
// ---------------------------------------------------------------------------

function tournament(population, k, rnd) {
  let best = population[rnd.int(population.length)];
  for (let i = 1; i < k; i += 1) {
    const other = population[rnd.int(population.length)];
    if (other.fitness > best.fitness) best = other;
  }
  return best;
}

/** Arithmetic crossover of the real part, two-point crossover of the rules. */
function crossover(p1, p2, rnd) {
  const o1 = clone(p1);
  const o2 = clone(p2);
  const lambda = rnd.next();
  for (let g = 0; g < REAL_GENES; g += 1) {
    o1.real[g] = lambda * p1.real[g] + (1 - lambda) * p2.real[g];
    o2.real[g] = (1 - lambda) * p1.real[g] + lambda * p2.real[g];
  }
  let a = rnd.int(N_RULES + 1);
  let b = rnd.int(N_RULES + 1);
  if (a > b) [a, b] = [b, a];
  for (let g = a * 4; g < b * 4; g += 1) {
    o1.rules[g] = p2.rules[g];
    o2.rules[g] = p1.rules[g];
  }
  o1.fitness = o2.fitness = null;
  return [o1, o2];
}

function mutate(ch, { pReal, pRule, scale, ranges }, rnd) {
  for (let g = 0; g < REAL_GENES; g += 1) {
    if (rnd.next() < pReal) {
      const [min, max] = ranges[g];
      ch.real[g] += rnd.normal() * scale * (max - min);
    }
  }
  for (let g = 0; g < RULE_GENES; g += 1) {
    if (rnd.next() < pRule) {
      const choices = g % 4 === 3 ? T_OUT : T_IN;
      ch.rules[g] = (ch.rules[g] + 1 + rnd.int(choices - 1)) % choices;
    }
  }
  ch.fitness = null;
  return ch;
}

function randomChromosome(spec, ranges, rnd) {
  const real = new Float64Array(REAL_GENES);
  for (let g = 0; g < REAL_GENES; g += 2) {
    const [min, max] = ranges[g];
    real[g] = rnd.uniform(min, max);
    real[g + 1] = rnd.uniform(0.05, 0.3) * (max - min);
  }
  const rules = new Int8Array(RULE_GENES);
  for (let g = 0; g < RULE_GENES; g += 1) rules[g] = rnd.int(g % 4 === 3 ? T_OUT : T_IN);
  return { real, rules, fitness: null, rmse: null };
}

/**
 * Converts columns of samples to typed arrays for the fitness function.
 * @param {Array<{x: number[], y: number}>} samples
 */
function toColumns(samples) {
  const n = samples.length;
  const x = [new Float64Array(n), new Float64Array(n), new Float64Array(n)];
  const y = new Float64Array(n);
  samples.forEach((s, i) => {
    x[0][i] = s.x[0];
    x[1][i] = s.x[1];
    x[2][i] = s.x[2];
    y[i] = s.y;
  });
  return { x, y, n };
}

function gridOf([min, max], step) {
  const count = Math.round((max - min) / step);
  return Float64Array.from({ length: count + 1 }, (_, i) => min + i * step);
}

// ---------------------------------------------------------------------------
// Evolution
// ---------------------------------------------------------------------------

/**
 * @param {object} args
 * @param {object} args.spec {inputs: [{symbol, range}], inputTerms, outputTerms,
 *   outputRange, sigmaMin}
 * @param {object} args.initial controller params in the training units
 *   (seed of the initial population)
 * @param {Array<{x: number[], y: number}>} args.train
 * @param {Array<{x: number[], y: number}>} [args.validation]
 * @param {object} [args.options]
 * @param {(entry: object) => void} [args.onGeneration]
 * @returns {{params, best, history}}
 */
/**
 * Generator form of the evolution: one `yield` per recorded generation (the
 * entry of the history), the final result as the return value. Lets the
 * caller report progress or stop early (generator.return()).
 */
function* evolveSteps({ spec, initial, train, validation = [], options = {} }) {
  const {
    initialPopulation = 300, // N0
    populationSize = 200, // N < N0
    generations = 200,
    crossoverRate = 0.9,
    mutationReal = 0.15,
    mutationRule = 0.04,
    mutationScaleStart = 0.08,
    mutationScaleEnd = 0.01,
    tournamentSize = 3,
    seedShare = 0.2, // share of N0 built by mutating the expert chromosome
    stagnation = 60,
    targetRmse = 0,
    gridStep = 0.5,
    seed = 42,
  } = options;

  const rnd = createRandom(seed);
  const ranges = geneRanges(spec);
  const grid = gridOf(spec.outputRange, gridStep);
  const trainData = toColumns(train);
  const valData = validation.length ? toColumns(validation) : null;

  // Step 1. Initial population P0 of N0 chromosomes: the expert controller,
  // mutated copies of it and random chromosomes.
  const expert = validate(encode(initial, spec), spec, rnd);
  let population = [evaluate(expert, trainData, grid)];
  const seeded = Math.round(initialPopulation * seedShare);
  for (let i = 1; i < initialPopulation; i += 1) {
    const ch =
      i < seeded
        ? mutate(clone(expert), { pReal: 0.5, pRule: 0.15, scale: 0.1, ranges }, rnd)
        : randomChromosome(spec, ranges, rnd);
    population.push(evaluate(validate(ch, spec, rnd), trainData, grid));
  }
  // Working population P of N best chromosomes (by RMSE).
  population.sort((a, b) => a.rmse - b.rmse);
  population = population.slice(0, populationSize);

  const history = [];
  const record = (generation, stopReason = null) => {
    const best = population[0];
    const meanRmse = population.reduce((acc, ch) => acc + ch.rmse, 0) / population.length;
    const entry = {
      generation,
      bestRmse: best.rmse,
      meanRmse,
      bestFitness: best.fitness,
      validationRmse: valData ? rmseOf(predict(best, valData, grid), valData.y) : null,
      stopReason,
    };
    history.push(entry);
    return entry;
  };
  const result = () => {
    const best = population[0];
    return {
      params: decode(best, spec),
      best: { rmse: best.rmse, fitness: best.fitness },
      expert: { rmse: expert.rmse, fitness: expert.fitness },
      history,
      chromosomeLength: REAL_GENES + RULE_GENES,
    };
  };
  if (yield record(0)) {
    history[0].stopReason = "stopped";
    return result();
  }

  let lastImprovement = 0;
  let bestRmse = population[0].rmse;
  for (let generation = 1; generation <= generations; generation += 1) {
    const progress = generations > 1 ? (generation - 1) / (generations - 1) : 1;
    const scale = mutationScaleStart + (mutationScaleEnd - mutationScaleStart) * progress;

    // Selection, crossover, mutation, validation, evaluation.
    const offspring = [];
    while (offspring.length < populationSize) {
      const p1 = tournament(population, tournamentSize, rnd);
      const p2 = tournament(population, tournamentSize, rnd);
      const children = rnd.next() < crossoverRate ? crossover(p1, p2, rnd) : [clone(p1), clone(p2)];
      children.forEach((child) => {
        mutate(child, { pReal: mutationReal, pRule: mutationRule, scale, ranges }, rnd);
        validate(child, spec, rnd);
        offspring.push(evaluate(child, trainData, grid));
      });
    }
    // Next generation: the best N of parents and offspring.
    population = population.concat(offspring).sort((a, b) => a.rmse - b.rmse).slice(0, populationSize);

    const entry = record(generation);
    if (entry.bestRmse < bestRmse - 1e-6) {
      bestRmse = entry.bestRmse;
      lastImprovement = generation;
    }
    if (entry.bestRmse <= targetRmse) entry.stopReason = "target";
    else if (generation - lastImprovement >= stagnation) entry.stopReason = "stagnation";
    else if (generation === generations) entry.stopReason = "generations";
    // next(true) asks to stop after this generation.
    const stop = yield entry;
    if (stop && !entry.stopReason) entry.stopReason = "stopped";
    if (entry.stopReason) break;
  }
  return result();
}

/**
 * @param {object} args see evolveSteps; `onGeneration(entry)` is called for
 *   every recorded generation
 * @returns {{params, best, expert, history, chromosomeLength}}
 */
function evolve({ onGeneration = null, ...args }) {
  const steps = evolveSteps(args);
  let step = steps.next();
  while (!step.done) {
    if (onGeneration) onGeneration(step.value);
    step = steps.next();
  }
  return step.value;
}

module.exports = {
  evolve,
  evolveSteps,
  encode,
  decode,
  validate,
  predict,
  crossover,
  mutate,
  toColumns,
  gridOf,
  regressionMetrics,
  CHROMOSOME_LENGTH: REAL_GENES + RULE_GENES,
};

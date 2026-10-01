/**
 * ANFIS training of the Security controller (thesis section 3.4.4).
 *
 * The controller is a zero-order Sugeno system with 3 inputs × 3 triangular
 * terms and a sparse rule base: the binary mask keeps the 6 expert rules of
 * table 3.1 and no other rule can appear during training.
 *
 * Hybrid learning, one epoch:
 *   1. forward pass with the membership functions fixed: normalised rule
 *      weights w̄ for every sample form the N×6 matrix A, and the 6 consequents
 *      are found in one step by least squares, C = (AᵀA)⁻¹Aᵀy   (eq. 3.11–3.12)
 *   2. backward pass with the consequents fixed: the break points of the
 *      triangles move by gradient descent on E = ½(y − y*)²       (eq. 3.13–3.14)
 *      ∂E/∂θ = (y − y*) · Σ_k ∂y/∂w_k · ∂w_k/∂μ · ∂μ/∂θ
 *        ∂y/∂w_k  = (c_k − y) / Σw
 *        ∂w_k/∂μ  = product of the other memberships of rule k
 *        ∂μ/∂θ    = subgradient of the triangle at its break point
 *
 * The history starts with epoch 0 (the expert model) followed by one entry
 * per epoch. Every epoch lowers the training RMSE (over the rows where some rule fires,
 * the error the gradient minimises): a step that does not is rejected and the
 * step halves. The returned model is the epoch with the lowest penalised
 * RMSE among the epochs that keep coverage: wherever the expert model fires a
 * rule (training rows and args.coverage), the trained model must fire one too.
 *
 * Break points are learned in normalised units u = (x − min)/(max − min),
 * which is the gradient scaling of the thesis: every variable gets the same
 * step size although EC lives on [0, 0.05] and TP on [0, 40].
 *
 * Learnable parameters per input (as in the thesis):
 *   L  "low"     left shoulder [min, min, c]          c
 *   M  "medium"  triangle [a, b, c]                   a, b, c
 *   H  "high"    right shoulder [a, b, max, max]      a, b
 * 3 inputs × 6 = 18 premise parameters, plus 6 consequents.
 */
const { leastSquares, regressionMetrics, round } = require("./utils");

const TERMS = ["low", "medium", "high"];
const GAP = 0.02; // minimal distance between break points, normalised units

// ---------------------------------------------------------------------------
// Parameter conversion: controller params (physical) <-> normalised vectors
// ---------------------------------------------------------------------------

/**
 * @param {object} inputParams e.g. {low: {type, params}, medium: …, high: …}
 * @param {[number, number]} range universe [min, max]
 * @returns {{L: number[], M: number[], H: number[]}} normalised break points
 */
function toNormalized(inputParams, [min, max]) {
  const u = (x) => (x - min) / (max - min);
  const low = inputParams.low.params;
  const medium = inputParams.medium.params;
  const high = inputParams.high.params;
  return {
    L: [u(low[2])],
    M: [u(medium[0]), u(medium[1]), u(medium[2])],
    H: [u(high[0]), u(high[1])],
  };
}

function toPhysical({ L, M, H }, [min, max], digits = 6) {
  const x = (value) => round(min + value * (max - min), digits);
  return {
    low: { type: "triangle", params: [min, min, x(L[0])] },
    medium: { type: "triangle", params: [x(M[0]), x(M[1]), x(M[2])] },
    high: { type: "trapeze", params: [x(H[0]), x(H[1]), max, max] },
  };
}

// ---------------------------------------------------------------------------
// Memberships and their subgradients (normalised input u)
// ---------------------------------------------------------------------------

/** mu and ∂mu/∂θ of the three terms at u. */
function termValues(p, u) {
  const out = {
    low: { mu: 0, grad: [0] },
    medium: { mu: 0, grad: [0, 0, 0] },
    high: { mu: 0, grad: [0, 0] },
  };
  // L: left shoulder [0, 0, c]
  const [c0] = p.L;
  if (u <= 0) out.low.mu = 1;
  else if (u < c0) {
    out.low.mu = (c0 - u) / c0;
    out.low.grad[0] = u / (c0 * c0);
  }
  // M: triangle [a, b, c]
  const [a, b, c] = p.M;
  if (u > a && u <= b) {
    out.medium.mu = (u - a) / (b - a);
    out.medium.grad[0] = (u - b) / (b - a) ** 2;
    out.medium.grad[1] = -(u - a) / (b - a) ** 2;
  } else if (u > b && u < c) {
    out.medium.mu = (c - u) / (c - b);
    out.medium.grad[1] = (c - u) / (c - b) ** 2;
    out.medium.grad[2] = (u - b) / (c - b) ** 2;
  }
  if (u === b) out.medium.mu = 1;
  // H: right shoulder [a, b, 1, 1]
  const [ha, hb] = p.H;
  if (u >= hb) out.high.mu = 1;
  else if (u > ha) {
    out.high.mu = (u - ha) / (hb - ha);
    out.high.grad[0] = (u - hb) / (hb - ha) ** 2;
    out.high.grad[1] = -(u - ha) / (hb - ha) ** 2;
  }
  return out;
}

/**
 * Keeps the break points ordered, inside [0, 1] and overlapping, so that
 * every point of the universe belongs to some term ("validation" of the
 * shape after a gradient step).
 */
function project(p) {
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const M = p.M.slice();
  M[1] = clamp(M[1], GAP, 1 - GAP);
  M[0] = clamp(M[0], 0, M[1] - GAP);
  M[2] = clamp(M[2], M[1] + GAP, 1);
  const L = [clamp(p.L[0], Math.max(GAP, M[0] + GAP), M[2])];
  const H = p.H.slice();
  H[1] = clamp(H[1], M[1] + GAP, 1);
  H[0] = clamp(H[0], M[0], Math.min(M[2] - GAP, H[1] - GAP));
  return { L, M, H };
}

// ---------------------------------------------------------------------------
// Forward pass
// ---------------------------------------------------------------------------

/**
 * @param {object} state {premise: {EC: {L, M, H}, …}, consequents: number[]}
 * @param {object} spec {inputs: [{symbol, range}], rules: [[terms], out]}
 * @param {number[]} x crisp inputs in spec.inputs order
 */
function forward(state, spec, x) {
  const values = spec.inputs.map(({ symbol, range: [min, max] }, i) =>
    termValues(state.premise[symbol], (x[i] - min) / (max - min))
  );
  const weights = spec.rules.map(([terms]) =>
    terms.reduce((acc, term, i) => acc * values[i][term].mu, 1)
  );
  const sum = weights.reduce((acc, w) => acc + w, 0);
  const normalized = weights.map((w) => (sum > 0 ? w / sum : 0));
  const y =
    sum > 0 ? normalized.reduce((acc, w, k) => acc + w * state.consequents[k], 0) : null;
  return { values, weights, sum, normalized, y };
}

function predictAll(state, spec, samples) {
  return samples.map((s) => forward(state, spec, s.x).y);
}

/**
 * Metrics on the rows where some rule fired, plus the training objective:
 * penalizedRmse counts a row without any fired rule with the worst possible
 * error for its target, max(y* − min, max − y*), so the training can never
 * gain by leaving hard rows uncovered.
 */
function evaluate(state, spec, samples, outputRange = [0, 100]) {
  const fired = [];
  const target = [];
  let notFired = 0;
  let penalty = 0;
  samples.forEach((s) => {
    const { y } = forward(state, spec, s.x);
    if (y === null) {
      notFired += 1;
      penalty += Math.max(s.y - outputRange[0], outputRange[1] - s.y) ** 2;
    } else {
      fired.push(y);
      target.push(s.y);
    }
  });
  const metrics = regressionMetrics(fired, target);
  const se = metrics.n ? metrics.rmse ** 2 * metrics.n : 0;
  const penalizedRmse = samples.length ? Math.sqrt((se + penalty) / samples.length) : null;
  return { ...metrics, notFired, penalizedRmse };
}

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

/** Step 1: consequents by least squares with the premises fixed. */
function fitConsequents(state, spec, samples, { ridge, prior }) {
  const rows = [];
  const y = [];
  samples.forEach((s) => {
    const f = forward(state, spec, s.x);
    if (f.sum > 0) {
      rows.push(f.normalized);
      y.push(s.y);
    }
  });
  return leastSquares(rows, y, { ridge, prior });
}

/** Step 2: batch subgradient of E = ½(y − y*)² over the premise parameters. */
function premiseGradient(state, spec, samples) {
  const grad = {};
  spec.inputs.forEach(({ symbol }) => {
    grad[symbol] = { L: [0], M: [0, 0, 0], H: [0, 0] };
  });
  const key = { low: "L", medium: "M", high: "H" };
  let n = 0;
  samples.forEach((s) => {
    const f = forward(state, spec, s.x);
    if (f.sum <= 0) return;
    n += 1;
    const error = f.y - s.y;
    spec.rules.forEach(([terms], k) => {
      const dydw = (state.consequents[k] - f.y) / f.sum;
      if (dydw === 0) return;
      terms.forEach((term, i) => {
        // ∂w_k/∂mu_i: product of the other memberships of rule k
        let others = 1;
        terms.forEach((t, j) => {
          if (j !== i) others *= f.values[j][t].mu;
        });
        if (others === 0) return;
        const g = grad[spec.inputs[i].symbol][key[term]];
        const dmu = f.values[i][term].grad;
        for (let q = 0; q < g.length; q += 1) g[q] += error * dydw * others * dmu[q];
      });
    });
  });
  if (n > 0) {
    Object.values(grad).forEach((g) =>
      Object.values(g).forEach((vec) => vec.forEach((_, q) => (vec[q] /= n)))
    );
  }
  return grad;
}

function gradientNorm(grad) {
  let s = 0;
  Object.values(grad).forEach((g) => Object.values(g).forEach((vec) => vec.forEach((v) => (s += v * v))));
  return Math.sqrt(s);
}

function cloneState(state) {
  const premise = {};
  Object.entries(state.premise).forEach(([symbol, p]) => {
    premise[symbol] = { L: p.L.slice(), M: p.M.slice(), H: p.H.slice() };
  });
  return { premise, consequents: state.consequents.slice() };
}

/**
 * Hybrid ANFIS training.
 *
 * @param {object} args
 * @param {object} args.spec {inputs: [{symbol, range}], rules: [[terms], outTerm][]}
 * @param {object} args.initial {inputs: {symbol: termParams}, consequents: {term: value}}
 *   controller params of the starting (expert) model
 * @param {Array<{x: number[], y: number}>} args.train
 * @param {Array<{x: number[], y: number}>} [args.test]
 * @param {number[][]} [args.coverage] extra inputs (no targets) where the
 *   trained model must fire a rule wherever the expert model does
 * @param {object} [args.options]
 * @param {number} [args.options.epochs=200]
 * @param {number} [args.options.stepSize=0.01] initial step, normalised units
 * @param {number} [args.options.minStep=1e-5] stop when a descent step this
 *   small does not lower the error
 * @param {number} [args.options.ridge=1e-3] Tikhonov term of the LSE step
 * @param {number} [args.options.tolerance=1e-4] stop when RMSE improves less
 * @param {number} [args.options.patience=25] epochs without improvement
 * @param {[number, number]} [args.options.outputRange=[0, 100]] consequents are
 *   clipped to the universe of SR
 * @returns {{params, history, best, metrics}}
 *
 * trainAnfisSteps is the generator form: one `yield` per epoch (the history
 * entry), the result as the return value; trainAnfis drains it.
 */
function* trainAnfisSteps({ spec, initial, train, test = [], coverage = [], options = {} }) {
  let {
    epochs = 200,
    stepSize: initialStep = 0.01,
    ridge = 1e-3,
    tolerance = 1e-4,
    patience = 25,
    minStep = 1e-5,
    outputRange = [0, 100],
  } = options;

  const priorConsequents = spec.rules.map(([, out]) => initial.consequents[out]);
  let state = { premise: {}, consequents: priorConsequents.slice() };
  spec.inputs.forEach(({ symbol, range }) => {
    state.premise[symbol] = project(toNormalized(initial.inputs[symbol], range));
  });

  const baseMetrics = {
    train: evaluate(state, spec, train),
    test: test.length ? evaluate(state, spec, test) : null,
  };

  /** Step 1 (forward pass): least-squares consequents for fixed premises. */
  const withConsequents = (premiseState) => {
    const fitted = fitConsequents(premiseState, spec, train, {
      ridge: ridge * train.length,
      prior: priorConsequents,
    });
    const next = cloneState(premiseState);
    next.consequents = fitted.map((c) => Math.min(outputRange[1], Math.max(outputRange[0], c)));
    return { state: next, metrics: evaluate(next, spec, train, outputRange) };
  };

  let current = withConsequents(state);
  const history = [];
  // Coverage: every input where the expert model fires some rule must keep a
  // fired rule in the trained model, or the app would show "no rule fired"
  // there. Checked on args.coverage (inputs only, no targets) and the train set.
  const coveragePoints = [...coverage, ...train.map((s) => s.x)].filter(
    (x) => forward(current.state, spec, x).sum > 0
  );
  // The check runs on the parameters as they are saved (rounded to physical
  // units and read back), so a break point that lands exactly on a sample
  // after rounding cannot slip through.
  const asSaved = (st) => {
    const copy = cloneState(st);
    spec.inputs.forEach(({ symbol, range }) => {
      copy.premise[symbol] = toNormalized(toPhysical(st.premise[symbol], range), range);
    });
    return copy;
  };
  const covers = (candidateState) => {
    const saved = asSaved(candidateState);
    return coveragePoints.every((x) => forward(saved, spec, x).sum > 0);
  };

  let best = { epoch: 1, objective: current.metrics.rmse, state: cloneState(current.state) };
  let stepSize = initialStep;
  let sinceImprovement = 0;

  const record = (epoch, stopReason = null) => {
    const testMetrics = test.length ? evaluate(current.state, spec, test) : null;
    const entry = {
      epoch,
      trainRmse: current.metrics.rmse,
      testRmse: testMetrics ? testMetrics.rmse : null,
      stepSize,
      stopReason,
    };
    history.push(entry);
    if (current.metrics.rmse < best.objective - 1e-12 && covers(current.state)) {
      best = { epoch, objective: current.metrics.rmse, state: cloneState(current.state) };
    }
    return entry;
  };

  // Epoch 0: the expert model before the first least-squares step, so the
  // learning curve shows what that step gains.
  const baseEntry = {
    epoch: 0,
    trainRmse: baseMetrics.train.rmse,
    testRmse: baseMetrics.test ? baseMetrics.test.rmse : null,
    stepSize: initialStep,
    stopReason: null,
  };
  history.push(baseEntry);
  if (yield baseEntry) {
    // Stopped before the first epoch: keep the least-squares consequents.
    record(1, "stopped");
    epochs = 0;
  }

  for (let epoch = 1; epoch <= epochs; epoch += 1) {
    const entry = record(epoch, epoch === epochs ? "epochs" : null);
    if (entry.stopReason) {
      yield entry;
      break;
    }

    // Step 2 (backward pass): gradient descent on the premises with the
    // consequents fixed, then the least squares of the next epoch. A step that
    // does not lower the error is rejected and the step size halves
    // (backtracking); an accepted step grows it by 10 %.
    let accepted = null;
    const grad = premiseGradient(current.state, spec, train);
    const norm = gradientNorm(grad);
    while (norm > 0 && stepSize >= minStep) {
      const moved = cloneState(current.state);
      Object.entries(grad).forEach(([symbol, g]) => {
        ["L", "M", "H"].forEach((k) => {
          g[k].forEach((v, q) => {
            moved.premise[symbol][k][q] -= (stepSize * v) / norm;
          });
        });
        moved.premise[symbol] = project(moved.premise[symbol]);
      });
      const candidate = withConsequents(moved);
      if (candidate.metrics.rmse < current.metrics.rmse && covers(candidate.state)) {
        accepted = candidate;
        stepSize *= 1.1;
        break;
      }
      stepSize *= 0.5;
    }
    if (!accepted) {
      // No descent direction left: converged.
      entry.stopReason = "converged";
      yield entry;
      break;
    }
    // next(true) asks to stop after this epoch.
    if (yield entry) {
      entry.stopReason = "stopped";
      break;
    }

    sinceImprovement = current.metrics.rmse - accepted.metrics.rmse > tolerance ? 0 : sinceImprovement + 1;
    current = accepted;
    if (sinceImprovement >= patience) {
      yield record(epoch + 1, "patience");
      break;
    }
  }

  const finalState = best.state;
  const params = { inputs: {}, consequents: {} };
  spec.inputs.forEach(({ symbol, range }) => {
    params.inputs[symbol] = toPhysical(finalState.premise[symbol], range);
  });
  spec.rules.forEach(([, out], k) => {
    params.consequents[out] = round(finalState.consequents[k], 4);
  });

  return {
    params,
    history,
    best: { epoch: best.epoch },
    metrics: {
      base: baseMetrics,
      trained: {
        train: evaluate(finalState, spec, train),
        test: test.length ? evaluate(finalState, spec, test) : null,
      },
    },
    predict: (samples) => predictAll(finalState, spec, samples),
  };
}

function trainAnfis({ onEpoch = null, ...args }) {
  const steps = trainAnfisSteps(args);
  let step = steps.next();
  while (!step.done) {
    if (onEpoch) onEpoch(step.value);
    step = steps.next();
  }
  return step.value;
}

module.exports = {
  TERMS,
  trainAnfis,
  trainAnfisSteps,
  toNormalized,
  toPhysical,
  termValues,
  project,
  forward,
  premiseGradient,
};

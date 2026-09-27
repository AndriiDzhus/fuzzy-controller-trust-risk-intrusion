/**
 * Inference steps shared by Mamdani and Sugeno controllers:
 * fuzzification and rule strength.
 */
const { termNames } = require("./model");

/** Step 1. Fuzzification: mu of every term of the variable at crisp x. */
function fuzzify(variable, x) {
  const memberships = {};
  variable.terms.forEach((term) => {
    memberships[term.name] = term.valueAt(x);
  });
  return memberships;
}

/**
 * Fuzzy AND (t-norm) combining the condition memberships of a rule.
 * Mamdani controllers use min (eq. 2.16, 4.8); the Sugeno controller uses the
 * algebraic product (eq. 3.5).
 */
const T_NORMS = {
  min: (values) => Math.min(...values),
  product: (values) => values.reduce((acc, value) => acc * value, 1),
};

function roundMu(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

/**
 * Step 2. Rule strength of every rule of the system.
 * @param {FIS} system model built by defineSystem()
 * @param {Object.<string, Object.<string, number>>} memberships per input key
 * @param {"min"|"product"} tnorm
 * @returns {Array} one entry per rule; `strength` is exact, `alpha` is rounded
 *   for display, `conditions` lists the memberships that were combined
 */
function evaluateRules(system, memberships, tnorm = "min") {
  const combine = T_NORMS[tnorm] || T_NORMS.min;
  return system.rules.map((rule, index) => {
    const mu = system.inputSpecs.map(
      (input, i) => Number(memberships[input.key]?.[rule.conditions[i]]) || 0
    );
    const strength = combine(mu);
    return {
      index: index + 1,
      conditions: system.inputSpecs.map((input, i) => ({
        key: input.key,
        symbol: input.symbol,
        term: rule.conditions[i],
        mu: roundMu(mu[i]),
      })),
      out: rule.conclusions[0],
      alpha: roundMu(strength),
      strength,
      tnorm,
    };
  });
}

/** Rule evaluations as returned by the API (without the exact strength). */
function publicRuleEvaluations(evaluations) {
  return evaluations.map(({ strength, ...rest }) => rest);
}

/** Term with the largest value; ties keep the first term in order. */
function argmaxTerm(values) {
  let best = null;
  let bestValue = -Infinity;
  Object.entries(values || {}).forEach(([term, value]) => {
    if (value > bestValue) {
      best = term;
      bestValue = value;
    }
  });
  return best;
}

/** Zero value for every term of the variable, in term order. */
function zeroByTerm(variable) {
  const out = {};
  termNames(variable).forEach((name) => {
    out[name] = 0;
  });
  return out;
}

module.exports = {
  fuzzify,
  T_NORMS,
  roundMu,
  evaluateRules,
  publicRuleEvaluations,
  argmaxTerm,
  zeroByTerm,
};

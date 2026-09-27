/**
 * Sugeno inference of zero order (thesis section 3, layers 3–5), after the
 * rule weights w_k are known:
 *   normalisation          w̄_k = w_k / Σ w                    (eq. 3.6–3.7)
 *   weighted consequents   Y_k = w̄_k · C_k  (Hadamard product) (eq. 3.8–3.9)
 *   output                 y*  = Σ Y_k      (full contraction of Y)
 * Consequents C_k are the positions of the FuzzyIS "singleton" output terms.
 */
const { roundMu, zeroByTerm } = require("./inference");

/** Singleton positions C_m of the output terms. */
function singletonPositions(outputVariable) {
  const positions = {};
  outputVariable.terms.forEach((term) => {
    positions[term.name] = term.mfParams[0];
  });
  return positions;
}

/**
 * @param {LinguisticVariable} outputVariable variable with singleton terms
 * @param {Array} evaluations rule evaluations with exact `strength` = w_k
 */
function sugenoWeightedSum(outputVariable, evaluations) {
  const singletons = singletonPositions(outputVariable);
  const weightSum = evaluations.reduce((acc, rule) => acc + rule.strength, 0);
  const noRuleFired = weightSum === 0;

  const weightedConsequents = evaluations.map((rule) => {
    const consequent = singletons[rule.out];
    const normalized = noRuleFired ? 0 : rule.strength / weightSum;
    return {
      index: rule.index,
      out: rule.out,
      weight: roundMu(rule.strength),
      normalizedWeight: roundMu(normalized),
      consequent,
      weighted: normalized * consequent,
    };
  });

  // Per-singleton view for the charts.
  const weights = zeroByTerm(outputVariable);
  const normalizedWeights = zeroByTerm(outputVariable);
  evaluations.forEach((rule) => {
    weights[rule.out] = Math.max(weights[rule.out], rule.strength);
    normalizedWeights[rule.out] += noRuleFired ? 0 : rule.strength / weightSum;
  });

  return {
    value: noRuleFired
      ? null
      : weightedConsequents.reduce((acc, item) => acc + item.weighted, 0),
    noRuleFired,
    weights,
    normalizedWeights,
    weightedConsequents,
    singletons,
  };
}

module.exports = {
  singletonPositions,
  sugenoWeightedSum,
};

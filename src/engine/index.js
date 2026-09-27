/**
 * Fuzzy inference engine shared by the Trust, Security and Intrusion
 * controllers.
 *
 * Division of labour:
 *  - The FuzzyIS library describes every model: linguistic variables, terms
 *    with their membership functions, rules (LinguisticVariable, Term, Rule,
 *    FIS)                                                       -> model.js
 *  - The inference steps are implemented explicitly, following the thesis
 *    formulas, because FuzzyIS only offers min as the AND operator and its
 *    built-in "mass center" is a coarse bisector, not the centroid:
 *      1. fuzzification                                         -> inference.js
 *      2. rule strength, t-norm min or product                  -> inference.js
 *      3–4. Mamdani: clip, max, centre of gravity               -> mamdani.js
 *      3–4. Sugeno: normalisation, weighted sum Σ w̄·c           -> sugeno.js
 *
 * FIS.getPreciseOutput() is never called: it computes the bisector and writes
 * rule strengths into the shared Rule objects.
 */
module.exports = {
  ...require("./membershipFunctions"),
  ...require("./model"),
  ...require("./inference"),
  ...require("./sampling"),
  ...require("./mamdani"),
  ...require("./sugeno"),
};

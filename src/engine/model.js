/**
 * Model description with FuzzyIS objects: linguistic variables with their
 * terms, and the rule base assembled into a FIS.
 */
const { LinguisticVariable, Rule, FIS } = require("fuzzyis");
const { SafeTerm } = require("./membershipFunctions");

/**
 * @param {string} name
 * @param {[number, number]} range universe of discourse
 * @param {Object.<string, {type: string, params: number[]}>} terms
 * @returns {LinguisticVariable}
 */
function defineVariable(name, range, terms) {
  const variable = new LinguisticVariable(name, range, []);
  Object.entries(terms).forEach(([termName, cfg]) => {
    variable.addTerm(new SafeTerm(termName, cfg.type, cfg.params));
  });
  return variable;
}

/**
 * Builds the FIS that describes a controller.
 * @param {object} spec
 * @param {string} spec.name
 * @param {Array<{key: string, symbol: string, variable: LinguisticVariable}>} spec.inputs
 *   key is the API / UI input name, symbol the thesis notation (ER, EC, NP, ...)
 * @param {LinguisticVariable} spec.output
 * @param {Array<[string[], string]>} spec.rules [input terms in input order, output term]
 * @returns {FIS}
 */
function defineSystem({ name, inputs, output, rules }) {
  const system = new FIS(name, [], [], []);
  inputs.forEach((input) => system.addInput(input.variable));
  system.addOutput(output);
  rules.forEach(([conditions, conclusion]) => {
    system.addRule(new Rule(conditions, [conclusion], "and"));
  });
  system.inputSpecs = inputs.map(({ key, symbol }) => ({ key, symbol }));
  return system;
}

function termNames(variable) {
  return variable.terms.map((term) => term.name);
}

module.exports = {
  defineVariable,
  defineSystem,
  termNames,
};

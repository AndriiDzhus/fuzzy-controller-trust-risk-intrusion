/**
 * Controller registry used by the API (server.js) and by the static
 * GitHub Pages build (window.fuzzyControllers).
 *
 *   trust      Mamdani, trapezoid / triangle MFs, exact centroid
 *   security   Sugeno 0-order, triangle MFs, product t-norm, Σ w̄·c
 *   intrusion  Mamdani, Gaussian MFs, discrete centroid
 *
 * Every controller module exposes the same interface:
 *   system, variables, ranges, calculate(inputs), membershipFunctions()
 */
const trustController = require("./trustController");
const securityController = require("./securityController");
const intrusionController = require("./intrusionController");

// A plain decimal number: "0.25", "0,25", ".5", "1e-3". Hex, binary, empty
// strings, Infinity etc. are rejected.
const DECIMAL_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

/**
 * Converts one raw input to a number. Accepts finite numbers and decimal
 * strings with a dot or a comma; everything else (null, booleans, arrays,
 * objects, "", "0x10") gives null.
 */
function toNumber(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw !== "string") return null;
  const text = raw.trim();
  if (!DECIMAL_PATTERN.test(text)) return null;
  const value = Number(text.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/**
 * Parses and validates the inputs of one controller.
 * @param {object} inputs raw request body
 * @param {Object.<string, {min: number, max: number}>} ranges input domains
 * @returns {{values: Object.<string, number>|null, errors: Object.<string, string>|null}}
 *   values holds only the controller's own keys, as numbers
 */
function parseInputs(inputs, ranges) {
  const values = {};
  const errors = {};
  const source = inputs && typeof inputs === "object" ? inputs : {};
  Object.entries(ranges).forEach(([key, { min, max }]) => {
    const value = toNumber(source[key]);
    if (value === null) errors[key] = "must be a number";
    else if (value < min || value > max) errors[key] = `must be within [${min}, ${max}]`;
    else values[key] = value;
  });
  return Object.keys(errors).length ? { values: null, errors } : { values, errors: null };
}

function register(controller) {
  return {
    ranges: controller.ranges,
    parseInputs: (inputs) => parseInputs(inputs, controller.ranges),
    validate: (inputs) => parseInputs(inputs, controller.ranges).errors === null,
    calculate: controller.calculate,
    membershipFunctions: controller.membershipFunctions,
  };
}

const controllers = {
  trust: register(trustController),
  security: register(securityController),
  intrusion: register(intrusionController),
};

module.exports = {
  controllers,
  trustController,
  securityController,
  intrusionController,
  toNumber,
  parseInputs,
};

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
 * The registry adds input parsing and the response surface (surface.js).
 * Security and Intrusion also have a "trained" variant (see variants below).
 */
const trustController = require("./trustController");
const securityController = require("./securityController");
const intrusionController = require("./intrusionController");
const { computeSurface } = require("./surface");

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
    /**
     * Response surface over two inputs; the third input stays at its value
     * in `inputs`. Returns {errors} when the request is invalid.
     */
    surface: ({ xKey, yKey, inputs, points } = {}) => {
      const parsed = parseInputs(inputs, controller.ranges);
      if (parsed.errors) return { errors: parsed.errors };
      const keys = Object.keys(controller.ranges);
      if (!keys.includes(xKey) || !keys.includes(yKey) || xKey === yKey) {
        return { errors: { axes: `x and y must be two different inputs of ${keys.join(", ")}` } };
      }
      return { surface: computeSurface(controller, { xKey, yKey, inputs: parsed.values, points }) };
    },
  };
}

/**
 * A controller with its model variants:
 *   base     the expert model of the assignment (always present)
 *   trained  the model after ANFIS (security) or genetic (intrusion)
 *            training; null until the training has been run
 * The object itself behaves as the base variant, so existing callers keep
 * working; `variant(name)` returns the requested one or null.
 */
function registerWithVariants(module, controllerName) {
  const base = register(module.variants ? module.variants.base : module);
  const trained = module.variants?.trained ? register(module.variants.trained) : null;
  const variants = { base, trained };
  // Models built from parameters sent by the client (a training result that
  // the page applied). A small cache avoids rebuilding on every slider move.
  const customCache = new Map();
  const withParams = (params) => {
    if (!module.buildModel) return null;
    const key = JSON.stringify(params);
    if (customCache.has(key)) return customCache.get(key);
    const { buildModelFromParams } = require("../training/session");
    const model = register(buildModelFromParams(controllerName, params, { variant: "custom" }));
    if (customCache.size >= 8) customCache.delete(customCache.keys().next().value);
    customCache.set(key, model);
    return model;
  };
  return {
    ...base,
    variants,
    variant: (name = "base") => (MODEL_VARIANTS.includes(name) ? variants[name] : null),
    withParams,
    trainable: Boolean(module.buildModel),
    availableVariants: () => MODEL_VARIANTS.filter((name) => variants[name]),
    trainingSummary: () => {
      const training = module.variants?.trained?.training;
      if (!training) return null;
      const { history, ...summary } = training;
      return summary;
    },
  };
}

const MODEL_VARIANTS = ["base", "trained"];

const controllers = {
  trust: registerWithVariants(trustController, "trust"),
  security: registerWithVariants(securityController, "security"),
  intrusion: registerWithVariants(intrusionController, "intrusion"),
};

module.exports = {
  controllers,
  trustController,
  securityController,
  intrusionController,
  toNumber,
  parseInputs,
  MODEL_VARIANTS,
};

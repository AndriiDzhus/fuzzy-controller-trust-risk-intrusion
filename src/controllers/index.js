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

/** Every input is a finite number inside its domain. */
function validateInputRanges(inputs, ranges) {
  return Object.entries(ranges).every(([key, range]) => {
    const value = Number(inputs[key]);
    return Number.isFinite(value) && value >= range.min && value <= range.max;
  });
}

function register(controller) {
  return {
    validate: (inputs) => validateInputRanges(inputs, controller.ranges),
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
  validateInputRanges,
};

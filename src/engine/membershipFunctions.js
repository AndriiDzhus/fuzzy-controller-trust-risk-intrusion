/**
 * Membership functions of the linguistic terms.
 *
 * Triangular and trapezoidal functions describe the Trust and Security
 * variables; Gaussian functions describe the Intrusion variables.
 */
const { Term } = require("fuzzyis");

/** Trapezoid with feet a, d and plateau [b, c]. */
function trapezoidalMF(x, a, b, c, d) {
  if (x < a || x > d) return 0;
  if (x >= b && x <= c) return 1;
  if (x >= a && x < b) return (x - a) / (b - a || 1);
  if (x > c && x <= d) return (d - x) / (d - c || 1);
  return 0;
}

/** Triangle with feet a, c and peak b; a = b or b = c gives a shoulder. */
function triangularMF(x, a, b, c) {
  if (x < a || x > c) return 0;
  if (a === b) return (c - x) / (c - a || 1);
  if (b === c) return (x - a) / (b - a || 1);
  if (x <= b) return (x - a) / (b - a || 1);
  return (c - x) / (c - b || 1);
}

/** Gaussian in the thesis notation exp(-(x - c)^2 / (2 sigma^2)). */
function gaussianMF(x, center, sigma) {
  return Math.exp(-Math.pow(x - center, 2) / (2 * sigma * sigma));
}

// FuzzyIS divides by (maxLeft - left) and returns NaN for shoulder terms such
// as [0, 0, 15, 30] at x = 0. SafeTerm keeps the FuzzyIS Term API but uses the
// guarded functions above, without patching the library globally. The
// "gauss" ([sigma, center]) and "singleton" types use the FuzzyIS functions.
const SAFE_MF = { triangle: triangularMF, trapeze: trapezoidalMF };

class SafeTerm extends Term {
  constructor(name, mfType, mfParams) {
    super(name, mfType, mfParams);
    if (SAFE_MF[mfType]) this.mf = SAFE_MF[mfType];
  }
}

module.exports = {
  trapezoidalMF,
  triangularMF,
  gaussianMF,
  SafeTerm,
};

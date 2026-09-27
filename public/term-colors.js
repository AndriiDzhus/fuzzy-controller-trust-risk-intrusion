(function (root) {
  /**
   * Semantic colors for linguistic terms.
   * Change values here to retheme graphs, membership swatches, formula chips, and the rule-base popup.
   *
   * none    — none, when veryLow is also present (gray)
   * absent  — very low, or none when it is the lowest term on the scale
   * low     — small / low
   * medium  — medium
   * high    — high / large when a more severe term exists (veryHigh)
   * peak    — very high / very large, and also 3-term high
   *
   * The scale reads from favourable (green) to unfavourable (orange / red):
   * for risk-like variables (inputs, SR, IP) low is favourable. For variables
   * where a higher value is better (the trust index TI) pass
   * { higherIsBetter: true } and the scale is mirrored.
   */
  const TERM_PALETTE = {
    none: "#95a5a6",
    absent: "#7dcea0",
    low: "#27ae60",
    medium: "#3498db",
    high: "#e67e22",
    peak: "#e74c3c",
  };

  const TERM_KEY = {
    none: "none",
    veryLow: "absent",
    VeryLow: "absent",
    low: "low",
    Low: "low",
    medium: "medium",
    Medium: "medium",
    high: "high",
    High: "high",
    veryHigh: "peak",
    VeryHigh: "peak",
  };

  // Mirror of every term on the low-high scale (medium and none stay).
  const MIRROR = {
    veryLow: "veryHigh",
    VeryLow: "VeryHigh",
    low: "high",
    Low: "High",
    high: "low",
    High: "Low",
    veryHigh: "veryLow",
    VeryHigh: "VeryLow",
  };

  function mirrorTerm(term) {
    return MIRROR[term] || term;
  }

  function canonicalTermKey(term) {
    return TERM_KEY[term] || null;
  }

  function siblingKeys(terms) {
    return new Set((Array.isArray(terms) ? terms : []).map(canonicalTermKey).filter(Boolean));
  }

  /**
   * @param {string} term
   * @param {string[]} siblingTerms all terms of the same variable
   * @param {{higherIsBetter?: boolean}} [options]
   */
  function resolveTermColor(term, siblingTerms, options = {}) {
    const mirrored = Boolean(options.higherIsBetter);
    const key = canonicalTermKey(mirrored ? mirrorTerm(term) : term);
    if (!key) return TERM_PALETTE.medium;
    const siblings = Array.isArray(siblingTerms) ? siblingTerms : [];
    const keys = siblingKeys(mirrored ? siblings.map(mirrorTerm) : siblings);
    if (key === "high" && !keys.has("peak")) return TERM_PALETTE.peak;
    if (key === "none" && !keys.has("absent")) return TERM_PALETTE.absent;
    return TERM_PALETTE[key];
  }

  function applyTermPaletteToDocument() {
    if (typeof document === "undefined" || !document.documentElement?.style?.setProperty) return;
    const root = document.documentElement.style;
    root.setProperty("--term-none", TERM_PALETTE.none);
    root.setProperty("--term-absent", TERM_PALETTE.absent);
    root.setProperty("--term-low", TERM_PALETTE.low);
    root.setProperty("--term-medium", TERM_PALETTE.medium);
    root.setProperty("--term-high", TERM_PALETTE.high);
    root.setProperty("--term-peak", TERM_PALETTE.peak);
  }

  root.TERM_PALETTE = TERM_PALETTE;
  root.resolveTermColor = resolveTermColor;
  root.applyTermPaletteToDocument = applyTermPaletteToDocument;

  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", applyTermPaletteToDocument);
    } else {
      applyTermPaletteToDocument();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);

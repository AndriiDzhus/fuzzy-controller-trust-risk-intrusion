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

  function canonicalTermKey(term) {
    return TERM_KEY[term] || null;
  }

  function siblingKeys(terms) {
    return new Set((Array.isArray(terms) ? terms : []).map(canonicalTermKey).filter(Boolean));
  }

  function resolveTermColor(term, siblingTerms) {
    const key = canonicalTermKey(term);
    if (!key) return TERM_PALETTE.medium;
    const keys = siblingKeys(siblingTerms);
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

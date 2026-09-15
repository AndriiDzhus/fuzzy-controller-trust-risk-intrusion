const fs = require("fs");
const path = require("path");
const vm = require("vm");
const katex = require("katex");

function loadControllerDocs() {
  const code = fs.readFileSync(path.join(__dirname, "../public/controller-docs.js"), "utf8");
  const context = { window: {}, document: { getElementById: () => null, createElement: () => ({}) } };
  vm.createContext(context);
  vm.runInContext(code, context);
  return context.window.controllerDocs;
}

describe("controller docs content", () => {
  const docs = loadControllerDocs();

  test("trust output formulas use T, not P", () => {
    expect(docs.trust.output.symbol).toBe("T");
    const asText = JSON.stringify(docs.trust.output);
    expect(asText).not.toMatch(/\bP\b/);
    expect(asText).toContain("T");
  });

  test("rule tables match assignment sizes", () => {
    expect(docs.trust.rules.rows).toHaveLength(27);
    expect(docs.security.rules.rows).toHaveLength(6);
    expect(docs.intrusion.rules.rows).toHaveLength(12);
  });

  test("KaTeX renders piecewise membership cases", () => {
    const html = katex.renderToString(
      "\\mu_{\\mathrm{L}}(E) = \\begin{cases} 1 & 0 \\le E \\le 30 \\\\ \\dfrac{50-E}{20} & 30 < E < 50 \\\\ 0 & E \\ge 50 \\end{cases}",
      { displayMode: true, throwOnError: true }
    );
    expect(html).toContain("katex");
    expect(html).toContain("μ");
  });

  test("trust first and last rules match the assignment table", () => {
    expect(docs.trust.rules.rows[0]).toEqual(["low", "low", "low", "veryHigh"]);
    expect(docs.trust.rules.rows[26]).toEqual(["high", "high", "high", "veryLow"]);
  });
});

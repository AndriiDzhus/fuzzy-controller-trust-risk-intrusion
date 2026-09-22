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

  test("trust output formulas use TI, not P", () => {
    expect(docs.trust.output.symbol).toBe("TI");
    const asText = JSON.stringify(docs.trust.output);
    expect(asText).not.toMatch(/\bP\b/);
    expect(asText).toContain("TI");
  });

  test("trust inputs use NSL-KDD symbols and domains", () => {
    expect(docs.trust.inputs.map((item) => item.symbol)).toEqual(["ER", "CC", "BS"]);
    expect(docs.trust.inputs[0].domain).toEqual([0, 1]);
    expect(docs.trust.inputs[1].domain).toEqual([0, 200]);
    expect(docs.trust.inputs[2].domain).toEqual([0, 12]);
    expect(docs.trust.inputs[0].unitKey).toBe("index.docs.units.errors");
    expect(docs.security.inputs[0].unitKey).toBe("security.docs.units.energy");
    expect(docs.intrusion.inputs[0].unitKey).toBe("intrusion.docs.units.packets");
  });

  test("rule tables match assignment sizes", () => {
    expect(docs.trust.rules.rows).toHaveLength(27);
    expect(docs.security.rules.rows).toHaveLength(6);
    expect(docs.intrusion.rules.rows).toHaveLength(12);
  });

  test("KaTeX renders piecewise membership cases with assignment punctuation", () => {
    const html = katex.renderToString(
      "\\mu_{\\mathrm{L}}(ER) = \\begin{cases} 1, & ER \\le 0.05, \\\\ \\dfrac{0.15-ER}{0.15-0.05}, & 0.05 < ER \\le 0.15, \\\\ 0, & ER > 0.15. \\end{cases}",
      { displayMode: true, throwOnError: true }
    );
    expect(html).toContain("katex");
    expect(html).toContain("μ");
  });

  test("trust first, middle and last rules match the assignment table", () => {
    expect(docs.trust.rules.rows[0]).toEqual(["low", "low", "low", "veryHigh"]);
    expect(docs.trust.rules.rows[13]).toEqual(["medium", "medium", "medium", "low"]);
    expect(docs.trust.rules.rows[26]).toEqual(["high", "high", "high", "veryLow"]);
  });

  test("docs renderer adds commas between piecewise cases and a period on the last row", () => {
    const code = fs.readFileSync(path.join(__dirname, "../public/controller-docs.js"), "utf8");
    expect(code).toContain('const end = index === all.length - 1 ? "." : ",";');
    expect(code).toContain("${latexExpr(expr)}, & ${latexCond(cond)}${end}");
    expect(code).toContain("${symbol} \\\\ne ${term.singleton}.");
  });

  test("trust piecewise conditions match the assignment inequalities", () => {
    const [er, cc, bs] = docs.trust.inputs;
    expect(er.terms[0].pieces.at(-1)).toEqual(["0", "ER > 0.15"]);
    expect(er.terms[1].pieces.at(-1)).toEqual(["0", "ER ≥ 0.6"]);
    expect(er.terms[2].pieces.at(-1)).toEqual(["1", "ER > 0.6"]);
    expect(cc.terms[1].pieces.at(-1)).toEqual(["0", "CC ≥ 120"]);
    expect(cc.terms[2].pieces.at(-1)).toEqual(["1", "CC > 120"]);
    expect(bs.terms[2].pieces.at(-1)).toEqual(["1", "BS > 11"]);
    expect(docs.trust.output.terms[4].pieces.at(-1)).toEqual(["1", "TI > 100"]);
    expect(docs.intrusion.inputs.every((item) => !item.noteKey)).toBe(true);
  });
});

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadTermColors() {
  const context = {
    window: {},
    document: {
      readyState: "complete",
      documentElement: { style: { setProperty() {} } },
      addEventListener: () => {},
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../public/term-colors.js"), "utf8"), context);
  return context.window;
}

describe("term color palette", () => {
  const { TERM_PALETTE, resolveTermColor } = loadTermColors();
  const three = ["low", "medium", "high"];
  const five = ["veryLow", "low", "medium", "high", "veryHigh"];
  const six = ["none", "veryLow", "low", "medium", "high", "veryHigh"];

  test("exposes named palette constants", () => {
    expect(TERM_PALETTE).toEqual({
      none: "#95a5a6",
      absent: "#7dcea0",
      low: "#27ae60",
      medium: "#3498db",
      high: "#e67e22",
      peak: "#e74c3c",
    });
  });

  test("three-term graphs use green / blue / red", () => {
    expect(resolveTermColor("low", three)).toBe(TERM_PALETTE.low);
    expect(resolveTermColor("medium", three)).toBe(TERM_PALETTE.medium);
    expect(resolveTermColor("high", three)).toBe(TERM_PALETTE.peak);
  });

  test("five- and six-term outputs add light green, orange, and red peak", () => {
    expect(resolveTermColor("none", six)).toBe(TERM_PALETTE.none);
    expect(resolveTermColor("veryLow", five)).toBe(TERM_PALETTE.absent);
    expect(resolveTermColor("veryLow", six)).toBe(TERM_PALETTE.absent);
    expect(resolveTermColor("low", five)).toBe(TERM_PALETTE.low);
    expect(resolveTermColor("medium", five)).toBe(TERM_PALETTE.medium);
    expect(resolveTermColor("high", five)).toBe(TERM_PALETTE.high);
    expect(resolveTermColor("veryHigh", five)).toBe(TERM_PALETTE.peak);
    expect(resolveTermColor("High", ["Low", "Medium", "High", "VeryHigh"])).toBe(TERM_PALETTE.high);
    expect(resolveTermColor("VeryHigh", ["Low", "Medium", "High", "VeryHigh"])).toBe(TERM_PALETTE.peak);
  });

  test("none is gray only when veryLow is also on the scale", () => {
    expect(resolveTermColor("none", six)).toBe(TERM_PALETTE.none);
    expect(resolveTermColor("none", ["none", "low", "medium", "high"])).toBe(TERM_PALETTE.absent);
  });
});

describe("favourable / unfavourable direction", () => {
  const { TERM_PALETTE, resolveTermColor } = loadTermColors();
  const trustIndex = ["VeryLow", "Low", "Medium", "High", "VeryHigh"];
  const mirrored = (term) => resolveTermColor(term, trustIndex, { higherIsBetter: true });

  test("trust index: very high is light green, very low is red", () => {
    expect(mirrored("VeryHigh")).toBe(TERM_PALETTE.absent);
    expect(mirrored("High")).toBe(TERM_PALETTE.low);
    expect(mirrored("Medium")).toBe(TERM_PALETTE.medium);
    expect(mirrored("Low")).toBe(TERM_PALETTE.high);
    expect(mirrored("VeryLow")).toBe(TERM_PALETTE.peak);
  });

  test("risk-like scales keep low = green, high = red", () => {
    const risk = ["none", "veryLow", "low", "medium", "high", "veryHigh"];
    expect(resolveTermColor("veryLow", risk)).toBe(TERM_PALETTE.absent);
    expect(resolveTermColor("veryHigh", risk)).toBe(TERM_PALETTE.peak);
    const intrusion = ["none", "low", "medium", "high"];
    expect(resolveTermColor("none", intrusion)).toBe(TERM_PALETTE.absent);
    expect(resolveTermColor("high", intrusion)).toBe(TERM_PALETTE.peak);
  });

  test("the trust page and the trust formula modal mark TI as higher-is-better", () => {
    const trustPage = fs.readFileSync(path.join(__dirname, "../public/trust.js"), "utf8");
    expect(trustPage).toMatch(/higherIsBetter: \["trustIndex"\]/);
    const docs = fs.readFileSync(path.join(__dirname, "../public/controller-docs.js"), "utf8");
    expect(docs).toMatch(/symbol: "TI",[\s\S]{0,200}higherIsBetter: true/);
  });
});

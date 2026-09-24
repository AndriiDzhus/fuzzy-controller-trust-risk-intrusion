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

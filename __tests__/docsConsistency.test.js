/**
 * The formula and rule-base modals (public/controller-docs.js) hold their own
 * copy of the models for display. These tests evaluate that copy numerically
 * and compare it with the controller models, so the two cannot drift apart.
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { gridPoints } = require("../src/engine");
const {
  trustController,
  securityController,
  intrusionController,
} = require("../src/controllers");

function loadControllerDocs() {
  const context = {
    window: {},
    document: {
      readyState: "complete",
      documentElement: { style: { setProperty() {} } },
      getElementById: () => null,
      createElement: () => ({}),
      addEventListener: () => {},
    },
  };
  vm.createContext(context);
  ["term-colors.js", "controller-docs.js"].forEach((file) => {
    vm.runInContext(fs.readFileSync(path.join(__dirname, "../public", file), "utf8"), context);
  });
  return context.window.controllerDocs;
}

const docs = loadControllerDocs();

const models = {
  trust: {
    controller: trustController,
    inputs: ["ER", "CC", "BS"],
    output: "TI",
    // Docs use camelCase term names; the Trust model uses PascalCase.
    term: (name) => name.charAt(0).toUpperCase() + name.slice(1),
  },
  security: { controller: securityController, inputs: ["EC", "TP", "Lat"], output: "SR", term: (n) => n },
  intrusion: { controller: intrusionController, inputs: ["NP", "Rate", "We"], output: "IP", term: (n) => n },
};

// "(0.15 − ER) / (0.15 − 0.05)" -> function of x
function pieceExpression(expr, symbol) {
  const js = expr.replace(/−/g, "-").split(symbol).join("(x)");
  return new Function("x", `return ${js};`);
}

// "0.05 < ER ≤ 0.15", "ER ≤ 0.05", "50 < TI" -> predicate of x
function pieceCondition(condition, symbol) {
  const ops = {
    "<": (a, b) => a < b,
    "≤": (a, b) => a <= b,
    ">": (a, b) => a > b,
    "≥": (a, b) => a >= b,
  };
  const [left, right] = condition.split(symbol).map((part) => part.trim());
  const checks = [];
  if (left) {
    const [, num, op] = left.match(/^([-\d.]+)\s*([<≤>≥])$/);
    checks.push((x) => ops[op](Number(num), x));
  }
  if (right) {
    const [, op, num] = right.match(/^([<≤>≥])\s*([-\d.]+)$/);
    checks.push((x) => ops[op](x, Number(num)));
  }
  return (x) => checks.every((check) => check(x));
}

function docsPiecewiseValue(docTerm, symbol, x) {
  const piece = docTerm.pieces.find(([, condition]) => pieceCondition(condition, symbol)(x));
  if (!piece) throw new Error(`${symbol} ${docTerm.term}: no piece covers x = ${x}`);
  return pieceExpression(piece[0], symbol)(x);
}

function checkVariable(name, docVariable, modelVariable, mapTerm) {
  expect(docVariable.symbol).toBe(modelVariable.name);
  if (docVariable.domain) expect(docVariable.domain).toEqual(modelVariable.range);

  expect(docVariable.terms.map((t) => mapTerm(t.term))).toEqual(
    modelVariable.terms.map((t) => t.name)
  );

  const [start, end] = modelVariable.range;
  const xs = gridPoints([start, end], (end - start) / 400);
  docVariable.terms.forEach((docTerm) => {
    const modelTerm = modelVariable.terms.find((t) => t.name === mapTerm(docTerm.term));
    if (docTerm.pieces) {
      xs.forEach((x) => {
        expect(docsPiecewiseValue(docTerm, docVariable.symbol, x)).toBeCloseTo(modelTerm.valueAt(x), 9);
      });
    } else if (docTerm.gaussian) {
      const [sigma, center] = modelTerm.mfParams;
      expect(docTerm.gaussian.center).toBeCloseTo(center, 12);
      expect(docTerm.gaussian.denom).toBeCloseTo(2 * sigma * sigma, 9);
    } else if (docTerm.singleton !== undefined) {
      expect(modelTerm.mfType).toBe("singleton");
      expect(docTerm.singleton).toBe(modelTerm.mfParams[0]);
    } else {
      throw new Error(`${name}: unknown doc term shape for ${docTerm.term}`);
    }
  });
}

describe.each(Object.keys(models))("%s modal matches the controller model", (name) => {
  const { controller, inputs, output, term } = models[name];

  test("input membership functions", () => {
    inputs.forEach((symbol, i) => {
      checkVariable(name, docs[name].inputs[i], controller.variables[symbol], term);
    });
  });

  test("output membership functions", () => {
    checkVariable(name, docs[name].output, controller.variables[output], term);
  });

  test("rule base", () => {
    const fromModel = controller.system.rules.map((rule) => [
      ...rule.conditions,
      rule.conclusions[0],
    ]);
    const fromDocs = docs[name].rules.rows.map((row) => row.map(term));
    expect(fromDocs).toEqual(fromModel);
  });
});

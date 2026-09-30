/**
 * HTTP server: serves the static UI from public/ and the controller API.
 *
 *   POST /api/controllers/:controller/calculate
 *   GET  /api/controllers/:controller/membership-functions
 *   POST /api/controllers/:controller/surface   response surface over two inputs
 *
 *   GET  /api/controllers/:controller/models    available model variants
 *
 * where :controller is trust | security | intrusion. The first three accept
 * ?model=base|trained (default base): "trained" is the Security controller
 * after ANFIS training or the Intrusion controller after the genetic
 * optimisation; 404 when that model has not been trained yet.
 */
const express = require("express");
const path = require("path");
const pkg = require("./package.json");
const { controllers } = require("./src/controllers");

const app = express();
const PORT = process.env.PORT || 3002;

app.use("/vendor/katex", express.static(path.join(__dirname, "node_modules/katex/dist")));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function findController(req, res) {
  const entry = controllers[req.params.controller];
  if (!entry) {
    res.status(404).json({ error: "Controller not found" });
    return null;
  }
  const model = typeof req.query.model === "string" && req.query.model ? req.query.model : "base";
  const controller = entry.variant(model);
  if (!controller) {
    res.status(404).json({ error: `Model "${model}" is not available for this controller` });
    return null;
  }
  return controller;
}

function sendServerError(res, error) {
  console.error(error);
  res.status(500).json({ error: `Internal server error: ${error.message}` });
}

app.post("/api/controllers/:controller/calculate", (req, res) => {
  try {
    const controller = findController(req, res);
    if (!controller) return;

    const { values: inputs, errors } = controller.parseInputs(req.body);
    if (errors) {
      res.status(400).json({
        error: "Invalid input values. All values must be within the allowed range.",
        fields: errors,
      });
      return;
    }

    const result = controller.calculate(inputs);
    res.json({
      value: result.value == null ? null : parseFloat(result.value.toFixed(2)),
      dominantTerm: result.dominantTerm ?? null,
      noRuleFired: Boolean(result.noRuleFired),
      membershipData: result.membershipData,
      ruleOutputs: result.ruleOutputs,
      ruleEvaluations: result.ruleEvaluations || [],
      aggregatedOutput: result.aggregatedOutput || null,
      normalizedOutputs: result.normalizedOutputs || null,
      weightedConsequents: result.weightedConsequents || null,
      inputs,
    });
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get("/api/controllers/:controller/membership-functions", (req, res) => {
  try {
    const controller = findController(req, res);
    if (!controller) return;
    res.json(controller.membershipFunctions());
  } catch (error) {
    sendServerError(res, error);
  }
});

app.post("/api/controllers/:controller/surface", (req, res) => {
  try {
    const controller = findController(req, res);
    if (!controller) return;
    const { xKey, yKey, inputs, points } = req.body || {};
    const { surface, errors } = controller.surface({ xKey, yKey, inputs, points });
    if (errors) {
      res.status(400).json({ error: "Invalid surface request.", fields: errors });
      return;
    }
    res.json(surface);
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get("/api/controllers/:controller/models", (req, res) => {
  const entry = controllers[req.params.controller];
  if (!entry) {
    res.status(404).json({ error: "Controller not found" });
    return;
  }
  res.json({ available: entry.availableVariants(), training: entry.trainingSummary() });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(pkg.description);
    console.log(`${pkg.name} v${pkg.version}`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Controllers: ${Object.keys(controllers).join(", ")}`);
  });
}

module.exports = app;

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
 * optimisation; 404 when that model has not been trained yet. A POST body
 * may instead carry `params` (a training result applied on the page): the
 * model is then built from them (membership-functions accepts POST for that).
 *
 * Training (Security: ANFIS, Intrusion: genetic algorithm):
 *   GET  /api/controllers/:controller/dataset?rows=N|all   default dataset (.xlsx); N ≥ size → all
 *   GET  /api/controllers/:controller/dataset/info        {total, columns} of the default dataset
 *   POST /api/training/:controller/jobs?name=<file>&generations=…  raw file body (.xlsx / .csv)
 *   GET  /api/training/jobs/:id                                    snapshot
 *   GET  /api/training/jobs/:id/events                             server-sent events
 *   POST /api/training/jobs/:id/stop
 */
const express = require("express");
const path = require("path");
const pkg = require("./package.json");
const fs = require("fs");
const { controllers } = require("./src/controllers");
const xlsx = require("./public/xlsx-lite");
const datasets = require("./src/training/datasets");
const jobs = require("./src/training/jobs");

const app = express();
const PORT = process.env.PORT || 3002;

app.use("/vendor/katex", express.static(path.join(__dirname, "node_modules/katex/dist")));
app.use(express.static(path.join(__dirname, "public")));
app.use("/data", express.static(path.join(__dirname, "data")));
app.use(express.json({ limit: "25mb" }));

function findController(req, res) {
  const entry = controllers[req.params.controller];
  if (!entry) {
    res.status(404).json({ error: "Controller not found" });
    return null;
  }
  const params = req.body && typeof req.body === "object" ? req.body.params : null;
  if (params) {
    if (!entry.trainable) {
      res.status(400).json({ error: "This controller does not accept custom parameters" });
      return null;
    }
    try {
      return entry.withParams(params);
    } catch (error) {
      res.status(400).json({ error: error.message });
      return null;
    }
  }
  const model = typeof req.query.model === "string" && req.query.model ? req.query.model : "base";
  const controller = entry.variant(model);
  if (!controller) {
    res.status(404).json({ error: `Model "${model}" is not available for this controller` });
    return null;
  }
  return controller;
}

function sendMembershipFunctions(req, res) {
  try {
    const controller = findController(req, res);
    if (!controller) return;
    res.json(controller.membershipFunctions());
  } catch (error) {
    sendServerError(res, error);
  }
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

app.get("/api/controllers/:controller/membership-functions", sendMembershipFunctions);
app.post("/api/controllers/:controller/membership-functions", sendMembershipFunctions);

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

// ---------------------------------------------------------------------------
// Training
// ---------------------------------------------------------------------------

function readDatasetFiles(controller) {
  const files = datasets.DEFAULT_DATASET_FILES[controller];
  if (!files) return null;
  const csv = {};
  Object.entries(files).forEach(([key, file]) => {
    csv[key] = fs.readFileSync(path.join(__dirname, file), "utf8");
  });
  return csv;
}

// Size and columns of the default dataset (for the row picker of the page).
app.get("/api/controllers/:controller/dataset/info", (req, res) => {
  try {
    const csv = readDatasetFiles(req.params.controller);
    if (!csv) {
      res.status(404).json({ error: "No dataset for this controller" });
      return;
    }
    const table = datasets.defaultDataset(req.params.controller, csv, null);
    res.json({ controller: req.params.controller, total: table.total, columns: table.header });
  } catch (error) {
    sendServerError(res, error);
  }
});

app.get("/api/controllers/:controller/dataset", async (req, res) => {
  try {
    const csv = readDatasetFiles(req.params.controller);
    if (!csv) {
      res.status(404).json({ error: "No dataset for this controller" });
      return;
    }
    const rowsParam = String(req.query.rows || "all");
    const limit = rowsParam === "all" ? null : Number(rowsParam);
    if (limit !== null && !(Number.isInteger(limit) && limit >= 10 && limit <= 100000)) {
      res.status(400).json({ error: "rows must be an integer ≥ 10 or \"all\"" });
      return;
    }
    const table = datasets.defaultDataset(req.params.controller, csv, limit);
    const bytes = await xlsx.write([{ name: "Dataset", rows: [table.header, ...table.rows] }]);
    // table.limit is null when the request covered the whole dataset.
    const name = `${req.params.controller}-dataset-${table.limit === null ? "all" : table.limit}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${name}"`);
    res.setHeader("X-Row-Count", String(table.rows.length));
    res.setHeader("X-Row-Total", String(table.total));
    res.send(Buffer.from(bytes));
  } catch (error) {
    sendServerError(res, error);
  }
});

app.post(
  "/api/training/:controller/jobs",
  express.raw({ type: () => true, limit: "30mb" }),
  async (req, res) => {
    try {
      const name = String(req.query.name || "dataset.xlsx");
      const bytes = Buffer.isBuffer(req.body) ? new Uint8Array(req.body) : new Uint8Array(0);
      if (!bytes.length) {
        res.status(400).json({ error: "emptyFile" });
        return;
      }
      const { name: _name, ...options } = req.query;
      const started = await jobs.startJob({ controller: req.params.controller, file: { name, bytes }, options, root: __dirname });
      if (!started.ok) {
        res.status(started.status).json({ error: started.error, details: started.details || null });
        return;
      }
      res.status(201).json(started.job);
    } catch (error) {
      sendServerError(res, error);
    }
  }
);

app.get("/api/training/jobs/:id", (req, res) => {
  const job = jobs.getJob(req.params.id);
  if (!job) res.status(404).json({ error: "Job not found" });
  else res.json(job);
});

app.post("/api/training/jobs/:id/stop", (req, res) => {
  const job = jobs.stopJob(req.params.id);
  if (!job) res.status(404).json({ error: "Job not found" });
  else res.json(job);
});

app.get("/api/training/jobs/:id/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  const send = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    if (event === "end") res.end();
  };
  const unsubscribe = jobs.subscribe(req.params.id, send);
  if (!unsubscribe) {
    send("error", { message: "Job not found" });
    send("end", {});
    return;
  }
  req.on("close", unsubscribe);
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

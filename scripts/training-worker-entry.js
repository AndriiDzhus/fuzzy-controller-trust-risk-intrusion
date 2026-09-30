/**
 * Web Worker of the static build: trains a controller in the browser.
 * Bundled by scripts/build-pages.js into dist/training-worker.js.
 *
 * Messages in:  { type: "start", controller, file: {name, bytes}, options, coverage }
 *               { type: "stop" }
 * Messages out: { type: "started", dataset, options }
 *               { type: "progress", entry, step }
 *               { type: "done", result } | { type: "error", message, code, details }
 */
const datasets = require("../src/training/datasets");
const { runTraining, methodOf } = require("../src/training/session");

let stopRequested = false;

self.onmessage = async (event) => {
  const message = event.data || {};
  if (message.type === "stop") {
    stopRequested = true;
    return;
  }
  if (message.type !== "start") return;
  const { controller, file, options = {}, coverage = [] } = message;
  try {
    const method = methodOf(controller);
    const table = await datasets.tableFromFile({ name: file.name, bytes: new Uint8Array(file.bytes) });
    const prepared = datasets.prepareDataset(controller, table, { seed: Number(options.seed) || 42 });
    if (!prepared.ok) {
      self.postMessage({
        type: "error",
        code: prepared.error,
        message: prepared.error,
        details: { missing: prepared.missing, counts: prepared.counts, skipped: prepared.skipped, minTrain: datasets.MIN_TRAIN_ROWS },
      });
      return;
    }
    const cleanOptions = {};
    Object.entries(options).forEach(([key, value]) => {
      const number = Number(value);
      if (Number.isFinite(number)) cleanOptions[key] = number;
    });
    self.postMessage({
      type: "started",
      dataset: { name: file.name, sheet: table.sheet || null, counts: prepared.counts, total: prepared.total, skipped: prepared.skipped },
      options: { ...method.defaultOptions, ...cleanOptions },
    });
    const result = await runTraining({
      controller,
      bySplit: prepared.bySplit,
      options: cleanOptions,
      datasetName: file.name,
      coverage,
      onProgress: (entry, info) => self.postMessage({ type: "progress", entry, step: info.step }),
      shouldStop: () => stopRequested,
      // Let the stop message through between steps.
      yieldEach: () => new Promise((resolve) => setTimeout(resolve, 0)),
    });
    self.postMessage({ type: "done", result });
  } catch (error) {
    self.postMessage({ type: "error", message: error.message, code: "unreadableFile" });
  }
};

/**
 * Training jobs of the API: one worker thread per job, progress kept in
 * memory and streamed to subscribers (server-sent events in server.js).
 */
const path = require("path");
const fs = require("fs");
const { Worker } = require("worker_threads");
const { prepareDataset, tableFromFile, MIN_TRAIN_ROWS } = require("./datasets");
const { methodOf, securityCoverage } = require("./session");

const MAX_RUNNING = 2;
const KEEP_FINISHED_MS = 30 * 60 * 1000;

const jobs = new Map();
let counter = 0;

function securityCoverageRows(root) {
  const file = path.join(root, "data/security/security_6g.csv");
  if (!fs.existsSync(file)) return [];
  const { readCsv, cellNumber } = require("./utils");
  return readCsv(file).map((r) => [cellNumber(r.EC), cellNumber(r.TP), cellNumber(r.Lat)]);
}

function runningCount() {
  return [...jobs.values()].filter((job) => job.status === "running").length;
}

function publicJob(job) {
  return {
    id: job.id,
    controller: job.controller,
    status: job.status,
    dataset: job.dataset,
    options: job.options,
    steps: job.progress.length,
    lastEntry: job.progress[job.progress.length - 1] || null,
    result: job.status === "done" || job.status === "stopped" ? job.result : null,
    error: job.error || null,
    createdAt: job.createdAt,
  };
}

/**
 * Parses the uploaded file, prepares the dataset and starts the job.
 * @param {object} args {controller, file: {name, bytes}, options, root}
 * @returns {Promise<{ok: true, job} | {ok: false, status: number, error: string, details?}>}
 */
async function startJob({ controller, file, options = {}, root }) {
  let method;
  try {
    method = methodOf(controller);
  } catch (error) {
    return { ok: false, status: 404, error: error.message };
  }
  if (runningCount() >= MAX_RUNNING) return { ok: false, status: 429, error: "too many running jobs" };

  let table;
  try {
    table = await tableFromFile(file);
  } catch (error) {
    return { ok: false, status: 400, error: "unreadableFile", details: { message: error.message } };
  }
  const prepared = prepareDataset(controller, table, { seed: Number(options.seed) || 42 });
  if (!prepared.ok) {
    return {
      ok: false,
      status: 400,
      error: prepared.error,
      details: { missing: prepared.missing, counts: prepared.counts, skipped: prepared.skipped, minTrain: MIN_TRAIN_ROWS },
    };
  }

  const cleanOptions = {};
  Object.entries(options).forEach(([key, value]) => {
    const number = Number(value);
    if (Number.isFinite(number)) cleanOptions[key] = number;
  });
  const dataset = {
    name: file.name,
    sheet: table.sheet || null,
    counts: prepared.counts,
    total: prepared.total,
    skipped: prepared.skipped,
  };
  const id = `job_${Date.now().toString(36)}_${(counter += 1)}`;
  const job = {
    id,
    controller,
    status: "running",
    dataset,
    options: { ...method.defaultOptions, ...cleanOptions },
    progress: [],
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    listeners: new Set(),
    worker: null,
  };
  jobs.set(id, job);

  const bySplit = {};
  Object.entries(prepared.bySplit).forEach(([name, rows]) => {
    bySplit[name] = rows.map(({ raw, y, label, category }) => ({ raw, y, label, category }));
  });
  job.worker = new Worker(path.join(__dirname, "worker-node.js"), {
    workerData: {
      controller,
      bySplit,
      options: cleanOptions,
      datasetName: file.name,
      coverage: controller === "security" ? securityCoverage(securityCoverageRows(root)) : [],
    },
  });
  job.worker.on("message", (message) => {
    if (message.type === "progress") {
      job.progress.push(message.entry);
      emit(job, "progress", { entry: message.entry, step: message.step });
    } else if (message.type === "done") {
      job.result = message.result;
      job.status = message.result.training.stopReason === "stopped" ? "stopped" : "done";
      emit(job, "done", { result: job.result });
      finish(job);
    } else if (message.type === "error") {
      job.error = message.message;
      job.status = "error";
      emit(job, "error", { message: message.message });
      finish(job);
    }
  });
  job.worker.on("error", (error) => {
    job.error = error.message;
    job.status = "error";
    emit(job, "error", { message: error.message });
    finish(job);
  });
  return { ok: true, job: publicJob(job) };
}

function emit(job, event, data) {
  job.listeners.forEach((send) => send(event, data));
}

function finish(job) {
  if (job.worker) job.worker.terminate().catch(() => {});
  job.worker = null;
  job.listeners.forEach((send) => send("end", {}));
  job.listeners.clear();
  setTimeout(() => jobs.delete(job.id), KEEP_FINISHED_MS).unref();
}

function getJob(id) {
  const job = jobs.get(id);
  return job ? publicJob(job) : null;
}

/** Subscribes; `send(event, data)` receives the history first, then live events. */
function subscribe(id, send) {
  const job = jobs.get(id);
  if (!job) return null;
  send("snapshot", publicJob(job));
  job.progress.forEach((entry, i) => send("progress", { entry, step: i + 1 }));
  if (job.status === "done" || job.status === "stopped") {
    send("done", { result: job.result });
    send("end", {});
    return () => {};
  }
  if (job.status === "error") {
    send("error", { message: job.error });
    send("end", {});
    return () => {};
  }
  job.listeners.add(send);
  return () => job.listeners.delete(send);
}

function stopJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.worker) job.worker.postMessage({ type: "stop" });
  return publicJob(job);
}

module.exports = { startJob, getJob, subscribe, stopJob };

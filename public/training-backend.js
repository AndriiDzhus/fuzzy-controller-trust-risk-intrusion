/**
 * Where the training of a controller runs, behind one interface used by
 * training-panel.js:
 *
 *   remote  the Express server: dataset from the API, training as a job
 *           in a worker thread, progress by server-sent events
 *   local   the static build (GitHub Pages): dataset built in the page from
 *           data/*.csv, training in a Web Worker (training-worker.js)
 *
 * The mode follows window.fuzzyControllers, exactly like the calculations.
 *
 *   trainingBackend.downloadDataset(controller, rows)  -> {blob, filename, rows}
 *   trainingBackend.startTraining({controller, file, options, onProgress, onDone, onError}) -> {stop}
 */
(function (root) {
  const isLocal = () => Boolean(root.fuzzyControllers && root.fuzzyTraining);

  const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  async function readFileBytes(file) {
    return new Uint8Array(await file.arrayBuffer());
  }

  // -------------------------------------------------------------------------
  // Remote (API)
  // -------------------------------------------------------------------------

  const remote = {
    mode: "remote",

    async downloadDataset(controller, rows) {
      const response = await fetch(`/api/controllers/${controller}/dataset?rows=${rows === null ? "all" : rows}`);
      if (!response.ok) throw new Error(`dataset: HTTP ${response.status}`);
      const blob = await response.blob();
      const count = Number(response.headers.get("X-Row-Count")) || null;
      return { blob, filename: `${controller}-dataset-${rows === null ? "all" : rows}.xlsx`, rows: count };
    },

    async startTraining({ controller, file, options, onProgress, onDone, onError }) {
      const query = new URLSearchParams({ name: file.name });
      Object.entries(options || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
      });
      const bytes = await readFileBytes(file);
      const response = await fetch(`/api/training/${controller}/jobs?${query}`, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || `HTTP ${response.status}`);
        error.code = body.error;
        error.details = body.details || null;
        throw error;
      }
      const job = body;
      const events = new EventSource(`/api/training/jobs/${job.id}/events`);
      let finished = false;
      events.addEventListener("progress", (event) => {
        const { entry, step } = JSON.parse(event.data);
        onProgress(entry, { step, dataset: job.dataset, options: job.options });
      });
      events.addEventListener("done", (event) => {
        finished = true;
        const { result } = JSON.parse(event.data);
        onDone(result, { dataset: job.dataset });
      });
      events.addEventListener("error", (event) => {
        if (finished) return;
        finished = true;
        let message = "connection lost";
        try {
          message = JSON.parse(event.data).message || message;
        } catch {
          // A transport error has no data.
        }
        onError(new Error(message));
        events.close();
      });
      events.addEventListener("end", () => events.close());
      return {
        dataset: job.dataset,
        options: job.options,
        stop: () => fetch(`/api/training/jobs/${job.id}/stop`, { method: "POST" }).catch(() => {}),
      };
    },
  };

  // -------------------------------------------------------------------------
  // Local (static build)
  // -------------------------------------------------------------------------

  async function fetchText(path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.text();
  }

  const local = {
    mode: "local",

    async downloadDataset(controller, rows) {
      const { datasets } = root.fuzzyTraining;
      const files = datasets.DEFAULT_DATASET_FILES[controller];
      const csv = {};
      await Promise.all(
        Object.entries(files).map(async ([key, file]) => {
          csv[key] = await fetchText(file);
        })
      );
      const table = datasets.defaultDataset(controller, csv, rows);
      const bytes = await root.xlsxLite.write([{ name: "Dataset", rows: [table.header, ...table.rows] }]);
      return {
        blob: new Blob([bytes], { type: XLSX_TYPE }),
        filename: `${controller}-dataset-${rows === null ? "all" : rows}.xlsx`,
        rows: table.rows.length,
      };
    },

    async startTraining({ controller, file, options, onProgress, onDone, onError }) {
      const bytes = await readFileBytes(file);
      let coverage = [];
      if (controller === "security") {
        try {
          const { parseCsv, cellNumber } = root.fuzzyTraining.utils;
          const rows = parseCsv(await fetchText("data/security/security_6g.csv")).map((r) => [
            cellNumber(r.EC), cellNumber(r.TP), cellNumber(r.Lat),
          ]);
          coverage = root.fuzzyTraining.session.securityCoverage(rows);
        } catch {
          coverage = root.fuzzyTraining.session.securityCoverage([]);
        }
      }
      const worker = new Worker("training-worker.js");
      return new Promise((resolve, reject) => {
        let started = false;
        const handle = { dataset: null, options: null, stop: () => worker.postMessage({ type: "stop" }) };
        worker.onmessage = (event) => {
          const message = event.data || {};
          if (message.type === "started") {
            started = true;
            handle.dataset = message.dataset;
            handle.options = message.options;
            resolve(handle);
          } else if (message.type === "progress") {
            onProgress(message.entry, { step: message.step, dataset: handle.dataset, options: handle.options });
          } else if (message.type === "done") {
            onDone(message.result, { dataset: handle.dataset });
            worker.terminate();
          } else if (message.type === "error") {
            const error = new Error(message.message);
            error.code = message.code || null;
            error.details = message.details || null;
            if (started) onError(error);
            else reject(error);
            worker.terminate();
          }
        };
        worker.onerror = (event) => {
          const error = new Error(event.message || "worker error");
          if (started) onError(error);
          else reject(error);
        };
        worker.postMessage({ type: "start", controller, file: { name: file.name, bytes }, options, coverage }, [bytes.buffer]);
      });
    },
  };

  root.trainingBackend = {
    get mode() {
      return isLocal() ? "local" : "remote";
    },
    downloadDataset: (...args) => (isLocal() ? local : remote).downloadDataset(...args),
    startTraining: (...args) => (isLocal() ? local : remote).startTraining(...args),
  };
})(typeof window !== "undefined" ? window : globalThis);

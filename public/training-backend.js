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
 *   trainingBackend.datasetInfo(controller)            -> {total, columns}
 *   trainingBackend.downloadDataset(controller, rows)  -> {blob, filename, rows, total}
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

    async datasetInfo(controller) {
      const response = await fetch(`/api/controllers/${controller}/dataset/info`);
      if (!response.ok) throw new Error(`dataset info: HTTP ${response.status}`);
      return response.json();
    },

    async downloadDataset(controller, rows) {
      const response = await fetch(`/api/controllers/${controller}/dataset?rows=${rows === null ? "all" : rows}`);
      if (!response.ok) throw new Error(`dataset: HTTP ${response.status}`);
      const blob = await response.blob();
      const count = Number(response.headers.get("X-Row-Count")) || null;
      const total = Number(response.headers.get("X-Row-Total")) || null;
      // Asking for at least the whole dataset gives all rows.
      const all = rows === null || (total !== null && rows >= total);
      return { blob, filename: `${controller}-dataset-${all ? "all" : rows}.xlsx`, rows: count, total };
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

    async defaultTable(controller, rows) {
      const { datasets } = root.fuzzyTraining;
      const files = datasets.DEFAULT_DATASET_FILES[controller];
      const csv = {};
      await Promise.all(
        Object.entries(files).map(async ([key, file]) => {
          csv[key] = await fetchText(file);
        })
      );
      return datasets.defaultDataset(controller, csv, rows);
    },

    async datasetInfo(controller) {
      const table = await this.defaultTable(controller, null);
      return { controller, total: table.total, columns: table.header };
    },

    async downloadDataset(controller, rows) {
      const table = await this.defaultTable(controller, rows);
      const bytes = await root.xlsxLite.write([{ name: "Dataset", rows: [table.header, ...table.rows] }]);
      return {
        blob: new Blob([bytes], { type: XLSX_TYPE }),
        // table.limit is null when the request covered the whole dataset.
        filename: `${controller}-dataset-${table.limit === null ? "all" : table.limit}.xlsx`,
        rows: table.rows.length,
        total: table.total,
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
    datasetInfo: (...args) => (isLocal() ? local : remote).datasetInfo(...args),
    downloadDataset: (...args) => (isLocal() ? local : remote).downloadDataset(...args),
    startTraining: (...args) => (isLocal() ? local : remote).startTraining(...args),
  };
})(typeof window !== "undefined" ? window : globalThis);

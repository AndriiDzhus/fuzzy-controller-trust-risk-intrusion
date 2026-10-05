/**
 * «Навчання моделі» — the training block of a controller page (the accordion
 * before "Fuzzification"): dataset download, training on an uploaded
 * dataset with a live learning curve, the results, and applying the trained
 * parameters to the controller (or returning to the expert ones).
 *
 *   Security   ANFIS (epochs)
 *   Intrusion  genetic algorithm (generations)
 *
 * Where the training runs is decided by training-backend.js (server job or
 * Web Worker). The applied parameters are handled by fuzzy-page-core.js
 * (window.fuzzyPage.setActiveModel).
 */
(function (root) {
  const METHOD = {
    security: {
      key: "anfis",
      stepKey: "epoch",
      stepsOption: "epochs",
      options: [{ key: "epochs", min: 1, max: 2000, step: 1 }],
      series: [
        { key: "trainRmse", nameKey: "common.training.series.train", cls: "s1" },
        { key: "testRmse", nameKey: "common.training.series.test", cls: "s2" },
      ],
      inputSymbols: ["EC", "TP", "Lat"],
      outputSymbol: "SR",
      keyOf: { EC: "energy", TP: "strength", Lat: "response", SR: "risk" },
      ranges: { EC: [0, 0.05], TP: [0, 40], Lat: [0, 10], SR: [0, 100] },
      reportSplits: ["train", "test"],
    },
    intrusion: {
      key: "ga",
      stepKey: "generation",
      stepsOption: "generations",
      options: [
        { key: "generations", min: 1, max: 2000, step: 1 },
        { key: "populationSize", min: 4, max: 500, step: 1 },
        { key: "initialPopulation", min: 4, max: 2000, step: 1 },
        { key: "targetRmse", min: 0, max: 100, step: 0.1 },
        { key: "seed", min: 0, max: 1e9, step: 1 },
      ],
      series: [
        { key: "bestRmse", nameKey: "common.training.series.best", cls: "s1" },
        { key: "meanRmse", nameKey: "common.training.series.mean", shortKey: "common.training.series.meanShort", cls: "s3", axis: "right" },
        { key: "validationRmse", nameKey: "common.training.series.validation", cls: "s2" },
      ],
      inputSymbols: ["NP", "Rate", "We"],
      outputSymbol: "IP",
      keyOf: { NP: "packets", Rate: "rate", We: "weight", IP: "intrusion" },
      ranges: { NP: [0, 15], Rate: [0, 3000], We: [0, 250], IP: [0, 100] },
      reportSplits: ["train", "validation", "test"],
    },
  };
  // The default datasets: one file per size, all covering the same ranges
  // (same values as DATASET_SIZES / DEFAULT_DATASET_SIZE in src/training/datasets.js).
  const DATASET_SIZES = [20, 50, 100, 500];
  const DEFAULT_SIZE = { security: 50, intrusion: 100 };
  const SPLIT_SHARES = { security: [0.7, 0.3], intrusion: [0.7, 0.15, 0.15] };
  const STORAGE_KEY = "fuzzyTrainingResult";

  const t = (key, fallback = "") => (root.i18nHelper ? root.i18nHelper.t(key, fallback) : fallback || key);
  const pageKey = (controller) => ({ trust: "index", security: "security", intrusion: "intrusion" }[controller] || controller);
  const escapeHtml = (value) =>
    String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const locale = () => (root.i18nHelper?.currentLang === "en" ? "en-US" : "uk-UA");
  // Without explicit digits: 2 decimals, 3 below 1 and 4 below 0.1 (RMSE of the
  // trained models is hundredths: 0.0189, 0.361).
  const fmt = (value, digits) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    const v = Number(value);
    const d = digits ?? (v !== 0 && Math.abs(v) < 0.1 ? 4 : Math.abs(v) < 1 ? 3 : 2);
    return v.toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  const pct = (value) => (value === null || value === undefined ? "—" : `${fmt(100 * value, 1)} %`);
  /** A "?" that shows `text` on hover / focus / tap (see .training-help in style.css). */
  const help = (text) =>
    `<span class="training-help" tabindex="0" role="note" aria-label="${escapeHtml(text)}" data-tip="${escapeHtml(text)}">?</span>`;
  const termLabelOf = (term, varKey) => (typeof root.termLabel === "function" ? root.termLabel(term, varKey) : term);
  const termColorOf = (term, siblings, varKey) =>
    typeof root.termColor === "function" ? root.termColor(term, siblings, varKey) : "#3498db";

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  const state = {
    controller: null,
    method: null,
    status: "idle", // idle | starting | running | done | stopped | error
    handle: null,
    history: [],
    dataset: null,
    options: null,
    expectedSteps: null,
    result: null,
    error: null,
    size: null, // rows of the chosen default dataset (20 / 50 / 100 / 500)
    els: {},
  };

  function readStored(controller) {
    try {
      const raw = localStorage.getItem(`${STORAGE_KEY}:${controller}`);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && parsed.result ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeStored(controller, entry) {
    try {
      if (entry) localStorage.setItem(`${STORAGE_KEY}:${controller}`, JSON.stringify(entry));
      else localStorage.removeItem(`${STORAGE_KEY}:${controller}`);
    } catch {
      // Ignore quota / private-mode failures.
    }
  }

  const isApplied = () => Boolean(root.fuzzyPage?.hasActiveModel?.());
  const appliedMeta = () => root.fuzzyPage?.activeModelMeta?.() || null;

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /** File name of the chosen default dataset, e.g. "intrusion-100.csv". */
  const datasetFileName = (size = state.size) => `${state.controller}-${size}.csv`;

  /** "70 / 15 / 15 rows" for the chosen size: the training / validation / test parts. */
  function splitText(size = state.size) {
    const shares = SPLIT_SHARES[state.controller] || [];
    const counts = [];
    let left = size;
    shares.forEach((share, i) => {
      const n = i === shares.length - 1 ? left : Math.round(size * share);
      counts.push(n);
      left -= n;
    });
    return counts.join(" / ");
  }

  function renderPanel() {
    const { controller, method } = state;
    const page = pageKey(controller);
    const sizeButtons = DATASET_SIZES.map(
      (n) => `<button type="button" class="training-rows-chip" data-role="size" data-size="${n}" aria-pressed="false">${n}</button>`
    ).join("");
    const optionFields = method.options
      .map((opt) =>
        opt.type === "toggle"
          ? `
          <label class="training-option training-option-toggle">
            <input type="checkbox" data-option="${opt.key}" />
            <span>${escapeHtml(t(`common.training.options.${opt.key}`))}${help(t(`common.training.optionHelp.${opt.key}`))}</span>
          </label>`
          : `
          <label class="training-option">
            <span>${escapeHtml(t(`common.training.options.${opt.key}`))}${help(t(`common.training.optionHelp.${opt.key}`))}</span>
            <input type="number" data-option="${opt.key}" min="${opt.min}" max="${opt.max}" step="${opt.step}" />
          </label>`
      )
      .join("");

    state.els.panel.innerHTML = `
      <details class="training-about">
        <summary>${escapeHtml(t("common.training.aboutTitle"))}</summary>
        <p>${escapeHtml(t(`${page}.training.about`))}</p>
        <p>${escapeHtml(t(`${page}.training.datasetNote`))}</p>
      </details>
      <div class="training-grid">
        <section class="training-card" data-stage="data">
          <h4><span class="training-stage">1</span>${escapeHtml(t("common.training.dataTitle"))}</h4>
          <div class="training-row">
            <div class="training-row-label">${escapeHtml(t("common.training.defaultDataset"))} <span class="training-row-file" data-role="size-file"></span>${help(t("common.training.help.rows"))}</div>
            <div class="training-rows" role="group" aria-label="${escapeHtml(t("common.training.sizeLabel"))}">
              <span class="training-rows-title">${escapeHtml(t("common.training.sizeLabel"))}</span>${sizeButtons}
            </div>
            <p class="training-note" data-role="size-note"></p>
            <div class="training-controls">
              <button type="button" class="docs-btn" data-role="download">${escapeHtml(t("common.training.downloadBtn"))}</button>
              <span class="training-note training-inline-note">${escapeHtml(t(`${page}.training.columnsNote`))}</span>
            </div>
          </div>
          <div class="training-row">
            <div class="training-row-label">${escapeHtml(t("common.training.trainOn"))}${help(t("common.training.help.upload"))}</div>
            <div class="training-dropzone" data-role="drop" tabindex="0">
              <input type="file" accept=".xlsx,.csv" data-role="file" hidden />
              <button type="button" class="docs-btn docs-btn-primary" data-role="choose">${escapeHtml(t("common.training.chooseFile"))}</button>
              <span class="training-drop-hint">${escapeHtml(t("common.training.dropHint"))}</span>
            </div>
            <p class="training-note">${escapeHtml(t(`${page}.training.uploadNote`))}</p>
            <details class="training-options">
              <summary>${escapeHtml(t("common.training.optionsTitle"))}${help(t("common.training.help.options"))}</summary>
              <div class="training-option-grid">${optionFields}</div>
            </details>
            <p class="training-error" data-role="error" hidden></p>
          </div>
        </section>
        <section class="training-card training-run" data-role="run" data-stage="run">
          <h4><span class="training-stage">2</span>${escapeHtml(t("common.training.runTitle"))}</h4>
          <div class="training-status" data-role="status"></div>
          <div class="training-progress" data-role="progress" hidden><div class="training-progress-bar"></div></div>
          <div class="training-chart" data-role="chart"></div>
          <div class="training-run-actions">
            <button type="button" class="docs-btn training-stop" data-role="stop" hidden>${escapeHtml(t("common.training.stopBtn"))}</button>
          </div>
        </section>
      </div>
      <section class="training-results" data-role="results" data-stage="results" hidden></section>
    `;
    const q = (role) => state.els.panel.querySelector(`[data-role="${role}"]`);
    Object.assign(state.els, {
      sizeFile: q("size-file"), sizeNote: q("size-note"), sizes: [...state.els.panel.querySelectorAll('[data-role="size"]')], download: q("download"), drop: q("drop"), file: q("file"), choose: q("choose"),
      error: q("error"), status: q("status"), progress: q("progress"), chart: q("chart"), stop: q("stop"),
      results: q("results"), run: q("run"),
    });
    // Option defaults.
    const defaults = { ...(root.fuzzyTraining?.session?.METHODS?.[controller]?.defaultOptions || {}), ...DEFAULT_OPTIONS[controller] };
    state.els.panel.querySelectorAll("[data-option]").forEach((input) => {
      const key = input.dataset.option;
      const value = state.options?.[key] ?? defaults[key] ?? "";
      if (input.type === "checkbox") input.checked = Number(value) === 1;
      else input.value = value;
    });
    bindPanel();
    renderRowsPicker();
    renderRun();
    renderResults();
    renderChip();
  }

  /** Marks the chosen dataset size and shows its file and the split of its rows. */
  function renderRowsPicker() {
    const { els, size } = state;
    if (!els.sizes) return;
    els.sizes.forEach((button) => {
      const active = Number(button.dataset.size) === size;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
    els.sizeFile.textContent = datasetFileName();
    const labels = (state.controller === "intrusion" ? ["train", "validation", "test"] : ["train", "test"])
      .map((name) => t(`common.training.split.${name}`).toLowerCase())
      .join(" / ");
    els.sizeNote.textContent = t("common.training.sizeNote")
      .replaceAll("{n}", String(size))
      .replaceAll("{split}", splitText())
      .replaceAll("{parts}", labels);
  }

  function setSize(size) {
    // Unchanged: do not rebuild the empty state, or a click on its button would be lost.
    if (size === state.size) return;
    state.size = size;
    renderRowsPicker();
    if (state.status === "idle") renderRun();
  }

  // Same values as METHODS[*].defaultOptions in src/training/session.js
  // (the API and the worker apply them when a field is left empty).
  const DEFAULT_OPTIONS = {
    security: { epochs: 100 },
    intrusion: { generations: 150, populationSize: 100, initialPopulation: 150, targetRmse: 0, seed: 42 },
  };

  function readOptions() {
    const options = {};
    state.els.panel.querySelectorAll("[data-option]").forEach((input) => {
      if (input.type === "checkbox") {
        options[input.dataset.option] = input.checked ? 1 : 0;
        return;
      }
      const value = Number(input.value);
      if (Number.isFinite(value) && input.value !== "") options[input.dataset.option] = value;
    });
    return options;
  }

  function bindPanel() {
    const { els } = state;
    // "?" icons: show the tip on tap / focus without toggling the <details> or
    // focusing the input of the label they sit in; keep the tip on screen.
    els.panel.addEventListener("click", (event) => {
      const icon = event.target.closest(".training-help");
      if (!icon) return;
      event.preventDefault();
      if (document.activeElement === icon) icon.blur();
      else icon.focus();
    });
    const placeTip = (event) => {
      const icon = event.target.closest(".training-help");
      if (!icon) return;
      const rect = icon.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth * 0.8);
      const x = Math.min(Math.max(rect.left + rect.width / 2, 8 + width / 2), window.innerWidth - 8 - width / 2);
      // Above the icon, or below it when there is no room above.
      const below = rect.top < 150;
      icon.classList.toggle("is-below", below);
      icon.style.setProperty("--tip-x", `${x}px`);
      icon.style.setProperty("--tip-y", `${below ? rect.bottom + 7 : rect.top - 7}px`);
      icon.style.setProperty("--tip-w", `${width}px`);
    };
    els.panel.addEventListener("mouseover", placeTip);
    els.panel.addEventListener("focusin", placeTip);
    els.download.addEventListener("click", () => downloadDataset());
    els.sizes.forEach((button) => button.addEventListener("click", () => setSize(Number(button.dataset.size))));
    els.choose.addEventListener("click", () => els.file.click());
    els.file.addEventListener("change", () => {
      const file = els.file.files && els.file.files[0];
      if (file) startTraining(file);
      els.file.value = "";
    });
    ["dragenter", "dragover"].forEach((name) =>
      els.drop.addEventListener(name, (event) => {
        event.preventDefault();
        els.drop.classList.add("is-over");
      })
    );
    ["dragleave", "drop"].forEach((name) =>
      els.drop.addEventListener(name, (event) => {
        event.preventDefault();
        els.drop.classList.remove("is-over");
      })
    );
    els.drop.addEventListener("drop", (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (file) startTraining(file);
    });
    els.drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        els.file.click();
      }
    });
    els.stop.addEventListener("click", () => {
      if (state.handle) {
        state.handle.stop();
        els.stop.disabled = true;
        els.stop.textContent = t("common.training.stopping");
      }
    });
  }

  // -------------------------------------------------------------------------
  // Chip in the accordion summary
  // -------------------------------------------------------------------------

  function renderChip() {
    const chip = state.els.chip;
    if (!chip) return;
    let key = "common.training.chip.expert";
    let cls = "is-expert";
    if (state.status === "running" || state.status === "starting") {
      key = "common.training.chip.running";
      cls = "is-running";
    } else if (isApplied()) {
      key = "common.training.chip.applied";
      cls = "is-applied";
    }
    chip.className = `training-chip ${cls}`;
    chip.textContent = t(key);
    document.body.classList.toggle("is-trained-model", isApplied());
    // A chip in the page header next to "Model" / "Defuzzification".
    const meta = document.querySelector(".controller-meta");
    if (meta) {
      let metaChip = meta.querySelector(".controller-meta-chip.is-trained");
      if (isApplied()) {
        if (!metaChip) {
          metaChip = document.createElement("span");
          metaChip.className = "controller-meta-chip is-trained";
          meta.appendChild(metaChip);
        }
        metaChip.innerHTML = `<strong>${escapeHtml(t("common.training.metaLabel"))}</strong><span>${escapeHtml(
          t(`${pageKey(state.controller)}.training.metaChip`)
        )}</span>`;
      } else if (metaChip) {
        metaChip.remove();
      }
    }
  }

  // -------------------------------------------------------------------------
  // Dataset download
  // -------------------------------------------------------------------------

  /** Downloads the default dataset of the chosen size. */
  async function downloadDataset(size = state.size) {
    const { els } = state;
    els.download.disabled = true;
    showError(null);
    try {
      const { blob, filename } = await root.trainingBackend.downloadDataset(state.controller, size);
      saveBlob(blob, filename);
    } catch (error) {
      showError(t("common.training.errors.download", error.message));
    } finally {
      els.download.disabled = false;
    }
  }

  /** Trains on the default dataset of the chosen size. */
  async function trainOnDefaultDataset() {
    if (state.status === "running" || state.status === "starting") return;
    const { size } = state;
    showError(null);
    const button = state.els.status.querySelector('[data-role="train-default"]');
    if (button) button.disabled = true;
    try {
      const { blob, filename } = await root.trainingBackend.downloadDataset(state.controller, size);
      await startTraining(new File([blob], filename, { type: blob.type }));
    } catch (error) {
      showError(t("common.training.errors.download", error.message));
      if (button) button.disabled = false;
    }
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  function showError(message) {
    const el = state.els.error;
    if (!el) return;
    el.hidden = !message;
    el.textContent = message || "";
  }

  function errorMessage(error) {
    const code = error.code || error.message;
    const d = error.details || {};
    if (code === "missingColumns") {
      return `${t("common.training.errors.missingColumns")}: ${(d.missing || []).join(", ")}`;
    }
    if (code === "tooFewRows") {
      const counts = d.counts ? ` (${t("common.training.split.train")}: ${d.counts.train || 0})` : "";
      return `${t("common.training.errors.tooFewRows")} ${d.minTrain || 10}${counts}`;
    }
    if (code === "unreadableFile") return `${t("common.training.errors.unreadableFile")}${d.message ? `: ${d.message}` : ""}`;
    if (code === "too many running jobs") return t("common.training.errors.busy");
    return `${t("common.training.errors.generic")}: ${error.message}`;
  }

  // -------------------------------------------------------------------------
  // Training run
  // -------------------------------------------------------------------------

  async function startTraining(file) {
    if (state.status === "running" || state.status === "starting") return;
    const name = String(file.name || "").toLowerCase();
    if (/\.(xls|doc|docx|pdf|json|txt)$/.test(name)) {
      showError(t("common.training.errors.fileType"));
      return;
    }
    showError(null);
    state.options = readOptions();
    state.status = "starting";
    state.history = [];
    state.dataset = { name: file.name };
    state.error = null;
    state.expectedSteps = state.options[state.method.stepsOption] || DEFAULT_OPTIONS[state.controller][state.method.stepsOption];
    renderRun();
    renderChip();
    try {
      state.handle = await root.trainingBackend.startTraining({
        controller: state.controller,
        file,
        options: state.options,
        onProgress: (entry, info) => {
          if (state.status !== "running" && state.status !== "starting") return;
          state.status = "running";
          if (info.dataset) state.dataset = info.dataset;
          if (info.options) {
            state.options = info.options;
            state.expectedSteps = info.options[state.method.stepsOption] || state.expectedSteps;
          }
          state.history.push(entry);
          renderRun();
        },
        onDone: (result, info) => {
          state.status = result.training.stopReason === "stopped" ? "stopped" : "done";
          state.result = result;
          state.history = result.training.history;
          if (info?.dataset) state.dataset = info.dataset;
          state.handle = null;
          writeStored(state.controller, { result, dataset: state.dataset, savedAt: new Date().toISOString() });
          renderRun();
          renderResults();
          renderChip();
          state.els.results.scrollIntoView({ behavior: "smooth", block: "nearest" });
        },
        onError: (error) => {
          state.status = "error";
          state.error = errorMessage(error);
          state.handle = null;
          renderRun();
          renderChip();
        },
      });
      if (state.handle?.dataset) state.dataset = state.handle.dataset;
      if (state.handle?.options) {
        state.options = state.handle.options;
        state.expectedSteps = state.handle.options[state.method.stepsOption] || state.expectedSteps;
      }
      if (state.status === "starting") state.status = "running";
      renderRun();
    } catch (error) {
      state.status = "error";
      state.error = errorMessage(error);
      state.handle = null;
      renderRun();
      renderChip();
      showError(state.error);
    }
  }

  function datasetSummary(dataset) {
    if (!dataset) return "";
    const parts = [dataset.name];
    if (dataset.counts) {
      const counts = Object.entries(dataset.counts)
        .map(([split, n]) => `${t(`common.training.split.${split}`)} ${n}`)
        .join(" · ");
      parts.push(counts);
    }
    if (dataset.skipped) parts.push(`${t("common.training.skippedRows")} ${dataset.skipped}`);
    return parts.join(" · ");
  }

  function renderRun() {
    const { els, method, status, history } = state;
    if (!els.status) return;
    const last = history[history.length - 1];
    const stepLabel = t(`common.training.${method.stepKey}`);
    const lines = [];
    if (status === "idle") {
      lines.push(`<p class="training-status-main is-muted">${escapeHtml(t("common.training.idle"))}</p>`);
      const file = datasetFileName();
      const total = ` (${state.size} ${t("common.training.rowsUnit")})`;
      lines.push(`
        <div class="training-empty">
          <p class="training-default-file">
            ${escapeHtml(t("common.training.defaultFile"))}
            <strong>${escapeHtml(file)}</strong>${escapeHtml(total)}
            · <a href="#" data-role="download-all">${escapeHtml(t("common.training.downloadAll"))}</a>
          </p>
          <button type="button" class="docs-btn docs-btn-primary" data-role="train-default">${escapeHtml(t("common.training.trainDefaultBtn"))}</button>
          <span class="training-note">${escapeHtml(t("common.training.trainDefaultHint").replace("{file}", file))}</span>
        </div>`);
      if (isApplied()) {
        // A result was cleared while its parameters stay applied: keep a way back.
        lines.push(`
          <p class="training-note is-warn">${escapeHtml(t("common.training.appliedNoResult"))}
            <button type="button" class="docs-btn training-revert" data-role="revert-idle">${escapeHtml(t("common.training.revertBtn"))}</button>
          </p>`);
      }
    } else if (status === "starting") {
      lines.push(`<p class="training-status-main">${escapeHtml(t("common.training.starting"))}</p>`);
      lines.push(`<p class="training-status-sub">${escapeHtml(datasetSummary(state.dataset))}</p>`);
    } else if (status === "error") {
      lines.push(`<p class="training-status-main is-error">${escapeHtml(state.error || t("common.training.errors.generic"))}</p>`);
    } else if (last) {
      // Live figures as small tiles: the step counter and the RMSE of each series.
      const step = last[method.stepKey];
      const inProgress = status === "running" || status === "starting";
      const total = inProgress && state.expectedSteps ? ` ${t("common.training.of")} ${state.expectedSteps}` : "";
      const stat = (label, value, tip) =>
        `<div class="training-stat"><span class="training-stat-label">${escapeHtml(label)}${tip ? help(tip) : ""}</span><span class="training-stat-value">${escapeHtml(value)}</span></div>`;
      const stats = [stat(stepLabel, `${step}${total}`, t(`common.training.statHelp.${method.stepKey}`))];
      method.series.forEach((series) => {
        if (last[series.key] != null) {
          stats.push(stat(`RMSE · ${t(series.shortKey || series.nameKey).toLowerCase()}`, fmt(last[series.key]), t(`common.training.statHelp.${series.key}`)));
        }
      });
      if (method.key === "ga" && last.bestFitness != null) stats.push(stat("F = 1 / (1 + RMSE)", fmt(last.bestFitness, 4), t("common.training.statHelp.bestFitness")));
      lines.push(`<div class="training-live">${stats.join("")}</div>`);
      const extras = [];
      if (status === "done" || status === "stopped") {
        extras.push(`${t("common.training.finished")}: ${t(`common.training.stop.${last.stopReason || "generations"}`, last.stopReason || "")}`);
      }
      extras.push(datasetSummary(state.dataset));
      lines.push(`<p class="training-status-sub">${escapeHtml(extras.filter(Boolean).join(" · "))}</p>`);
    }
    els.status.innerHTML = lines.join("");
    els.status.querySelector('[data-role="train-default"]')?.addEventListener("click", trainOnDefaultDataset);
    els.status.querySelector('[data-role="download-all"]')?.addEventListener("click", (event) => {
      event.preventDefault();
      downloadDataset();
    });
    els.status.querySelector('[data-role="revert-idle"]')?.addEventListener("click", async () => {
      await revertToExpert();
      renderRun();
    });

    const running = status === "running" || status === "starting";
    els.progress.hidden = !(running || status === "done" || status === "stopped");
    const bar = els.progress.querySelector(".training-progress-bar");
    const done = status === "done" || status === "stopped";
    const share = done ? 1 : last && state.expectedSteps ? Math.min(1, last[method.stepKey] / state.expectedSteps) : 0;
    bar.style.width = `${Math.round(share * 100)}%`;
    bar.classList.toggle("is-done", done);
    els.stop.hidden = !running;
    els.stop.disabled = false;
    els.stop.textContent = t("common.training.stopBtn");
    els.run.classList.toggle("is-running", running);
    els.choose.disabled = running;
    els.download.disabled = running;

    if (history.length > 1) {
      const xMax = done ? last[method.stepKey] : Math.max(state.expectedSteps || 0, last[method.stepKey]);
      els.chart.innerHTML = learningCurve(history, { xMax, chosen: state.result?.training?.bestEpoch ?? null });
      bindCurve(els.chart);
    } else if (!running) {
      els.chart.innerHTML = "";
    }
  }

  // -------------------------------------------------------------------------
  // Learning curve (SVG): RMSE per generation / epoch, one line per series
  // -------------------------------------------------------------------------

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
  }

  function learningCurve(history, { xMax, chosen }) {
    const { method } = state;
    const stepKey = method.stepKey;
    const series = method.series
      .map((s) => ({ ...s, name: t(s.nameKey) }))
      .filter((s) => history.some((h) => Number.isFinite(h[s.key])));
    const W = 640;
    const H = 250;
    // A series on the right axis (the GA's population mean, tens of times above
    // the best RMSE) gets a scale of its own, so the best curve stays readable.
    const hasRight = series.some((s) => s.axis === "right") && series.some((s) => s.axis !== "right");
    const isRight = (s) => hasRight && s.axis === "right";
    const pad = { l: 50, r: hasRight ? 44 : 16, t: 26, b: 36 };
    const xs = history.map((h) => h[stepKey]);
    const x0 = xs[0];
    const x1 = Math.max(xMax || 0, xs[xs.length - 1], x0 + 1);
    const range = (list) => {
      const all = list.flatMap((s) => history.map((h) => h[s.key]).filter(Number.isFinite));
      let lo = Math.min(...all);
      let hi = Math.max(...all);
      const sp = hi - lo || 1;
      lo = Math.max(0, lo - sp * 0.08);
      hi += sp * 0.08;
      return { lo, hi, sp };
    };
    const left = range(series.filter((s) => !isRight(s)));
    const right = hasRight ? range(series.filter(isRight)) : null;
    const yMin = left.lo;
    const yMax = left.hi;
    const span = left.sp;
    const x = (v) => pad.l + ((v - x0) / (x1 - x0)) * (W - pad.l - pad.r);
    const scaleOf = (r) => (v) => pad.t + (1 - (v - r.lo) / (r.hi - r.lo)) * (H - pad.t - pad.b);
    const y = scaleOf(left);
    const yRight = right ? scaleOf(right) : null;
    const yTicks = niceTicks(yMin, yMax, 5);
    const rightTicks = right
      ? niceTicks(right.lo, right.hi, 5)
          .map((v) => `<text class="lc-tick lc-tick-right" x="${W - pad.r + 8}" y="${yRight(v) + 4}" text-anchor="start">${escapeHtml(fmt(v, right.sp < 2 ? 2 : 1))}</text>`)
          .join("")
      : "";
    const xTicks = niceTicks(x0, x1, 6).filter((v) => Number.isInteger(v));
    const grid = yTicks
      .map(
        (v) =>
          `<line class="lc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>` +
          `<text class="lc-tick" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${escapeHtml(fmt(v, span < 0.2 ? 3 : span < 2 ? 2 : 1))}</text>`
      )
      .join("");
    const xAxis = xTicks
      .map((v) => `<text class="lc-tick" x="${x(v)}" y="${H - pad.b + 18}" text-anchor="middle">${v}</text>`)
      .join("");
    const lines = series
      .map((s) => {
        const pts = history.filter((h) => Number.isFinite(h[s.key]));
        const yy = isRight(s) ? yRight : y;
        const d = pts.map((h, i) => `${i ? "L" : "M"}${x(h[stepKey]).toFixed(1)},${yy(h[s.key]).toFixed(1)}`).join("");
        return `<path class="lc-line ${s.cls}" d="${d}"/>`;
      })
      .join("");
    const chosenMark =
      chosen !== null && chosen !== undefined && chosen !== xs[xs.length - 1]
        ? `<line class="lc-chosen" x1="${x(chosen)}" x2="${x(chosen)}" y1="${pad.t}" y2="${H - pad.b}"/>` +
          `<text class="lc-chosen-label" x="${x(chosen) + 4}" y="${pad.t + 10}">${escapeHtml(t("common.training.chosen"))}</text>`
        : "";
    const legend = series
      .map((s) => `<span class="lc-legend-item"><i class="${s.cls}"></i>${escapeHtml(s.name)}${isRight(s) ? ` (${escapeHtml(t("common.training.rightAxis"))})` : ""}</span>`)
      .join("");
    const xLabel = t(`common.training.${stepKey}`);
    return `
      <div class="lc-legend">${legend}</div>
      <div class="lc-wrap" data-lc>
        <svg class="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="RMSE">
          ${grid}
          <line class="lc-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"/>
          ${xAxis}
          ${rightTicks}
          <text class="lc-axis-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 4}" text-anchor="middle">${escapeHtml(xLabel)}</text>
          <text class="lc-axis-label" x="10" y="12" text-anchor="start">RMSE</text>
          ${chosenMark}
          ${lines}
          <line class="lc-cross" x1="0" x2="0" y1="${pad.t}" y2="${H - pad.b}" visibility="hidden"/>
          ${series.map((s) => `<circle class="lc-dot ${s.cls}" r="4" visibility="hidden"/>`).join("")}
          <rect class="lc-hit" x="${pad.l}" y="${pad.t}" width="${W - pad.l - pad.r}" height="${H - pad.t - pad.b}"/>
        </svg>
        <div class="lc-tip" hidden></div>
      </div>
      <script type="application/json" class="lc-data">${JSON.stringify({
        stepKey,
        xLabel,
        series: series.map((s) => ({ key: s.key, name: s.name, cls: s.cls, right: isRight(s) })),
        history,
        geom: { W, H, pad, x0, x1, yMin, yMax, rMin: right ? right.lo : null, rMax: right ? right.hi : null },
      }).replace(/</g, "\\u003c")}</script>`;
  }

  function bindCurve(container) {
    const wrap = container.querySelector("[data-lc]");
    const dataEl = container.querySelector(".lc-data");
    if (!wrap || !dataEl) return;
    const { stepKey, xLabel, series, history, geom } = JSON.parse(dataEl.textContent);
    const svg = wrap.querySelector("svg");
    const hit = svg.querySelector(".lc-hit");
    const cross = svg.querySelector(".lc-cross");
    const dots = [...svg.querySelectorAll(".lc-dot")];
    const tip = wrap.querySelector(".lc-tip");
    const { W, H, pad, x0, x1, yMin, yMax, rMin, rMax } = geom;
    const x = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
    const y = (v, right = false) => {
      const [lo, hi] = right ? [rMin, rMax] : [yMin, yMax];
      return pad.t + (1 - (v - lo) / (hi - lo)) * (H - pad.t - pad.b);
    };
    const hide = () => {
      cross.setAttribute("visibility", "hidden");
      dots.forEach((d) => d.setAttribute("visibility", "hidden"));
      tip.hidden = true;
    };
    const show = (event) => {
      const rect = svg.getBoundingClientRect();
      const sx = ((event.clientX - rect.left) / rect.width) * W;
      const step = x0 + ((sx - pad.l) / (W - pad.l - pad.r)) * (x1 - x0);
      let best = history[0];
      history.forEach((h) => {
        if (Math.abs(h[stepKey] - step) < Math.abs(best[stepKey] - step)) best = h;
      });
      const cx = x(best[stepKey]);
      cross.setAttribute("x1", cx);
      cross.setAttribute("x2", cx);
      cross.setAttribute("visibility", "visible");
      series.forEach((s, i) => {
        const v = best[s.key];
        if (!Number.isFinite(v)) return dots[i].setAttribute("visibility", "hidden");
        dots[i].setAttribute("cx", cx);
        dots[i].setAttribute("cy", y(v, s.right));
        dots[i].setAttribute("visibility", "visible");
      });
      tip.innerHTML =
        `<strong>${escapeHtml(xLabel)} ${best[stepKey]}</strong>` +
        series.map((s) => `<span><i class="${s.cls}"></i>${escapeHtml(s.name)}: ${escapeHtml(fmt(best[s.key]))}</span>`).join("");
      tip.hidden = false;
      const left = (cx / W) * rect.width;
      tip.style.left = `${Math.min(rect.width - tip.offsetWidth - 4, Math.max(4, left + 12))}px`;
      tip.style.top = "8px";
    };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  function tile(label, before, after, { better = "lower", format = fmt, wide = false, tip = "" } = {}) {
    const improved = before != null && after != null && (better === "lower" ? after < before : after > before);
    const worse = before != null && after != null && (better === "lower" ? after > before : after < before);
    return `
      <div class="training-tile${wide ? " is-wide" : ""}">
        <span class="training-tile-label">${escapeHtml(label)}${tip ? help(tip) : ""}</span>
        <span class="training-tile-value">
          <span class="training-tile-before">${escapeHtml(format(before))}</span>
          <span class="training-tile-arrow">→</span>
          <span class="training-tile-after ${improved ? "is-better" : worse ? "is-worse" : ""}">${escapeHtml(format(after))}</span>
        </span>
      </div>`;
  }

  function renderResults() {
    const { els, result, method } = state;
    if (!els.results) return;
    if (!result) {
      els.results.hidden = true;
      els.results.innerHTML = "";
      return;
    }
    const tr = result.training;
    const m = tr.metrics;
    const splitTiles = method.reportSplits
      .filter((split) => m.trained[split])
      .map((split) =>
        tile(`RMSE · ${t(`common.training.split.${split}`)}`, m.base[split]?.rmse, m.trained[split].rmse, {
          tip: `${t(`common.training.tileHelp.rmse`)} ${t(`common.training.tileHelp.split.${split}`)}`,
        })
      )
      .join("");
    const lastSplit = method.reportSplits.filter((split) => m.trained[split]).pop();
    const extraTiles = [
      tile(`R² · ${t(`common.training.split.${lastSplit}`)}`, m.base[lastSplit]?.r2, m.trained[lastSplit]?.r2, {
        better: "higher",
        format: (v) => fmt(v, 3),
        tip: t("common.training.tileHelp.r2"),
      }),
      m.trained[lastSplit]?.detection
        ? tile(t("common.training.balancedAccuracy"), m.base[lastSplit]?.detection?.balancedAccuracy, m.trained[lastSplit].detection.balancedAccuracy, {
            better: "higher",
            format: pct,
            wide: true,
            tip: t("common.training.tileHelp.balancedAccuracy"),
          })
        : "",
    ].join("");
    const applied = isApplied();
    const meta = appliedMeta();
    const appliedThis = applied && meta?.createdAt === tr.createdAt;
    const facts = [
      `${t("common.training.dataset")}: ${escapeHtml(tr.datasetName || state.dataset?.name || "—")}`,
      `${t(`common.training.${method.stepKey}s`)}: ${tr.steps}${tr.stopReason ? ` (${escapeHtml(t(`common.training.stop.${tr.stopReason}`, tr.stopReason))})` : ""}`,
      method.key === "anfis" && tr.bestEpoch ? `${t("common.training.bestEpoch")}: ${tr.bestEpoch}` : "",
      method.key === "ga" && tr.fitness ? `F: ${fmt(tr.fitness.expert, 4)} → ${fmt(tr.fitness.best, 4)}` : "",
      tr.seconds != null ? `${fmt(tr.seconds, 1)} ${t("common.training.seconds")}` : "",
      Object.entries(tr.samples || {}).map(([s, n]) => `${t(`common.training.split.${s}`)} ${n}`).join(" · "),
    ]
      .filter(Boolean)
      .join(" · ");

    els.results.hidden = false;
    els.results.innerHTML = `
      <div class="training-results-head">
        <h4><span class="training-stage">3</span>${escapeHtml(t("common.training.resultsTitle"))}</h4>
        <p class="training-note">${facts}</p>
      </div>
      <div class="training-tiles">${splitTiles}${extraTiles}</div>
      <div class="training-actions">
        <button type="button" class="docs-btn docs-btn-primary" data-role="apply" ${appliedThis ? "disabled" : ""}>${escapeHtml(
          appliedThis ? t("common.training.appliedBtn") : t("common.training.applyBtn")
        )}</button>
        <button type="button" class="docs-btn training-revert" data-role="revert" ${applied ? "" : "hidden"}>${escapeHtml(t("common.training.revertBtn"))}</button>
        <span class="training-clear" data-role="clear-wrap">
          <button type="button" class="docs-btn docs-btn-alt" data-role="clear">${escapeHtml(t("common.training.clearBtn"))}</button>
          <span class="training-confirm" data-role="clear-confirm" hidden>
            <span>${escapeHtml(t("common.training.clearConfirm"))}${
              applied ? ` <small>${escapeHtml(t("common.training.clearNoteApplied"))}</small>` : ""
            }</span>
            <button type="button" class="docs-btn training-confirm-yes" data-role="clear-yes">${escapeHtml(t("common.training.clearYes"))}</button>
            <button type="button" class="docs-btn docs-btn-alt" data-role="clear-no">${escapeHtml(t("common.training.clearNo"))}</button>
          </span>
        </span>
      </div>
      ${applied && !appliedThis ? `<p class="training-note is-warn">${escapeHtml(t("common.training.appliedOther"))}</p>` : ""}
      <details class="training-changes">
        <summary>${escapeHtml(changesSummary(result.changes))}</summary>
        <div class="training-changes-body">
          <p class="training-note">${escapeHtml(t(`${pageKey(state.controller)}.training.changesNote`))}</p>
          <div class="training-legend"><span><i class="is-before"></i>${escapeHtml(t("common.training.before"))}</span><span><i class="is-after"></i>${escapeHtml(t("common.training.after"))}</span></div>
          <div class="training-vars">${result.changes.variables.map(renderVariable).join("")}</div>
          ${renderRules(result.changes)}
        </div>
      </details>
    `;
    els.results.querySelector('[data-role="apply"]').addEventListener("click", applyResult);
    els.results.querySelector('[data-role="revert"]').addEventListener("click", revertToExpert);
    const clearBtn = els.results.querySelector('[data-role="clear"]');
    const confirmBox = els.results.querySelector('[data-role="clear-confirm"]');
    const showConfirm = (on) => {
      confirmBox.hidden = !on;
      clearBtn.hidden = on;
      if (on) confirmBox.querySelector('[data-role="clear-no"]').focus();
    };
    clearBtn.addEventListener("click", () => showConfirm(true));
    els.results.querySelector('[data-role="clear-no"]').addEventListener("click", () => showConfirm(false));
    els.results.querySelector('[data-role="clear-yes"]').addEventListener("click", clearResult);
    confirmBox.addEventListener("keydown", (event) => {
      if (event.key === "Escape") showConfirm(false);
    });
  }

  function changesSummary(changes) {
    const parts = [`${changes.changedParams} ${t("common.training.changedParams")}`];
    if (state.method.key === "ga") parts.push(`${changes.changedRules} ${t("common.training.changedRules")}`);
    else parts.push(t("common.training.rulesKept"));
    return `${t("common.training.whatChanged")}: ${parts.join(", ")}`;
  }

  // Membership function value of a term configuration.
  function mfValue(cfg, x) {
    const p = cfg.after || cfg;
    if (cfg.type === "gauss") return Math.exp(-((x - p[1]) ** 2) / (2 * p[0] * p[0]));
    if (cfg.type === "triangle") {
      const [a, b, c] = p;
      if (x < a || x > c) return 0;
      if (a === b && x <= b) return c > b ? (c - x) / (c - b) : 1;
      if (b === c && x >= b) return b > a ? (x - a) / (b - a) : 1;
      return x <= b ? (x - a) / (b - a || 1) : (c - x) / (c - b || 1);
    }
    if (cfg.type === "trapeze") {
      const [a, b, c, d] = p;
      if (x < a || x > d) return 0;
      if (x >= b && x <= c) return 1;
      if (x < b) return (x - a) / (b - a || 1);
      return (d - x) / (d - c || 1);
    }
    return 0;
  }

  function variableTitle(symbol) {
    const page = pageKey(state.controller);
    const key = state.method.keyOf[symbol];
    return t(`${page}.membership.${key}`, symbol);
  }

  function renderVariable(variable) {
    const { method } = state;
    const varKey = method.keyOf[variable.symbol];
    const [min, max] = method.ranges[variable.symbol];
    const siblings = variable.terms.map((term) => term.term);
    const W = 300;
    const H = 110;
    const pad = { l: 8, r: 8, t: 10, b: 18 };
    const x = (v) => pad.l + ((v - min) / (max - min)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
    const n = 120;
    const curves = variable.terms
      .map((term) => {
        const color = termColorOf(term.term, siblings, varKey);
        if (term.type === "singleton") {
          const parts = [];
          if (term.before) parts.push(`<line class="mf-before" stroke="${color}" x1="${x(term.before[0])}" x2="${x(term.before[0])}" y1="${y(0)}" y2="${y(1)}"/>`);
          parts.push(`<line class="mf-after" stroke="${color}" x1="${x(term.after[0])}" x2="${x(term.after[0])}" y1="${y(0)}" y2="${y(1)}"/>`);
          return parts.join("");
        }
        const path = (params) => {
          const cfg = { type: term.type, after: params };
          let d = "";
          for (let i = 0; i <= n; i += 1) {
            const xv = min + ((max - min) * i) / n;
            d += `${i ? "L" : "M"}${x(xv).toFixed(1)},${y(Math.max(0, Math.min(1, mfValue(cfg, xv)))).toFixed(1)}`;
          }
          return d;
        };
        return (
          (term.before ? `<path class="mf-before" stroke="${color}" d="${path(term.before)}"/>` : "") +
          `<path class="mf-after" stroke="${color}" d="${path(term.after)}"/>`
        );
      })
      .join("");
    const tickValues = [min, (min + max) / 2, max];
    const ticks = tickValues
      .map((v) => `<text class="mf-tick" x="${x(v)}" y="${H - 4}" text-anchor="${v === min ? "start" : v === max ? "end" : "middle"}">${escapeHtml(fmt(v, max - min <= 1 ? 3 : max - min <= 20 ? 1 : 0))}</text>`)
      .join("");
    // Gaussians are stored as [σ, c] (FuzzyIS order) and shown as c, σ.
    const order = (type, values) => (type === "gauss" && values ? [values[1], values[0]] : values);
    // Terms of one variable may mix triangles and trapezoids (ANFIS: L, M, H):
    // the columns cover the longest parameter list, shorter rows are padded.
    const columnCount = Math.max(...variable.terms.map((term) => term.after.length));
    const firstType = variable.terms[0]?.type || "gauss";
    const paramNames =
      firstType === "gauss"
        ? [t("common.training.params.center"), t("common.training.params.sigma")]
        : firstType === "singleton"
          ? [t("common.training.params.value")]
          : ["a", "b", "c", "d"].slice(0, columnCount);
    const digitsOf = () => (max - min <= 1 ? 4 : max - min <= 20 ? 2 : 1);
    const rows = variable.terms
      .map((term) => {
        const color = termColorOf(term.term, siblings, varKey);
        const shownAfter = order(term.type, term.after);
        const shownBefore = order(term.type, term.before);
        const cells = Array.from({ length: columnCount }, (_, i) => {
            const after = shownAfter[i];
            if (after === undefined) return "<td></td>";
            const before = shownBefore ? shownBefore[i] : null;
            const digits = digitsOf(after);
            const afterText = fmt(after, digits);
            const beforeText = before === null ? null : fmt(before, digits);
            // A change below the shown precision reads as "no change".
            const changed = beforeText !== null && beforeText !== afterText;
            return `<td>${
              changed
                ? `<span class="is-before">${escapeHtml(beforeText)}</span> → <strong>${escapeHtml(afterText)}</strong>`
                : `<span class="is-same">${escapeHtml(afterText)}</span>`
            }</td>`;
          }).join("");
        return `<tr><th scope="row"><i style="background:${color}"></i>${escapeHtml(termLabelOf(term.term, varKey))}</th>${cells}</tr>`;
      })
      .join("");
    return `
      <article class="training-var">
        <header><strong>${escapeHtml(variable.symbol)}</strong><span>${escapeHtml(variableTitle(variable.symbol))}</span></header>
        <svg viewBox="0 0 ${W} ${H}" class="mf-svg" role="img" aria-label="${escapeHtml(variable.symbol)}">
          <line class="mf-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${y(0)}" y2="${y(0)}"/>
          ${curves}${ticks}
        </svg>
        <table class="training-params">
          <thead><tr><th></th>${paramNames.map((name) => `<th>${escapeHtml(name)}</th>`).join("")}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </article>`;
  }

  function ruleText(rule) {
    const { method } = state;
    const cond = rule.conditions
      .map((term, i) => {
        const symbol = method.inputSymbols[i];
        const varKey = method.keyOf[symbol];
        return `<span class="rule-cond">${escapeHtml(symbol)} <em style="color:${termColorOf(term, ["low", "medium", "high"], varKey)}">${escapeHtml(termLabelOf(term, varKey))}</em></span>`;
      })
      .join(" · ");
    const outKey = method.keyOf[method.outputSymbol];
    const outTerms = state.controller === "intrusion" ? ["none", "low", "medium", "high"] : ["none", "veryLow", "low", "medium", "high", "veryHigh"];
    return `${cond} <span class="rule-arrow">→</span> ${escapeHtml(method.outputSymbol)} <em style="color:${termColorOf(rule.out, outTerms, outKey)}">${escapeHtml(termLabelOf(rule.out, outKey))}</em>`;
  }

  function renderRules(changes) {
    if (state.method.key !== "ga") return "";
    if (!changes.rules.length) return `<p class="training-note">${escapeHtml(t("common.training.noRuleChanges"))}</p>`;
    const rows = changes.rules
      .map(
        (rule) => `
        <li>
          <span class="rule-num">${rule.index}</span>
          <div class="rule-pair">
            ${rule.before ? `<div class="rule-before">${ruleText(rule.before)}</div>` : ""}
            <div class="rule-after">${ruleText(rule.after)}</div>
          </div>
        </li>`
      )
      .join("");
    return `
      <div class="training-rules">
        <h5>${escapeHtml(t("common.training.changedRulesTitle"))}</h5>
        <ul>${rows}</ul>
      </div>`;
  }

  // -------------------------------------------------------------------------
  // Apply / revert / export / clear
  // -------------------------------------------------------------------------

  async function applyResult() {
    if (!state.result || !root.fuzzyPage) return;
    const tr = state.result.training;
    const ok = await root.fuzzyPage.setActiveModel(state.result.params, {
      source: "training",
      method: state.method.key,
      createdAt: tr.createdAt,
      datasetName: tr.datasetName,
      steps: tr.steps,
    });
    if (!ok) showError(t("common.training.errors.apply"));
    renderResults();
    renderChip();
  }

  async function revertToExpert() {
    if (!root.fuzzyPage) return;
    await root.fuzzyPage.setActiveModel(null);
    renderResults();
    renderChip();
  }

  function clearResult() {
    state.result = null;
    state.history = [];
    state.status = "idle";
    state.dataset = null;
    writeStored(state.controller, null);
    renderRun();
    renderResults();
    renderChip();
  }

  // -------------------------------------------------------------------------
  // Setup
  // -------------------------------------------------------------------------

  function setup(controller) {
    const method = METHOD[controller];
    const step = document.getElementById("trainingStep");
    const panel = document.getElementById("trainingPanel");
    if (!method || !step || !panel) return;
    state.controller = controller;
    state.method = method;
    state.size = DEFAULT_SIZE[controller];
    state.els = { step, panel, chip: step.querySelector(".training-chip") };
    if (!root.trainingBackend) {
      panel.innerHTML = `<p class="training-note">${escapeHtml(t("common.training.errors.noBackend"))}</p>`;
      return;
    }
    const stored = readStored(controller);
    if (stored) {
      state.result = stored.result;
      state.history = stored.result.training.history || [];
      state.dataset = stored.dataset || null;
      state.status = stored.result.training.stopReason === "stopped" ? "stopped" : "done";
      state.expectedSteps = stored.result.training.steps;
    }
    renderPanel();
    root.addEventListener("languageChanged", () => renderPanel());
    root.addEventListener("activeModelChanged", () => {
      renderResults();
      renderChip();
    });
  }

  root.setupTrainingPanel = setup;
})(typeof window !== "undefined" ? window : globalThis);

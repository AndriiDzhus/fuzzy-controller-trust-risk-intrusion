/**
 * Model variants of a controller page: "base" (the expert model of the
 * assignment) and "trained" (Security after ANFIS training, Intrusion after
 * the genetic optimisation).
 *
 *  - The variant is part of the URL: ?model=trained. Switching reloads the
 *    page, so every chart, rule table and the surface use one model.
 *  - fuzzyModel.local(controller) / fuzzyModel.query() route the calls of
 *    fuzzy-page-core.js and surface-view.js to that variant, in the static
 *    build (window.fuzzyControllers) as well as through the API (?model=).
 *  - The page header gets the switch and a "training results" modal with the
 *    metrics before / after training and the learning curve.
 */
(function (root) {
  const VARIANTS = ["base", "trained"];

  function readModel() {
    try {
      const value = new URLSearchParams(root.location.search).get("model");
      return VARIANTS.includes(value) ? value : "base";
    } catch {
      return "base";
    }
  }

  const current = readModel();

  const t = (key, fallback = "") =>
    root.i18nHelper ? root.i18nHelper.t(key, fallback) : fallback || key;

  const escapeHtml = (value) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

  /** Controller of the static build for the current variant (or null). */
  function local(controller, variant = current) {
    const entry = root.fuzzyControllers?.[controller];
    if (!entry) return null;
    if (typeof entry.variant === "function") return entry.variant(variant);
    return variant === "base" ? entry : null;
  }

  function query(variant = current) {
    return variant === "base" ? "" : `?model=${encodeURIComponent(variant)}`;
  }

  /** Storage key of the persisted inputs: the trained Rate has another scale. */
  function storageKey(controller) {
    return current === "base" ? controller : `${controller}:${current}`;
  }

  async function availableVariants(controller) {
    const entry = root.fuzzyControllers?.[controller];
    if (entry) {
      return typeof entry.availableVariants === "function" ? entry.availableVariants() : ["base"];
    }
    try {
      const response = await fetch(`/api/controllers/${controller}/models`);
      if (!response.ok) return ["base"];
      const data = await response.json();
      return Array.isArray(data.available) ? data.available : ["base"];
    } catch {
      return ["base"];
    }
  }

  async function trainingOf(controller) {
    const model = local(controller, "trained");
    if (model) return model.membershipFunctions().meta?.training || null;
    if (root.fuzzyControllers?.[controller]) return null;
    try {
      const response = await fetch(`/api/controllers/${controller}/membership-functions?model=trained`);
      if (!response.ok) return null;
      return (await response.json()).meta?.training || null;
    } catch {
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Page config of the variant
  // -------------------------------------------------------------------------

  /**
   * Merges config.variants[current] into the page config: input ranges,
   * label keys and chart options that differ in the trained model (the
   * logarithmic Rate of Intrusion).
   */
  function applyConfig(config) {
    const override = config.variants?.[current];
    if (!override) return config;
    Object.entries(override.inputs || {}).forEach(([key, patch]) => {
      const spec = config.inputs.find((item) => item.key === key);
      if (!spec) return;
      Object.assign(spec, patch);
      // Start value of the variant: the HTML default may lie outside its range.
      if (patch.value !== undefined) {
        [spec.numberId, spec.sliderId].forEach((id) => {
          const el = id ? document.getElementById(id) : null;
          if (el) el.value = String(patch.value);
        });
      }
      if (patch.inputLabelKey) {
        const label = document.querySelector(`label[for="${spec.sliderId}"]`);
        if (label) label.setAttribute("data-i18n", patch.inputLabelKey);
      }
    });
    Object.entries(override.graphs?.inputs || {}).forEach(([key, patch]) => {
      const graph = config.graphs.inputs[key];
      if (!graph || typeof graph !== "object") return;
      Object.assign(graph, patch, { axisLabels: { ...graph.axisLabels, ...(patch.axisLabels || {}) } });
    });
    Object.entries(override.i18n || {}).forEach(([selector, key]) => {
      document.querySelectorAll(selector).forEach((el) => el.setAttribute("data-i18n", key));
    });
    return config;
  }

  // -------------------------------------------------------------------------
  // Switch in the page header
  // -------------------------------------------------------------------------

  function setUrlModel(variant) {
    const url = new URL(root.location.href);
    if (variant === "base") url.searchParams.delete("model");
    else url.searchParams.set("model", variant);
    root.location.assign(url.toString());
  }

  async function setupSwitch(config) {
    if (!config.trainable) return;
    const tools = document.querySelector(".page-head-tools");
    if (!tools || document.getElementById("modelSwitch")) return;

    const available = await availableVariants(config.controller);
    const trainedReady = available.includes("trained");

    const wrap = document.createElement("div");
    wrap.className = "model-switch-row";
    wrap.innerHTML = `
      <div class="model-switch" id="modelSwitch" role="group">
        <span class="model-switch-label" data-i18n="common.model.label"></span>
        <button type="button" class="model-switch-btn" data-model="base" data-i18n="common.model.base"></button>
        <button type="button" class="model-switch-btn" data-model="trained">
          <span data-i18n="common.model.trained"></span>
          <span class="model-switch-method" data-i18n="${config.controller}.training.methodShort"></span>
        </button>
      </div>
      <button type="button" class="docs-btn docs-btn-alt model-results-btn" data-i18n="common.model.resultsBtn"></button>
    `;
    tools.prepend(wrap);

    const group = wrap.querySelector(".model-switch");
    group.querySelectorAll(".model-switch-btn").forEach((btn) => {
      const variant = btn.dataset.model;
      const active = variant === current;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", active ? "true" : "false");
      if (variant === "trained" && !trainedReady) {
        btn.disabled = true;
        btn.classList.add("is-unavailable");
      }
      btn.addEventListener("click", () => {
        if (!active && !btn.disabled) setUrlModel(variant);
      });
    });

    const resultsBtn = wrap.querySelector(".model-results-btn");
    resultsBtn.hidden = !trainedReady;
    resultsBtn.addEventListener("click", () => openResults(config));

    const refreshTitles = () => {
      const trainedBtn = group.querySelector('[data-model="trained"]');
      trainedBtn.title = trainedReady
        ? t(`${config.controller}.training.methodLong`)
        : `${t("common.model.unavailable")}. ${t(`${config.controller}.training.howTo`)}`;
      group.setAttribute("aria-label", t("common.model.label"));
    };

    if (current === "trained") {
      const banner = document.createElement("p");
      banner.className = "model-banner";
      banner.setAttribute("data-i18n", `${config.controller}.training.banner`);
      document.querySelector(".page-head")?.after(banner);
      document.body.classList.add("is-trained-model");
    }

    if (root.i18nHelper) root.i18nHelper.applyTranslations(document);
    refreshTitles();
    root.addEventListener("languageChanged", refreshTitles);
  }

  // -------------------------------------------------------------------------
  // Training results modal
  // -------------------------------------------------------------------------

  const fmt = (value, digits = 2) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
    const locale = root.i18nHelper?.currentLang === "en" ? "en-US" : "uk-UA";
    return Number(value).toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
  };
  const pct = (value) => (value === null || value === undefined ? "—" : `${fmt(100 * value, 1)} %`);

  function metricRows(training) {
    const splits = ["train", "validation", "test"].filter((split) => training.metrics.trained?.[split]);
    const rows = [
      { key: "rmse", label: "RMSE", better: "lower", format: (v) => fmt(v) },
      { key: "mae", label: "MAE", better: "lower", format: (v) => fmt(v) },
      { key: "r2", label: "R²", better: "higher", format: (v) => fmt(v, 3) },
    ];
    if (training.metrics.trained[splits[0]].termAccuracy !== undefined) {
      rows.push({ key: "termAccuracy", labelKey: "common.model.results.termAccuracy", better: "higher", format: pct });
      rows.push({
        key: "balancedAccuracy",
        path: (m) => m.detection?.balancedAccuracy,
        labelKey: "common.model.results.balancedAccuracy",
        better: "higher",
        format: pct,
      });
    }
    return { splits, rows };
  }

  function metricsTable(training) {
    const { splits, rows } = metricRows(training);
    const value = (variant, split, row) => {
      const m = training.metrics[variant]?.[split];
      if (!m) return null;
      return row.path ? row.path(m) : m[row.key];
    };
    const head = splits
      .map((split) => `<th colspan="2">${escapeHtml(t(`common.model.results.split.${split}`, split))}</th>`)
      .join("");
    const sub = splits
      .map(
        () =>
          `<th>${escapeHtml(t("common.model.base"))}</th><th>${escapeHtml(t("common.model.trained"))}</th>`
      )
      .join("");
    const body = rows
      .map((row) => {
        const cells = splits
          .map((split) => {
            const b = value("base", split, row);
            const tr = value("trained", split, row);
            const improved =
              b !== null && tr !== null && (row.better === "lower" ? tr < b : tr > b);
            return `<td>${escapeHtml(row.format(b))}</td><td class="${improved ? "is-better" : ""}">${escapeHtml(
              row.format(tr)
            )}</td>`;
          })
          .join("");
        const label = row.labelKey ? t(row.labelKey) : row.label;
        return `<tr><th scope="row">${escapeHtml(label)}</th>${cells}</tr>`;
      })
      .join("");
    return `
      <div class="docs-table-wrap">
        <table class="training-table">
          <thead><tr><th rowspan="2"></th>${head}</tr><tr>${sub}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function categoryTable(training) {
    const split = training.metrics.trained?.test ? "test" : "train";
    const trained = training.metrics.trained?.[split]?.meanIPByCategory;
    const base = training.metrics.base?.[split]?.meanIPByCategory;
    if (!trained) return "";
    const targets = {};
    Object.entries(training.targetByLabel || {}).forEach(([label, ip]) => {
      const category = training.categoryByLabel?.[label];
      if (category) (targets[category] = targets[category] || new Set()).add(ip);
    });
    const rows = Object.keys(trained)
      .map((category) => {
        const target = targets[category] ? [...targets[category]].sort((a, b) => a - b).join(" / ") : "—";
        return `<tr><th scope="row">${escapeHtml(t(`common.model.results.categories.${category}`, category))}</th>
          <td>${escapeHtml(target)}</td>
          <td>${escapeHtml(fmt(base?.[category]?.meanIP, 1))}</td>
          <td>${escapeHtml(fmt(trained[category].meanIP, 1))}</td></tr>`;
      })
      .join("");
    return `
      <h3>${escapeHtml(t("common.model.results.categoryTitle"))}</h3>
      <p class="docs-hint">${escapeHtml(t("common.model.results.categoryHint"))}</p>
      <div class="docs-table-wrap">
        <table class="training-table">
          <thead><tr>
            <th>${escapeHtml(t("common.model.results.category"))}</th>
            <th>${escapeHtml(t("common.model.results.target"))}</th>
            <th>${escapeHtml(t("common.model.base"))}</th>
            <th>${escapeHtml(t("common.model.trained"))}</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  /**
   * Learning curve: RMSE per epoch / generation, one line per data split.
   * Inline SVG, one y axis, legend + direct labels at the line ends, and a
   * crosshair tooltip with the values of every series at the hovered step.
   */
  function learningCurve(training) {
    const history = training.history || [];
    if (history.length < 2) return "";
    const stepKey = history[0].generation !== undefined ? "generation" : "epoch";
    const series = [
      { key: stepKey === "generation" ? "bestRmse" : "trainRmse", name: t("common.model.results.split.train"), cls: "s1" },
      { key: stepKey === "generation" ? "validationRmse" : "testRmse", name: t(`common.model.results.split.${stepKey === "generation" ? "validation" : "test"}`), cls: "s2" },
    ].filter((s) => history.some((h) => Number.isFinite(h[s.key])));

    const W = 640;
    const H = 260;
    const pad = { l: 52, r: 150, t: 14, b: 38 };
    const xs = history.map((h) => h[stepKey]);
    const all = series.flatMap((s) => history.map((h) => h[s.key]).filter(Number.isFinite));
    let yMin = Math.min(...all);
    let yMax = Math.max(...all);
    const span = yMax - yMin || 1;
    yMin = Math.max(0, yMin - span * 0.08);
    yMax += span * 0.08;
    const x = (v) => pad.l + ((v - xs[0]) / (xs[xs.length - 1] - xs[0] || 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

    const yTicks = niceTicks(yMin, yMax, 5);
    const xTicks = niceTicks(xs[0], xs[xs.length - 1], 6).filter((v) => Number.isInteger(v));
    const grid = yTicks
      .map((v) => `<line class="lc-grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v)}" y2="${y(v)}"/>
        <text class="lc-tick" x="${pad.l - 8}" y="${y(v) + 4}" text-anchor="end">${escapeHtml(fmt(v, span < 2 ? 2 : 1))}</text>`)
      .join("");
    const xAxis = xTicks
      .map((v) => `<text class="lc-tick" x="${x(v)}" y="${H - pad.b + 18}" text-anchor="middle">${v}</text>`)
      .join("");
    // Direct labels at the line ends, pushed apart when they would overlap.
    const ends = series.map((s) => {
      const pts = history.filter((h) => Number.isFinite(h[s.key]));
      const last = pts[pts.length - 1];
      return { s, pts, last, ly: y(last[s.key]) + 4 };
    });
    [...ends]
      .sort((a, b) => a.ly - b.ly)
      .forEach((end, i, sorted) => {
        if (i > 0 && end.ly - sorted[i - 1].ly < 14) end.ly = sorted[i - 1].ly + 14;
      });
    const lines = ends
      .map(({ s, pts, last, ly }) => {
        const d = pts.map((h, i) => `${i ? "L" : "M"}${x(h[stepKey]).toFixed(1)},${y(h[s.key]).toFixed(1)}`).join("");
        return `<path class="lc-line ${s.cls}" d="${d}"/>
          <text class="lc-end" x="${x(last[stepKey]) + 8}" y="${ly}">${escapeHtml(s.name)} ${escapeHtml(fmt(last[s.key]))}</text>`;
      })
      .join("");
    const legend = series
      .map((s) => `<span class="lc-legend-item"><i class="${s.cls}"></i>${escapeHtml(s.name)}</span>`)
      .join("");
    const xLabel = t(`common.model.results.${stepKey}`);
    // The model that was saved: best epoch of ANFIS (may precede the end of
    // the curve), last generation of the GA (elitism keeps the best).
    const chosen = training.bestEpoch ?? xs[xs.length - 1];
    const chosenMark =
      chosen !== xs[xs.length - 1]
        ? `<line class="lc-chosen" x1="${x(chosen)}" x2="${x(chosen)}" y1="${pad.t}" y2="${H - pad.b}"/>
           <text class="lc-chosen-label" x="${x(chosen) + 4}" y="${pad.t + 10}">${escapeHtml(t("common.model.results.chosen"))}</text>`
        : "";

    return `
      <h3>${escapeHtml(t("common.model.results.curveTitle"))}</h3>
      <div class="lc-legend">${legend}</div>
      <div class="lc-wrap" data-lc>
        <svg class="lc-svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeHtml(t("common.model.results.curveTitle"))}">
          ${grid}
          <line class="lc-axis" x1="${pad.l}" x2="${W - pad.r}" y1="${H - pad.b}" y2="${H - pad.b}"/>
          ${xAxis}
          <text class="lc-axis-label" x="${(pad.l + W - pad.r) / 2}" y="${H - 4}" text-anchor="middle">${escapeHtml(xLabel)}</text>
          <text class="lc-axis-label" x="12" y="${pad.t + 8}" text-anchor="start">RMSE</text>
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
        series: series.map(({ key, name, cls }) => ({ key, name, cls })),
        history,
        geom: { W, H, pad, x0: xs[0], x1: xs[xs.length - 1], yMin, yMax },
      }).replace(/</g, "\\u003c")}</script>`;
  }

  function niceTicks(min, max, count) {
    const span = max - min || 1;
    const step0 = span / count;
    const mag = 10 ** Math.floor(Math.log10(step0));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) || step0;
    const out = [];
    for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
    return out;
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
    const { W, H, pad, x0, x1, yMin, yMax } = geom;
    const x = (v) => pad.l + ((v - x0) / (x1 - x0 || 1)) * (W - pad.l - pad.r);
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (H - pad.t - pad.b);

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
        dots[i].setAttribute("cy", y(v));
        dots[i].setAttribute("visibility", "visible");
      });
      tip.innerHTML = `<strong>${escapeHtml(xLabel)} ${best[stepKey]}</strong>${series
        .map((s) => `<span><i class="${s.cls}"></i>${escapeHtml(s.name)}: ${escapeHtml(fmt(best[s.key]))}</span>`)
        .join("")}`;
      tip.hidden = false;
      const left = (cx / W) * rect.width;
      tip.style.left = `${Math.min(rect.width - tip.offsetWidth - 4, Math.max(4, left + 12))}px`;
      tip.style.top = "8px";
    };
    hit.addEventListener("pointermove", show);
    hit.addEventListener("pointerdown", show);
    hit.addEventListener("pointerleave", hide);
  }

  function renderResults(config, training) {
    const date = training.createdAt ? new Date(training.createdAt) : null;
    const locale = root.i18nHelper?.currentLang === "en" ? "en-GB" : "uk-UA";
    const samples = Object.entries(training.samples || {})
      .map(([split, n]) => `${t(`common.model.results.split.${split}`, split)}: ${n}`)
      .join(", ");
    const facts = [
      [t("common.model.results.method"), t(`${config.controller}.training.methodLong`)],
      [t("common.model.results.samples"), samples],
      [
        t(`common.model.results.${training.options ? "generations" : "epochs"}`),
        training.options
          ? `${training.options.generationsRun} (N₀ = ${training.options.initialPopulation}, N = ${training.options.populationSize}, ${training.chromosomeLength} ${t("common.model.results.genes")})`
          : `${training.epochs} (${t("common.model.results.bestEpoch")}: ${training.bestEpoch})`,
      ],
      [t("common.model.results.date"), date ? date.toLocaleString(locale) : "—"],
    ]
      .map(([k, v], i) => `<div${i === 0 ? ' class="is-wide"' : ""}><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`)
      .join("");
    return `
      <dl class="training-facts">${facts}</dl>
      <p class="docs-hint">${escapeHtml(t(`${config.controller}.training.note`))}</p>
      <h3>${escapeHtml(t("common.model.results.metricsTitle"))}</h3>
      ${metricsTable(training)}
      ${learningCurve(training)}
      ${categoryTable(training)}
    `;
  }

  async function openResults(config) {
    const training = await trainingOf(config.controller);
    if (!training) return;
    const modal = typeof root.ensureDocsModal === "function" ? root.ensureDocsModal() : null;
    if (!modal) return;
    const title = document.getElementById("docsModalTitle");
    const body = document.getElementById("docsModalBody");
    modal.dataset.kind = "training";
    title.textContent = t("common.model.results.title");
    body.innerHTML = renderResults(config, training);
    bindCurve(body);
    modal.hidden = false;
    document.body.classList.add("docs-modal-open");
    modal.querySelector(".docs-modal-close")?.focus();
    const rerender = () => {
      if (modal.hidden || modal.dataset.kind !== "training") return;
      title.textContent = t("common.model.results.title");
      body.innerHTML = renderResults(config, training);
      bindCurve(body);
    };
    root.addEventListener("languageChanged", rerender, { once: true });
  }

  root.fuzzyModel = {
    current,
    VARIANTS,
    local,
    query,
    storageKey,
    applyConfig,
    setupSwitch,
    availableVariants,
    trainingOf,
  };
})(typeof window !== "undefined" ? window : globalThis);

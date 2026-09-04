const graphPalette = ["#e74c3c", "#3498db", "#27ae60", "#8e44ad", "#1abc9c", "#f39c12"];

const INPUTS_STORAGE_KEY = "fuzzyControllerInputs";

function clampInputValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(100, Math.max(0, numeric));
}

function readPersistedInputs() {
  try {
    const raw = localStorage.getItem(INPUTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function persistControllerInputs(controller, values) {
  const all = readPersistedInputs();
  all[controller] = values;
  try {
    localStorage.setItem(INPUTS_STORAGE_KEY, JSON.stringify(all));
  } catch {
    // Ignore quota / private-mode failures.
  }
}

function restoreControllerInputs(config, applyInputValue) {
  const stored = readPersistedInputs()[config.controller];
  if (!stored || typeof stored !== "object") return;

  config.inputs.forEach((spec) => {
    const value = clampInputValue(stored[spec.key]);
    if (value === null) return;
    applyInputValue(spec, value);
  });
}

function buildMapFromSpecs(specs) {
  const data = {};
  specs.forEach((spec) => {
    data[spec.key] = Number(document.getElementById(spec.numberId).value);
  });
  return data;
}

function drawAxes(ctx, width, height, pad, axisLabels = null) {
  ctx.strokeStyle = "#bdc3c7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(pad, pad);
  ctx.stroke();

  const xTicks = [0, 20, 40, 60, 80, 100];
  const yTicks = [0, 0.5, 1];

  ctx.fillStyle = "#6b7280";
  ctx.font = "11px Arial";
  ctx.textAlign = "center";
  xTicks.forEach((tick) => {
    const x = pad + (tick / 100) * (width - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(x, height - pad);
    ctx.lineTo(x, height - pad + 4);
    ctx.stroke();
    ctx.fillText(formatNumber(tick, { maximumFractionDigits: 0 }), x, height - pad + 16);
  });

  ctx.textAlign = "right";
  yTicks.forEach((tick) => {
    const y = height - pad - tick * (height - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(pad - 4, y);
    ctx.lineTo(pad, y);
    ctx.stroke();
    ctx.fillText(formatNumber(tick, { maximumFractionDigits: 1 }), pad - 8, y + 4);
  });

  if (!axisLabels) return;

  ctx.fillStyle = "#4b5563";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  if (axisLabels.x) {
    ctx.fillText(axisLabels.x, width / 2, height - 4);
  }

  if (axisLabels.y) {
    ctx.save();
    ctx.translate(14, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText(axisLabels.y, 0, 0);
    ctx.restore();
  }
}

function termLabel(term) {
  if (window.i18nHelper) return window.i18nHelper.t(`common.terms.${term}`, term);
  return term;
}

function i18nText(key, fallback) {
  if (window.i18nHelper) return window.i18nHelper.t(key, fallback);
  return fallback;
}

function getCurrentLocale() {
  const lang = window.i18nHelper?.currentLang || "uk";
  return lang === "en" ? "en-US" : "uk-UA";
}

function formatNumber(value, options = {}) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "0";

  return new Intl.NumberFormat(getCurrentLocale(), options).format(numericValue);
}

function termColor(term, index) {
  const known = {
    low: "#e74c3c",
    medium: "#3498db",
    high: "#27ae60",
    veryLow: "#1abc9c",
    veryHigh: "#8e44ad",
    none: "#95a5a6",
    aggregated: "#2c3e50",
    Low: "#e74c3c",
    Medium: "#3498db",
    High: "#27ae60",
    VeryLow: "#1abc9c",
    VeryHigh: "#8e44ad",
  };
  return known[term] || graphPalette[index % graphPalette.length];
}

function hexToRgba(hex, alpha) {
  const raw = String(hex || "").replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((c) => c + c).join("") : raw;
  const n = Number.parseInt(full, 16);
  if (!Number.isFinite(n)) return `rgba(44, 62, 80, ${alpha})`;
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function dominantTermFromMemberships(memberships) {
  const entries = Object.entries(memberships || {});
  if (!entries.length) return null;
  let bestTerm = entries[0][0];
  let bestValue = Number(entries[0][1]) || 0;
  for (let i = 1; i < entries.length; i += 1) {
    const [term, value] = entries[i];
    const numeric = Number(value) || 0;
    if (numeric > bestValue) {
      bestTerm = term;
      bestValue = numeric;
    }
  }
  return bestValue > 0 ? bestTerm : null;
}

function fillTermArea(ctx, points, color, w, h, p) {
  if (!Array.isArray(points) || points.length < 2) return;
  const toX = (x) => p + (x / 100) * (w - 2 * p);
  const toY = (y) => h - p - y * (h - 2 * p);

  ctx.beginPath();
  ctx.moveTo(toX(points[0].x), toY(0));
  points.forEach((point) => {
    ctx.lineTo(toX(point.x), toY(point.y));
  });
  ctx.lineTo(toX(points[points.length - 1].x), toY(0));
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, 0.28);
  ctx.fill();
}

function ensureLegend(canvasId, terms, highlightTerm = null) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const container = canvas.closest(".graph-container");
  if (!container) return;

  let legend = container.querySelector(".graph-legend");
  if (!legend) {
    legend = document.createElement("div");
    legend.className = "graph-legend";
    container.appendChild(legend);
  }

  legend.innerHTML = "";
  terms.forEach((term, index) => {
    const item = document.createElement("span");
    item.className = "graph-legend-item";
    if (term === highlightTerm) item.classList.add("active");
    item.innerHTML = `<i style="background:${termColor(term, index)}"></i>${termLabel(term)}`;
    legend.appendChild(item);
  });
}

function getGlobalTooltip() {
  let tooltip = document.getElementById("globalGraphTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "globalGraphTooltip";
    tooltip.className = "graph-tooltip";
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function findNearestPoint(points, x) {
  let best = points[0];
  let minDist = Math.abs(points[0].x - x);
  for (let i = 1; i < points.length; i += 1) {
    const d = Math.abs(points[i].x - x);
    if (d < minDist) {
      minDist = d;
      best = points[i];
    }
  }
  return best;
}

function findPeakPoint(points) {
  if (!Array.isArray(points) || points.length === 0) return null;

  let maxY = -Infinity;
  points.forEach((p) => {
    if (p.y > maxY) maxY = p.y;
  });

  const peakPoints = points.filter((p) => Math.abs(p.y - maxY) < 1e-9);
  if (!peakPoints.length) return points[0];

  const avgX = peakPoints.reduce((sum, p) => sum + p.x, 0) / peakPoints.length;
  return { x: avgX, y: maxY };
}

function drawCurveGraph(canvasId, termSeries, currentValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null);

  const terms = Object.keys(termSeries);
  const highlightTerm = options.highlightTerm || null;
  if (highlightTerm && termSeries[highlightTerm]) {
    fillTermArea(
      ctx,
      termSeries[highlightTerm],
      termColor(highlightTerm, terms.indexOf(highlightTerm)),
      w,
      h,
      p
    );
  }

  terms.forEach((term, idx) => {
    const points = termSeries[term];
    const color = termColor(term, idx);

    ctx.strokeStyle = color;
    ctx.lineWidth = term === highlightTerm ? 3 : 2;
    ctx.beginPath();

    points.forEach((point, i) => {
      const x = p + (point.x / 100) * (w - 2 * p);
      const y = h - p - point.y * (h - 2 * p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    if (options.showPeakLabels) {
      const peak = findPeakPoint(points);
      if (peak) {
        const labelX = p + (peak.x / 100) * (w - 2 * p);
        const labelY = h - p - peak.y * (h - 2 * p);
        ctx.fillStyle = color;
        ctx.font = "11px Arial";
        ctx.textAlign = "center";
        ctx.fillText(termLabel(term), labelX, Math.max(14, labelY - 18));
      }
    }
  });

  if (currentValue !== null && currentValue !== undefined) {
    const vx = p + (currentValue / 100) * (w - 2 * p);
    ctx.strokeStyle = "#111";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx, p);
    ctx.lineTo(vx, h - p);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ensureLegend(canvasId, terms, highlightTerm);
}

function drawAggregatedSetGraph(canvasId, points, resultValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || !Array.isArray(points) || !points.length) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;
  const fill = "rgba(44, 62, 80, 0.28)";
  const stroke = "#2c3e50";

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null);

  const toX = (x) => p + (x / 100) * (w - 2 * p);
  const toY = (y) => h - p - y * (h - 2 * p);

  ctx.beginPath();
  ctx.moveTo(toX(points[0].x), toY(0));
  points.forEach((point) => {
    ctx.lineTo(toX(point.x), toY(point.y));
  });
  ctx.lineTo(toX(points[points.length - 1].x), toY(0));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, i) => {
    const x = toX(point.x);
    const y = toY(point.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();

  if (resultValue !== null && resultValue !== undefined) {
    const vx = toX(resultValue);
    ctx.strokeStyle = "#111";
    ctx.setLineDash([5, 5]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(vx, p);
    ctx.lineTo(vx, h - p);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#111";
    ctx.font = "bold 12px Arial";
    ctx.textAlign = "left";
    ctx.fillText(
      formatNumber(resultValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      Math.min(w - 70, vx + 8),
      p + 12
    );
  }

  ensureLegend(canvasId, ["aggregated"]);
}

function drawSingletonGraph(canvasId, singletonValues, ruleOutputs, resultValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null);

  const terms = Object.keys(singletonValues);
  const highlightTerm = options.highlightTerm || null;
  terms.forEach((term, idx) => {
    const x = singletonValues[term];
    const activation = ruleOutputs?.[term] || 0;
    const px = p + (x / 100) * (w - 2 * p);
    const color = termColor(term, idx);

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(px, h - p);
    ctx.lineTo(px, h - p - (h - 2 * p) * 0.12);
    ctx.stroke();
    ctx.globalAlpha = 1;

    if (term === highlightTerm) {
      ctx.fillStyle = hexToRgba(color, 0.2);
      ctx.fillRect(px - 10, p, 20, h - 2 * p);
    }

    if (activation > 0) {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2 + activation * 8 + (term === highlightTerm ? 2 : 0);
      ctx.beginPath();
      ctx.moveTo(px, h - p);
      ctx.lineTo(px, h - p - activation * (h - 2 * p));
      ctx.stroke();
    }
  });

  if (Number.isFinite(Number(resultValue))) {
    const rx = p + (resultValue / 100) * (w - 2 * p);
    ctx.strokeStyle = "#111";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(rx, p);
    ctx.lineTo(rx, h - p);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = "#111";
    ctx.font = "bold 12px Arial";
    ctx.fillText(
      formatNumber(resultValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      Math.min(w - 70, rx + 8),
      p + 12
    );
  }

  ensureLegend(canvasId, terms, highlightTerm);
}

function renderMembership(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  Object.entries(data || {}).forEach(([term, value]) => {
    const item = document.createElement("div");
    item.className = "membership-item";
    item.innerHTML = `
      <span class="membership-label">${termLabel(term)}</span>
      <span class="membership-value">${formatNumber(value, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })}</span>
    `;
    container.appendChild(item);
  });
}

function getGraphCanvasId(graphConfig) {
  if (typeof graphConfig === "string") return graphConfig;
  return graphConfig.canvasId;
}

function getGraphOptions(graphConfig) {
  if (typeof graphConfig === "string") return {};

  const xLabel = graphConfig.axisLabels?.xKey
    ? i18nText(graphConfig.axisLabels.xKey, graphConfig.axisLabels.xFallback || "")
    : graphConfig.axisLabels?.x;
  const yLabel = graphConfig.axisLabels?.yKey
    ? i18nText(graphConfig.axisLabels.yKey, graphConfig.axisLabels.yFallback || "")
    : graphConfig.axisLabels?.y;

  return {
    axisLabels: xLabel || yLabel ? { x: xLabel, y: yLabel } : null,
    showPeakLabels: Boolean(graphConfig.showPeakLabels),
  };
}

function bindCanvasTooltip(canvasId, state, getTooltipModel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tooltip = getGlobalTooltip();

  const hide = () => {
    tooltip.classList.remove("visible");
  };

  canvas.addEventListener("mouseleave", hide);
  canvas.addEventListener("mousemove", (event) => {
    const model = getTooltipModel();
    if (!model) return;

    const rect = canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const pad = 40;
    if (px < pad || px > canvas.width - pad || py < pad || py > canvas.height - pad) {
      hide();
      return;
    }

    const x = ((px - pad) / (canvas.width - 2 * pad)) * 100;
    const formattedX = formatNumber(x, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const membershipsLabel = i18nText("common.tooltip.memberships");

    if (model.type === "curve") {
      const rows = Object.entries(model.series).map(([term, points], idx) => {
        const point = findNearestPoint(points, x);
        return {
          term,
          value: point.y,
          color: termColor(term, idx),
        };
      });

      rows.sort((a, b) => b.value - a.value);
      tooltip.innerHTML = `
        <strong>${i18nText("common.tooltip.xAxis")}: ${formattedX}</strong>
        <div>${membershipsLabel}</div>
        <hr />
        ${rows
          .map(
            (r) =>
              `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${r.color};margin-right:6px"></span>${termLabel(r.term)}: ${formatNumber(r.value, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>`
          )
          .join("")}
      `;
    } else {
      const rows = Object.entries(model.activations).map(([term, value], idx) => ({
        term,
        value,
        color: termColor(term, idx),
      }));

      rows.sort((a, b) => b.value - a.value);
      tooltip.innerHTML = `
        <strong>${i18nText("common.tooltip.outputAxis")}: ${Number.isFinite(Number(model.resultValue)) ? formatNumber(model.resultValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "--"}</strong>
        <div>${membershipsLabel}</div>
        <hr />
        ${rows
          .map(
            (r) =>
              `<div><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${r.color};margin-right:6px"></span>${termLabel(r.term)}: ${formatNumber(r.value, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</div>`
          )
          .join("")}
      `;
    }

    tooltip.style.left = `${event.clientX}px`;
    tooltip.style.top = `${event.clientY}px`;
    tooltip.classList.add("visible");
  });
}

function stickyLabelKey(spec) {
  if (spec.labelKey) return spec.labelKey;
  const original = document.querySelector(`label[for="${spec.sliderId}"]`);
  const key = original?.getAttribute("data-i18n") || "";
  return key.replace(".inputs.", ".membership.");
}

function stickyShortLabel(spec, fullLabel) {
  if (spec.shortLabel) return spec.shortLabel;
  const match = String(fullLabel || "").match(/\(([A-Za-z])\)/);
  if (match) return match[1].toUpperCase();
  return String(spec.key || "?").slice(0, 1).toUpperCase();
}

function pageI18nKey(config) {
  return {
    trust: "index",
    security: "security",
    intrusion: "intrusion",
  }[config.controller] || "index";
}

function stickyTitleKey(config) {
  if (config.titleKey) return config.titleKey;
  return `${pageI18nKey(config)}.stickyTitle`;
}

function stickyNameKey(spec, config) {
  if (spec.stickyNameKey) return spec.stickyNameKey;
  return `${pageI18nKey(config)}.sticky.inputs.${spec.key}`;
}

function refreshStickyCopy(config) {
  const titleEl = document.getElementById("stickyPageTitle");
  if (titleEl) {
    titleEl.textContent = i18nText(stickyTitleKey(config));
  }

  config.inputs.forEach((spec) => {
    const label = document.querySelector(`label[for="${spec.sliderId}Sticky"]`);
    if (!label) return;
    const full = i18nText(stickyLabelKey(spec), spec.key);
    const letter = stickyShortLabel(spec, full);
    const name = i18nText(stickyNameKey(spec, config), full);
    const letterEl = label.querySelector(".sticky-input-letter");
    const nameEl = label.querySelector(".sticky-input-name");
    if (letterEl) letterEl.textContent = letter;
    if (nameEl) nameEl.textContent = name;
    label.setAttribute("title", full);
    label.setAttribute("aria-label", `${letter}: ${name}`);
  });
}

function hasFiredOutput(data) {
  return Boolean(data) && data.noRuleFired !== true && Number.isFinite(Number(data.value));
}

function noRuleFiredLabel() {
  return i18nText("common.noRuleFired", "No rule fired");
}

function noRuleFiredHint() {
  return i18nText(
    "common.noRuleFiredHint",
    "The current inputs do not match any rule, so the output cannot be calculated."
  );
}

function markUncoveredTip(el, on) {
  if (!el) return;
  if (on) {
    el.dataset.uncoveredTip = "1";
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-describedby", "uncoveredHelpTooltip");
  } else {
    delete el.dataset.uncoveredTip;
    el.removeAttribute("tabindex");
    el.removeAttribute("aria-describedby");
  }
}

function uncoveredHosts(valueEl, termEl) {
  const parents = [
    valueEl?.closest(".result-item"),
    termEl?.closest(".result-item"),
    valueEl?.closest(".sticky-inputs-result"),
    termEl?.closest(".sticky-inputs-result"),
  ].filter(Boolean);
  if (parents.length) return [...new Set(parents)];
  return [valueEl, termEl].filter(Boolean);
}

function getUncoveredTooltip() {
  let tip = document.getElementById("uncoveredHelpTooltip");
  if (tip) return tip;

  tip = document.createElement("div");
  tip.id = "uncoveredHelpTooltip";
  tip.className = "help-tooltip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  return tip;
}

function positionUncoveredTooltip(tip, event, anchor) {
  const rect = anchor.getBoundingClientRect();
  const x = event?.clientX ?? rect.left + rect.width / 2;
  const showBelow = rect.top < 140;
  tip.classList.toggle("is-below", showBelow);
  tip.style.left = `${Math.min(window.innerWidth - 20, Math.max(20, x))}px`;
  tip.style.top = `${showBelow ? rect.bottom : rect.top}px`;
}

function setupUncoveredTips() {
  if (document.documentElement.dataset.uncoveredTips === "1") return;
  document.documentElement.dataset.uncoveredTips = "1";

  const tip = getUncoveredTooltip();
  let active = null;

  const hide = () => {
    active = null;
    tip.classList.remove("visible");
  };

  const show = (event) => {
    const anchor = event.target.closest?.("[data-uncovered-tip]");
    if (!anchor) return;
    active = anchor;
    tip.textContent = noRuleFiredHint();
    positionUncoveredTooltip(tip, event, anchor);
    tip.classList.add("visible");
  };

  document.addEventListener("mouseover", (event) => {
    if (event.target.closest?.("[data-uncovered-tip]")) show(event);
  });
  document.addEventListener("mouseout", (event) => {
    const from = event.target.closest?.("[data-uncovered-tip]");
    const to = event.relatedTarget?.closest?.("[data-uncovered-tip]");
    if (from && from !== to) hide();
  });
  document.addEventListener("mousemove", (event) => {
    if (!active) return;
    positionUncoveredTooltip(tip, event, active);
  });
  document.addEventListener("focusin", (event) => {
    if (event.target.closest?.("[data-uncovered-tip]")) show(event);
  });
  document.addEventListener("focusout", (event) => {
    if (event.target.closest?.("[data-uncovered-tip]")) hide();
  });
}

function setOutputText(valueEl, termEl, data) {
  if (!valueEl || !termEl) return;
  setupUncoveredTips();

  const hosts = uncoveredHosts(valueEl, termEl);
  const uncovered = Boolean(data) && !hasFiredOutput(data);

  if (!hasFiredOutput(data)) {
    valueEl.classList.add("is-uncovered");
    termEl.classList.add("is-uncovered");
    valueEl.textContent = "--";
    termEl.textContent = data ? noRuleFiredLabel() : "--";
    hosts.forEach((el) => markUncoveredTip(el, uncovered));
    return;
  }

  valueEl.classList.remove("is-uncovered");
  termEl.classList.remove("is-uncovered");
  valueEl.textContent = formatNumber(data.value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  termEl.textContent = termLabel(data.dominantTerm);
  hosts.forEach((el) => markUncoveredTip(el, false));
  const tip = document.getElementById("uncoveredHelpTooltip");
  if (tip) tip.classList.remove("visible");
}

function updateStickyResult(data) {
  setOutputText(
    document.getElementById("stickyResultValue"),
    document.getElementById("stickyResultTerm"),
    data
  );
}

function setupStickyInputs(config, { applyInputValue, recalc }) {
  const inputSection = document.querySelector(".input-section");
  if (!inputSection || document.getElementById("stickyInputs")) return;

  const bar = document.createElement("aside");
  bar.id = "stickyInputs";
  bar.className = "sticky-inputs";
  bar.setAttribute("aria-hidden", "true");
  bar.innerHTML = `
    <div class="sticky-inputs-inner">
      <div class="sticky-inputs-head">
        <p class="sticky-inputs-title" id="stickyPageTitle"></p>
      </div>
      <div class="sticky-inputs-controls"></div>
      <div class="sticky-inputs-result">
        <span class="sticky-inputs-result-label" data-i18n="common.sticky.result"></span>
        <span class="sticky-inputs-result-value" id="stickyResultValue">--</span>
        <span class="sticky-inputs-result-term" id="stickyResultTerm">--</span>
      </div>
    </div>
  `;

  const controls = bar.querySelector(".sticky-inputs-controls");
  config.inputs.forEach((spec) => {
    const current = document.getElementById(spec.numberId)?.value ?? "50";
    const group = document.createElement("div");
    group.className = "sticky-input-group";
    group.innerHTML = `
      <label class="sticky-input-label" for="${spec.sliderId}Sticky">
        <span class="sticky-input-letter"></span>
        <span class="sticky-input-name"></span>
      </label>
      <input type="range" id="${spec.sliderId}Sticky" min="0" max="100" step="0.1" value="${current}" />
      <input type="number" id="${spec.numberId}Sticky" min="0" max="100" step="0.1" value="${current}" />
    `;
    controls.appendChild(group);

    const slider = group.querySelector(`#${spec.sliderId}Sticky`);
    const number = group.querySelector(`#${spec.numberId}Sticky`);

    slider.addEventListener("input", () => {
      applyInputValue(spec, Number(slider.value));
      recalc();
    });
    number.addEventListener("input", () => {
      const val = Math.min(100, Math.max(0, Number(number.value)));
      applyInputValue(spec, val);
      recalc();
    });
  });

  document.body.appendChild(bar);
  if (window.i18nHelper) window.i18nHelper.applyTranslations(bar);
  refreshStickyCopy(config);

  const observer = new IntersectionObserver(
    ([entry]) => {
      const show = !entry.isIntersecting;
      bar.classList.toggle("is-visible", show);
      bar.setAttribute("aria-hidden", show ? "false" : "true");
    },
    { threshold: 0 }
  );
  observer.observe(inputSection);
}

function setupTooltips(config, state) {
  Object.entries(config.graphs.inputs).forEach(([key, canvasId]) => {
    bindCanvasTooltip(getGraphCanvasId(canvasId), state, () => {
      if (!state.mfData) return null;
      return {
        type: "curve",
        series: state.mfData.inputs[key],
      };
    });
  });

  const outputCanvas = config.graphs.output.canvasId;
  bindCanvasTooltip(outputCanvas, state, () => {
    if (!state.mfData || !state.result) return null;

    if (state.mfData.meta?.singletonValues) {
      return {
        type: "singleton",
        activations: state.result.ruleOutputs || {},
        resultValue: state.result.value,
      };
    }

    return {
      type: "curve",
      series: state.mfData.output[config.graphs.output.key],
    };
  });

  if (config.graphs.aggregated?.canvasId) {
    bindCanvasTooltip(config.graphs.aggregated.canvasId, state, () => {
      if (!state.result?.aggregatedOutput) return null;
      return {
        type: "curve",
        series: { aggregated: state.result.aggregatedOutput },
      };
    });
  }
}

function normalizeCalculateResult(result, payload) {
  return {
    value: result.value == null ? null : parseFloat(result.value.toFixed(2)),
    dominantTerm: result.dominantTerm ?? null,
    noRuleFired: Boolean(result.noRuleFired),
    membershipData: result.membershipData,
    ruleOutputs: result.ruleOutputs ?? null,
    aggregatedOutput: result.aggregatedOutput || null,
    inputs: payload,
  };
}

async function calculateController(controller, payload) {
  const local = window.fuzzyControllers?.[controller];
  if (local) {
    if (!local.validate(payload)) return null;
    return normalizeCalculateResult(local.calculate(payload), payload);
  }

  const response = await fetch(`/api/controllers/${controller}/calculate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) return null;
  return response.json();
}

async function loadMembershipFunctions(controller) {
  const local = window.fuzzyControllers?.[controller];
  if (local) {
    return local.membershipFunctions();
  }

  const response = await fetch(`/api/controllers/${controller}/membership-functions`);
  if (!response.ok) return null;
  return response.json();
}

async function createFuzzyPage(config) {
  if (window.i18nHelper) {
    await window.i18nHelper.init();
    window.i18nHelper.bindSwitcher();
  }

  const state = {
    mfData: null,
    result: null,
  };

  const applyInputValue = (spec, value) => {
    if (spec.sliderId) {
      const slider = document.getElementById(spec.sliderId);
      if (slider) slider.value = value;
      const stickySlider = document.getElementById(`${spec.sliderId}Sticky`);
      if (stickySlider) stickySlider.value = value;
    }
    const numberEl = document.getElementById(spec.numberId);
    if (numberEl) numberEl.value = value;
    const stickyNumber = document.getElementById(`${spec.numberId}Sticky`);
    if (stickyNumber) stickyNumber.value = value;
    if (spec.valueId) {
      const valueEl = document.getElementById(spec.valueId);
      if (valueEl) {
        valueEl.textContent = formatNumber(value, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        });
      }
    }
    persistControllerInputs(config.controller, buildMapFromSpecs(config.inputs));
  };

  const recalc = async () => {
    const payload = buildMapFromSpecs(config.inputs);
    const data = await calculateController(config.controller, payload);
    if (!data) return;

    state.result = data;

    setOutputText(
      document.getElementById(config.output.valueId),
      document.getElementById(config.output.termId),
      data
    );
    updateStickyResult(data);

    Object.entries(config.membership).forEach(([key, containerId]) => {
      renderMembership(containerId, data.membershipData[key]);
    });

    drawAll();
  };

  const drawAll = () => {
    if (!state.mfData || !state.result) return;

    Object.entries(config.graphs.inputs).forEach(([key, canvasId]) => {
      drawCurveGraph(
        getGraphCanvasId(canvasId),
        state.mfData.inputs[key],
        buildMapFromSpecs(config.inputs)[key],
        {
          ...getGraphOptions(canvasId),
          highlightTerm: dominantTermFromMemberships(state.result.membershipData?.[key]),
        }
      );
    });

    const outputKey = config.graphs.output.key;
    const outputCanvasId = config.graphs.output.canvasId;
    const outputSeries = state.mfData.output?.[outputKey];
    const hasOutputCurves = outputSeries && Object.keys(outputSeries).length > 0;
    const outputHighlight = hasFiredOutput(state.result) ? state.result.dominantTerm : null;

    if (hasOutputCurves) {
      drawCurveGraph(
        outputCanvasId,
        outputSeries,
        hasFiredOutput(state.result) ? state.result.value : null,
        {
          ...getGraphOptions(config.graphs.output),
          highlightTerm: outputHighlight,
        }
      );
    } else if (state.mfData.meta?.singletonValues) {
      drawSingletonGraph(
        outputCanvasId,
        state.mfData.meta.singletonValues,
        state.result.ruleOutputs,
        hasFiredOutput(state.result) ? state.result.value : null,
        {
          ...getGraphOptions(config.graphs.output),
          highlightTerm: outputHighlight,
        }
      );
    } else {
      drawCurveGraph(
        outputCanvasId,
        state.mfData.output[outputKey],
        hasFiredOutput(state.result) ? state.result.value : null,
        {
          ...getGraphOptions(config.graphs.output),
          highlightTerm: outputHighlight,
        }
      );
    }

    if (config.graphs.aggregated?.canvasId && state.result.aggregatedOutput) {
      drawAggregatedSetGraph(
        config.graphs.aggregated.canvasId,
        state.result.aggregatedOutput,
        state.result.value,
        getGraphOptions(config.graphs.aggregated)
      );
    }
  };

  config.inputs.forEach((spec) => {
    const numberEl = document.getElementById(spec.numberId);
    numberEl.addEventListener("input", () => {
      const val = Math.min(100, Math.max(0, Number(numberEl.value)));
      applyInputValue(spec, val);
      recalc();
    });

    if (spec.sliderId) {
      const sliderEl = document.getElementById(spec.sliderId);
      sliderEl.addEventListener("input", () => {
        applyInputValue(spec, Number(sliderEl.value));
        recalc();
      });
    }
  });

  setupStickyInputs(config, { applyInputValue, recalc });
  restoreControllerInputs(config, applyInputValue);
  if (window.setupDocsModals) window.setupDocsModals(config.controller);

  state.mfData = await loadMembershipFunctions(config.controller);

  setupTooltips(config, state);

  window.addEventListener("languageChanged", () => {
    refreshStickyCopy(config);
    if (!state.result) return;
    setOutputText(
      document.getElementById(config.output.valueId),
      document.getElementById(config.output.termId),
      state.result
    );
    updateStickyResult(state.result);
    Object.entries(config.membership).forEach(([key, containerId]) => {
      renderMembership(containerId, state.result.membershipData[key]);
    });
    drawAll();
  });

  await recalc();
}

window.createFuzzyPage = createFuzzyPage;

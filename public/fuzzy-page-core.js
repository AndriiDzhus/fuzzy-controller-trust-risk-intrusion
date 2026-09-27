const INPUTS_STORAGE_KEY = "fuzzyControllerInputs";

function inputSpecMeta(spec = {}) {
  return {
    min: Number.isFinite(Number(spec.min)) ? Number(spec.min) : 0,
    max: Number.isFinite(Number(spec.max)) ? Number(spec.max) : 100,
    step: Number.isFinite(Number(spec.step)) ? Number(spec.step) : 0.1,
    digits: Number.isFinite(Number(spec.digits)) ? Number(spec.digits) : 1,
  };
}

function clampInputValue(value, spec = {}) {
  const numeric = typeof value === "string" ? parseDecimalInput(value) : Number(value);
  if (numeric === null || !Number.isFinite(numeric)) return null;
  const { min, max } = inputSpecMeta(spec);
  return Math.min(max, Math.max(min, numeric));
}

// Same rule as toNumber() in src/controllers/index.js: a plain decimal with
// a dot or a comma ("0.25", "0,25", ".5"). Partial input such as "", "0," or
// "-" gives null, so the field is left alone while the user is typing.
const DECIMAL_INPUT_PATTERN = /^[+-]?(\d+([.,]\d*)?|[.,]\d+)([eE][+-]?\d+)?$/;

function parseDecimalInput(text) {
  const trimmed = String(text ?? "").trim();
  if (!DECIMAL_INPUT_PATTERN.test(trimmed)) return null;
  const value = Number(trimmed.replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

/** Text for a value field: locale decimal separator, no grouping. */
function formatFieldValue(value) {
  return formatNumber(value, { maximumFractionDigits: 6, useGrouping: false });
}

// Last valid value of every input on the page, by input key. The text fields
// can hold partial input while the user types, so calculations read from here.
const pageInputValues = {};

function formatInputValue(value, spec = {}) {
  const { digits } = inputSpecMeta(spec);
  return formatNumber(value, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

const canvasXView = new WeakMap();

function resolveXMax(options = {}) {
  const xMax = Number(options.xMax);
  return Number.isFinite(xMax) && xMax > 0 ? xMax : 100;
}

function xZoomStep(domainMax) {
  if (domainMax <= 0.05) return 0.001;
  if (domainMax <= 1) return 0.05;
  if (domainMax <= 15) return 0.5;
  if (domainMax <= 40) return 1;
  if (domainMax <= 100) return 5;
  if (domainMax <= 250) return 10;
  return 50;
}

function minXViewSpan(domainMax) {
  const step = xZoomStep(domainMax);
  return Math.min(domainMax, Math.max(step * 2, Number((domainMax * 0.04).toFixed(10))));
}

function snapXViewValue(value, domainMax) {
  const step = xZoomStep(domainMax);
  return Number((Math.round(value / step) * step).toFixed(10));
}

function readCanvasXView(canvas, domainMax) {
  const stored = canvas ? canvasXView.get(canvas) : null;
  if (!stored) return { viewMin: 0, viewMax: domainMax };
  return { viewMin: stored.viewMin, viewMax: stored.viewMax };
}

function isXViewZoomed(view, domainMax) {
  return view.viewMin > 1e-12 || domainMax - view.viewMax > 1e-12;
}

function clearCanvasXView(canvas) {
  if (canvas) canvasXView.delete(canvas);
}

function writeCanvasXView(canvas, viewMin, viewMax, domainMax) {
  const next = { viewMin, viewMax };
  if (!isXViewZoomed(next, domainMax)) canvasXView.delete(canvas);
  else canvasXView.set(canvas, next);
}

function resolveXView(options = {}, canvas = null) {
  const domainMax = resolveXMax(options);
  const stored = readCanvasXView(canvas, domainMax);
  if (canvas) canvas.dataset.xDomainMax = String(domainMax);
  return {
    xMin: stored.viewMin,
    xMax: stored.viewMax,
    domainMax,
    domainMin: 0,
  };
}

function plotXRange(view) {
  if (view && typeof view === "object") {
    const xMin = Number.isFinite(Number(view.xMin)) ? Number(view.xMin) : 0;
    const xMax = Number.isFinite(Number(view.xMax)) ? Number(view.xMax) : 100;
    return { xMin, xMax };
  }
  const xMax = Number.isFinite(Number(view)) && Number(view) > 0 ? Number(view) : 100;
  return { xMin: 0, xMax };
}

function inXView(x, view) {
  const { xMin, xMax } = plotXRange(view);
  return Number(x) >= xMin - 1e-9 && Number(x) <= xMax + 1e-9;
}

function knownDomainTicks(xMax) {
  if (Math.abs(xMax - 100) < 1e-9) return [0, 20, 40, 60, 80, 100];
  if (Math.abs(xMax - 200) < 1e-9) return [0, 40, 80, 120, 160, 200];
  if (Math.abs(xMax - 250) < 1e-9) return [0, 50, 100, 150, 200, 250];
  if (Math.abs(xMax - 40) < 1e-9) return [0, 10, 20, 30, 40];
  if (Math.abs(xMax - 15) < 1e-9) return [0, 3, 6, 9, 12, 15];
  if (Math.abs(xMax - 12) < 1e-9) return [0, 2, 4, 6, 8, 10, 12];
  if (Math.abs(xMax - 10) < 1e-9) return [0, 2, 4, 6, 8, 10];
  if (Math.abs(xMax - 3000) < 1e-9) return [0, 500, 1000, 1500, 2000, 2500, 3000];
  if (Math.abs(xMax - 1) < 1e-9) return [0, 0.2, 0.4, 0.6, 0.8, 1];
  return null;
}

function niceXTicks(xMin, xMax) {
  const span = xMax - xMin;
  if (span <= 0) return [xMin, xMax];
  const raw = span / 5;
  const mag = Math.pow(10, Math.floor(Math.log10(raw || 1e-12)));
  const n = raw / mag;
  const step = n >= 5 ? 5 * mag : n >= 2 ? 2 * mag : mag;
  const start = Math.ceil((xMin - 1e-12) / step) * step;
  const ticks = [];
  for (let t = start; t <= xMax + step * 1e-9; t += step) {
    ticks.push(Number(t.toFixed(10)));
  }
  if (!ticks.length || Math.abs(ticks[0] - xMin) > 1e-9) ticks.unshift(xMin);
  if (Math.abs(ticks[ticks.length - 1] - xMax) > 1e-9) ticks.push(xMax);
  return ticks;
}

function xTickValues(view) {
  const { xMin, xMax } = plotXRange(view);
  const domainMax = (view && typeof view === "object" && Number(view.domainMax)) || xMax;
  const unzoomed = Math.abs(xMin) < 1e-12 && Math.abs(xMax - domainMax) < 1e-9;
  if (unzoomed) {
    const known = knownDomainTicks(xMax);
    if (known) return known;
    const steps = xMax <= 0.1 ? 5 : 4;
    return Array.from({ length: steps + 1 }, (_, i) => Number(((xMax * i) / steps).toFixed(10)));
  }
  return niceXTicks(xMin, xMax);
}

function viewSpan(view) {
  const { xMin, xMax } = plotXRange(view);
  return xMax - xMin;
}

function formatAxisTick(tick, view) {
  const span = viewSpan(view);
  if (span <= 0.1) return formatNumber(tick, { minimumFractionDigits: 2, maximumFractionDigits: 3 });
  if (span <= 1) return formatNumber(tick, { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  if (span < 20) return formatNumber(tick, { maximumFractionDigits: 1 });
  return formatNumber(tick, { maximumFractionDigits: 0 });
}

function xFormatOptions(view) {
  const span = viewSpan(view);
  if (span <= 0.1) return { minimumFractionDigits: 3, maximumFractionDigits: 3 };
  if (span <= 1) return { minimumFractionDigits: 2, maximumFractionDigits: 2 };
  if (span <= 12) return { minimumFractionDigits: 1, maximumFractionDigits: 2 };
  return { minimumFractionDigits: 0, maximumFractionDigits: 1 };
}

function toPlotX(x, width, pad, view) {
  const { xMin, xMax } = plotXRange(view);
  const span = xMax - xMin || 1;
  return pad + ((x - xMin) / span) * (width - 2 * pad);
}

function clipToPlot(ctx, width, height, pad) {
  ctx.beginPath();
  ctx.rect(pad, pad, width - 2 * pad, height - 2 * pad);
  ctx.clip();
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
    const value = clampInputValue(stored[spec.key], spec);
    if (value === null) return;
    applyInputValue(spec, value);
  });
}

function buildMapFromSpecs(specs) {
  const data = {};
  specs.forEach((spec) => {
    const stored = pageInputValues[spec.key];
    data[spec.key] = Number.isFinite(stored)
      ? stored
      : parseDecimalInput(document.getElementById(spec.numberId)?.value);
  });
  return data;
}

/**
 * Wires a text value field: accepts a dot or a comma, recalculates on every
 * complete number, never rewrites the field while it is being edited, and
 * normalises / clamps the text when the field loses focus or on Enter.
 */
function bindValueField(field, spec, { applyInputValue, recalc }) {
  field.addEventListener("input", () => {
    const value = parseDecimalInput(field.value);
    const { min, max } = inputSpecMeta(spec);
    const valid = value !== null && value >= min && value <= max;
    field.classList.toggle("is-invalid", !valid && field.value.trim() !== "");
    if (!valid) return;
    applyInputValue(spec, value, field);
    recalc();
  });

  const commit = () => {
    const clamped = clampInputValue(field.value, spec);
    field.classList.remove("is-invalid");
    if (clamped === null) {
      // Not a number: restore the last valid value.
      field.value = formatFieldValue(pageInputValues[spec.key]);
      return;
    }
    const changed = clamped !== pageInputValues[spec.key];
    applyInputValue(spec, clamped);
    if (changed) recalc();
  };
  field.addEventListener("change", commit);
  field.addEventListener("keydown", (event) => {
    if (event.key === "Enter") commit();
  });
}

function refreshValueFields(config) {
  config.inputs.forEach((spec) => {
    const value = pageInputValues[spec.key];
    if (!Number.isFinite(value)) return;
    [spec.numberId, `${spec.numberId}Sticky`].forEach((id) => {
      const field = document.getElementById(id);
      if (field && document.activeElement !== field) field.value = formatFieldValue(value);
    });
  });
}

function drawPlotGrid(ctx, width, height, pad, view = 100) {
  const { xMin, xMax } = plotXRange(view);
  const xTicks = xTickValues(view).filter((tick) => tick > xMin + 1e-12 && tick < xMax - 1e-12);
  const yTicks = [0.25, 0.5, 0.75, 1];

  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 4]);

  xTicks.forEach((tick) => {
    const x = toPlotX(tick, width, pad, view);
    ctx.beginPath();
    ctx.moveTo(x, pad);
    ctx.lineTo(x, height - pad);
    ctx.stroke();
  });

  yTicks.forEach((tick) => {
    const y = height - pad - tick * (height - 2 * pad);
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  });

  ctx.restore();
}

function drawAxes(ctx, width, height, pad, axisLabels = null, view = 100) {
  drawPlotGrid(ctx, width, height, pad, view);

  ctx.strokeStyle = "#bdc3c7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(pad, pad);
  ctx.stroke();

  const xTicks = xTickValues(view);
  const yTicks = [0, 0.5, 1];

  ctx.fillStyle = "#6b7280";
  ctx.font = "12px Arial";
  ctx.textAlign = "center";
  xTicks.forEach((tick) => {
    const x = toPlotX(tick, width, pad, view);
    ctx.beginPath();
    ctx.moveTo(x, height - pad);
    ctx.lineTo(x, height - pad + 4);
    ctx.stroke();
    ctx.fillText(formatAxisTick(tick, view), x, height - pad + 16);
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

  ctx.fillStyle = "#374151";
  ctx.font = "italic 15px Arial";
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  if (axisLabels.x) {
    ctx.fillText(axisLabels.x, width / 2, height - 6);
  }

  if (axisLabels.y) {
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(axisLabels.y, 8, pad + 8);
  }
  ctx.textBaseline = "alphabetic";
}

// Ukrainian term labels agree in grammatical gender with their variable, as in
// the assignment rule tables (e.g. feminine inputs vs. masculine outputs).
// config.termForms maps a variable key to a form ("f" feminine, "n" neuter);
// the forms live in i18n common.termForms.<form>.<term> and fall back to
// common.terms (masculine in Ukrainian, and the English labels).
const pageTermForms = { byVar: {}, outputKey: null };

function configureTermForms(config) {
  pageTermForms.byVar = { ...(config.termForms || {}) };
  pageHigherIsBetter.clear();
  (config.higherIsBetter || []).forEach((key) => pageHigherIsBetter.add(key));
  pageTermForms.outputKey = config.graphs?.output?.key || null;
}

function termLabel(term, varKey) {
  if (!window.i18nHelper) return term;
  const base = window.i18nHelper.t(`common.terms.${term}`, term);
  const form = varKey ? pageTermForms.byVar[varKey] : null;
  if (!form) return base;
  return window.i18nHelper.t(`common.termForms.${form}.${term}`, base);
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

// Variables where a higher value is the favourable end of the scale
// (config.higherIsBetter, e.g. the trust index); their colors are mirrored.
const pageHigherIsBetter = new Set();

function termColor(term, siblingTerms = [], varKey = null) {
  if (typeof window.resolveTermColor === "function") {
    return window.resolveTermColor(term, siblingTerms, {
      higherIsBetter: Boolean(varKey) && pageHigherIsBetter.has(varKey),
    });
  }
  return "#3498db";
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

function fillTermArea(ctx, points, color, w, h, p, alpha = 0.28, view = 100) {
  if (!Array.isArray(points) || points.length < 2) return;
  const toX = (x) => toPlotX(x, w, p, view);
  const toY = (y) => h - p - y * (h - 2 * p);

  ctx.beginPath();
  ctx.moveTo(toX(points[0].x), toY(0));
  points.forEach((point) => {
    ctx.lineTo(toX(point.x), toY(point.y));
  });
  ctx.lineTo(toX(points[points.length - 1].x), toY(0));
  ctx.closePath();
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.fill();
}

function strokePlotCurve(ctx, points, w, h, p, view = 100) {
  if (!Array.isArray(points) || !points.length) return;
  const toX = (x) => toPlotX(x, w, p, view);
  const toY = (y) => h - p - y * (h - 2 * p);
  ctx.beginPath();
  points.forEach((point, i) => {
    const x = toX(point.x);
    const y = toY(point.y);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function clipTermSeries(termSeries, activations) {
  const clipped = {};
  Object.entries(termSeries || {}).forEach(([term, points]) => {
    const alpha = Number(activations?.[term]) || 0;
    if (alpha <= 1e-6 || !Array.isArray(points)) return;
    clipped[term] = points.map((point) => ({ x: point.x, y: Math.min(Number(point.y) || 0, alpha) }));
  });
  return clipped;
}

function ensureLegend(canvasId) {
  const canvas = document.getElementById(canvasId);
  const legend = canvas?.closest(".graph-container")?.querySelector(".graph-legend");
  if (legend) legend.remove();
}

function syncAggregatedGraphKey(canvas) {
  canvas?.closest(".graph-container")?.querySelector(".graph-key")?.remove();
}

const PLOT_PAD = 46;
const SINGLETON_SNAP = 7;

function getGlobalTooltip() {
  let tooltip = document.getElementById("globalGraphTooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "globalGraphTooltip";
    tooltip.className = "graph-tooltip";
    tooltip.setAttribute("role", "tooltip");
    document.body.appendChild(tooltip);
  }
  return tooltip;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapMathLetters(escapedHtml) {
  return String(escapedHtml).replace(/[αμ]/g, (ch) => `<span class="sym-greek">${ch}</span>`);
}

function interpolateSeriesY(points, x) {
  if (!Array.isArray(points) || !points.length) return 0;
  if (x <= points[0].x) return Number(points[0].y) || 0;
  const last = points[points.length - 1];
  if (x >= last.x) return Number(last.y) || 0;

  for (let i = 1; i < points.length; i += 1) {
    const left = points[i - 1];
    const right = points[i];
    if (x <= right.x) {
      const span = right.x - left.x;
      if (span <= 0) return Number(right.y) || 0;
      const t = (x - left.x) / span;
      return (Number(left.y) || 0) + t * ((Number(right.y) || 0) - (Number(left.y) || 0));
    }
  }
  return Number(last.y) || 0;
}

function getPlotGeometry(canvas) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.clientWidth / canvas.width;
  const scaleY = canvas.clientHeight / canvas.height;
  const left = canvas.clientLeft;
  const top = canvas.clientTop;
  return {
    rect,
    plotLeft: left + PLOT_PAD * scaleX,
    plotRight: left + (canvas.width - PLOT_PAD) * scaleX,
    plotTop: top + PLOT_PAD * scaleY,
    plotBottom: top + (canvas.height - PLOT_PAD) * scaleY,
  };
}

function readCursorX(canvas, event, view = 100) {
  const geo = getPlotGeometry(canvas);
  const cssX = event.clientX - geo.rect.left;
  const cssY = event.clientY - geo.rect.top;
  const inPlot =
    cssX >= geo.plotLeft &&
    cssX <= geo.plotRight &&
    cssY >= geo.plotTop &&
    cssY <= geo.plotBottom;
  if (!inPlot) return { inPlot: false, x: null, geo, cssX };
  const { xMin, xMax } = plotXRange(view);
  const span = geo.plotRight - geo.plotLeft;
  const x = span <= 0 ? xMin : xMin + ((cssX - geo.plotLeft) / span) * (xMax - xMin);
  return { inPlot: true, x: Math.min(xMax, Math.max(xMin, x)), geo, cssX };
}

function graphTitle(canvas) {
  return canvas.closest(".graph-container")?.querySelector("h4")?.textContent?.trim() || "";
}

function ensureGraphProbe(canvas) {
  const container = canvas.closest(".graph-container");
  if (!container) return null;
  let probe = container.querySelector(".graph-probe");
  if (!probe) {
    probe = document.createElement("div");
    probe.className = "graph-probe";
    probe.hidden = true;
    container.appendChild(probe);
  }
  return probe;
}

function hideGraphProbe(canvas) {
  const probe = canvas.closest(".graph-container")?.querySelector(".graph-probe");
  if (probe) probe.hidden = true;
}

function showGraphProbe(canvas, geo, cssX) {
  const probe = ensureGraphProbe(canvas);
  const container = canvas.closest(".graph-container");
  if (!probe || !container) return;
  const cRect = container.getBoundingClientRect();
  probe.hidden = false;
  probe.style.left = `${geo.rect.left - cRect.left + cssX}px`;
  probe.style.top = `${geo.rect.top - cRect.top + geo.plotTop}px`;
  probe.style.height = `${Math.max(0, geo.plotBottom - geo.plotTop)}px`;
}

function muRowHtml(term, value, color, { dominant = false, zero = false, varKey = null } = {}) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  const classes = ["tt-row"];
  if (dominant) classes.push("is-dominant");
  if (zero) classes.push("is-zero");
  return `<div class="${classes.join(" ")}">
    <i style="background:${color}"></i>
    <span class="tt-term">${escapeHtml(termLabel(term, varKey))}</span>
    <span class="tt-mu">${formatNumber(value, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
    <span class="tt-bar"><span style="width:${pct}%"></span></span>
  </div>`;
}

function formatCursorX(model, x) {
  const symbol = model.xLabel || "x";
  return `${escapeHtml(symbol)} = ${formatNumber(x, xFormatOptions(resolveXView(model)))}`;
}

function snapCursorX(x, model) {
  const view = resolveXView(model);
  const span = view.xMax - view.xMin;
  const snapStep = span <= 0.1 ? 0.001 : span <= 10 ? 0.01 : span >= 500 ? 1 : 0.1;
  const candidates = [];
  if (Number.isFinite(Number(model.currentValue))) candidates.push(Number(model.currentValue));
  if (Number.isFinite(Number(model.resultValue))) candidates.push(Number(model.resultValue));
  Object.values(model.singletonValues || {}).forEach((value) => {
    if (Number.isFinite(Number(value))) candidates.push(Number(value));
  });

  let best = x;
  let bestDist = 0.004 * span;
  candidates.forEach((value) => {
    const dist = Math.abs(value - x);
    if (dist < bestDist) {
      best = value;
      bestDist = dist;
    }
  });
  let snapped = Number((Math.round(best / snapStep) * snapStep).toFixed(10));
  return Math.min(view.xMax, Math.max(view.xMin, snapped));
}

function tooltipFooter(model) {
  if (model.kind === "input" && Number.isFinite(Number(model.currentValue))) {
    return `<div class="tt-foot">${i18nText("common.tooltip.current")}: ${formatNumber(
      Number(model.currentValue),
      xFormatOptions(resolveXView(model))
    )}</div>`;
  }

  if (!Number.isFinite(Number(model.resultValue))) return "";
  const term = model.resultTerm
    ? ` · ${escapeHtml(termLabel(model.resultTerm, model.varKey))}`
    : "";
  return `<div class="tt-foot">${i18nText("common.tooltip.result")}: ${formatNumber(
    Number(model.resultValue),
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}${term}</div>`;
}

function buildCurveTooltip(model, x) {
  const terms = Object.keys(model.series || {});
  const rows = terms.map((term) => ({
    term,
    value: interpolateSeriesY(model.series[term], x),
    color: termColor(term, terms, model.varKey),
  }));
  const max = rows.reduce((best, row) => Math.max(best, row.value), 0);
  const caption =
    model.kind === "aggregated"
      ? i18nText("common.tooltip.clippedMu", i18nText("common.tooltip.aggregatedMu"))
      : i18nText("common.tooltip.memberships");

  return `
    <div class="tt-head">${escapeHtml(model.title || "")}</div>
    <div class="tt-x">${formatCursorX(model, x)}</div>
    <div class="tt-cap">${escapeHtml(caption)}</div>
    ${rows
      .map((row) =>
        muRowHtml(row.term, row.value, row.color, {
          dominant: max > 0.001 && row.value === max,
          zero: row.value < 0.005,
          varKey: model.varKey,
        })
      )
      .join("")}
    ${tooltipFooter(model)}
  `;
}

function buildSingletonTooltip(model, x) {
  const entries = Object.entries(model.singletonValues || {});
  const terms = entries.map(([term]) => term);
  let nearest = null;
  entries.forEach(([term, sx]) => {
    const dist = Math.abs(Number(sx) - x);
    if (!nearest || dist < nearest.dist) {
      nearest = { term, dist, color: termColor(term, terms, model.varKey) };
    }
  });
  const onSpike = Boolean(nearest && nearest.dist <= SINGLETON_SNAP);
  const rows = entries.map(([term, sx]) => ({
    term,
    value: Number(model.activations?.[term]) || 0,
    color: termColor(term, terms, model.varKey),
    x: Number(sx),
  }));
  const max = rows.reduce((best, row) => Math.max(best, row.value), 0);
  const status = onSpike
    ? `${i18nText("common.tooltip.singletonAt")}: ${termLabel(nearest.term, model.varKey)}`
    : i18nText("common.tooltip.notSingleton");

  return `
    <div class="tt-head">${escapeHtml(model.title || "")}</div>
    <div class="tt-x">${formatCursorX(model, x)}</div>
    <div class="tt-cap">${escapeHtml(status)}</div>
    ${rows
      .map((row) =>
        muRowHtml(row.term, row.value, row.color, {
          dominant: onSpike ? row.term === nearest.term : max > 0 && row.value === max,
          zero: row.value <= 0,
          varKey: model.varKey,
        })
      )
      .join("")}
    ${tooltipFooter(model)}
  `;
}

function placeTooltip(tooltip, event) {
  tooltip.classList.add("visible");
  const width = tooltip.offsetWidth || 220;
  const height = tooltip.offsetHeight || 80;
  const margin = 12;
  const below = event.clientY - margin < height + 8;
  tooltip.classList.toggle("is-below", below);
  const half = width / 2;
  const left = Math.min(window.innerWidth - margin - half, Math.max(margin + half, event.clientX));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${event.clientY}px`;
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
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = PLOT_PAD;
  const view = resolveXView(options, canvas);

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null, view);

  const terms = Object.keys(termSeries);
  const highlightTerm = options.highlightTerm || null;
  ctx.save();
  clipToPlot(ctx, w, h, p);
  if (highlightTerm && termSeries[highlightTerm]) {
    fillTermArea(
      ctx,
      termSeries[highlightTerm],
      termColor(highlightTerm, terms, options.varKey),
      w,
      h,
      p,
      0.28,
      view
    );
  }

  terms.forEach((term) => {
    const points = termSeries[term];
    const color = termColor(term, terms, options.varKey);

    ctx.strokeStyle = color;
    ctx.lineWidth = term === highlightTerm ? 3 : 2;
    ctx.beginPath();

    points.forEach((point, i) => {
      const x = toPlotX(point.x, w, p, view);
      const y = h - p - point.y * (h - 2 * p);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
  });
  ctx.restore();

  terms.forEach((term) => {
    if (!options.showPeakLabels) return;
    const points = termSeries[term];
    const peak = findPeakPoint(points);
    if (!peak || !inXView(peak.x, view)) return;
    const color = termColor(term, terms, options.varKey);
    const labelX = toPlotX(peak.x, w, p, view);
    const labelY = h - p - peak.y * (h - 2 * p);
    ctx.fillStyle = color;
    ctx.font = "11px Arial";
    ctx.textAlign = "center";
    ctx.fillText(termLabel(term, options.varKey), labelX, Math.max(14, labelY - 18));
  });

  if (currentValue !== null && currentValue !== undefined && inXView(currentValue, view)) {
    if (options.showResultLabel) {
      drawResultMarker(ctx, w, h, p, currentValue, view);
    } else {
      const vx = toPlotX(currentValue, w, p, view);
      ctx.strokeStyle = "#111";
      ctx.setLineDash([5, 5]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(vx, p);
      ctx.lineTo(vx, h - p);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  ensureLegend(canvasId, terms, highlightTerm);
}

function drawResultMarker(ctx, w, h, p, resultValue, view = 100) {
  if (resultValue === null || resultValue === undefined || !Number.isFinite(Number(resultValue))) return;
  if (!inXView(resultValue, view)) return;
  const vx = toPlotX(Number(resultValue), w, p, view);
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

function drawTermPeakLabel(ctx, w, h, p, term, points, color, view = 100, varKey = null) {
  const peak = findPeakPoint(points);
  if (!peak || peak.y <= 0.04 || !inXView(peak.x, view)) return;
  const labelX = toPlotX(peak.x, w, p, view);
  const labelY = h - p - peak.y * (h - 2 * p);
  ctx.fillStyle = color;
  ctx.font = "11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(termLabel(term, varKey), labelX, Math.max(14, labelY - 16));
}

function drawAggregatedSetGraph(canvasId, points, resultValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = PLOT_PAD;
  const view = resolveXView(options, canvas);
  const termSeries = options.termSeries || null;
  const showAcc = options.showAccumulation !== false;
  const showDefuzz = options.showDefuzzification !== false;
  const highlightTerm = options.highlightTerm || null;
  const clipped = showAcc ? clipTermSeries(termSeries, options.activations) : {};
  const clippedTerms = Object.keys(clipped);

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null, view);

  const allTerms = Object.keys(termSeries || {});
  ctx.save();
  clipToPlot(ctx, w, h, p);
  if (showDefuzz && termSeries) {
    if (highlightTerm && termSeries[highlightTerm]) {
      fillTermArea(
        ctx,
        termSeries[highlightTerm],
        termColor(highlightTerm, allTerms, options.varKey),
        w,
        h,
        p,
        0.16,
        view
      );
    }
    Object.entries(termSeries).forEach(([term, series]) => {
      ctx.strokeStyle = termColor(term, allTerms, options.varKey);
      ctx.lineWidth = term === highlightTerm ? 3 : 2;
      ctx.globalAlpha = showAcc ? 0.5 : 1;
      strokePlotCurve(ctx, series, w, h, p, view);
      ctx.globalAlpha = 1;
    });
  }

  if (showAcc) {
    clippedTerms.forEach((term) => {
      const color = termColor(term, allTerms, options.varKey);
      fillTermArea(ctx, clipped[term], color, w, h, p, 0.22, view);
      ctx.strokeStyle = hexToRgba(color, 0.9);
      ctx.lineWidth = 1.6;
      strokePlotCurve(ctx, clipped[term], w, h, p, view);
    });

    if (Array.isArray(points) && points.length) {
      fillTermArea(ctx, points, "#2c3e50", w, h, p, 0.1, view);
      ctx.strokeStyle = "#1a252f";
      ctx.lineWidth = 2.4;
      strokePlotCurve(ctx, points, w, h, p, view);
    }
  }
  ctx.restore();

  if (showDefuzz && termSeries && options.showPeakLabels) {
    Object.entries(termSeries).forEach(([term, series]) => {
      drawTermPeakLabel(ctx, w, h, p, term, series, termColor(term, allTerms, options.varKey), view, options.varKey);
    });
  }
  if (showAcc && options.showPeakLabels && !showDefuzz) {
    clippedTerms.forEach((term) => {
      drawTermPeakLabel(ctx, w, h, p, term, clipped[term], termColor(term, allTerms, options.varKey), view, options.varKey);
    });
  }

  if (showDefuzz) drawResultMarker(ctx, w, h, p, resultValue, view);
  ensureLegend(canvasId, ["aggregated"]);
  syncAggregatedGraphKey(canvas);
}

function drawSingletonGraph(canvasId, singletonValues, ruleOutputs, resultValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = PLOT_PAD;
  const view = resolveXView(options, canvas);

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null, view);

  const terms = Object.keys(singletonValues);
  const highlightTerm = options.highlightTerm || null;
  const showAcc = options.showAccumulation !== false;
  const showDefuzz = options.showDefuzzification !== false;
  const plotH = h - 2 * p;
  terms.forEach((term) => {
    const x = singletonValues[term];
    if (!inXView(x, view)) return;
    const activation = ruleOutputs?.[term] || 0;
    const px = toPlotX(x, w, p, view);
    const color = termColor(term, terms, options.varKey);
    const fired = activation > 0;
    const top = h - p - plotH;

    if (showDefuzz && term === highlightTerm) {
      ctx.fillStyle = hexToRgba(color, 0.2);
      ctx.fillRect(px - 10, p, 20, plotH);
    }

    ctx.strokeStyle = color;
    ctx.globalAlpha = showAcc ? (fired ? 1 : 0.55) : 0.28;
    ctx.lineWidth = showAcc
      ? fired
        ? 2 + activation * 4 + (term === highlightTerm ? 2 : 0)
        : 2
      : 2;
    ctx.beginPath();
    ctx.moveTo(px, h - p);
    ctx.lineTo(px, showAcc ? top : h - p - plotH * 0.18);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  if (showDefuzz) drawResultMarker(ctx, w, h, p, resultValue, view);

  ensureLegend(canvasId, terms, highlightTerm);
}

function renderMembership(containerId, data, varKey = null) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";
  appendMembershipItems(container, data, varKey);
}

function appendMembershipItems(container, data, varKey = null) {
  const entries = Object.entries(data || {});
  const maxValue = entries.reduce((best, [, value]) => Math.max(best, Number(value) || 0), 0);

  const terms = entries.map(([term]) => term);

  entries.forEach(([term, value]) => {
    const numeric = Number(value) || 0;
    const color = termColor(term, terms, varKey);
    const item = document.createElement("div");
    item.className = "membership-item";
    if (maxValue > 0 && numeric === maxValue) item.classList.add("active");
    item.style.borderLeftColor = color;
    item.innerHTML = `
      <i class="membership-swatch" style="background:${color}"></i>
      <span class="membership-label">${termLabel(term, varKey)}</span>
      <span class="membership-value">${formatNumber(value, {
        minimumFractionDigits: 3,
        maximumFractionDigits: 3,
      })}</span>
    `;
    container.appendChild(item);
  });
}

function completeTermMap(termSeries, values) {
  const keys = Object.keys(termSeries || {}).length
    ? Object.keys(termSeries)
    : Object.keys(values || {});
  const out = {};
  keys.forEach((term) => {
    out[term] = Number(values?.[term]) || 0;
  });
  return out;
}

function renderControllerMemberships(config, result, mfData) {
  if (!result) return;
  Object.entries(config.membership || {}).forEach(([key, containerId]) => {
    renderMembership(containerId, result.membershipData?.[key], key);
  });
  const activationsId = config.graphs.aggregated?.membershipId;
  if (!activationsId) return;
  const termSeries = mfData?.output?.[config.graphs.output.key];
  renderMembership(
    activationsId,
    completeTermMap(termSeries, result.ruleOutputs),
    config.graphs.output.key
  );
}

const RULE_FIRE_EPS = 0.001;

function formatMembership(value) {
  return formatNumber(value, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function outputTermOrder(config, mfData) {
  if (mfData?.meta?.singletonValues) return Object.keys(mfData.meta.singletonValues);
  const key = config.graphs?.output?.key;
  return Object.keys(mfData?.output?.[key] || {});
}

function isProductRule(rule) {
  return rule?.tnorm === "product";
}

function ruleStrengthSymbol(rule) {
  // Mamdani: firing level α = min μ. Sugeno (thesis, section 3): weight w = Π μ.
  return isProductRule(rule) ? "w" : "α";
}

function renderRuleRow(rule, maxAlpha) {
  const isMax = maxAlpha >= RULE_FIRE_EPS && rule.alpha >= maxAlpha - 1e-9;
  const idle = rule.alpha < RULE_FIRE_EPS;
  const product = isProductRule(rule);
  const conditions = (rule.conditions || [])
    .map((cond, index) => {
      const isMin = !product && Math.abs(Number(cond.mu) - Number(rule.alpha)) <= 1e-9;
      const join = index
        ? `<span class="rule-op" aria-hidden="true">${product ? "·" : "∧"}</span>`
        : "";
      return `${join}<span class="rule-cond${isMin ? " is-min" : ""}">
        <span class="rule-cond-sym">${escapeHtml(cond.symbol)}</span>
        <span class="rule-cond-term">${escapeHtml(termLabel(cond.term, cond.key))}</span>
        <span class="rule-cond-mu">${formatMembership(cond.mu)}</span>
      </span>`;
    })
    .join("");

  return `<li class="rule-row${isMax ? " is-max" : ""}${idle ? " is-idle" : ""}">
    <span class="rule-index">#${rule.index}</span>
    <div class="rule-conds">${conditions}</div>
    <span class="rule-alpha"><span class="sym-greek">${ruleStrengthSymbol(rule)}</span> = ${formatMembership(rule.alpha)}</span>
  </li>`;
}

function renderRuleEvaluations(config, result, mfData) {
  const root = document.getElementById(config.rules?.containerId);
  if (!root) return;

  const rules = result?.ruleEvaluations || [];
  const showIdle = root.dataset.showIdle === "1";
  const productRules = isProductRule(rules[0]);
  const clipLabel = productRules
    ? i18nText("common.pipeline.rulesWeight", "вага правила")
    : mfData?.meta?.singletonValues
      ? i18nText("common.pipeline.rulesSingleton", "висота синглтона")
      : i18nText("common.pipeline.rulesClip", "висота зрізу");

  if (!rules.length) {
    root.innerHTML = `<p class="rule-eval-empty">${escapeHtml(
      i18nText("common.pipeline.rulesEmpty", "Жодне правило не спрацювало.")
    )}</p>`;
    return;
  }

  const grouped = new Map();
  rules.forEach((rule) => {
    if (!grouped.has(rule.out)) grouped.set(rule.out, []);
    grouped.get(rule.out).push(rule);
  });

  const groupOrder = [];
  outputTermOrder(config, mfData).forEach((term) => {
    if (grouped.has(term) && !groupOrder.includes(term)) groupOrder.push(term);
  });
  grouped.forEach((_, term) => {
    if (!groupOrder.includes(term)) groupOrder.push(term);
  });

  const cards = [];
  groupOrder.forEach((out) => {
    const items = grouped
      .get(out)
      .slice()
      .sort((a, b) => b.alpha - a.alpha || a.index - b.index);
    const maxAlpha = items.reduce((best, rule) => Math.max(best, Number(rule.alpha) || 0), 0);
    const visible = items.filter((rule) => showIdle || rule.alpha >= RULE_FIRE_EPS);
    if (!visible.length) return;
    const color = termColor(out, outputTermOrder(config, mfData), config.graphs?.output?.key);
    cards.push(`<article class="rule-group" style="border-top-color:${color}">
      <header class="rule-group-head">
        <span class="rule-group-term">${escapeHtml(termLabel(out, config.graphs?.output?.key))}</span>
        <span class="rule-group-max">${
          productRules && items.length === 1
            ? `<span class="sym-greek">w</span>`
            : `max <span class="sym-greek">${ruleStrengthSymbol(items[0])}</span>`
        } = ${formatMembership(maxAlpha)} (${escapeHtml(clipLabel)})</span>
      </header>
      <ul class="rule-group-list">${visible.map((rule) => renderRuleRow(rule, maxAlpha)).join("")}</ul>
    </article>`);
  });

  const idleCount = rules.filter((rule) => rule.alpha < RULE_FIRE_EPS).length;
  let footer = "";
  if (!cards.length) {
    footer = `<p class="rule-eval-empty">${escapeHtml(
      i18nText("common.pipeline.rulesEmpty", "Жодне правило не спрацювало.")
    )}</p>`;
  }
  if (idleCount) {
    const toggleLabel = showIdle
      ? i18nText("common.pipeline.rulesHideIdle", "Сховати неактивні")
      : i18nText("common.pipeline.rulesShowIdle", "Показати неактивні ({n})").replace(
          "{n}",
          String(idleCount)
        );
    footer += `<button type="button" class="rule-eval-toggle" data-rule-idle-toggle>${escapeHtml(
      toggleLabel
    )}</button>`;
  }

  root.innerHTML = `${cards.length ? `<div class="rule-eval-grid">${cards.join("")}</div>` : ""}${footer}`;
}

// Sugeno layer 5: SR = Σ w̄ᵢ·cᵢ written out with the active rules only.
function renderSugenoSum(config, result) {
  const el = document.getElementById(config.output?.formulaId);
  if (!el) return;
  const items = (result?.weightedConsequents || []).filter(
    (item) => Number(item.normalizedWeight) >= RULE_FIRE_EPS
  );
  if (!hasFiredOutput(result) || !items.length) {
    el.innerHTML = "";
    return;
  }
  const symbol = escapeHtml(config.output.symbol || "y*");
  const w = `<span class="sym-greek">w̄</span>`;
  const terms = items
    .map((item) => `${formatMembership(item.normalizedWeight)}·${formatNumber(item.consequent)}`)
    .join(" + ");
  const label = escapeHtml(i18nText("common.pipeline.sugenoSumLabel", "Розрахунок:"));
  el.innerHTML = `<span class="sugeno-sum-label">${label}</span> ${symbol} = Σ ${w}<sub>i</sub>·c<sub>i</sub> = ${terms} = <strong>${formatNumber(
    result.value,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 }
  )}</strong>`;
}

function bindRuleEvalToggle(config, state) {
  const root = document.getElementById(config.rules?.containerId);
  if (!root || root.dataset.bound) return;
  root.dataset.bound = "1";
  root.addEventListener("click", (event) => {
    if (!event.target.closest("[data-rule-idle-toggle]")) return;
    root.dataset.showIdle = root.dataset.showIdle === "1" ? "0" : "1";
    renderRuleEvaluations(config, state.result, state.mfData);
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
    xMax: Number.isFinite(Number(graphConfig.xMax)) ? Number(graphConfig.xMax) : 100,
  };
}

function bindCanvasTooltip(canvasId, getTooltipModel) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const tooltip = getGlobalTooltip();
  let frame = 0;
  let lastPoint = null;

  const hide = () => {
    tooltip.classList.remove("visible");
    hideGraphProbe(canvas);
    lastPoint = null;
  };

  const render = () => {
    frame = 0;
    if (!lastPoint) return;
    const model = getTooltipModel();
    if (!model) {
      hide();
      return;
    }

    const cursor = readCursorX(canvas, lastPoint, resolveXView(model, canvas));
    if (!cursor.inPlot) {
      hide();
      return;
    }

    model.title = graphTitle(canvas);
    const x = snapCursorX(cursor.x, model);
    tooltip.innerHTML =
      model.type === "singleton"
        ? buildSingletonTooltip(model, x)
        : buildCurveTooltip(model, x);
    showGraphProbe(canvas, cursor.geo, cursor.cssX);
    placeTooltip(tooltip, lastPoint);
  };

  canvas.addEventListener("mouseleave", hide);
  canvas.addEventListener("mousemove", (event) => {
    lastPoint = { clientX: event.clientX, clientY: event.clientY };
    if (frame) return;
    frame = requestAnimationFrame(render);
  });
}

function stickyLabelKey(spec) {
  if (spec.labelKey) return spec.labelKey;
  const original = document.querySelector(`label[for="${spec.sliderId}"]`);
  const key = original?.getAttribute("data-i18n") || "";
  return key.replace(".inputs.", ".membership.");
}

// Symbol exactly as written in the main input label: "ER", "TP", "Lat", "Rate".
function stickyShortLabel(spec, fullLabel) {
  if (spec.shortLabel) return spec.shortLabel;
  const match = String(fullLabel || "").match(/\(([A-Za-z]{1,4})\)/);
  if (match) return match[1];
  return String(spec.key || "?").slice(0, 1).toUpperCase();
}

// Variable name as in the main input label, without symbol, range and colon:
// "Transmit Power (TP) (0–40 dBm):" -> "Transmit Power".
function stickyInputName(fullLabel) {
  return String(fullLabel || "")
    .replace(/\s*\(.*$/, "")
    .replace(/:\s*$/, "")
    .trim();
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
    const name = spec.stickyNameKey
      ? i18nText(spec.stickyNameKey, stickyInputName(full))
      : stickyInputName(full) || full;
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
    el.setAttribute("aria-describedby", "helpTooltip");
  } else {
    delete el.dataset.uncoveredTip;
    el.removeAttribute("tabindex");
    if (!el.dataset.termTip) el.removeAttribute("aria-describedby");
  }
}

function markTermTip(el, on) {
  if (!el) return;
  if (on) {
    el.dataset.termTip = "1";
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-describedby", "helpTooltip");
  } else {
    delete el.dataset.termTip;
    if (!el.dataset.uncoveredTip) {
      el.removeAttribute("tabindex");
      el.removeAttribute("aria-describedby");
    }
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

function helpTipAnchor(event) {
  return event.target.closest?.("[data-uncovered-tip]") || event.target.closest?.("[data-term-tip]") || null;
}

function helpTipText(anchor) {
  if (anchor?.dataset.uncoveredTip) return noRuleFiredHint();
  return i18nText("common.tooltip.dominantTerm");
}

function getHelpTooltip() {
  let tip = document.getElementById("helpTooltip") || document.getElementById("uncoveredHelpTooltip");
  if (tip) {
    tip.id = "helpTooltip";
    return tip;
  }

  tip = document.createElement("div");
  tip.id = "helpTooltip";
  tip.className = "help-tooltip";
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  return tip;
}

function positionHelpTooltip(tip, event, anchor) {
  const rect = anchor.getBoundingClientRect();
  const x = event?.clientX ?? rect.left + rect.width / 2;
  const showBelow = rect.top < 140;
  tip.classList.toggle("is-below", showBelow);
  tip.style.left = `${Math.min(window.innerWidth - 20, Math.max(20, x))}px`;
  tip.style.top = `${showBelow ? rect.bottom : rect.top}px`;
}

function setupHelpTips() {
  if (document.documentElement.dataset.helpTips === "1") return;
  document.documentElement.dataset.helpTips = "1";

  const tip = getHelpTooltip();
  let active = null;

  const hide = () => {
    active = null;
    tip.classList.remove("visible");
  };

  const show = (event) => {
    const anchor = helpTipAnchor(event);
    if (!anchor) return;
    active = anchor;
    tip.textContent = helpTipText(anchor);
    positionHelpTooltip(tip, event, anchor);
    tip.classList.add("visible");
  };

  document.addEventListener("mouseover", (event) => {
    if (helpTipAnchor(event)) show(event);
  });
  document.addEventListener("mouseout", (event) => {
    const from = helpTipAnchor(event);
    const to = event.relatedTarget ? helpTipAnchor({ target: event.relatedTarget }) : null;
    if (from && from !== to) hide();
  });
  document.addEventListener("mousemove", (event) => {
    if (!active) return;
    positionHelpTooltip(tip, event, active);
  });
  document.addEventListener("focusin", (event) => {
    if (helpTipAnchor(event)) show(event);
  });
  document.addEventListener("focusout", (event) => {
    if (helpTipAnchor(event)) hide();
  });
}

function outputTermNames(data) {
  const memberships = data?.membershipData || {};
  const block = memberships.trustIndex || memberships.risk || memberships.intrusion;
  return block ? Object.keys(block) : [];
}

function setOutputText(valueEl, termEl, data) {
  if (!valueEl || !termEl) return;
  setupHelpTips();

  const hosts = uncoveredHosts(valueEl, termEl);
  const uncovered = Boolean(data) && !hasFiredOutput(data);

  if (!hasFiredOutput(data)) {
    valueEl.classList.add("is-uncovered");
    termEl.classList.add("is-uncovered");
    valueEl.textContent = "--";
    termEl.textContent = data ? noRuleFiredLabel() : "--";
    termEl.style.color = "";
    hosts.forEach((el) => markUncoveredTip(el, uncovered));
    markTermTip(termEl, false);
    return;
  }

  valueEl.classList.remove("is-uncovered");
  termEl.classList.remove("is-uncovered");
  valueEl.textContent = formatNumber(data.value, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  termEl.textContent = termLabel(data.dominantTerm, pageTermForms.outputKey);
  termEl.style.color = termColor(data.dominantTerm, outputTermNames(data), pageTermForms.outputKey);
  hosts.forEach((el) => markUncoveredTip(el, false));
  markTermTip(termEl, true);
  const tip = document.getElementById("helpTooltip") || document.getElementById("uncoveredHelpTooltip");
  if (tip) tip.classList.remove("visible");
}

function updateStickyResult(data) {
  setOutputText(
    document.getElementById("stickyResultValue"),
    document.getElementById("stickyResultTerm"),
    data
  );
}

function joinPrettyList(items) {
  const labels = items.filter(Boolean);
  if (labels.length <= 1) return labels[0] || "";
  const head = labels.slice(0, -1).join(", ");
  const last = labels[labels.length - 1];
  const lang = window.i18nHelper?.currentLang || "uk";
  return lang === "en" ? `${head} and ${last}` : `${head} і ${last}`;
}

function inputMuLabels(config) {
  return Object.values(config.graphs?.inputs || {})
    .map((graph) => getGraphOptions(graph).axisLabels?.y || "")
    .filter(Boolean);
}

function outputMuLabel(config) {
  const source = config.graphs?.aggregated || config.graphs?.output;
  return getGraphOptions(source).axisLabels?.y || "μ(y)";
}

function outputAxisSymbol(config) {
  const source = config.graphs?.aggregated || config.graphs?.output;
  return getGraphOptions(source).axisLabels?.x || "y";
}

function withOutputVar(text, config) {
  return String(text || "").replaceAll("{var}", outputAxisSymbol(config));
}

function muRefCaption(variable, config) {
  if (variable === "x") {
    const vars = joinPrettyList(inputMuLabels(config));
    return i18nText("common.tooltip.muX", "").replaceAll("{vars}", vars || "μ(x)");
  }
  return i18nText("common.tooltip.muOut", "").replaceAll("{var}", variable || outputMuLabel(config));
}

function glossaryCaption(key) {
  return i18nText(`common.glossary.${key}.hint`, "");
}

function glossaryLabel(key) {
  return i18nText(`common.glossary.${key}.label`, key);
}

function hintRefCaption(el, config) {
  if (el.dataset.tip) return glossaryCaption(el.dataset.tip);
  return muRefCaption(el.dataset.mu || "x", config);
}

function showMuRefTooltip(el, event, config) {
  const tooltip = getGlobalTooltip();
  tooltip.innerHTML = `
    <div class="tt-head">${escapeHtml(el.textContent || "")}</div>
    <div class="tt-cap">${escapeHtml(hintRefCaption(el, config))}</div>
  `;
  placeTooltip(tooltip, event);
}

function bindMuRefTooltips(config) {
  const root = document.documentElement;
  root._muRefConfig = config;
  if (root.dataset.muRefBound) return;
  root.dataset.muRefBound = "1";

  const hide = () => getGlobalTooltip().classList.remove("visible");
  const fromEvent = (event) => {
    const el = event.target.closest?.(".mu-ref");
    if (!el) return;
    showMuRefTooltip(el, event, root._muRefConfig);
  };

  document.addEventListener("mouseover", fromEvent);
  document.addEventListener("mousemove", (event) => {
    if (event.target.closest?.(".mu-ref")) fromEvent(event);
  });
  document.addEventListener("mouseout", (event) => {
    const el = event.target.closest?.(".mu-ref");
    if (!el) return;
    if (event.relatedTarget?.closest?.(".mu-ref") === el) return;
    hide();
  });
  document.addEventListener("focusin", (event) => {
    const el = event.target.closest?.(".mu-ref");
    if (!el) return;
    const rect = el.getBoundingClientRect();
    showMuRefTooltip(
      el,
      { clientX: rect.left + rect.width / 2, clientY: rect.top },
      root._muRefConfig
    );
  });
  document.addEventListener("focusout", (event) => {
    if (event.target.closest?.(".mu-ref")) hide();
  });
}

function decoratePipelineMuHints(config) {
  bindMuRefTooltips(config);
  const mu = outputMuLabel(config);
  document.querySelectorAll(".process-step-hint[data-i18n]").forEach((el) => {
    const text = withOutputVar(
      i18nText(el.getAttribute("data-i18n"), el.textContent).replaceAll("{mu}", mu),
      config
    );
    el.innerHTML = wrapMathLetters(
      escapeHtml(text)
        .replace(/\{tip:([a-zA-Z]+)\}/g, (_, key) => {
          return `<span class="mu-ref" tabindex="0" data-tip="${key}">${escapeHtml(glossaryLabel(key))}</span>`;
        })
        .replace(/μ\(([^)]+)\)/g, (_, variable) => {
          const safe = escapeHtml(variable);
          return `<span class="mu-ref" tabindex="0" data-mu="${safe}">μ(${safe})</span>`;
        })
    );
    el.querySelectorAll(".mu-ref").forEach((span) => {
      span.setAttribute("aria-label", `${span.textContent}. ${hintRefCaption(span, config)}`);
    });
  });

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    if (el.classList.contains("process-step-hint")) return;
    let text = i18nText(el.getAttribute("data-i18n"), el.textContent);
    if (text.includes("{var}")) text = withOutputVar(text, config);
    else if (!/[αμ]/.test(text)) return;
    if (/[αμ]/.test(text)) el.innerHTML = wrapMathLetters(escapeHtml(text));
    else el.textContent = text;
  });
}

function zoomResetLabel() {
  return i18nText("common.graph.resetZoom", "Reset scale");
}

function zoomHandleLabel(side) {
  return i18nText(
    side === "min" ? "common.graph.zoomMin" : "common.graph.zoomMax",
    side === "min" ? "Left X-axis bound" : "Right X-axis bound"
  );
}

function syncZoomResetButton(canvas) {
  const container = canvas?.closest(".graph-container");
  const reset = container?.querySelector(".graph-zoom-reset");
  if (!reset) return;
  const domainMax = Number(canvas.dataset.xDomainMax) || 100;
  const zoomed =
    container.classList.contains("is-expanded") && isXViewZoomed(readCanvasXView(canvas, domainMax), domainMax);
  reset.hidden = !zoomed;
  reset.setAttribute("aria-label", zoomResetLabel());
  reset.textContent = zoomResetLabel();
}

function bindZoomHandle(handle, side, canvas, redraw) {
  handle.addEventListener("pointerdown", (event) => {
    if (!canvas.closest(".graph-container")?.classList.contains("is-expanded")) return;
    event.preventDefault();
    event.stopPropagation();
    const tooltip = document.getElementById("globalGraphTooltip");
    if (tooltip) tooltip.classList.remove("visible");
    hideGraphProbe(canvas);

    const domainMax = Number(canvas.dataset.xDomainMax) || 100;
    const startView = readCanvasXView(canvas, domainMax);
    const startX = event.clientX;
    const geo = getPlotGeometry(canvas);
    const plotW = Math.max(1, geo.plotRight - geo.plotLeft);
    const minSpan = minXViewSpan(domainMax);

    const onMove = (ev) => {
      const delta = ((ev.clientX - startX) / plotW) * domainMax;
      if (side === "min") {
        const maxMin = startView.viewMax - minSpan;
        const next = Math.min(maxMin, Math.max(0, snapXViewValue(startView.viewMin + delta, domainMax)));
        writeCanvasXView(canvas, next, startView.viewMax, domainMax);
      } else {
        const minMax = startView.viewMin + minSpan;
        const next = Math.max(minMax, Math.min(domainMax, snapXViewValue(startView.viewMax + delta, domainMax)));
        writeCanvasXView(canvas, startView.viewMin, next, domainMax);
      }
      syncZoomResetButton(canvas);
      if (typeof redraw === "function") redraw();
    };

    const onUp = () => {
      handle.releasePointerCapture(event.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
    };

    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
    handle.setPointerCapture(event.pointerId);
  });
}

function ensureGraphZoomUi(container, redraw) {
  const canvas = container.querySelector("canvas");
  if (!canvas) return;

  let stage = canvas.parentElement;
  if (!stage.classList.contains("graph-plot-stage")) {
    stage = document.createElement("div");
    stage.className = "graph-plot-stage";
    canvas.after(stage);
    stage.appendChild(canvas);
  }

  if (!stage.querySelector(".graph-zoom-handle")) {
    const zoomIcon =
      '<svg viewBox="0 0 24 16" aria-hidden="true"><polyline points="7 3 2 8 7 13"/><polyline points="17 3 22 8 17 13"/><line x1="10" y1="4" x2="10" y2="12"/><line x1="14" y1="4" x2="14" y2="12"/></svg>';
    const minHandle = document.createElement("button");
    minHandle.type = "button";
    minHandle.className = "graph-zoom-handle graph-zoom-min";
    minHandle.innerHTML = zoomIcon;
    const maxHandle = document.createElement("button");
    maxHandle.type = "button";
    maxHandle.className = "graph-zoom-handle graph-zoom-max";
    maxHandle.innerHTML = zoomIcon;
    stage.appendChild(minHandle);
    stage.appendChild(maxHandle);
    bindZoomHandle(minHandle, "min", canvas, redraw);
    bindZoomHandle(maxHandle, "max", canvas, redraw);
  }

  stage.querySelectorAll(".graph-zoom-handle").forEach((handle) => {
    const side = handle.classList.contains("graph-zoom-min") ? "min" : "max";
    handle.setAttribute("aria-label", zoomHandleLabel(side));
    handle.setAttribute("title", zoomHandleLabel(side));
  });

  let reset = container.querySelector(".graph-zoom-reset");
  if (!reset) {
    reset = document.createElement("button");
    reset.type = "button";
    reset.className = "graph-zoom-reset";
    reset.hidden = true;
    container.appendChild(reset);
    reset.addEventListener("click", (event) => {
      event.stopPropagation();
      clearCanvasXView(canvas);
      syncZoomResetButton(canvas);
      if (typeof redraw === "function") redraw();
    });
  }
  syncZoomResetButton(canvas);
}

function setupGraphExpand(redraw) {
  const expandIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
  const collapseIcon =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="10" y1="14" x2="3" y2="21"/><line x1="14" y1="10" x2="21" y2="3"/></svg>';

  const rememberCanvasSize = (canvas) => {
    if (!canvas.dataset.baseWidth) {
      canvas.dataset.baseWidth = String(canvas.width);
      canvas.dataset.baseHeight = String(canvas.height);
    }
  };

  const restoreCanvasSize = (canvas) => {
    const w = Number(canvas.dataset.baseWidth);
    const h = Number(canvas.dataset.baseHeight);
    if (w && h && (canvas.width !== w || canvas.height !== h)) {
      canvas.width = w;
      canvas.height = h;
      return true;
    }
    return false;
  };

  const isMobileExpand = () => window.matchMedia("(max-width: 768px)").matches;

  const appContainerWidth = () => {
    const shell = document.querySelector(".container");
    if (!shell) return Math.min(1200, Math.floor(window.innerWidth - 48));
    return Math.max(280, Math.round(shell.getBoundingClientRect().width));
  };

  const applyExpandSize = (container, canvas) => {
    if (isMobileExpand()) {
      container.style.removeProperty("--expand-w");
      container.style.removeProperty("--expand-h");
      return;
    }
    const width = appContainerWidth();
    const ratio =
      (Number(canvas?.dataset.baseHeight || canvas?.height) || 220) /
      (Number(canvas?.dataset.baseWidth || canvas?.width) || 400);
    container.style.setProperty("--expand-w", `${width}px`);
    container.style.setProperty("--expand-h", `${Math.round(width * ratio)}px`);
  };

  const fitExpandedCanvas = (canvas) => {
    rememberCanvasSize(canvas);
    const baseW = Number(canvas.dataset.baseWidth) || canvas.width;
    const baseH = Number(canvas.dataset.baseHeight) || canvas.height;
    const ratio = baseH / baseW;
    let width;
    let height;
    if (isMobileExpand()) {
      width = Math.max(baseW, Math.floor(canvas.clientWidth) || baseW);
      height = Math.round(width * ratio);
      const maxH = Math.floor(window.innerHeight * 0.72);
      if (height > maxH) {
        height = maxH;
        width = Math.round(height / ratio);
      }
    } else {
      width = appContainerWidth();
      height = Math.round(width * ratio);
      const maxH = Math.floor(window.innerHeight * 0.7);
      if (height > maxH) {
        height = maxH;
        width = Math.round(height / ratio);
      }
    }
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      return true;
    }
    return false;
  };

  const syncExpandButtons = () => {
    document.querySelectorAll(".graph-expand-btn").forEach((btn) => {
      const expanded = btn.closest(".graph-container")?.classList.contains("is-expanded");
      btn.innerHTML = expanded ? collapseIcon : expandIcon;
      btn.setAttribute(
        "aria-label",
        i18nText(expanded ? "common.graph.collapse" : "common.graph.expand", expanded ? "Collapse" : "Expand")
      );
      btn.setAttribute("aria-pressed", expanded ? "true" : "false");
    });
  };

  const collapseGraph = () => {
    const container = document.querySelector(".graph-container.is-expanded");
    if (!container) return;
    const canvas = container.querySelector("canvas");
    const placeholder = container.nextElementSibling;
    container.classList.remove("is-expanded");
    container.style.removeProperty("--expand-w");
    container.style.removeProperty("--expand-h");
    document.body.classList.remove("graph-expanded");
    if (placeholder?.classList.contains("graph-expand-placeholder")) placeholder.remove();
    if (canvas) restoreCanvasSize(canvas);
    if (canvas) {
      clearCanvasXView(canvas);
      syncZoomResetButton(canvas);
    }
    syncExpandButtons();
    if (typeof redraw === "function") redraw();
  };

  const expandGraph = (container) => {
    if (container.classList.contains("is-expanded")) {
      collapseGraph();
      return;
    }
    collapseGraph();
    const canvas = container.querySelector("canvas");
    if (canvas) rememberCanvasSize(canvas);
    applyExpandSize(container, canvas);
    const placeholder = document.createElement("div");
    placeholder.className = "graph-expand-placeholder";
    placeholder.style.height = `${container.offsetHeight}px`;
    container.after(placeholder);
    container.classList.add("is-expanded");
    document.body.classList.add("graph-expanded");
    syncExpandButtons();
    requestAnimationFrame(() => {
      const live = container.querySelector("canvas");
      if (live) fitExpandedCanvas(live);
      if (typeof redraw === "function") redraw();
      if (live) syncZoomResetButton(live);
    });
  };

  document.querySelectorAll(".graph-container").forEach((container) => {
    ensureGraphZoomUi(container, redraw);
    if (container.querySelector(".graph-expand-btn")) return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "graph-expand-btn";
    container.appendChild(btn);
    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      expandGraph(container);
    });
  });
  syncExpandButtons();

  if (!document.documentElement.dataset.graphExpandBound) {
    document.documentElement.dataset.graphExpandBound = "1";
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") collapseGraph();
    });
    document.addEventListener("click", (event) => {
      if (!document.body.classList.contains("graph-expanded")) return;
      if (event.target.closest(".graph-container.is-expanded")) return;
      collapseGraph();
    });
    window.addEventListener("resize", () => {
      const container = document.querySelector(".graph-container.is-expanded");
      const canvas = container?.querySelector("canvas");
      if (!canvas) return;
      applyExpandSize(container, canvas);
      if (fitExpandedCanvas(canvas) && typeof redraw === "function") {
        redraw();
      }
    });
  }

  window.addEventListener("languageChanged", () => {
    syncExpandButtons();
    document.querySelectorAll(".graph-container").forEach((container) => ensureGraphZoomUi(container, redraw));
  });
}

function setupPipelineAccordions(config) {
  const page = window.location.pathname || "index.html";
  document.querySelectorAll(".process-step[data-step]").forEach((el) => {
    const key = `fuzzyPipeline:${page}:${el.dataset.step}`;
    try {
      const stored = localStorage.getItem(key);
      if (stored === "0") el.open = false;
      if (stored === "1") el.open = true;
    } catch {
      // Ignore private-mode failures.
    }
    el.addEventListener("toggle", () => {
      try {
        localStorage.setItem(key, el.open ? "1" : "0");
      } catch {
        // Ignore quota / private-mode failures.
      }
    });
  });
  decoratePipelineMuHints(config);
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
    const { min, max, step } = inputSpecMeta(spec);
    const currentValue = Number.isFinite(pageInputValues[spec.key])
      ? pageInputValues[spec.key]
      : max / 2;
    const current = String(currentValue);
    const group = document.createElement("div");
    group.className = "sticky-input-group";
    group.innerHTML = `
      <label class="sticky-input-label" for="${spec.sliderId}Sticky">
        <span class="sticky-input-letter"></span>
        <span class="sticky-input-name"></span>
      </label>
      <input type="range" id="${spec.sliderId}Sticky" min="${min}" max="${max}" step="${step}" value="${current}" />
      <input type="text" inputmode="decimal" autocomplete="off" class="value-input" id="${spec.numberId}Sticky" value="${escapeHtml(formatFieldValue(currentValue))}" />
    `;
    controls.appendChild(group);

    const slider = group.querySelector(`#${spec.sliderId}Sticky`);
    const number = group.querySelector(`#${spec.numberId}Sticky`);

    slider.addEventListener("input", () => {
      applyInputValue(spec, Number(slider.value));
      recalc();
    });
    bindValueField(number, spec, { applyInputValue, recalc });
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
    bindCanvasTooltip(getGraphCanvasId(canvasId), () => {
      if (!state.mfData) return null;
      const spec = config.inputs.find((item) => item.key === key);
      const graphOptions = getGraphOptions(canvasId);
      const fromResult = Number(state.result?.inputs?.[key]);
      const fromInput = spec ? Number(document.getElementById(spec.numberId)?.value) : NaN;
      return {
        type: "curve",
        kind: "input",
        varKey: key,
        series: state.mfData.inputs[key],
        currentValue: Number.isFinite(fromResult) ? fromResult : fromInput,
        xLabel: graphOptions.axisLabels?.x || "x",
        xMax: spec?.max ?? graphOptions.xMax,
      };
    });
  });

  bindCanvasTooltip(config.graphs.output.canvasId, () => {
    if (!state.mfData || !state.result) return null;
    const graphOptions = getGraphOptions(config.graphs.output);
    if (state.mfData.meta?.singletonValues) {
      return {
        type: "singleton",
        kind: "output",
        varKey: config.graphs.output.key,
        singletonValues: state.mfData.meta.singletonValues,
        activations: state.result.ruleOutputs || {},
        resultValue: hasFiredOutput(state.result) ? state.result.value : null,
        resultTerm: hasFiredOutput(state.result) ? state.result.dominantTerm : null,
        xLabel: graphOptions.axisLabels?.x || "x",
        xMax: graphOptions.xMax,
      };
    }

    const outputKey = config.graphs.output.key;
    return {
      type: "curve",
      kind: "output",
      varKey: outputKey,
      series: state.mfData.output?.[outputKey] || {},
      resultValue: hasFiredOutput(state.result) ? state.result.value : null,
      resultTerm: hasFiredOutput(state.result) ? state.result.dominantTerm : null,
      xLabel: graphOptions.axisLabels?.x || "x",
      xMax: graphOptions.xMax,
    };
  });

  if (
    config.graphs.aggregated?.canvasId &&
    config.graphs.aggregated.canvasId !== config.graphs.output.canvasId
  ) {
    bindCanvasTooltip(config.graphs.aggregated.canvasId, () => {
      if (!state.mfData || !state.result) return null;
      const outputKey = config.graphs.output.key;
      const outputSeries = state.mfData.output?.[outputKey] || {};
      const series = {
        ...clipTermSeries(outputSeries, state.result.ruleOutputs),
      };
      if (state.result.aggregatedOutput) series.aggregated = state.result.aggregatedOutput;
      return {
        type: "curve",
        kind: "aggregated",
        varKey: outputKey,
        series,
        resultValue: null,
        resultTerm: null,
        xLabel: getGraphOptions(config.graphs.aggregated).axisLabels?.x || "x",
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
    ruleEvaluations: result.ruleEvaluations || [],
    aggregatedOutput: result.aggregatedOutput || null,
    normalizedOutputs: result.normalizedOutputs || null,
    weightedConsequents: result.weightedConsequents || null,
    inputs: payload,
  };
}

async function calculateController(controller, payload) {
  const local = window.fuzzyControllers?.[controller];
  if (local) {
    const { values } = local.parseInputs(payload);
    if (!values) return null;
    return normalizeCalculateResult(local.calculate(values), values);
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

// The page stays hidden (html.is-loading, see style.css) until translations,
// membership functions and the first calculation are rendered, so the user
// never sees empty labels or the layout jumping into place.
function revealPage() {
  document.documentElement.classList.remove("is-loading");
}

async function createFuzzyPage(config) {
  try {
    await initFuzzyPage(config);
  } finally {
    revealPage();
  }
}

async function initFuzzyPage(config) {
  configureTermForms(config);
  // Chart data does not depend on the language: fetch it alongside i18n.json.
  const mfDataPromise = loadMembershipFunctions(config.controller);
  if (window.i18nHelper) {
    await window.i18nHelper.init();
    window.i18nHelper.bindSwitcher();
  }

  const state = {
    mfData: null,
    result: null,
  };

  // Pushes a valid value to every control of the input. `source` is the text
  // field being edited, which is left untouched so the caret and partial
  // input ("0,0") survive.
  const applyInputValue = (spec, value, source = null) => {
    pageInputValues[spec.key] = value;
    if (spec.sliderId) {
      const slider = document.getElementById(spec.sliderId);
      if (slider) slider.value = value;
      const stickySlider = document.getElementById(`${spec.sliderId}Sticky`);
      if (stickySlider) stickySlider.value = value;
    }
    [document.getElementById(spec.numberId), document.getElementById(`${spec.numberId}Sticky`)]
      .filter((field) => field && field !== source)
      .forEach((field) => {
        field.value = formatFieldValue(value);
        field.classList.remove("is-invalid");
      });
    if (spec.valueId) {
      const valueEl = document.getElementById(spec.valueId);
      if (valueEl) {
        valueEl.textContent = formatInputValue(value, spec);
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
    renderControllerMemberships(config, data, state.mfData);
    renderRuleEvaluations(config, data, state.mfData);
    renderSugenoSum(config, data);
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
          varKey: key,
          highlightTerm: dominantTermFromMemberships(state.result.membershipData?.[key]),
        }
      );
    });

    const outputKey = config.graphs.output.key;
    const outputCanvasId = config.graphs.output.canvasId;
    const aggregatedCanvasId = config.graphs.aggregated?.canvasId;
    const outputSeries = state.mfData.output?.[outputKey];
    const hasOutputCurves = outputSeries && Object.keys(outputSeries).length > 0;
    const outputHighlight = hasFiredOutput(state.result) ? state.result.dominantTerm : null;
    const crispValue = hasFiredOutput(state.result) ? state.result.value : null;

    if (state.mfData.meta?.singletonValues) {
      drawSingletonGraph(
        outputCanvasId,
        state.mfData.meta.singletonValues,
        state.result.ruleOutputs,
        crispValue,
        {
          ...getGraphOptions(config.graphs.output),
          varKey: outputKey,
          highlightTerm: outputHighlight,
        }
      );
    } else {
      if (aggregatedCanvasId) {
        drawAggregatedSetGraph(
          aggregatedCanvasId,
          state.result.aggregatedOutput,
          null,
          {
            ...getGraphOptions(config.graphs.aggregated || config.graphs.output),
            varKey: outputKey,
            termSeries: hasOutputCurves ? outputSeries : null,
            activations: state.result.ruleOutputs,
            showPeakLabels: true,
            showAccumulation: true,
            showDefuzzification: false,
          }
        );
      }
      if (hasOutputCurves && outputCanvasId !== aggregatedCanvasId) {
        drawCurveGraph(
          outputCanvasId,
          outputSeries,
          crispValue,
          {
            ...getGraphOptions(config.graphs.output),
            varKey: outputKey,
            highlightTerm: outputHighlight,
            showResultLabel: true,
          }
        );
      }
    }
  };

  config.inputs.forEach((spec) => {
    const { min, max, step } = inputSpecMeta(spec);
    const sliderEl = spec.sliderId ? document.getElementById(spec.sliderId) : null;
    if (sliderEl) {
      sliderEl.min = String(min);
      sliderEl.max = String(max);
      sliderEl.step = String(step);
    }

    const numberEl = document.getElementById(spec.numberId);
    const initial = clampInputValue(numberEl.value, spec);
    pageInputValues[spec.key] = initial ?? (min + max) / 2;
    numberEl.value = formatFieldValue(pageInputValues[spec.key]);
    bindValueField(numberEl, spec, { applyInputValue, recalc });

    if (sliderEl) {
      sliderEl.addEventListener("input", () => {
        applyInputValue(spec, Number(sliderEl.value));
        recalc();
      });
    }
  });

  setupStickyInputs(config, { applyInputValue, recalc });
  setupPipelineAccordions(config);
  bindRuleEvalToggle(config, state);
  setupGraphExpand(drawAll);
  restoreControllerInputs(config, applyInputValue);
  if (window.setupDocsModals) window.setupDocsModals(config.controller);

  state.mfData = await mfDataPromise;

  setupTooltips(config, state);

  window.addEventListener("languageChanged", () => {
    decoratePipelineMuHints(config);
    refreshStickyCopy(config);
    refreshValueFields(config);
    if (!state.result) return;
    setOutputText(
      document.getElementById(config.output.valueId),
      document.getElementById(config.output.termId),
      state.result
    );
    updateStickyResult(state.result);
    renderControllerMemberships(config, state.result, state.mfData);
    renderRuleEvaluations(config, state.result, state.mfData);
    renderSugenoSum(config, state.result);
    drawAll();
  });

  await recalc();
}

window.createFuzzyPage = createFuzzyPage;

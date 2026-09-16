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

function drawPlotGrid(ctx, width, height, pad) {
  const xTicks = [20, 40, 60, 80];
  const yTicks = [0.25, 0.5, 0.75, 1];

  ctx.save();
  ctx.strokeStyle = "rgba(148, 163, 184, 0.55)";
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 4]);

  xTicks.forEach((tick) => {
    const x = pad + (tick / 100) * (width - 2 * pad);
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

function drawAxes(ctx, width, height, pad, axisLabels = null) {
  drawPlotGrid(ctx, width, height, pad);

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
  ctx.font = "12px Arial";
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

function fillTermArea(ctx, points, color, w, h, p, alpha = 0.28) {
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
  ctx.fillStyle = hexToRgba(color, alpha);
  ctx.fill();
}

function strokePlotCurve(ctx, points, w, h, p) {
  if (!Array.isArray(points) || !points.length) return;
  const toX = (x) => p + (x / 100) * (w - 2 * p);
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

function readCursorX(canvas, event) {
  const geo = getPlotGeometry(canvas);
  const cssX = event.clientX - geo.rect.left;
  const cssY = event.clientY - geo.rect.top;
  const inPlot =
    cssX >= geo.plotLeft &&
    cssX <= geo.plotRight &&
    cssY >= geo.plotTop &&
    cssY <= geo.plotBottom;
  if (!inPlot) return { inPlot: false, x: null, geo, cssX };
  const span = geo.plotRight - geo.plotLeft;
  const x = span <= 0 ? 0 : ((cssX - geo.plotLeft) / span) * 100;
  return { inPlot: true, x: Math.min(100, Math.max(0, x)), geo, cssX };
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

function muRowHtml(term, value, color, { dominant = false, zero = false } = {}) {
  const pct = Math.round(Math.max(0, Math.min(1, Number(value) || 0)) * 100);
  const classes = ["tt-row"];
  if (dominant) classes.push("is-dominant");
  if (zero) classes.push("is-zero");
  return `<div class="${classes.join(" ")}">
    <i style="background:${color}"></i>
    <span class="tt-term">${escapeHtml(termLabel(term))}</span>
    <span class="tt-mu">${formatNumber(value, { minimumFractionDigits: 3, maximumFractionDigits: 3 })}</span>
    <span class="tt-bar"><span style="width:${pct}%"></span></span>
  </div>`;
}

function formatCursorX(model, x) {
  const symbol = model.xLabel || "x";
  return `${escapeHtml(symbol)} = ${formatNumber(x, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}`;
}

function snapCursorX(x, model) {
  const candidates = [];
  if (Number.isFinite(Number(model.currentValue))) candidates.push(Number(model.currentValue));
  if (Number.isFinite(Number(model.resultValue))) candidates.push(Number(model.resultValue));
  Object.values(model.singletonValues || {}).forEach((value) => {
    if (Number.isFinite(Number(value))) candidates.push(Number(value));
  });

  let best = x;
  let bestDist = 0.4;
  candidates.forEach((value) => {
    const dist = Math.abs(value - x);
    if (dist < bestDist) {
      best = value;
      bestDist = dist;
    }
  });
  return Math.round(best * 10) / 10;
}

function tooltipFooter(model) {
  if (model.kind === "input" && Number.isFinite(Number(model.currentValue))) {
    return `<div class="tt-foot">${i18nText("common.tooltip.current")}: ${formatNumber(
      Number(model.currentValue),
      {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }
    )}</div>`;
  }

  if (!Number.isFinite(Number(model.resultValue))) return "";
  const term = model.resultTerm ? ` · ${escapeHtml(termLabel(model.resultTerm))}` : "";
  return `<div class="tt-foot">${i18nText("common.tooltip.result")}: ${formatNumber(
    Number(model.resultValue),
    {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  )}${term}</div>`;
}

function buildCurveTooltip(model, x) {
  const rows = Object.entries(model.series || {}).map(([term, points], idx) => ({
    term,
    value: interpolateSeriesY(points, x),
    color: termColor(term, idx),
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
        })
      )
      .join("")}
    ${tooltipFooter(model)}
  `;
}

function buildSingletonTooltip(model, x) {
  const entries = Object.entries(model.singletonValues || {});
  let nearest = null;
  entries.forEach(([term, sx], idx) => {
    const dist = Math.abs(Number(sx) - x);
    if (!nearest || dist < nearest.dist) {
      nearest = { term, dist, color: termColor(term, idx) };
    }
  });
  const onSpike = Boolean(nearest && nearest.dist <= SINGLETON_SNAP);
  const rows = entries.map(([term, sx], idx) => ({
    term,
    value: Number(model.activations?.[term]) || 0,
    color: termColor(term, idx),
    x: Number(sx),
  }));
  const max = rows.reduce((best, row) => Math.max(best, row.value), 0);
  const status = onSpike
    ? `${i18nText("common.tooltip.singletonAt")}: ${termLabel(nearest.term)}`
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
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = PLOT_PAD;

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

function drawResultMarker(ctx, w, h, p, resultValue) {
  if (resultValue === null || resultValue === undefined || !Number.isFinite(Number(resultValue))) return;
  const vx = p + (Number(resultValue) / 100) * (w - 2 * p);
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

function drawTermPeakLabel(ctx, w, h, p, term, points, color) {
  const peak = findPeakPoint(points);
  if (!peak || peak.y <= 0.04) return;
  const labelX = p + (peak.x / 100) * (w - 2 * p);
  const labelY = h - p - peak.y * (h - 2 * p);
  ctx.fillStyle = color;
  ctx.font = "11px Arial";
  ctx.textAlign = "center";
  ctx.fillText(termLabel(term), labelX, Math.max(14, labelY - 16));
}

function drawAggregatedSetGraph(canvasId, points, resultValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = PLOT_PAD;
  const termSeries = options.termSeries || null;
  const showAcc = options.showAccumulation !== false;
  const showDefuzz = options.showDefuzzification !== false;
  const highlightTerm = options.highlightTerm || null;
  const clipped = showAcc ? clipTermSeries(termSeries, options.activations) : {};
  const clippedTerms = Object.keys(clipped);

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null);

  if (showDefuzz && termSeries) {
    if (highlightTerm && termSeries[highlightTerm]) {
      fillTermArea(
        ctx,
        termSeries[highlightTerm],
        termColor(highlightTerm, Object.keys(termSeries).indexOf(highlightTerm)),
        w,
        h,
        p,
        0.16
      );
    }
    Object.entries(termSeries).forEach(([term, series], idx) => {
      ctx.strokeStyle = termColor(term, idx);
      ctx.lineWidth = term === highlightTerm ? 3 : 2;
      ctx.globalAlpha = showAcc ? 0.5 : 1;
      strokePlotCurve(ctx, series, w, h, p);
      ctx.globalAlpha = 1;
      if (options.showPeakLabels) drawTermPeakLabel(ctx, w, h, p, term, series, termColor(term, idx));
    });
  }

  if (showAcc) {
    clippedTerms.forEach((term) => {
      const color = termColor(term, Math.max(0, Object.keys(termSeries || {}).indexOf(term)));
      fillTermArea(ctx, clipped[term], color, w, h, p, 0.22);
      ctx.strokeStyle = hexToRgba(color, 0.9);
      ctx.lineWidth = 1.6;
      strokePlotCurve(ctx, clipped[term], w, h, p);
      if (options.showPeakLabels && !showDefuzz) {
        drawTermPeakLabel(ctx, w, h, p, term, clipped[term], color);
      }
    });

    if (Array.isArray(points) && points.length) {
      fillTermArea(ctx, points, "#2c3e50", w, h, p, 0.1);
      ctx.strokeStyle = "#1a252f";
      ctx.lineWidth = 2.4;
      strokePlotCurve(ctx, points, w, h, p);
    }
  }

  drawResultMarker(ctx, w, h, p, resultValue);
  ensureLegend(canvasId, ["aggregated"]);
}

function drawSingletonGraph(canvasId, singletonValues, ruleOutputs, resultValue, options = {}) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = PLOT_PAD;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p, options.axisLabels || null);

  const terms = Object.keys(singletonValues);
  const highlightTerm = options.highlightTerm || null;
  const showAcc = options.showAccumulation !== false;
  const showDefuzz = options.showDefuzzification !== false;
  const plotH = h - 2 * p;
  terms.forEach((term, idx) => {
    const x = singletonValues[term];
    const activation = ruleOutputs?.[term] || 0;
    const px = p + (x / 100) * (w - 2 * p);
    const color = termColor(term, idx);
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

  if (showDefuzz) drawResultMarker(ctx, w, h, p, resultValue);

  ensureLegend(canvasId, terms, highlightTerm);
}

function renderMembership(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = "";

  const entries = Object.entries(data || {});
  const maxValue = entries.reduce((best, [, value]) => Math.max(best, Number(value) || 0), 0);

  entries.forEach(([term, value], index) => {
    const numeric = Number(value) || 0;
    const color = termColor(term, index);
    const item = document.createElement("div");
    item.className = "membership-item";
    if (maxValue > 0 && numeric === maxValue) item.classList.add("active");
    item.style.borderLeftColor = color;
    item.innerHTML = `
      <i class="membership-swatch" style="background:${color}"></i>
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

    const cursor = readCursorX(canvas, lastPoint);
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
    const text = i18nText(el.getAttribute("data-i18n"), el.textContent).replaceAll("{mu}", mu);
    el.innerHTML = escapeHtml(text)
      .replace(/\{tip:([a-zA-Z]+)\}/g, (_, key) => {
        return `<span class="mu-ref" tabindex="0" data-tip="${key}">${escapeHtml(glossaryLabel(key))}</span>`;
      })
      .replace(/μ\(([^)]+)\)/g, (_, variable) => {
        const safe = escapeHtml(variable);
        return `<span class="mu-ref" tabindex="0" data-mu="${safe}">μ(${safe})</span>`;
      });
    el.querySelectorAll(".mu-ref").forEach((span) => {
      span.setAttribute("aria-label", `${span.textContent}. ${hintRefCaption(span, config)}`);
    });
  });
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
    });
  };

  document.querySelectorAll(".graph-container").forEach((container) => {
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

  window.addEventListener("languageChanged", syncExpandButtons);
}

const OUTPUT_LAYER_DEFAULTS = { accumulation: true, defuzzification: true };

function readStoredOutputLayers(controller) {
  try {
    const raw = localStorage.getItem(`fuzzyOutputLayers:${controller}`);
    if (!raw) return { ...OUTPUT_LAYER_DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      accumulation: parsed.accumulation !== false,
      defuzzification: parsed.defuzzification !== false,
    };
  } catch {
    return { ...OUTPUT_LAYER_DEFAULTS };
  }
}

function setupOutputLayers(controller, onChange) {
  const root = document.querySelector("[data-output-layers]");
  let layers = readStoredOutputLayers(controller);
  if (!root) return () => layers;

  const syncUi = () => {
    root.querySelectorAll("[data-layer]").forEach((input) => {
      input.checked = Boolean(layers[input.dataset.layer]);
    });
    const stepBody = root.closest(".process-step-body");
    const grid = stepBody?.querySelector(".graph-grid");
    stepBody?.querySelectorAll("[data-layer-panel]").forEach((panel) => {
      panel.hidden = !layers[panel.dataset.layerPanel];
    });
    if (grid) {
      const panel = grid.querySelector("[data-layer-panel]");
      const panelVisible = Boolean(panel && !panel.hidden);
      grid.classList.toggle("graph-grid-split", panelVisible);
      grid.classList.toggle("graph-grid-1", !panelVisible);
    }
  };

  root.querySelectorAll("[data-layer]").forEach((input) => {
    input.addEventListener("change", () => {
      layers = { ...layers, [input.dataset.layer]: input.checked };
      try {
        localStorage.setItem(`fuzzyOutputLayers:${controller}`, JSON.stringify(layers));
      } catch {
        // Ignore private-mode failures.
      }
      syncUi();
      onChange?.(layers);
    });
  });

  syncUi();
  return () => layers;
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

function setupTooltips(config, state, getLayers) {
  Object.entries(config.graphs.inputs).forEach(([key, canvasId]) => {
    bindCanvasTooltip(getGraphCanvasId(canvasId), () => {
      if (!state.mfData) return null;
      const spec = config.inputs.find((item) => item.key === key);
      const fromResult = Number(state.result?.inputs?.[key]);
      const fromInput = spec ? Number(document.getElementById(spec.numberId)?.value) : NaN;
      return {
        type: "curve",
        kind: "input",
        series: state.mfData.inputs[key],
        currentValue: Number.isFinite(fromResult) ? fromResult : fromInput,
        xLabel: getGraphOptions(canvasId).axisLabels?.x || "x",
      };
    });
  });

  const outputTooltip = () => {
    if (!state.mfData || !state.result) return null;
    const layers = getLayers();
    const axisSource = config.graphs.aggregated || config.graphs.output;

    if (state.mfData.meta?.singletonValues) {
      return {
        type: "singleton",
        kind: "output",
        singletonValues: state.mfData.meta.singletonValues,
        activations: state.result.ruleOutputs || {},
        resultValue: hasFiredOutput(state.result) ? state.result.value : null,
        resultTerm: hasFiredOutput(state.result) ? state.result.dominantTerm : null,
        xLabel: getGraphOptions(config.graphs.output).axisLabels?.x || "x",
      };
    }

    const outputKey = config.graphs.output.key;
    const outputSeries = state.mfData.output?.[outputKey] || {};
    const series = {};
    if (layers.defuzzification) Object.assign(series, outputSeries);
    if (layers.accumulation) {
      if (!layers.defuzzification) {
        Object.assign(series, clipTermSeries(outputSeries, state.result.ruleOutputs));
      }
      if (state.result.aggregatedOutput) series.aggregated = state.result.aggregatedOutput;
    }

    return {
      type: "curve",
      kind: layers.accumulation ? "aggregated" : "output",
      series,
      resultValue: hasFiredOutput(state.result) ? state.result.value : null,
      resultTerm: hasFiredOutput(state.result) ? state.result.dominantTerm : null,
      xLabel: getGraphOptions(axisSource).axisLabels?.x || "x",
    };
  };

  bindCanvasTooltip(config.graphs.output.canvasId, outputTooltip);
  if (
    config.graphs.aggregated?.canvasId &&
    config.graphs.aggregated.canvasId !== config.graphs.output.canvasId
  ) {
    bindCanvasTooltip(config.graphs.aggregated.canvasId, outputTooltip);
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

  let getOutputLayers = () => ({ ...OUTPUT_LAYER_DEFAULTS });

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

    const layers = getOutputLayers();
    const outputKey = config.graphs.output.key;
    const outputCanvasId = config.graphs.output.canvasId;
    const aggregatedCanvasId = config.graphs.aggregated?.canvasId;
    const outputSeries = state.mfData.output?.[outputKey];
    const hasOutputCurves = outputSeries && Object.keys(outputSeries).length > 0;
    const outputHighlight = hasFiredOutput(state.result) ? state.result.dominantTerm : null;
    const layerOptions = {
      showAccumulation: layers.accumulation,
      showDefuzzification: layers.defuzzification,
    };

    if (state.mfData.meta?.singletonValues) {
      drawSingletonGraph(
        outputCanvasId,
        state.mfData.meta.singletonValues,
        state.result.ruleOutputs,
        hasFiredOutput(state.result) ? state.result.value : null,
        {
          ...getGraphOptions(config.graphs.output),
          highlightTerm: outputHighlight,
          ...layerOptions,
        }
      );
    } else if (aggregatedCanvasId) {
      drawAggregatedSetGraph(
        aggregatedCanvasId,
        state.result.aggregatedOutput,
        hasFiredOutput(state.result) ? state.result.value : null,
        {
          ...getGraphOptions(config.graphs.aggregated || config.graphs.output),
          termSeries: hasOutputCurves ? outputSeries : null,
          activations: state.result.ruleOutputs,
          showPeakLabels: true,
          highlightTerm: outputHighlight,
          ...layerOptions,
        }
      );
    } else if (hasOutputCurves) {
      drawCurveGraph(
        outputCanvasId,
        outputSeries,
        hasFiredOutput(state.result) ? state.result.value : null,
        {
          ...getGraphOptions(config.graphs.output),
          highlightTerm: outputHighlight,
        }
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
  setupPipelineAccordions(config);
  getOutputLayers = setupOutputLayers(config.controller, drawAll);
  setupGraphExpand(drawAll);
  restoreControllerInputs(config, applyInputValue);
  if (window.setupDocsModals) window.setupDocsModals(config.controller);

  state.mfData = await loadMembershipFunctions(config.controller);

  setupTooltips(config, state, getOutputLayers);

  window.addEventListener("languageChanged", () => {
    decoratePipelineMuHints(config);
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

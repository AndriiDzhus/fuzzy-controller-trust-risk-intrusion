const graphPalette = ["#e74c3c", "#3498db", "#27ae60", "#8e44ad", "#1abc9c", "#f39c12"];

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
    Low: "#e74c3c",
    Medium: "#3498db",
    High: "#27ae60",
    VeryLow: "#1abc9c",
    VeryHigh: "#8e44ad",
  };
  return known[term] || graphPalette[index % graphPalette.length];
}

function ensureLegend(canvasId, terms) {
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
  terms.forEach((term, idx) => {
    const points = termSeries[term];
    const color = termColor(term, idx);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
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

  ensureLegend(canvasId, terms);
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
  terms.forEach((term, idx) => {
    const x = singletonValues[term];
    const activation = ruleOutputs?.[term] || 0;
    const px = p + (x / 100) * (w - 2 * p);

    ctx.strokeStyle = termColor(term, idx);
    ctx.lineWidth = 1 + activation * 6;
    ctx.beginPath();
    ctx.moveTo(px, h - p);
    ctx.lineTo(px, h - p - activation * (h - 2 * p));
    ctx.stroke();
  });

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

  ensureLegend(canvasId, terms);
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
        <strong>${i18nText("common.tooltip.outputAxis")}: ${formatNumber(model.resultValue, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
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
}

function normalizeCalculateResult(result, payload) {
  return {
    value: parseFloat(result.value.toFixed(2)),
    dominantTerm: result.dominantTerm,
    membershipData: result.membershipData,
    ruleOutputs: result.ruleOutputs ?? null,
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
      document.getElementById(spec.sliderId).value = value;
    }
    document.getElementById(spec.numberId).value = value;
    if (spec.valueId) {
      document.getElementById(spec.valueId).textContent = formatNumber(value, {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      });
    }
  };

  const recalc = async () => {
    const payload = buildMapFromSpecs(config.inputs);
    const data = await calculateController(config.controller, payload);
    if (!data) return;

    state.result = data;

    document.getElementById(config.output.valueId).textContent = formatNumber(data.value, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    document.getElementById(config.output.termId).textContent = termLabel(data.dominantTerm);

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
        getGraphOptions(canvasId)
      );
    });

    const outputKey = config.graphs.output.key;
    const outputCanvasId = config.graphs.output.canvasId;

    if (state.mfData.meta?.singletonValues) {
      drawSingletonGraph(
        outputCanvasId,
        state.mfData.meta.singletonValues,
        state.result.ruleOutputs,
        state.result.value,
        getGraphOptions(config.graphs.output)
      );
    } else {
      drawCurveGraph(
        outputCanvasId,
        state.mfData.output[outputKey],
        state.result.value,
        getGraphOptions(config.graphs.output)
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

  const calcBtn = document.getElementById(config.calculateButtonId);
  if (calcBtn) calcBtn.addEventListener("click", recalc);

  state.mfData = await loadMembershipFunctions(config.controller);

  setupTooltips(config, state);

  window.addEventListener("languageChanged", () => {
    if (!state.result) return;
    document.getElementById(config.output.termId).textContent = termLabel(state.result.dominantTerm);
    Object.entries(config.membership).forEach(([key, containerId]) => {
      renderMembership(containerId, state.result.membershipData[key]);
    });
    drawAll();
  });

  await recalc();
}

window.createFuzzyPage = createFuzzyPage;

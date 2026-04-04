function gauss(x, c, s) {
  return Math.exp(-Math.pow(x - c, 2) / (2 * s * s));
}

const intrusionMF = {
  N: {
    low: (x) => gauss(x, 0, 18),
    medium: (x) => gauss(x, 60, 20),
    high: (x) => gauss(x, 100, 12),
  },
  R: {
    low: (x) => gauss(x, 0, 8),
    medium: (x) => gauss(x, 45, 24),
    high: (x) => gauss(x, 100, 12),
  },
  D: {
    low: (x) => gauss(x, 0, 20),
    medium: (x) => gauss(x, 65, 16),
    high: (x) => gauss(x, 100, 6),
  },
  I: {
    none: (x) => gauss(x, 0, 12),
    low: (x) => gauss(x, 35, 12),
    medium: (x) => gauss(x, 65, 12),
    high: (x) => gauss(x, 100, 12),
  },
};

const intrusionRules = [
  { N: "low", R: "low", D: "medium", out: "low" },
  { N: "low", R: "medium", D: "low", out: "none" },
  { N: "low", R: "medium", D: "high", out: "none" },
  { N: "low", R: "high", D: "medium", out: "none" },
  { N: "medium", R: "low", D: "low", out: "medium" },
  { N: "medium", R: "medium", D: "low", out: "medium" },
  { N: "medium", R: "medium", D: "high", out: "low" },
  { N: "medium", R: "high", D: "high", out: "low" },
  { N: "high", R: "low", D: "medium", out: "high" },
  { N: "high", R: "medium", D: "low", out: "high" },
  { N: "high", R: "medium", D: "high", out: "high" },
  { N: "high", R: "high", D: "medium", out: "medium" },
];

const intrusionColors = {
  low: "#e74c3c",
  medium: "#3498db",
  high: "#27ae60",
  none: "#95a5a6",
};

function intrFuzzify(N, R, D) {
  return {
    N: {
      low: intrusionMF.N.low(N),
      medium: intrusionMF.N.medium(N),
      high: intrusionMF.N.high(N),
    },
    R: {
      low: intrusionMF.R.low(R),
      medium: intrusionMF.R.medium(R),
      high: intrusionMF.R.high(R),
    },
    D: {
      low: intrusionMF.D.low(D),
      medium: intrusionMF.D.medium(D),
      high: intrusionMF.D.high(D),
    },
  };
}

function intrInfer(fuzzy) {
  const out = { none: 0, low: 0, medium: 0, high: 0 };

  intrusionRules.forEach((rule) => {
    const alpha = Math.min(fuzzy.N[rule.N], fuzzy.R[rule.R], fuzzy.D[rule.D]);
    out[rule.out] = Math.max(out[rule.out], alpha);
  });

  return out;
}

function intrDefuzzify(ruleOutputs) {
  let numerator = 0;
  let denominator = 0;

  for (let x = 0; x <= 100; x += 0.2) {
    let mu = 0;
    Object.entries(ruleOutputs).forEach(([term, alpha]) => {
      mu = Math.max(mu, Math.min(alpha, intrusionMF.I[term](x)));
    });
    numerator += x * mu;
    denominator += mu;
  }

  return denominator === 0 ? 0 : numerator / denominator;
}

function intrDominant(ruleOutputs) {
  return Object.entries(ruleOutputs).sort((a, b) => b[1] - a[1])[0][0];
}

function intrusionCalc(N, R, D) {
  const fuzzy = intrFuzzify(N, R, D);
  const ruleOutputs = intrInfer(fuzzy);
  const value = intrDefuzzify(ruleOutputs);
  return {
    value,
    fuzzy,
    ruleOutputs,
    dominant: intrDominant(ruleOutputs),
  };
}

function bindSync(sliderId, numberId, valueId, onChange) {
  const slider = document.getElementById(sliderId);
  const number = document.getElementById(numberId);
  const value = document.getElementById(valueId);

  const syncFromSlider = () => {
    number.value = slider.value;
    value.textContent = Number(slider.value).toFixed(1);
    onChange();
  };

  const syncFromNumber = () => {
    const val = Math.min(100, Math.max(0, Number(number.value)));
    number.value = String(val);
    slider.value = String(val);
    value.textContent = val.toFixed(1);
    onChange();
  };

  slider.addEventListener("input", syncFromSlider);
  number.addEventListener("input", syncFromNumber);
}

function translateIntrusionTerm(term) {
  if (window.i18nHelper) {
    return window.i18nHelper.t(`common.terms.${term}`, term);
  }
  return term;
}

function renderMembershipBars(containerId, values) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  Object.entries(values).forEach(([term, mu]) => {
    const item = document.createElement("div");
    item.className = "membership-item";
    item.innerHTML = `
      <span class="membership-label">${translateIntrusionTerm(term)}</span>
      <span class="membership-value">${mu.toFixed(3)}</span>
    `;
    container.appendChild(item);
  });
}

function drawAxes(ctx, width, height, pad) {
  ctx.strokeStyle = "#bdc3c7";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(width - pad, height - pad);
  ctx.moveTo(pad, height - pad);
  ctx.lineTo(pad, pad);
  ctx.stroke();
}

function drawGaussianGraph(canvasId, mfs, currentValue) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p);

  ["low", "medium", "high"].forEach((term) => {
    ctx.strokeStyle = intrusionColors[term];
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x <= 100; x += 0.5) {
      const y = mfs[term](x);
      const px = p + (x / 100) * (w - 2 * p);
      const py = h - p - y * (h - 2 * p);
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.stroke();
  });

  const vx = p + (currentValue / 100) * (w - 2 * p);
  ctx.strokeStyle = "#2c3e50";
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.moveTo(vx, p);
  ctx.lineTo(vx, h - p);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawIntrusionOutputGraph(result) {
  const canvas = document.getElementById("intrusionCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p);

  ["none", "low", "medium", "high"].forEach((term) => {
    const alpha = result.ruleOutputs[term];
    ctx.strokeStyle = intrusionColors[term];
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x <= 100; x += 0.5) {
      const y = Math.min(alpha, intrusionMF.I[term](x));
      const px = p + (x / 100) * (w - 2 * p);
      const py = h - p - y * (h - 2 * p);
      if (x === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.stroke();
  });

  const rx = p + (result.value / 100) * (w - 2 * p);
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
  ctx.fillText(`I=${result.value.toFixed(2)}`, Math.min(w - 80, rx + 8), p + 12);
}

function recalculateIntrusion() {
  const N = Number(document.getElementById("packetsSlider").value);
  const R = Number(document.getElementById("rateSlider").value);
  const D = Number(document.getElementById("deliverySlider").value);

  const result = intrusionCalc(N, R, D);

  document.getElementById("intrusionValue").textContent = result.value.toFixed(2);
  document.getElementById("intrusionTerm").textContent = translateIntrusionTerm(result.dominant);

  renderMembershipBars("packetsMembership", result.fuzzy.N);
  renderMembershipBars("rateMembership", result.fuzzy.R);
  renderMembershipBars("deliveryMembership", result.fuzzy.D);
  renderMembershipBars("intrusionMembership", result.ruleOutputs);

  drawGaussianGraph("packetsCanvas", intrusionMF.N, N);
  drawGaussianGraph("rateCanvas", intrusionMF.R, R);
  drawGaussianGraph("deliveryCanvas", intrusionMF.D, D);
  drawIntrusionOutputGraph(result);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.i18nHelper) {
    await window.i18nHelper.init();
    window.i18nHelper.bindSwitcher();
  }

  bindSync("packetsSlider", "packetsNumber", "packetsValue", recalculateIntrusion);
  bindSync("rateSlider", "rateNumber", "rateValue", recalculateIntrusion);
  bindSync("deliverySlider", "deliveryNumber", "deliveryValue", recalculateIntrusion);

  recalculateIntrusion();
});

window.addEventListener("languageChanged", () => {
  recalculateIntrusion();
});

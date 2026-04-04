const securityMF = {
  E: {
    low: (x) => {
      if (x <= 0) return 1;
      if (x <= 20) return (20 - x) / 20;
      return 0;
    },
    medium: (x) => {
      if (x <= 10 || x >= 70) return 0;
      if (x <= 40) return (x - 10) / 30;
      return (70 - x) / 30;
    },
    high: (x) => {
      if (x <= 50) return 0;
      if (x <= 100) return (x - 50) / 50;
      return 1;
    },
  },
  S: {
    low: (x) => {
      if (x <= 0) return 1;
      if (x <= 50) return (50 - x) / 50;
      return 0;
    },
    medium: (x) => {
      if (x <= 30 || x >= 90) return 0;
      if (x <= 60) return (x - 30) / 30;
      return (90 - x) / 30;
    },
    high: (x) => {
      if (x <= 70) return 0;
      if (x <= 100) return (x - 70) / 30;
      return 1;
    },
  },
  T: {
    low: (x) => {
      if (x <= 0) return 1;
      if (x <= 20) return (20 - x) / 20;
      return 0;
    },
    medium: (x) => {
      if (x <= 10 || x >= 90) return 0;
      if (x <= 50) return (x - 10) / 40;
      return (90 - x) / 40;
    },
    high: (x) => {
      if (x <= 80) return 0;
      if (x <= 100) return (x - 80) / 20;
      return 1;
    },
  },
};

const riskSingletons = {
  none: 0,
  veryLow: 20,
  low: 40,
  medium: 60,
  high: 80,
  veryHigh: 100,
};

const securityRules = [
  { E: "low", S: "high", T: "low", out: "none" },
  { E: "low", S: "high", T: "medium", out: "veryLow" },
  { E: "medium", S: "medium", T: "low", out: "low" },
  { E: "medium", S: "low", T: "medium", out: "medium" },
  { E: "high", S: "medium", T: "high", out: "high" },
  { E: "high", S: "low", T: "high", out: "veryHigh" },
];

const securityColors = {
  low: "#e74c3c",
  medium: "#3498db",
  high: "#27ae60",
  none: "#95a5a6",
  veryLow: "#1abc9c",
  veryHigh: "#8e44ad",
};

function secFuzzify(E, S, T) {
  return {
    E: {
      low: securityMF.E.low(E),
      medium: securityMF.E.medium(E),
      high: securityMF.E.high(E),
    },
    S: {
      low: securityMF.S.low(S),
      medium: securityMF.S.medium(S),
      high: securityMF.S.high(S),
    },
    T: {
      low: securityMF.T.low(T),
      medium: securityMF.T.medium(T),
      high: securityMF.T.high(T),
    },
  };
}

function secInfer(fuzzy) {
  const out = {
    none: 0,
    veryLow: 0,
    low: 0,
    medium: 0,
    high: 0,
    veryHigh: 0,
  };

  securityRules.forEach((rule) => {
    const alpha = Math.min(fuzzy.E[rule.E], fuzzy.S[rule.S], fuzzy.T[rule.T]);
    out[rule.out] = Math.max(out[rule.out], alpha);
  });

  return out;
}

function secDefuzzify(ruleOutputs) {
  let numerator = 0;
  let denominator = 0;

  Object.entries(ruleOutputs).forEach(([term, mu]) => {
    numerator += riskSingletons[term] * mu;
    denominator += mu;
  });

  return denominator === 0 ? 0 : numerator / denominator;
}

function secDominant(ruleOutputs) {
  return Object.entries(ruleOutputs).sort((a, b) => b[1] - a[1])[0][0];
}

function securityCalc(E, S, T) {
  const fuzzy = secFuzzify(E, S, T);
  const ruleOutputs = secInfer(fuzzy);
  const value = secDefuzzify(ruleOutputs);
  return {
    value,
    fuzzy,
    ruleOutputs,
    dominant: secDominant(ruleOutputs),
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

function renderMembershipBars(containerId, values) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  Object.entries(values).forEach(([term, mu]) => {
    const item = document.createElement("div");
    item.className = "membership-item";
    item.innerHTML = `
      <span class="membership-label">${translateSecurityTerm(term)}</span>
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

function drawInputGraph(canvasId, mfs, currentValue) {
  const canvas = document.getElementById(canvasId);
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p);

  ["low", "medium", "high"].forEach((term) => {
    ctx.strokeStyle = securityColors[term];
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x <= 100; x += 1) {
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

function drawRiskGraph(result) {
  const canvas = document.getElementById("riskCanvas");
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const p = 40;

  ctx.clearRect(0, 0, w, h);
  drawAxes(ctx, w, h, p);

  Object.entries(riskSingletons).forEach(([term, x]) => {
    const px = p + (x / 100) * (w - 2 * p);
    const activation = result.ruleOutputs[term];

    ctx.strokeStyle = securityColors[term] || "#7f8c8d";
    ctx.lineWidth = 1 + activation * 6;
    ctx.beginPath();
    ctx.moveTo(px, h - p);
    ctx.lineTo(px, h - p - activation * (h - 2 * p));
    ctx.stroke();

    ctx.fillStyle = "#2c3e50";
    ctx.font = "10px Arial";
    ctx.fillText(translateSecurityTerm(term), px - 18, h - p + 14);
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
  ctx.fillText(`R=${result.value.toFixed(2)}`, Math.min(w - 80, rx + 8), p + 12);
}

function translateSecurityTerm(term) {
  if (window.i18nHelper) {
    return window.i18nHelper.t(`common.terms.${term}`, term);
  }
  return term;
}

function recalculateSecurity() {
  const E = Number(document.getElementById("energySlider").value);
  const S = Number(document.getElementById("strengthSlider").value);
  const T = Number(document.getElementById("responseSlider").value);

  const result = securityCalc(E, S, T);

  document.getElementById("riskValue").textContent = result.value.toFixed(2);
  document.getElementById("riskTerm").textContent = translateSecurityTerm(result.dominant);

  renderMembershipBars("energyMembership", result.fuzzy.E);
  renderMembershipBars("strengthMembership", result.fuzzy.S);
  renderMembershipBars("responseMembership", result.fuzzy.T);
  renderMembershipBars("riskMembership", result.ruleOutputs);

  drawInputGraph("energyCanvas", securityMF.E, E);
  drawInputGraph("strengthCanvas", securityMF.S, S);
  drawInputGraph("responseCanvas", securityMF.T, T);
  drawRiskGraph(result);
}

document.addEventListener("DOMContentLoaded", async () => {
  if (window.i18nHelper) {
    await window.i18nHelper.init();
    window.i18nHelper.bindSwitcher();
  }

  bindSync("energySlider", "energyNumber", "energyValue", recalculateSecurity);
  bindSync("strengthSlider", "strengthNumber", "strengthValue", recalculateSecurity);
  bindSync("responseSlider", "responseNumber", "responseValue", recalculateSecurity);

  recalculateSecurity();
});

window.addEventListener("languageChanged", () => {
  recalculateSecurity();
});

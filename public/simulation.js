/**
 * Joint simulation of the three controllers on one stream of observations.
 *
 * Every step of the simulation is one observation window of a device: nine
 * inputs (three per controller) are produced by a scenario or set by hand,
 * the three controllers compute TI, SR and IP, and the page combines them
 * into the integral information-security level (see `assess`).
 *
 * Calculations run in the browser (static build, window.fuzzyControllers)
 * or through the API (local server), like the controller pages.
 */
(function (root) {
  "use strict";

  // ---------------------------------------------------------------------------
  // Inputs of the three controllers (keys of the API)
  // ---------------------------------------------------------------------------
  const INPUTS = [
    { controller: "trust", key: "errors", symbol: "ER", min: 0, max: 1, step: 0.001, digits: 3 },
    { controller: "trust", key: "connections", symbol: "CC", min: 0, max: 200, step: 1, digits: 0 },
    { controller: "trust", key: "bytes", symbol: "BS", min: 0, max: 12, step: 0.1, digits: 1 },
    { controller: "security", key: "energy", symbol: "EC", min: 0, max: 0.05, step: 0.001, digits: 3 },
    { controller: "security", key: "strength", symbol: "TP", min: 0, max: 40, step: 0.1, digits: 1 },
    { controller: "security", key: "response", symbol: "Lat", min: 0, max: 10, step: 0.1, digits: 1 },
    { controller: "intrusion", key: "packets", symbol: "NP", min: 0, max: 15, step: 0.1, digits: 1 },
    { controller: "intrusion", key: "rate", symbol: "Rate", min: 0, max: 3000, step: 1, digits: 0 },
    { controller: "intrusion", key: "weight", symbol: "We", min: 0, max: 250, step: 0.5, digits: 1 },
  ];
  const CONTROLLERS = ["trust", "security", "intrusion"];
  const OUTPUT = { trust: "TI", security: "SR", intrusion: "IP" };

  // Quiet operation of a device: the baseline every scenario starts from.
  const BASELINE = { errors: 0.02, connections: 12, bytes: 5, energy: 0.02, strength: 18, response: 3, packets: 9.5, rate: 10, weight: 141.5 };

  // ---------------------------------------------------------------------------
  // Scenarios: where the inputs go during an attack (at intensity 1)
  // ---------------------------------------------------------------------------
  const SCENARIOS = {
    manual: null,
    normal: { phases: [] },
    ddos: {
      phases: [{ target: { errors: 0.85, connections: 185, bytes: 3, packets: 15, rate: 2600, weight: 245, energy: 0.034, response: 8.5 } }],
    },
    exhaustion: {
      phases: [{ target: { energy: 0.048, strength: 38, response: 9.2, rate: 40, errors: 0.08 } }],
    },
    scan: {
      phases: [{ target: { connections: 150, errors: 0.55, rate: 450, packets: 12.5, bytes: 4, weight: 200 } }],
    },
    mixed: {
      phases: [
        { target: { errors: 0.85, connections: 185, bytes: 3, packets: 15, rate: 2600, weight: 245, energy: 0.034, response: 8.5 }, from: 0, to: 0.45 },
        { target: { energy: 0.048, strength: 38, response: 9.2, rate: 40, errors: 0.08 }, from: 0.55, to: 1 },
      ],
    },
  };
  const STEPS = 120;
  const RISE = 10; // steps of the ramp up
  const FALL = 14; // steps of the ramp down

  /** Small deterministic generator (LCG), so a scenario replays identically. */
  function createRandom(seed) {
    let s = (seed >>> 0) || 1;
    return {
      next() {
        s = (Math.imul(1664525, s) + 1013904223) >>> 0;
        return s / 4294967296;
      },
      normal() {
        const u = Math.max(this.next(), 1e-12), v = this.next();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
      },
    };
  }

  /** 0 → 1 → 0 envelope of one attack phase over the steps [a, b]. */
  function envelope(t, a, b) {
    if (t < a || t > b) return 0;
    if (t < a + RISE) return (t - a) / RISE;
    if (t > b - FALL) return Math.max(0, (b - t) / FALL);
    return 1;
  }

  /**
   * Inputs of step t of a scenario: baseline plus the attack profile scaled by
   * the intensity, plus a little measurement noise.
   */
  function scenarioInputs(name, t, { intensity = 1, start = 30, duration = 60, noise = 1, rnd } = {}) {
    const scenario = SCENARIOS[name];
    const values = { ...BASELINE };
    if (scenario) {
      scenario.phases.forEach((phase) => {
        const a = phase.from === undefined ? start : Math.round(start + phase.from * duration);
        const b = phase.to === undefined ? start + duration : Math.round(start + phase.to * duration);
        const e = envelope(t, a, b) * intensity;
        if (e <= 0) return;
        Object.entries(phase.target).forEach(([key, target]) => {
          values[key] = values[key] + (target - values[key]) * e;
        });
      });
    }
    INPUTS.forEach((input) => {
      const span = input.max - input.min;
      const jitter = rnd ? rnd.normal() * span * 0.012 * noise : 0;
      values[input.key] = clamp(values[input.key] + jitter, input.min, input.max);
    });
    return values;
  }

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  // ---------------------------------------------------------------------------
  // Integral information-security level
  // ---------------------------------------------------------------------------
  // The three controllers assess three facets of the security of a device:
  // the trust index TI (higher is better), the security risk SR and the
  // intrusion probability IP (lower is better). Each is mapped to a partial
  // security score on [0, 100] (TI, 100 − SR, 100 − IP) and the integral
  // level is their fuzzy conjunction with the t-norm min — the device is
  // secure if it is trusted AND its risk is low AND no intrusion is likely
  // — i.e. the "weakest link" principle of security assessment. The level is
  // described by the same five triangular terms as the trust index.
  const LEVEL_TERMS = [
    ["VeryLow", [0, 0, 25]],
    ["Low", [0, 25, 50]],
    ["Medium", [25, 50, 75]],
    ["High", [50, 75, 100]],
    ["VeryHigh", [75, 100, 100]],
  ];
  function triangle(x, [a, b, c]) {
    if (x < a || x > c) return 0;
    if (x === b) return 1;
    if (x < b) return (x - a) / (b - a || 1);
    return (c - x) / (c - b || 1);
  }
  function levelTerm(level) {
    let best = LEVEL_TERMS[0][0], bestMu = -1;
    LEVEL_TERMS.forEach(([name, p]) => {
      const mu = triangle(level, p);
      if (mu > bestMu) { bestMu = mu; best = name; }
    });
    return best;
  }
  const DEFAULT_POLICY = { warn: 50, critical: 25 };

  /**
   * @param {{trust:number|null, security:number|null, intrusion:number|null}} outputs TI, SR, IP
   * @param {{warn:number, critical:number}} policy thresholds of the integral level
   */
  function assess(outputs, policy = DEFAULT_POLICY) {
    const partial = {
      trust: outputs.trust === null || outputs.trust === undefined ? null : clamp(outputs.trust, 0, 100),
      security: outputs.security === null || outputs.security === undefined ? null : clamp(100 - outputs.security, 0, 100),
      intrusion: outputs.intrusion === null || outputs.intrusion === undefined ? null : clamp(100 - outputs.intrusion, 0, 100),
    };
    const known = CONTROLLERS.filter((c) => partial[c] !== null);
    if (!known.length) return { partial, level: null, weakest: null, term: null, status: "unknown" };
    let weakest = known[0];
    known.forEach((c) => { if (partial[c] < partial[weakest]) weakest = c; });
    const level = partial[weakest];
    const status = level < policy.critical ? "critical" : level < policy.warn ? "warning" : "normal";
    return { partial, level, weakest, term: levelTerm(level), status, mean: known.reduce((s, c) => s + partial[c], 0) / known.length };
  }

  /**
   * Zones of a 0–100 scale by the policy thresholds, in the order they are drawn.
   * Direct scale (TI, integral level): critical | warning | normal from 0 to 100.
   * Inverted scale (SR, IP, "more is worse"): normal | warning | critical.
   * @returns {Array<{from:number, to:number, status:string}>} empty zones are omitted
   */
  function policyZones(policy = DEFAULT_POLICY, inverted = false) {
    const a = clamp(policy.critical, 0, 100);
    const b = clamp(Math.max(policy.warn, policy.critical), 0, 100);
    const direct = [[0, a, "critical"], [a, b, "warning"], [b, 100, "normal"]];
    const zones = inverted ? direct.map(([from, to, status]) => [100 - to, 100 - from, status]).reverse() : direct;
    return zones.filter(([from, to]) => to > from).map(([from, to, status]) => ({ from, to, status }));
  }

  const api = { INPUTS, BASELINE, SCENARIOS, STEPS, scenarioInputs, assess, levelTerm, policyZones, createRandom, DEFAULT_POLICY };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (!root || !root.document) return;
  root.securitySimulation = api;

  // ---------------------------------------------------------------------------
  // Page
  // ---------------------------------------------------------------------------
  const t = (key, fallback = "") => (root.i18nHelper ? root.i18nHelper.t(key, fallback) : fallback || key);
  const $ = (id) => document.getElementById(id);
  const fmt = (v, d = 1) => (v === null || v === undefined || Number.isNaN(v) ? "—" : Number(v).toFixed(d));
  // Identity colours of the series: neutral hues, so that a value by itself does not look like an alarm.
  const COLORS = { trust: "#2f80ed", security: "#8e44ad", intrusion: "#16a085", level: "#2c3e50" };
  // Status colours are used only where the policy zones or the state are shown.
  const STATUS_RGB = { normal: "39, 174, 96", warning: "242, 153, 74", critical: "235, 87, 87" };
  const statusColour = (status, alpha = 1) => `rgba(${STATUS_RGB[status] || "127, 140, 141"}, ${alpha})`;
  const ZONE_TRACK_ALPHA = 0.22;

  const state = {
    scenario: "ddos",
    intensity: 1,
    start: 30,
    duration: 60,
    noise: 1,
    speed: 1,
    model: "trained",
    policy: { ...DEFAULT_POLICY },
    source: "sim",
    step: 0,
    playing: false,
    timer: null,
    rnd: createRandom(7),
    history: [], // { step, inputs, outputs, terms, assessment }
    lastStatus: null,
    log: [],
    busy: false,
  };

  // --- calculation in the browser or through the API ------------------------
  function localController(name) {
    const entry = root.fuzzyControllers?.[name];
    if (!entry) return null;
    if (state.model === "trained" && typeof entry.variant === "function") return entry.variant("trained") || entry;
    return entry;
  }

  async function calculate(name, payload) {
    const local = localController(name);
    if (local) {
      const { values } = local.parseInputs(payload);
      if (!values) return null;
      const result = local.calculate(values);
      return { value: result.value, term: result.dominantTerm, noRuleFired: Boolean(result.noRuleFired) };
    }
    const query = state.model === "trained" ? "?model=trained" : "";
    let response = await fetch(`api/controllers/${name}/calculate${query}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.status === 404 && query) {
      response = await fetch(`api/controllers/${name}/calculate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    }
    if (!response.ok) return null;
    const result = await response.json();
    return { value: result.value, term: result.dominantTerm, noRuleFired: Boolean(result.noRuleFired) };
  }

  async function evaluate(inputs) {
    const results = await Promise.all(
      CONTROLLERS.map((name) => {
        const payload = {};
        INPUTS.filter((i) => i.controller === name).forEach((i) => { payload[i.key] = inputs[i.key]; });
        return calculate(name, payload);
      })
    );
    const outputs = {}, terms = {};
    CONTROLLERS.forEach((name, i) => {
      outputs[name] = results[i] && results[i].value !== null && results[i].value !== undefined ? results[i].value : null;
      terms[name] = results[i] ? results[i].term : null;
    });
    return { outputs, terms, assessment: assess(outputs, state.policy) };
  }

  // --- inputs ----------------------------------------------------------------
  function readInputs() {
    const values = {};
    INPUTS.forEach((input) => { values[input.key] = Number($(`sim-${input.key}`).value); });
    return values;
  }
  function writeInputs(values) {
    INPUTS.forEach((input) => {
      const v = clamp(values[input.key], input.min, input.max);
      $(`sim-${input.key}`).value = v;
      $(`sim-${input.key}-num`).value = fmt(v, input.digits);
    });
  }
  function bindInputs() {
    INPUTS.forEach((input) => {
      const slider = $(`sim-${input.key}`), num = $(`sim-${input.key}-num`);
      slider.min = input.min; slider.max = input.max; slider.step = input.step;
      slider.addEventListener("input", () => { num.value = fmt(Number(slider.value), input.digits); onManualChange(); });
      num.addEventListener("change", () => {
        const v = clamp(Number(String(num.value).replace(",", ".")) || 0, input.min, input.max);
        slider.value = v; num.value = fmt(v, input.digits); onManualChange();
      });
    });
    writeInputs(BASELINE);
  }
  let manualTimer = null;
  function onManualChange() {
    if (state.playing) pause();
    if (state.scenario !== "manual") {
      state.scenario = "manual";
      $("sim-scenario").value = "manual";
      updateScenarioControls();
    }
    clearTimeout(manualTimer);
    manualTimer = setTimeout(() => recordStep(readInputs(), true), 60);
  }

  // --- simulation loop -------------------------------------------------------
  async function recordStep(inputs, manual = false) {
    if (state.busy) return;
    state.busy = true;
    try {
      const { outputs, terms, assessment } = await evaluate(inputs);
      const entry = { step: state.step, inputs: { ...inputs }, outputs, terms, assessment, manual };
      state.history.push(entry);
      if (state.history.length > 600) state.history.shift();
      logTransition(entry);
      render(entry);
      renderLive(inputs); // keep the read-only readouts in sync (scenario and device modes)
      state.step += 1;
    } finally {
      state.busy = false;
    }
  }

  function logTransition(entry) {
    const status = entry.assessment.status;
    if (status === state.lastStatus) return;
    state.lastStatus = status;
    const weakest = entry.assessment.weakest ? t(`simulation.controllers.${entry.assessment.weakest}`) : "";
    state.log.unshift({ step: entry.step, status, level: entry.assessment.level, weakest });
    if (state.log.length > 40) state.log.pop();
    renderLog();
  }

  function tick() {
    if (!state.playing) return;
    if (state.step >= STEPS) { pause(); return; }
    const inputs = scenarioInputs(state.scenario, state.step, { intensity: state.intensity, start: state.start, duration: state.duration, noise: state.noise, rnd: state.rnd });
    writeInputs(inputs);
    recordStep(inputs).then(() => {
      if (state.playing) state.timer = setTimeout(tick, Math.max(30, 400 / state.speed));
    });
  }
  function play() {
    if (state.scenario === "manual") return;
    if (state.step >= STEPS) reset();
    state.playing = true;
    $("sim-play").hidden = true;
    $("sim-pause").hidden = false;
    tick();
  }
  function pause() {
    state.playing = false;
    clearTimeout(state.timer);
    $("sim-play").hidden = false;
    $("sim-pause").hidden = true;
  }
  function stepOnce() {
    if (state.playing) pause();
    if (state.scenario === "manual") { recordStep(readInputs(), true); return; }
    if (state.step >= STEPS) return;
    const inputs = scenarioInputs(state.scenario, state.step, { intensity: state.intensity, start: state.start, duration: state.duration, noise: state.noise, rnd: state.rnd });
    writeInputs(inputs);
    recordStep(inputs);
  }
  function reset() {
    pause();
    state.step = 0;
    state.history = [];
    state.log = [];
    state.lastStatus = null;
    state.rnd = createRandom(7);
    renderLog();
    if (state.scenario === "manual") {
      recordStep(readInputs(), true);
    } else {
      const inputs = scenarioInputs(state.scenario, 0, { intensity: state.intensity, start: state.start, duration: state.duration, noise: 0 });
      writeInputs(inputs);
      recordStep(inputs);
    }
  }

  function updateScenarioControls() {
    const manual = state.scenario === "manual";
    $("sim-scenario-params").hidden = manual;
    $("sim-play").disabled = manual;
    $("sim-scenario-note").textContent = t(`simulation.scenarios.${state.scenario}Note`);
    document.documentElement.classList.toggle("is-manual-mode", manual && state.source === "sim");
  }

  // --- rendering -------------------------------------------------------------
  function termLabel(controller, term) {
    if (!term) return "—";
    return t(`common.terms.${term}`, term);
  }

  function render(entry) {
    const { outputs, terms, assessment } = entry;
    CONTROLLERS.forEach((name) => {
      $(`sim-out-${name}`).textContent = fmt(outputs[name], 2);
      $(`sim-term-${name}`).textContent = termLabel(name, terms[name]);
      drawGauge($(`sim-gauge-${name}`), outputs[name], name);
    });
    const level = assessment.level;
    $("sim-level").textContent = fmt(level, 1);
    $("sim-level-term").textContent = level === null ? "—" : t(`simulation.levels.${assessment.term}`);
    const statusEl = $("sim-status");
    statusEl.textContent = t(`simulation.status.${assessment.status}`);
    statusEl.className = `sim-status is-${assessment.status}`;
    $("sim-weakest").textContent = assessment.weakest ? t(`simulation.controllers.${assessment.weakest}`) : "—";
    $("sim-step").textContent = `${entry.step}`;
    styleLevelBar($("sim-level-bar"), level, assessment.status);
    drawRadar($("sim-radar"), assessment);
    drawTimeline($("sim-timeline"));
  }

  function renderLog() {
    const list = $("sim-log");
    list.innerHTML = "";
    if (!state.log.length) {
      const li = document.createElement("li");
      li.className = "sim-log-empty";
      li.textContent = t("simulation.log.empty");
      list.appendChild(li);
      return;
    }
    state.log.forEach((item) => {
      const li = document.createElement("li");
      li.className = `is-${item.status}`;
      li.innerHTML = `<span class="sim-log-step">${t("simulation.step")} ${item.step}</span> <strong>${t(`simulation.status.${item.status}`)}</strong> · ${t("simulation.level")} ${fmt(item.level, 1)}${item.weakest ? ` · ${t("simulation.weakestShort")}: ${item.weakest}` : ""}`;
      list.appendChild(li);
    });
  }

  function setupCanvas(canvas) {
    const dpr = root.devicePixelRatio || 1;
    const w = canvas.clientWidth || canvas.width, h = canvas.clientHeight || canvas.height;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  /**
   * Half-circle gauge 0–100 split into the policy zones (normal / warning / critical).
   * The track shows the zones in pale colours, the filled part up to the value in full colours,
   * so a value in the green zone looks normal whatever the controller.
   */
  function drawGauge(canvas, value, name) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const cx = w / 2, cy = h - 16, r = Math.min(w / 2 - 14, h - 26);
    const angle = (v) => Math.PI + (Math.PI * clamp(v, 0, 100)) / 100;
    const zones = policyZones(state.policy, name !== "trust");
    const arc = (from, to, colour) => {
      if (to <= from) return;
      ctx.strokeStyle = colour;
      ctx.beginPath(); ctx.arc(cx, cy, r, angle(from), angle(to)); ctx.stroke();
    };
    const radial = (a, r0, r1) => { ctx.beginPath(); ctx.moveTo(cx + r0 * Math.cos(a), cy + r0 * Math.sin(a)); ctx.lineTo(cx + r1 * Math.cos(a), cy + r1 * Math.sin(a)); ctx.stroke(); };
    ctx.lineWidth = 12;
    ctx.lineCap = "butt";
    // track: the zones in pale colours
    zones.forEach((z) => arc(z.from, z.to, statusColour(z.status, ZONE_TRACK_ALPHA)));
    if (value !== null && value !== undefined) {
      // fill: one colour, that of the zone the value is in
      const v = clamp(value, 0, 100);
      const zone = zones.find((z) => v < z.to) || zones[zones.length - 1];
      arc(0, v, statusColour(zone.status));
      ctx.strokeStyle = "#2c3e50"; ctx.lineWidth = 2;
      radial(angle(v), r - 9, r + 9);
    }
    // dividers at the zone boundaries, across the arc and a little outside it
    zones.slice(1).forEach((z) => {
      const a = angle(z.from);
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)"; ctx.lineWidth = 1.5; radial(a, r - 6, r + 6);
      ctx.strokeStyle = "#95a5a6"; ctx.lineWidth = 1; radial(a, r + 7, r + 11);
    });
    ctx.fillStyle = "#7f8c8d";
    ctx.font = "10px Segoe UI, sans-serif";
    ctx.textBaseline = "top";
    ctx.textAlign = "center"; ctx.fillText("0", cx - r, cy + 2);
    ctx.fillText("100", cx + r, cy + 2);
  }

  /** Style of the integral-level bar: pale zones on the track, dividers at the thresholds, fill by status. */
  function styleLevelBar(fill, level, status) {
    const zones = policyZones(state.policy);
    const track = fill.parentElement;
    track.style.backgroundImage = `linear-gradient(90deg, ${zones.map((z) => `${statusColour(z.status, ZONE_TRACK_ALPHA)} ${z.from}% ${z.to}%`).join(", ")})`;
    const dividers = zones.slice(1).map((z) => `linear-gradient(90deg, transparent calc(${z.from}% - 1px), rgba(255,255,255,0.9) calc(${z.from}% - 1px) calc(${z.from}% + 1px), transparent calc(${z.from}% + 1px))`);
    track.style.setProperty("--sim-dividers", dividers.length ? dividers.join(", ") : "none");
    fill.style.clipPath = `inset(0 ${100 - (level === null ? 0 : clamp(level, 0, 100))}% 0 0)`;
    fill.className = `sim-level-bar-fill is-${status}`;
  }

  /** "Security triangle": the three partial scores as a filled polygon. */
  function drawRadar(canvas, assessment) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const cx = w / 2, cy = h / 2 + 6, R = Math.min(w / 2 - 30, h / 2 - 28);
    const axes = [
      { key: "trust", angle: -Math.PI / 2 },
      { key: "security", angle: -Math.PI / 2 + (2 * Math.PI) / 3 },
      { key: "intrusion", angle: -Math.PI / 2 + (4 * Math.PI) / 3 },
    ];
    const pt = (angle, r) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
    // grid
    [25, 50, 75, 100].forEach((lvl) => {
      ctx.beginPath();
      axes.forEach((a, i) => { const [x, y] = pt(a.angle, (R * lvl) / 100); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.strokeStyle = lvl === 100 ? "#bdc3c7" : "#e6ebf0";
      ctx.lineWidth = 1;
      ctx.stroke();
    });
    axes.forEach((a) => {
      const [x, y] = pt(a.angle, R);
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(x, y); ctx.strokeStyle = "#dfe6ec"; ctx.stroke();
      // label above the top vertex, below the bottom ones; kept inside the canvas
      const label = t(`simulation.partial.${a.key}`);
      ctx.fillStyle = COLORS[a.key];
      ctx.font = "bold 12px Segoe UI, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const tw = ctx.measureText(label).width;
      const lx = Math.min(w - tw / 2 - 2, Math.max(tw / 2 + 2, x));
      const ly = Math.sin(a.angle) < 0 ? y - 12 : y + 14;
      ctx.fillText(label, lx, ly);
    });
    // polygon of the partial scores
    const p = assessment.partial;
    if (axes.every((a) => p[a.key] !== null)) {
      ctx.beginPath();
      axes.forEach((a, i) => { const [x, y] = pt(a.angle, (R * p[a.key]) / 100); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = statusColour(assessment.status, 0.25);
      ctx.strokeStyle = statusColour(assessment.status);
      ctx.lineWidth = 2;
      ctx.fill(); ctx.stroke();
      axes.forEach((a) => {
        const [x, y] = pt(a.angle, (R * p[a.key]) / 100);
        ctx.beginPath(); ctx.arc(x, y, 4, 0, 2 * Math.PI); ctx.fillStyle = COLORS[a.key]; ctx.fill();
        ctx.fillStyle = "#2c3e50"; ctx.font = "11px Segoe UI, sans-serif";
        const [tx, ty] = pt(a.angle, (R * p[a.key]) / 100 + 12);
        ctx.fillText(fmt(p[a.key], 0), tx, ty);
      });
    }
    // integral level in the centre
    if (assessment.level !== null) {
      ctx.fillStyle = "#2c3e50";
      ctx.font = "bold 15px Segoe UI, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(fmt(assessment.level, 0), cx, cy + 2);
    }
  }

  /** Time series of TI, SR, IP and the integral level over the steps. */
  const timeline = { pad: { l: 36, r: 12, t: 10, b: 24 }, w: 0, h: 0, n: 1, hover: null };

  function drawTimeline(canvas) {
    if (!canvas) return;
    const { ctx, w, h } = setupCanvas(canvas);
    const pad = timeline.pad;
    const W = w - pad.l - pad.r, H = h - pad.t - pad.b;
    const history = state.history;
    const n = Math.max(STEPS, history.length ? history[history.length - 1].step + 1 : 1);
    Object.assign(timeline, { w, h, n });
    const x = (step) => pad.l + (W * step) / Math.max(1, n - 1);
    const y = (v) => pad.t + H - (H * clamp(v, 0, 100)) / 100;
    // grid
    ctx.strokeStyle = "#eef2f5"; ctx.lineWidth = 1; ctx.fillStyle = "#7f8c8d"; ctx.font = "10px Segoe UI, sans-serif"; ctx.textAlign = "right"; ctx.textBaseline = "middle";
    [0, 25, 50, 75, 100].forEach((v) => { ctx.beginPath(); ctx.moveTo(pad.l, y(v)); ctx.lineTo(w - pad.r, y(v)); ctx.stroke(); ctx.fillText(String(v), pad.l - 6, y(v)); });
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    for (let s = 0; s <= n - 1; s += Math.max(10, Math.round(n / 12 / 10) * 10)) { ctx.fillText(String(s), x(s), h - pad.b + 6); }
    // policy thresholds
    [["warn", "warning"], ["critical", "critical"]].forEach(([k, st]) => {
      ctx.setLineDash([4, 4]); ctx.strokeStyle = statusColour(st); ctx.beginPath(); ctx.moveTo(pad.l, y(state.policy[k])); ctx.lineTo(w - pad.r, y(state.policy[k])); ctx.stroke(); ctx.setLineDash([]);
    });
    // status bands
    history.forEach((e, i) => {
      if (e.assessment.status === "normal") return;
      const x0 = x(e.step), x1 = x(history[i + 1] ? history[i + 1].step : e.step + 1);
      ctx.fillStyle = statusColour(e.assessment.status, 0.1);
      ctx.fillRect(x0, pad.t, Math.max(1, x1 - x0), H);
    });
    const series = [
      ["trust", (e) => e.outputs.trust, COLORS.trust, 1.5, []],
      ["security", (e) => e.outputs.security, COLORS.security, 1.5, []],
      ["intrusion", (e) => e.outputs.intrusion, COLORS.intrusion, 1.5, []],
      ["level", (e) => e.assessment.level, COLORS.level, 2.5, []],
    ];
    series.forEach(([, get, colour, width]) => {
      ctx.strokeStyle = colour; ctx.lineWidth = width; ctx.beginPath();
      let started = false;
      history.forEach((e) => {
        const v = get(e);
        if (v === null || v === undefined) { started = false; return; }
        if (started) ctx.lineTo(x(e.step), y(v)); else { ctx.moveTo(x(e.step), y(v)); started = true; }
      });
      ctx.stroke();
    });
    // hover cursor: a vertical line and a dot on every series at the step under the mouse
    const hovered = timeline.hover;
    if (hovered) {
      ctx.setLineDash([3, 3]); ctx.strokeStyle = "#7f8c8d"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x(hovered.step), pad.t); ctx.lineTo(x(hovered.step), pad.t + H); ctx.stroke(); ctx.setLineDash([]);
      series.forEach(([, get, colour]) => {
        const v = get(hovered);
        if (v === null || v === undefined) return;
        ctx.beginPath(); ctx.arc(x(hovered.step), y(v), 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.strokeStyle = colour; ctx.lineWidth = 2; ctx.stroke();
      });
    }
    // legend
    ctx.font = "11px Segoe UI, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    let lx = pad.l + 4;
    series.forEach(([key, , colour]) => {
      const label = key === "level" ? t("simulation.levelShort") : OUTPUT[key];
      ctx.fillStyle = colour; ctx.fillRect(lx, pad.t + 2, 12, 3);
      ctx.fillStyle = "#2c3e50"; ctx.fillText(label, lx + 16, pad.t + 4);
      lx += 16 + ctx.measureText(label).width + 14;
    });
  }

  // --- tooltip of the timeline (same look as the charts of the controllers) --
  function getTooltip() {
    let tip = document.getElementById("globalGraphTooltip");
    if (!tip) {
      tip = document.createElement("div");
      tip.id = "globalGraphTooltip";
      tip.className = "graph-tooltip";
      tip.setAttribute("role", "tooltip");
      document.body.appendChild(tip);
    }
    return tip;
  }
  function placeTooltip(tip, event) {
    tip.classList.add("visible");
    const width = tip.offsetWidth || 220, height = tip.offsetHeight || 80, margin = 12;
    const below = event.clientY - margin < height + 8;
    tip.classList.toggle("is-below", below);
    const half = width / 2;
    tip.style.left = `${Math.min(root.innerWidth - margin - half, Math.max(margin + half, event.clientX))}px`;
    tip.style.top = `${event.clientY}px`;
  }
  const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  function timelineTooltipHtml(entry) {
    const a = entry.assessment;
    const row = (colour, label, value, strong) =>
      `<div class="tt-row${strong ? " is-dominant" : ""}"><i style="background:${colour}"></i><span class="tt-term">${esc(label)}</span><span class="tt-mu">${fmt(value, 1)}</span><span class="tt-bar"><span style="width:${value === null ? 0 : clamp(value, 0, 100)}%"></span></span></div>`;
    const termOf = (name) => (entry.terms[name] ? ` · ${t(`common.terms.${entry.terms[name]}`, entry.terms[name])}` : "");
    return `<div class="tt-head">${esc(t("simulation.step"))} ${entry.step}</div>
      <div class="tt-cap">${esc(t("simulation.tooltip.outputs"))}</div>
      ${row(COLORS.trust, `${t("simulation.controllers.trust")} (TI)${termOf("trust")}`, entry.outputs.trust)}
      ${row(COLORS.security, `${t("simulation.controllers.security")} (SR)${termOf("security")}`, entry.outputs.security)}
      ${row(COLORS.intrusion, `${t("simulation.controllers.intrusion")} (IP)${termOf("intrusion")}`, entry.outputs.intrusion)}
      ${row(COLORS.level, `${t("simulation.levelShort")}${a.term ? ` · ${t(`simulation.levels.${a.term}`)}` : ""}`, a.level, true)}
      <div class="tt-foot">${esc(t(`simulation.status.${a.status}`))}${a.weakest ? ` · ${esc(t("simulation.weakestShort"))}: ${esc(t(`simulation.controllers.${a.weakest}`))}` : ""}</div>`;
  }
  function bindTimelineTooltip(canvas) {
    const tip = getTooltip();
    const hide = () => { tip.classList.remove("visible"); if (timeline.hover) { timeline.hover = null; drawTimeline(canvas); } };
    canvas.addEventListener("mousemove", (event) => {
      if (!state.history.length) return;
      const rect = canvas.getBoundingClientRect();
      const px = event.clientX - rect.left;
      const W = timeline.w - timeline.pad.l - timeline.pad.r;
      const step = ((px - timeline.pad.l) / Math.max(1, W)) * Math.max(1, timeline.n - 1);
      let best = state.history[0];
      state.history.forEach((e) => { if (Math.abs(e.step - step) < Math.abs(best.step - step)) best = e; });
      if (Math.abs(best.step - step) > Math.max(1.5, timeline.n / 40)) { hide(); return; }
      if (timeline.hover !== best) { timeline.hover = best; drawTimeline(canvas); }
      tip.classList.add("is-sim");
      tip.innerHTML = timelineTooltipHtml(best);
      placeTooltip(tip, event);
    });
    canvas.addEventListener("mouseleave", hide);
    canvas.addEventListener("touchstart", (event) => { const touch = event.touches[0]; if (touch) canvas.dispatchEvent(new MouseEvent("mousemove", { clientX: touch.clientX, clientY: touch.clientY })); }, { passive: true });
  }

  // --- controls --------------------------------------------------------------
  function bindControls() {
    $("sim-scenario").addEventListener("change", (e) => { state.scenario = e.target.value; updateScenarioControls(); reset(); });
    $("sim-intensity").addEventListener("input", (e) => { state.intensity = Number(e.target.value); $("sim-intensity-val").textContent = `${Math.round(state.intensity * 100)} %`; });
    $("sim-start").addEventListener("input", (e) => { state.start = Number(e.target.value); $("sim-start-val").textContent = String(state.start); });
    $("sim-duration").addEventListener("input", (e) => { state.duration = Number(e.target.value); $("sim-duration-val").textContent = String(state.duration); });
    $("sim-noise").addEventListener("input", (e) => { state.noise = Number(e.target.value); $("sim-noise-val").textContent = `${Math.round(state.noise * 100)} %`; });
    $("sim-speed").addEventListener("input", (e) => { state.speed = Number(e.target.value); $("sim-speed-val").textContent = `×${state.speed}`; });
    $("sim-model").addEventListener("change", (e) => { state.model = e.target.value; replay(); });
    $("sim-warn").addEventListener("change", (e) => { state.policy.warn = clamp(Number(e.target.value) || 0, 0, 100); replay(); });
    $("sim-critical").addEventListener("change", (e) => { state.policy.critical = clamp(Number(e.target.value) || 0, 0, 100); replay(); });
    $("sim-play").addEventListener("click", play);
    $("sim-pause").addEventListener("click", pause);
    $("sim-stepbtn").addEventListener("click", stepOnce);
    $("sim-reset").addEventListener("click", reset);
    $("sim-warn").value = state.policy.warn;
    $("sim-critical").value = state.policy.critical;
    root.addEventListener("resize", () => { const last = state.history[state.history.length - 1]; if (last) render(last); });
    root.addEventListener("languageChanged", () => {
      const last = state.history[state.history.length - 1]; if (last) render(last); renderLog(); updateScenarioControls();
      updateConnectBtn();
      if (device.connected) { setDeviceStatus("connected"); if (device.source && device.source.isDemo) $("sim-device-note").textContent = t("simulation.device.demoNote"); }
      else { setDeviceStatus("idle"); $("sim-device-note").textContent = $("sim-device").options.length <= 1 ? t("simulation.device.noDevices") : ""; }
    });
  }

  /** Recompute the recorded history (after a change of model or policy). */
  async function replay() {
    pause();
    const inputsList = state.history.map((e) => e.inputs);
    const manualFlags = state.history.map((e) => e.manual);
    state.history = []; state.log = []; state.lastStatus = null; state.step = 0;
    for (let i = 0; i < inputsList.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await recordStep(inputsList[i], manualFlags[i]);
    }
    if (!inputsList.length) reset();
  }

  // ---------------------------------------------------------------------------
  // Data source: generated scenario (simulation) vs real device (ESP32)
  // ---------------------------------------------------------------------------
  // In device mode the nine inputs are not set by hand but received, window by
  // window, from a connected IoT device through the gateway. The source is an
  // object with connect()/start(onReading)/stop()/command(name); two are
  // provided: a demo source (readings produced locally, so the interface is
  // usable before a real device exists) and an API source that talks to the
  // gateway backend (the Home Assistant add-on) at /api/devices/...
  const LABEL_KEYS = {
    errors: "index.inputs.errors", connections: "index.inputs.connections", bytes: "index.inputs.bytes",
    energy: "security.inputs.energy", strength: "security.inputs.strength", response: "security.inputs.response",
    packets: "intrusion.inputs.packets", rate: "intrusion.inputs.rate", weight: "intrusion.inputs.weight",
  };
  const UNITS = { bytes: "log₁₀", energy: "kWh/GB", strength: "dBm", response: "ms", rate: "п/с" };

  const device = { source: null, connected: false, listening: false, mode: "normal" };

  /** Demo source: free-running readings generated in the browser. */
  function demoSource() {
    const rnd = createRandom(1234);
    const current = { ...BASELINE };
    let mode = "normal", timer = null;
    const targetFor = (name) => {
      const base = { ...BASELINE };
      const sc = SCENARIOS[name];
      if (sc && sc.phases) sc.phases.forEach((ph) => Object.assign(base, ph.target));
      return base;
    };
    const reading = () => {
      const tgt = targetFor(mode);
      INPUTS.forEach((input) => {
        const k = input.key;
        const want = tgt[k] !== undefined ? tgt[k] : BASELINE[k];
        current[k] += (want - current[k]) * 0.25;
        const span = input.max - input.min;
        current[k] = clamp(current[k] + rnd.normal() * span * 0.015, input.min, input.max);
      });
      return { ...current };
    };
    return {
      id: "demo", isDemo: true,
      async connect() { return true; },
      start(onReading) { timer = setInterval(() => onReading(reading()), 1000); },
      stop() { clearInterval(timer); timer = null; },
      async command(name) { mode = name; },
    };
  }

  /** API source: real device served by the gateway backend (HA add-on). */
  function apiSource(id) {
    let es = null, poll = null;
    const url = (suffix) => `api/devices/${encodeURIComponent(id)}${suffix}`;
    return {
      id, isDemo: false,
      async connect() { const r = await fetch(url("")).catch(() => null); return Boolean(r && r.ok); },
      start(onReading) {
        try {
          es = new EventSource(url("/stream"));
          es.onmessage = (ev) => { try { const d = JSON.parse(ev.data); if (d && d.inputs) onReading(d.inputs); } catch (_) { /* skip */ } };
        } catch (_) {
          poll = setInterval(async () => {
            const r = await fetch(url("/reading")).catch(() => null);
            if (r && r.ok) { const d = await r.json(); if (d && d.inputs) onReading(d.inputs); }
          }, 1000);
        }
      },
      stop() { if (es) { es.close(); es = null; } if (poll) { clearInterval(poll); poll = null; } },
      async command(name) {
        await fetch(url("/command"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ scenario: name }) }).catch(() => { /* ignore */ });
      },
    };
  }

  function buildLive() {
    const host = $("sim-live");
    host.innerHTML = "";
    CONTROLLERS.forEach((name) => {
      const group = document.createElement("div");
      group.className = `sim-live-group sim-live-group-${name}`;
      const legend = document.createElement("div");
      legend.className = "sim-live-legend";
      legend.innerHTML = `<span data-i18n="simulation.controllers.${name}"></span> · <span data-i18n="simulation.inputGroups.${name}"></span>`;
      group.appendChild(legend);
      INPUTS.filter((i) => i.controller === name).forEach((input) => {
        const row = document.createElement("div");
        row.className = "sim-readout";
        row.innerHTML =
          `<span class="sim-readout-sym">${input.symbol}</span>` +
          `<span class="sim-readout-main"><span class="sim-readout-label" data-i18n="${LABEL_KEYS[input.key]}"></span>` +
          `<span class="sim-readout-bar"><span class="sim-readout-fill" id="live-fill-${input.key}"></span></span></span>` +
          `<span class="sim-readout-val"><span id="live-val-${input.key}">—</span>` +
          (UNITS[input.key] ? `<span class="sim-readout-unit">${UNITS[input.key]}</span>` : "") + `</span>`;
        group.appendChild(row);
      });
      host.appendChild(group);
    });
    if (root.i18nHelper) root.i18nHelper.applyTranslations(host);
  }

  function renderLive(inputs) {
    const host = $("sim-live");
    host.classList.toggle("is-waiting", !inputs);
    INPUTS.forEach((input) => {
      const val = $(`live-val-${input.key}`), fill = $(`live-fill-${input.key}`);
      if (!val || !fill) return;
      if (!inputs) { val.textContent = "—"; fill.style.width = "0"; return; }
      val.textContent = fmt(inputs[input.key], input.digits);
      fill.style.width = `${clamp((inputs[input.key] - input.min) / (input.max - input.min || 1), 0, 1) * 100}%`;
    });
  }

  function blankRender() {
    CONTROLLERS.forEach((name) => {
      $(`sim-out-${name}`).textContent = "—"; $(`sim-term-${name}`).textContent = "—";
      drawGauge($(`sim-gauge-${name}`), null, name);
    });
    $("sim-level").textContent = "—"; $("sim-level-term").textContent = "—";
    $("sim-status").textContent = t("simulation.device.waiting", ""); $("sim-status").className = "sim-status is-unknown";
    styleLevelBar($("sim-level-bar"), null, "unknown");
    $("sim-weakest").textContent = "—"; $("sim-step").textContent = "0";
    drawTimeline($("sim-timeline"));
    drawRadar($("sim-radar"), { partial: { trust: null, security: null, intrusion: null }, level: null });
  }

  function setDeviceStatus(s) {
    const dot = $("sim-device-dot"), label = $("sim-device-status");
    dot.className = "sim-device-dot" + (s === "idle" ? "" : ` is-${s}`);
    const key = { idle: "statusIdle", connecting: "statusConnecting", connected: "statusConnected", error: "statusError" }[s];
    label.textContent = t(`simulation.device.${key}`);
  }
  function setCmdEnabled(on) { document.querySelectorAll(".sim-cmd").forEach((b) => { b.disabled = !on; }); }
  function updateConnectBtn() {
    $("sim-connect").querySelector("span").textContent = t(device.connected ? "simulation.device.disconnect" : "simulation.device.connect");
  }

  function populateDevices(real) {
    const select = $("sim-device");
    const keep = select.value;
    select.innerHTML = "";
    real.forEach((dev) => { const o = document.createElement("option"); o.value = dev.id; o.textContent = dev.name || dev.id; select.appendChild(o); });
    const demo = document.createElement("option"); demo.value = "demo"; demo.textContent = t("simulation.device.demo"); select.appendChild(demo);
    if (keep && [...select.options].some((o) => o.value === keep)) select.value = keep;
    $("sim-device-note").textContent = real.length ? "" : t("simulation.device.noDevices");
    return real.length;
  }

  async function loadDevices() {
    let real = [];
    try { const r = await fetch("api/devices"); if (r.ok) { const d = await r.json(); if (Array.isArray(d)) real = d; } } catch (_) { /* no backend */ }
    populateDevices(real);
  }

  async function scanDevices() {
    const btn = $("sim-scan");
    btn.disabled = true;
    $("sim-device-note").textContent = t("simulation.device.scanning");
    let real = [];
    try { const r = await fetch("api/devices/discover"); if (r.ok) { const d = await r.json(); if (Array.isArray(d)) real = d; } } catch (_) { /* no backend */ }
    const n = populateDevices(real);
    btn.disabled = false;
    if (n) $("sim-device-note").textContent = t("simulation.device.scanFound").replace("{n}", String(n));
  }

  async function connectDevice() {
    disconnectDevice();
    const id = $("sim-device").value;
    setDeviceStatus("connecting");
    const src = id === "demo" ? demoSource() : apiSource(id);
    const ok = await src.connect();
    if (!ok) { setDeviceStatus("error"); device.source = null; return; }
    device.source = src; device.connected = true;
    setDeviceStatus("connected");
    $("sim-device-note").textContent = src.isDemo ? t("simulation.device.demoNote") : "";
    $("sim-listen").disabled = false;
    setCmdEnabled(true);
    updateConnectBtn();
    setActiveCmd(device.mode);
  }
  function disconnectDevice() {
    stopListening();
    if (device.source) device.source.stop();
    device.source = null; device.connected = false;
    $("sim-listen").disabled = true; setCmdEnabled(false);
    setDeviceStatus("idle"); updateConnectBtn();
  }
  function startListening() {
    if (!device.source || device.listening) return;
    device.listening = true;
    $("sim-listen").hidden = true; $("sim-liststop").hidden = false;
    device.source.start((inputs) => { recordStep(inputs, false); });
  }
  function stopListening() {
    if (device.source && device.listening) device.source.stop();
    device.listening = false;
    if ($("sim-listen")) $("sim-listen").hidden = false;
    if ($("sim-liststop")) $("sim-liststop").hidden = true;
  }
  function setActiveCmd(name) {
    document.querySelectorAll(".sim-cmd").forEach((b) => b.classList.toggle("is-active", b.dataset.cmd === name));
  }
  async function sendCommand(name) {
    if (!device.source) return;
    device.mode = name; setActiveCmd(name);
    await device.source.command(name);
  }

  function setSource(src) {
    if (src === state.source) return;
    pause(); disconnectDevice();
    state.source = src;
    document.documentElement.classList.toggle("is-device-mode", src === "device");
    $("sim-source-sim").classList.toggle("is-active", src === "sim");
    $("sim-source-device").classList.toggle("is-active", src === "device");
    state.step = 0; state.history = []; state.log = []; state.lastStatus = null;
    renderLog();
    updateScenarioControls(); // keeps is-manual-mode in sync with the active source
    if (src === "sim") { reset(); }
    else { renderLive(null); blankRender(); }
  }

  function bindDevice() {
    $("sim-source-sim").addEventListener("click", () => setSource("sim"));
    $("sim-source-device").addEventListener("click", () => setSource("device"));
    $("sim-connect").addEventListener("click", () => { if (device.connected) disconnectDevice(); else connectDevice(); });
    $("sim-refresh").addEventListener("click", loadDevices);
    $("sim-scan").addEventListener("click", scanDevices);
    $("sim-device").addEventListener("change", () => { if (device.connected) disconnectDevice(); });
    $("sim-listen").addEventListener("click", startListening);
    $("sim-liststop").addEventListener("click", stopListening);
    document.querySelectorAll(".sim-cmd").forEach((b) => b.addEventListener("click", () => sendCommand(b.dataset.cmd)));
  }

  async function init() {
    if (root.i18nHelper) {
      await root.i18nHelper.init();
      root.i18nHelper.bindSwitcher();
    }
    bindInputs();
    bindControls();
    buildLive();
    bindDevice();
    bindTimelineTooltip($("sim-timeline"));
    $("sim-scenario").value = state.scenario;
    updateScenarioControls();
    setDeviceStatus("idle");
    updateConnectBtn();
    await loadDevices();
    const trainedAvailable = Boolean(root.fuzzyControllers?.security?.variant?.("trained") || !root.fuzzyControllers);
    if (!trainedAvailable) {
      $("sim-model").querySelector('option[value="trained"]').disabled = true;
      state.model = "base"; // fall back to expert parameters if trained ones are unavailable
    }
    $("sim-model").value = state.model;
    await reset();
    document.documentElement.classList.remove("is-loading");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})(typeof window !== "undefined" ? window : null);

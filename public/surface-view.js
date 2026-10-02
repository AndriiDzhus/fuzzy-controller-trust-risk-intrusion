/**
 * Response surface modal: the crisp output as a function of two inputs with
 * the third input fixed at its current value (MATLAB gensurf / Surface
 * Viewer), drawn as a rotatable 3D surface on a plain canvas.
 *
 * The modal has its own sliders for all three inputs: moving an axis input
 * moves the current point, moving the fixed input rebuilds the surface.
 *
 * Uses helpers of fuzzy-page-core.js (i18nText, formatNumber, formatFieldValue,
 * getGraphOptions, inputSpecMeta, bindValueField, refreshInputControlLabels, and the page-level pageInputValues / pageHigherIsBetter,
 * which are global lexical bindings of that classic script, not window
 * properties) and the palette of term-colors.js.
 */
(function (root) {
  const DEFAULT_VIEW = { azimuth: -37.5, elevation: 30 };
  const Z_SCALE = 0.72; // height of the z axis relative to the x / y half-width
  const SURFACE_POINTS = 25;

  // ---------------------------------------------------------------------------
  // Colors: the favourable -> unfavourable scale of the term palette
  // ---------------------------------------------------------------------------

  function hexToRgb(hex) {
    const n = parseInt(String(hex).replace("#", ""), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  /**
   * t in [0, 1] -> rgb along the term palette: light green, green, blue,
   * orange, red (reversed when a higher value is favourable), linear between
   * the stops.
   */
  function colorScale(higherIsBetter) {
    const p = root.TERM_PALETTE || {};
    const stops = [p.absent, p.low, p.medium, p.high, p.peak].map((hex) => hexToRgb(hex || "#3498db"));
    if (higherIsBetter) stops.reverse();
    return (t) => {
      const clamped = Math.min(1, Math.max(0, t));
      const pos = clamped * (stops.length - 1);
      const i = Math.min(stops.length - 2, Math.floor(pos));
      const f = pos - i;
      return stops[i].map((c, k) => c + (stops[i + 1][k] - c) * f);
    };
  }

  const rgbCss = ([r, g, b], shade = 1) =>
    `rgb(${Math.round(r * shade)}, ${Math.round(g * shade)}, ${Math.round(b * shade)})`;

  // ---------------------------------------------------------------------------
  // 3D projection and drawing
  // ---------------------------------------------------------------------------

  function niceTicks(min, max, count = 5) {
    const span = max - min;
    const raw = span / count;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) || raw;
    const ticks = [];
    for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-9; v += step) {
      ticks.push(Number(v.toFixed(10)));
    }
    return ticks;
  }

  function tickDigits(range) {
    const span = range[1] - range[0];
    if (span <= 0.1) return 3;
    if (span <= 2) return 2;
    if (span <= 20) return 1;
    return 0;
  }

  // Rotates a normalised point ([-1, 1] on x / y, [-Z_SCALE, Z_SCALE] on z)
  // for the view; t grows towards the viewer.
  function rotate(nx, ny, nz, view) {
    const az = (view.azimuth * Math.PI) / 180;
    const el = (view.elevation * Math.PI) / 180;
    const rx = nx * Math.cos(az) - ny * Math.sin(az);
    const ry = nx * Math.sin(az) + ny * Math.cos(az);
    return {
      sx: rx,
      sy: ry * Math.sin(el) + nz * Math.cos(el),
      t: -ry * Math.cos(el) + nz * Math.sin(el),
    };
  }

  /**
   * Scale and centre that fit the axis box (plus room for tick and axis
   * labels) into the canvas at the default view. They are kept while the user
   * rotates, so the picture does not zoom in and out during a drag.
   */
  function fitLayout(width, height) {
    const corners = [];
    [-1, 1].forEach((a) => [-1, 1].forEach((b) => [-Z_SCALE, Z_SCALE].forEach((c) => {
      corners.push(rotate(a, b, c, DEFAULT_VIEW));
    })));
    const minX = Math.min(...corners.map((p) => p.sx));
    const maxX = Math.max(...corners.map((p) => p.sx));
    const minY = Math.min(...corners.map((p) => p.sy));
    const maxY = Math.max(...corners.map((p) => p.sy));
    const narrow = width < 600;
    // Narrow screens drop the colour bar (see drawSurface), so less right room.
    const padX = narrow ? { left: 44, right: 40 } : { left: 70, right: 110 }; // z ticks / colour bar
    const padY = narrow ? { top: 30, bottom: 56 } : { top: 40, bottom: 70 }; // z label / axis labels
    const scale = Math.min(
      (width - padX.left - padX.right) / (maxX - minX),
      (height - padY.top - padY.bottom) / (maxY - minY)
    );
    return {
      scale,
      cx: padX.left + ((width - padX.left - padX.right) - (maxX + minX) * scale) / 2,
      cy: padY.top + ((height - padY.top - padY.bottom) + (maxY + minY) * scale) / 2,
    };
  }

  function drawSurface(canvas, model, view) {
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 800;
    const cssH = canvas.clientHeight || 520;
    if (canvas.width !== Math.round(cssW * dpr) || canvas.height !== Math.round(cssH * dpr)) {
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
    }
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);

    const { x, y, z, xRange, yRange, zRange } = model;
    const { scale, cx, cy } = fitLayout(cssW, cssH);

    const norm = (v, [a, b]) => ((v - a) / (b - a || 1)) * 2 - 1;
    // World (x right, y depth, z up) -> screen; t grows towards the viewer.
    const project = (xv, yv, zv) => {
      const nx = norm(xv, xRange);
      const ny = norm(yv, yRange);
      const nz = norm(zv, zRange) * Z_SCALE;
      const r = rotate(nx, ny, nz, view);
      return { px: cx + r.sx * scale, py: cy - r.sy * scale, t: r.t };
    };

    const [x0, x1] = xRange;
    const [y0, y1] = yRange;
    const [z0, z1] = zRange;
    // Back walls are the ones farther from the viewer.
    const xFar = project(x0, (y0 + y1) / 2, z0).t < project(x1, (y0 + y1) / 2, z0).t ? x0 : x1;
    const yFar = project((x0 + x1) / 2, y0, z0).t < project((x0 + x1) / 2, y1, z0).t ? y0 : y1;
    const xNear = xFar === x0 ? x1 : x0;
    const yNear = yFar === y0 ? y1 : y0;

    const line = (a, b, color, width = 1, dash = null) => {
      ctx.beginPath();
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.setLineDash(dash || []);
      ctx.moveTo(a.px, a.py);
      ctx.lineTo(b.px, b.py);
      ctx.stroke();
      ctx.setLineDash([]);
    };

    // Floor and back walls with grid lines
    const xTicks = niceTicks(x0, x1);
    const yTicks = niceTicks(y0, y1);
    const zTicks = niceTicks(z0, z1);
    const grid = "rgba(44, 62, 80, 0.12)";
    const edge = "rgba(44, 62, 80, 0.45)";
    xTicks.forEach((v) => {
      line(project(v, y0, z0), project(v, y1, z0), grid);
      line(project(v, yFar, z0), project(v, yFar, z1), grid);
    });
    yTicks.forEach((v) => {
      line(project(x0, v, z0), project(x1, v, z0), grid);
      line(project(xFar, v, z0), project(xFar, v, z1), grid);
    });
    zTicks.forEach((v) => {
      line(project(x0, yFar, v), project(x1, yFar, v), grid);
      line(project(xFar, y0, v), project(xFar, y1, v), grid);
    });
    line(project(xFar, yFar, z0), project(xFar, yFar, z1), edge);

    // Surface quads, far to near (painter's algorithm)
    const color = colorScale(model.higherIsBetter);
    const quads = [];
    for (let j = 0; j < y.length - 1; j += 1) {
      for (let i = 0; i < x.length - 1; i += 1) {
        const zs = [z[j][i], z[j][i + 1], z[j + 1][i + 1], z[j + 1][i]];
        if (zs.some((v) => v === null || v === undefined)) continue; // no rule fired
        const pts = [
          project(x[i], y[j], zs[0]),
          project(x[i + 1], y[j], zs[1]),
          project(x[i + 1], y[j + 1], zs[2]),
          project(x[i], y[j + 1], zs[3]),
        ];
        const zAvg = (zs[0] + zs[1] + zs[2] + zs[3]) / 4;
        // Simple shading from the slope of the quad in normalised units
        const dzdx = (norm(zs[1], zRange) - norm(zs[0], zRange)) * Z_SCALE /
          (norm(x[i + 1], xRange) - norm(x[i], xRange));
        const dzdy = (norm(zs[3], zRange) - norm(zs[0], zRange)) * Z_SCALE /
          (norm(y[j + 1], yRange) - norm(y[j], yRange));
        const nlen = Math.hypot(dzdx, dzdy, 1);
        const shade = 0.78 + 0.22 * (1 / nlen);
        quads.push({ pts, t: pts.reduce((acc, p) => acc + p.t, 0) / 4, fill: rgbCss(color((zAvg - z0) / (z1 - z0 || 1)), shade) });
      }
    }
    quads.sort((a, b) => a.t - b.t);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = "rgba(44, 62, 80, 0.35)";
    quads.forEach(({ pts, fill }) => {
      ctx.beginPath();
      ctx.moveTo(pts[0].px, pts[0].py);
      pts.slice(1).forEach((p) => ctx.lineTo(p.px, p.py));
      ctx.closePath();
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.stroke();
    });

    // Axes with ticks and labels on the near floor edges and the far corner
    ctx.fillStyle = "#5d6d7e";
    ctx.font = "11px Arial";
    const fmt = (v, range) => model.formatNumber(v, tickDigits(range));
    const label = (p, text, dx, dy, align = "center") => {
      ctx.textAlign = align;
      ctx.fillText(text, p.px + dx, p.py + dy);
    };
    const outward = (p, from) => {
      const dx = p.px - from.px;
      const dy = p.py - from.py;
      const len = Math.hypot(dx, dy) || 1;
      return [dx / len, dy / len];
    };
    const center = project((x0 + x1) / 2, (y0 + y1) / 2, z0);
    line(project(x0, yNear, z0), project(x1, yNear, z0), edge);
    line(project(xNear, y0, z0), project(xNear, y1, z0), edge);
    xTicks.forEach((v) => {
      const p = project(v, yNear, z0);
      const [ux, uy] = outward(project((x0 + x1) / 2, yNear, z0), center);
      label(p, fmt(v, xRange), ux * 16, uy * 16 + 4);
    });
    yTicks.forEach((v) => {
      const p = project(xNear, v, z0);
      const [ux, uy] = outward(project(xNear, (y0 + y1) / 2, z0), center);
      label(p, fmt(v, yRange), ux * 18, uy * 18 + 4);
    });
    // z axis on the leftmost back corner
    const corners = [[x0, y0], [x0, y1], [x1, y0], [x1, y1]]
      .map(([a, b]) => ({ a, b, p: project(a, b, z0) }))
      .sort((m, n) => m.p.px - n.p.px);
    const zc = corners[0];
    line(project(zc.a, zc.b, z0), project(zc.a, zc.b, z1), edge);
    zTicks.forEach((v) => label(project(zc.a, zc.b, v), fmt(v, zRange), -8, 4, "right"));

    ctx.fillStyle = "#2c3e50";
    ctx.font = "italic 13px Arial";
    {
      const p = project((x0 + x1) / 2, yNear, z0);
      const [ux, uy] = outward(p, center);
      label(p, model.xLabel, ux * 64, uy * 64 + 6);
    }
    {
      const p = project(xNear, (y0 + y1) / 2, z0);
      const [ux, uy] = outward(p, center);
      label(p, model.yLabel, ux * 64, uy * 64 + 6);
    }
    label(project(zc.a, zc.b, z1), model.zLabel, 0, -12);

    // Current point with a drop line to the floor
    if (model.point && Number.isFinite(model.point.z)) {
      const { x: px, y: py, z: pz } = model.point;
      const top = project(px, py, pz);
      const floor = project(px, py, z0);
      line(floor, top, "#111", 1.5, [5, 4]);
      ctx.beginPath();
      ctx.arc(floor.px, floor.py, 3, 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(top.px, top.py, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#111";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "#fff";
      ctx.stroke();
      ctx.font = "bold 12px Arial";
      ctx.textAlign = "left";
      const text = model.pointLabel;
      const w = ctx.measureText(text).width;
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      ctx.fillRect(top.px + 10, top.py - 22, w + 10, 18);
      ctx.fillStyle = "#111";
      ctx.fillText(text, top.px + 15, top.py - 9);
    }

    // Color bar (desktop only: on narrow screens it would cover the y axis label)
    if (cssW < 600) return;
    const barX = cssW - 46;
    const barTop = cssH * 0.18;
    const barH = cssH * 0.6;
    for (let k = 0; k < barH; k += 1) {
      ctx.fillStyle = rgbCss(color(1 - k / barH));
      ctx.fillRect(barX, barTop + k, 12, 1);
    }
    ctx.strokeStyle = "rgba(44, 62, 80, 0.4)";
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barTop, 12, barH);
    ctx.fillStyle = "#5d6d7e";
    ctx.font = "11px Arial";
    ctx.textAlign = "left";
    zTicks.forEach((v) => {
      const yy = barTop + barH * (1 - (v - z0) / (z1 - z0 || 1));
      ctx.fillText(fmt(v, zRange), barX + 16, yy + 4);
    });
  }

  // ---------------------------------------------------------------------------
  // Modal
  // ---------------------------------------------------------------------------

  const text = (key, fallback) =>
    typeof root.i18nText === "function" ? root.i18nText(key, fallback) : fallback;

  function axisLabel(config, key) {
    const graph = config.graphs.inputs[key];
    return (typeof root.getGraphOptions === "function" && root.getGraphOptions(graph).axisLabels?.x) || key;
  }

  function axisSymbol(config, key) {
    return axisLabel(config, key).split(",")[0].trim();
  }

  async function fetchSurface(controller, request) {
    const local =
      typeof root.localController === "function" ? root.localController(controller) : root.fuzzyControllers?.[controller];
    if (local?.surface) {
      const { surface } = local.surface(request);
      return surface || null;
    }
    const body = typeof root.withModelParams === "function" ? root.withModelParams(request) : request;
    const response = await fetch(`/api/controllers/${controller}/surface`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok ? response.json() : null;
  }

  function ensureModal() {
    let modal = document.getElementById("surfaceModal");
    if (modal) return modal;
    modal = document.createElement("div");
    modal.id = "surfaceModal";
    modal.className = "docs-modal surface-modal";
    modal.hidden = true;
    modal.innerHTML = `
      <div class="docs-modal-backdrop" data-surface-close="1"></div>
      <div class="docs-modal-dialog surface-dialog" role="dialog" aria-modal="true" aria-labelledby="surfaceModalTitle">
        <div class="docs-modal-header">
          <h2 id="surfaceModalTitle"></h2>
          <button type="button" class="docs-modal-close" data-surface-close="1">×</button>
        </div>
        <div class="docs-modal-body">
          <div class="surface-toolbar">
            <div class="surface-pairs" role="group"></div>
            <span class="surface-fixed"></span>
          </div>
          <div class="surface-inputs sticky-inputs-controls"></div>
          <div class="surface-canvas-wrap">
            <canvas class="surface-canvas"></canvas>
            <p class="surface-status" hidden></p>
          </div>
          <p class="docs-hint surface-hint"></p>
        </div>
      </div>`;
    document.body.appendChild(modal);
    return modal;
  }

  /**
   * Sliders + value fields for every input inside the modal. They share
   * applyInputValue with the page (ids `${sliderId}Surface` /
   * `${numberId}Surface`), so the form, the sticky bar and the modal always
   * show the same values; `onChange(key)` runs after each accepted value.
   */
  function buildInputControls(container, config, applyInputValue, onChange) {
    container.innerHTML = "";
    config.inputs.forEach((spec) => {
      const { min, max, step } = root.inputSpecMeta(spec);
      // eslint-disable-next-line no-undef
      const value = typeof pageInputValues !== "undefined" ? pageInputValues[spec.key] : min;
      const group = document.createElement("div");
      group.className = "sticky-input-group surface-input-group";
      group.dataset.key = spec.key;
      group.innerHTML = `
        <label class="sticky-input-label" for="${spec.sliderId}Surface">
          <span class="sticky-input-letter"></span>
          <span class="sticky-input-name"></span>
        </label>
        <input type="range" id="${spec.sliderId}Surface" min="${min}" max="${max}" step="${step}" value="${value}" />
        <input type="text" inputmode="decimal" autocomplete="off" class="value-input" id="${spec.numberId}Surface" value="${root.formatFieldValue(value)}" />`;
      container.appendChild(group);

      const slider = group.querySelector("input[type=range]");
      const field = group.querySelector("input.value-input");
      slider.addEventListener("input", () => {
        applyInputValue(spec, Number(slider.value));
        onChange(spec.key);
      });
      root.bindValueField(field, spec, { applyInputValue, recalc: () => onChange(spec.key) });
    });
  }

  function setupSurfaceModal(config, { applyInputValue, recalc } = {}) {
    const button = document.querySelector("[data-surface]");
    if (!button) return;
    const modal = ensureModal();
    const canvas = modal.querySelector(".surface-canvas");
    const pairsEl = modal.querySelector(".surface-pairs");
    const fixedEl = modal.querySelector(".surface-fixed");
    const inputsEl = modal.querySelector(".surface-inputs");
    const statusEl = modal.querySelector(".surface-status");
    const keys = config.inputs.map((spec) => spec.key);
    const pairs = [[keys[0], keys[1]], [keys[0], keys[2]], [keys[1], keys[2]]];
    const outputKey = config.graphs.output.key;
    const state = { pair: 0, view: { ...DEFAULT_VIEW }, model: null, request: 0, busy: false, pending: false };

    // eslint-disable-next-line no-undef
    const currentInputs = () => ({ ...(typeof pageInputValues !== "undefined" ? pageInputValues : {}) });
    const currentPair = () => pairs[state.pair];
    const fixedKey = () => keys.find((key) => !currentPair().includes(key));

    const outSymbol = () => text(config.graphs.output.axisLabels?.xKey, outputKey).split(",")[0].trim();
    const format = (v, digits) =>
      root.formatNumber(v, { minimumFractionDigits: digits, maximumFractionDigits: digits });

    const redraw = () => {
      if (state.model) drawSurface(canvas, state.model, state.view);
    };

    const renderFixed = () => {
      const key = fixedKey();
      fixedEl.textContent = text("common.surface.fixed", "{name} = {value}")
        .replace("{name}", axisSymbol(config, key))
        .replace("{value}", root.formatFieldValue(currentInputs()[key]));
      inputsEl.querySelectorAll(".surface-input-group").forEach((group) => {
        group.classList.toggle("is-fixed", group.dataset.key === key);
      });
    };

    // The current result as a point on the surface (taken from the page state,
    // which recalc() has just updated).
    const currentPoint = () => {
      const result = root.fuzzyPageState?.result;
      const hasPoint = result && result.value !== null && result.value !== undefined && !result.noRuleFired;
      if (!hasPoint) return { point: null, pointLabel: "" };
      const [xKey, yKey] = currentPair();
      const inputs = currentInputs();
      return {
        point: { x: inputs[xKey], y: inputs[yKey], z: result.value },
        pointLabel: `${outSymbol()} = ${format(result.value, 2)}`,
      };
    };

    const renderChrome = () => {
      document.getElementById("surfaceModalTitle").textContent = text(
        "common.surface.title",
        "Поверхня відгуку"
      ).replace("{output}", text(config.surface?.outputTitleKey, outputKey));
      modal.querySelector(".docs-modal-close").setAttribute("aria-label", text("common.docs.close", "Close"));
      pairsEl.innerHTML = pairs
        .map(
          ([a, b], index) =>
            `<button type="button" class="docs-btn surface-pair${index === state.pair ? " is-active" : ""}" data-pair="${index}">${axisSymbol(
              config,
              a
            )} × ${axisSymbol(config, b)}</button>`
        )
        .join("");
      if (typeof root.refreshInputControlLabels === "function") root.refreshInputControlLabels(config, "Surface");
      modal.querySelector(".surface-hint").textContent = text("common.surface.hint", "");
    };

    /**
     * Recomputes the surface grid. `quiet` keeps the previous picture on
     * screen while the new one is computed (used while a slider is dragged);
     * only the newest request is drawn.
     */
    const load = async ({ quiet = false } = {}) => {
      const [xKey, yKey] = currentPair();
      const inputs = currentInputs();
      const request = ++state.request;
      renderFixed();
      if (!quiet) {
        statusEl.hidden = false;
        statusEl.textContent = text("common.surface.loading", "…");
        state.model = null;
        canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
      }

      const surface = await fetchSurface(config.controller, { xKey, yKey, inputs, points: SURFACE_POINTS });
      if (request !== state.request) return;
      statusEl.hidden = true;
      if (!surface) {
        statusEl.hidden = false;
        statusEl.textContent = text("common.surface.error", "Error");
        return;
      }

      state.model = {
        ...surface,
        xRange: [surface.x[0], surface.x.at(-1)],
        yRange: [surface.y[0], surface.y.at(-1)],
        zRange: [0, 100],
        xLabel: axisLabel(config, xKey),
        yLabel: axisLabel(config, yKey),
        zLabel: outSymbol(),
        // eslint-disable-next-line no-undef
        higherIsBetter: typeof pageHigherIsBetter !== "undefined" && pageHigherIsBetter.has(outputKey),
        formatNumber: format,
        ...currentPoint(),
      };
      redraw();
    };

    // At most one surface computation at a time; changes that arrive meanwhile
    // collapse into a single follow-up run with the latest values.
    const reloadQuietly = async () => {
      if (state.busy) {
        state.pending = true;
        return;
      }
      state.busy = true;
      try {
        do {
          state.pending = false;
          await load({ quiet: true });
          await new Promise((resolve) => requestAnimationFrame(resolve));
        } while (state.pending);
      } finally {
        state.busy = false;
      }
    };

    // An input changed in the modal: recalculate the page result, then either
    // move the point (an axis input) or rebuild the surface (the fixed input).
    const onInputChange = async (key) => {
      if (recalc) await recalc();
      if (modal.hidden) return;
      if (key === fixedKey()) {
        reloadQuietly();
      } else if (state.model) {
        Object.assign(state.model, currentPoint());
        redraw();
      }
    };

    if (applyInputValue) buildInputControls(inputsEl, config, applyInputValue, onInputChange);

    const syncControls = () => {
      const inputs = currentInputs();
      config.inputs.forEach((spec) => {
        const slider = document.getElementById(`${spec.sliderId}Surface`);
        const field = document.getElementById(`${spec.numberId}Surface`);
        if (slider) slider.value = inputs[spec.key];
        if (field) {
          field.value = root.formatFieldValue(inputs[spec.key]);
          field.classList.remove("is-invalid");
        }
      });
    };

    const open = () => {
      state.view = { ...DEFAULT_VIEW };
      syncControls();
      renderChrome();
      modal.hidden = false;
      document.body.classList.add("docs-modal-open");
      load();
    };
    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("docs-modal-open");
    };

    button.addEventListener("click", open);
    modal.addEventListener("click", (event) => {
      if (event.target.closest("[data-surface-close]")) close();
      const pairBtn = event.target.closest("[data-pair]");
      if (pairBtn) {
        state.pair = Number(pairBtn.dataset.pair);
        state.view = { ...DEFAULT_VIEW };
        renderChrome();
        load();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) close();
    });

    // Rotation: drag horizontally for azimuth, vertically for elevation.
    let drag = null;
    canvas.addEventListener("pointerdown", (event) => {
      drag = { x: event.clientX, y: event.clientY, view: { ...state.view } };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (!drag) return;
      state.view = {
        azimuth: drag.view.azimuth + (event.clientX - drag.x) * 0.5,
        elevation: Math.min(89, Math.max(5, drag.view.elevation + (event.clientY - drag.y) * 0.4)),
      };
      redraw();
    });
    const endDrag = () => {
      drag = null;
    };
    canvas.addEventListener("pointerup", endDrag);
    canvas.addEventListener("pointercancel", endDrag);
    canvas.addEventListener("dblclick", () => {
      state.view = { ...DEFAULT_VIEW };
      redraw();
    });
    window.addEventListener("resize", () => {
      if (!modal.hidden) redraw();
    });
    window.addEventListener("languageChanged", () => {
      if (modal.hidden) return;
      syncControls();
      renderChrome();
      load();
    });
  }

  root.setupSurfaceModal = setupSurfaceModal;
  root.drawSurface = drawSurface;
})(typeof window !== "undefined" ? window : globalThis);

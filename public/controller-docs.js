const L = "low";
const M = "medium";
const H = "high";
const VL = "veryLow";
const VH = "veryHigh";
const NONE = "none";

const controllerDocs = {
  trust: {
    hintKey: "common.docs.piecewiseHint",
    inputs: [
      {
        symbol: "E",
        titleKey: "index.membership.errors",
        gender: "f",
        terms: [
          { term: L, mu: "L", pieces: [["1", "0 ≤ E ≤ 30"], ["(50 − E) / (50 − 30)", "30 < E < 50"], ["0", "E ≥ 50"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "E ≤ 30 або E ≥ 90"],
              ["(E − 30) / (50 − 30)", "30 < E < 50"],
              ["1", "50 ≤ E ≤ 70"],
              ["(90 − E) / (90 − 70)", "70 < E < 90"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "E ≤ 70"], ["(E − 70) / (90 − 70)", "70 < E < 90"], ["1", "90 ≤ E ≤ 100"]] },
        ],
      },
      {
        symbol: "C",
        titleKey: "index.membership.connections",
        gender: "f",
        terms: [
          { term: L, mu: "L", pieces: [["1", "0 ≤ C ≤ 10"], ["(30 − C) / (30 − 10)", "10 < C < 30"], ["0", "C ≥ 30"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "C ≤ 10 або C ≥ 70"],
              ["(C − 10) / (30 − 10)", "10 < C < 30"],
              ["1", "30 ≤ C ≤ 50"],
              ["(70 − C) / (70 − 50)", "50 < C < 70"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "C ≤ 50"], ["(C − 50) / (70 − 50)", "50 < C < 70"], ["1", "70 ≤ C ≤ 100"]] },
        ],
      },
      {
        symbol: "B",
        titleKey: "index.membership.bytes",
        gender: "f",
        terms: [
          { term: L, mu: "L", pieces: [["1", "0 ≤ B ≤ 20"], ["(40 − B) / (40 − 20)", "20 < B < 40"], ["0", "B ≥ 40"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "B ≤ 20 або B ≥ 80"],
              ["(B − 20) / (40 − 20)", "20 < B < 40"],
              ["1", "40 ≤ B ≤ 60"],
              ["(80 − B) / (80 − 60)", "60 < B < 80"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "B ≤ 60"], ["(B − 60) / (80 − 60)", "60 < B < 80"], ["1", "80 ≤ B ≤ 100"]] },
        ],
      },
    ],
    output: {
      symbol: "T",
      titleKey: "index.membership.trust",
      gender: "m",
      terms: [
        { term: VL, mu: "VL", pieces: [["(25 − T) / (25 − 0)", "0 ≤ T ≤ 25"], ["0", "T > 25"]] },
        {
          term: L,
          mu: "L",
          pieces: [
            ["(T − 0) / (25 − 0)", "0 ≤ T ≤ 25"],
            ["(50 − T) / (50 − 25)", "25 < T ≤ 50"],
            ["0", "інакше"],
          ],
        },
        {
          term: M,
          mu: "M",
          pieces: [
            ["(T − 25) / (50 − 25)", "25 ≤ T ≤ 50"],
            ["(75 − T) / (75 − 50)", "50 < T ≤ 75"],
            ["0", "інакше"],
          ],
        },
        {
          term: H,
          mu: "H",
          pieces: [
            ["(T − 50) / (75 − 50)", "50 ≤ T ≤ 75"],
            ["(100 − T) / (100 − 75)", "75 < T ≤ 100"],
            ["0", "інакше"],
          ],
        },
        { term: VH, mu: "VH", pieces: [["0", "T < 75"], ["(T − 75) / (100 − 75)", "75 ≤ T ≤ 100"]] },
      ],
    },
    rules: {
      columns: [
        { key: "E", gender: "f", titleKey: "index.membership.errors" },
        { key: "C", gender: "f", titleKey: "index.membership.connections" },
        { key: "B", gender: "f", titleKey: "index.membership.bytes" },
        { key: "T", gender: "m", titleKey: "index.membership.trust", output: true },
      ],
      rows: [
        [L, L, L, VH],
        [L, L, M, VH],
        [L, L, H, VH],
        [L, M, L, VH],
        [L, M, M, VH],
        [L, M, H, H],
        [L, H, L, H],
        [L, H, M, H],
        [L, H, H, H],
        [M, L, L, H],
        [M, L, M, H],
        [M, L, H, M],
        [M, M, L, M],
        [M, M, M, M],
        [M, M, H, M],
        [M, H, L, M],
        [M, H, M, L],
        [M, H, H, L],
        [H, L, L, L],
        [H, L, M, L],
        [H, L, H, L],
        [H, M, L, L],
        [H, M, M, VL],
        [H, M, H, VL],
        [H, H, L, VL],
        [H, H, M, VL],
        [H, H, H, VL],
      ],
    },
  },
  security: {
    hintKey: "common.docs.piecewiseHint",
    outputHintKey: "common.docs.singletonHint",
    inputs: [
      {
        symbol: "E",
        titleKey: "security.membership.energy",
        gender: "n",
        terms: [
          { term: L, mu: "L", pieces: [["(20 − E) / (20 − 0)", "0 ≤ E ≤ 20"], ["0", "E > 20"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "E ≤ 10 або E ≥ 70"],
              ["(E − 10) / (40 − 10)", "10 < E ≤ 40"],
              ["(70 − E) / (70 − 40)", "40 < E < 70"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "E ≤ 50"], ["(E − 50) / (100 − 50)", "50 < E ≤ 100"]] },
        ],
      },
      {
        symbol: "S",
        titleKey: "security.membership.strength",
        gender: "f",
        terms: [
          { term: L, mu: "L", pieces: [["(50 − S) / (50 − 0)", "0 ≤ S ≤ 50"], ["0", "S > 50"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "S ≤ 30 або S ≥ 90"],
              ["(S − 30) / (60 − 30)", "30 < S ≤ 60"],
              ["(90 − S) / (90 − 60)", "60 < S < 90"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "S ≤ 70"], ["(S − 70) / (100 − 70)", "70 < S ≤ 100"]] },
        ],
      },
      {
        symbol: "T",
        titleKey: "security.membership.response",
        gender: "m",
        terms: [
          { term: L, mu: "L", pieces: [["(20 − T) / (20 − 0)", "0 ≤ T ≤ 20"], ["0", "T > 20"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "T ≤ 10 або T ≥ 90"],
              ["(T − 10) / (50 − 10)", "10 < T ≤ 50"],
              ["(90 − T) / (90 − 50)", "50 < T < 90"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "T ≤ 80"], ["(T − 80) / (100 − 80)", "80 < T ≤ 100"]] },
        ],
      },
    ],
    output: {
      symbol: "R",
      titleKey: "security.membership.risk",
      gender: "m",
      kind: "singleton",
      domainValues: [0, 20, 40, 60, 80, 100],
      terms: [
        { term: NONE, mu: "none", singleton: 0 },
        { term: VL, mu: "VL", singleton: 20 },
        { term: L, mu: "L", singleton: 40 },
        { term: M, mu: "M", singleton: 60 },
        { term: H, mu: "H", singleton: 80 },
        { term: VH, mu: "VH", singleton: 100 },
      ],
    },
    rules: {
      columns: [
        { key: "E", gender: "n", titleKey: "security.membership.energy" },
        { key: "S", gender: "f", titleKey: "security.membership.strength" },
        { key: "T", gender: "m", titleKey: "security.membership.response" },
        { key: "R", gender: "m", titleKey: "security.membership.risk", output: true },
      ],
      rows: [
        [L, H, L, NONE],
        [L, H, M, VL],
        [M, M, L, L],
        [M, L, M, M],
        [H, M, H, H],
        [H, L, H, VH],
      ],
    },
  },
  intrusion: {
    hintKey: "common.docs.gaussianHint",
    inputs: [
      {
        symbol: "N",
        titleKey: "intrusion.membership.packets",
        gender: "f",
        terms: [
          { term: L, mu: "L", gaussian: { center: 0, sigma: 18 } },
          { term: M, mu: "M", gaussian: { center: 60, sigma: 20 } },
          { term: H, mu: "H", gaussian: { center: 100, sigma: 12 } },
        ],
      },
      {
        symbol: "R",
        titleKey: "intrusion.membership.rate",
        gender: "f",
        terms: [
          { term: L, mu: "L", gaussian: { center: 0, sigma: 8 } },
          { term: M, mu: "M", gaussian: { center: 45, sigma: 24 } },
          { term: H, mu: "H", gaussian: { center: 100, sigma: 12 } },
        ],
      },
      {
        symbol: "D",
        titleKey: "intrusion.membership.delivery",
        gender: "f",
        terms: [
          { term: L, mu: "L", gaussian: { center: 0, sigma: 20 } },
          { term: M, mu: "M", gaussian: { center: 65, sigma: 16 } },
          { term: H, mu: "H", gaussian: { center: 100, sigma: 6 } },
        ],
      },
    ],
    output: {
      symbol: "I",
      titleKey: "intrusion.membership.intrusion",
      gender: "f",
      terms: [
        { term: NONE, mu: "none", gaussian: { center: 0, sigma: 12 } },
        { term: L, mu: "L", gaussian: { center: 35, sigma: 12 } },
        { term: M, mu: "M", gaussian: { center: 65, sigma: 12 } },
        { term: H, mu: "H", gaussian: { center: 100, sigma: 12 } },
      ],
    },
    rules: {
      columns: [
        { key: "N", gender: "f", titleKey: "intrusion.membership.packets" },
        { key: "R", gender: "f", titleKey: "intrusion.membership.rate" },
        { key: "D", gender: "f", titleKey: "intrusion.membership.delivery" },
        { key: "I", gender: "f", titleKey: "intrusion.membership.intrusion", output: true },
      ],
      rows: [
        [L, L, M, L],
        [L, M, L, NONE],
        [L, M, H, NONE],
        [L, H, M, NONE],
        [M, L, L, M],
        [M, M, L, M],
        [M, M, H, L],
        [M, H, H, L],
        [H, L, M, H],
        [H, M, L, H],
        [H, M, H, H],
        [H, H, M, M],
      ],
    },
  },
};

const docsTermColor = {
  none: "#95a5a6",
  veryLow: "#1abc9c",
  low: "#e74c3c",
  medium: "#3498db",
  high: "#27ae60",
  veryHigh: "#8e44ad",
};

function docsText(key, fallback = "") {
  if (window.i18nHelper) return window.i18nHelper.t(key, fallback);
  return fallback || key;
}

function docsEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function lingLabel(term, gender = "m") {
  if (term === NONE) return docsText("common.docs.ling.none", "—");
  if (term === VL) return docsText("common.docs.ling.veryLow");
  if (term === VH) return docsText("common.docs.ling.veryHigh");
  const suffix = { f: "F", n: "N", m: "M" }[gender] || "M";
  return docsText(`common.docs.ling.${term}${suffix}`, term);
}

function latexMu(mu) {
  return `\\mathrm{${mu}}`;
}

function latexExpr(expr) {
  const cleaned = String(expr).replace(/−/g, "-").trim();
  const both = cleaned.match(/^\((.+)\)\s*\/\s*\((.+)\)$/);
  if (both) return `\\dfrac{${both[1]}}{${both[2]}}`;
  const grouped = cleaned.match(/^\((.+)\)\s*\/\s*(.+)$/);
  if (grouped) return `\\dfrac{${grouped[1]}}{${grouped[2]}}`;
  const simple = cleaned.match(/^(.+)\s*\/\s*(.+)$/);
  if (simple) return `\\dfrac{${simple[1]}}{${simple[2]}}`;
  return cleaned;
}

function latexCond(cond) {
  const otherwise = docsText("common.docs.otherwise", "інакше");
  const orWord = docsText("common.docs.or", "або");
  return String(cond)
    .replace(/інакше|otherwise/g, `\\text{${otherwise}}`)
    .replace(/або|\bor\b/g, `\\text{ ${orWord} }`)
    .replace(/≤/g, "\\le ")
    .replace(/≥/g, "\\ge ")
    .replace(/−/g, "-");
}

function renderKatex(tex, displayMode = true) {
  if (!window.katex) {
    return `<pre class="docs-tex-fallback">${docsEscape(tex)}</pre>`;
  }
  return window.katex.renderToString(tex, {
    displayMode,
    throwOnError: false,
    strict: "ignore",
  });
}

function wrapKatex(tex, displayMode = true) {
  return `<div class="docs-katex">${renderKatex(tex, displayMode)}</div>`;
}

function renderGaussian(symbol, term) {
  const { center, sigma } = term.gaussian;
  const deviation = center === 0 ? symbol : `${symbol} - ${center}`;
  return wrapKatex(
    `\\mu_{${latexMu(term.mu)}}(${symbol}) = \\exp\\!\\left(-\\dfrac{(${deviation})^{2}}{2 \\cdot ${sigma}^{2}}\\right)`
  );
}

function renderPiecewise(symbol, term) {
  const rows = term.pieces
    .map(([expr, cond]) => `${latexExpr(expr)} & ${latexCond(cond)}`)
    .join(" \\\\ ");
  return wrapKatex(`\\mu_{${latexMu(term.mu)}}(${symbol}) = \\begin{cases} ${rows} \\end{cases}`);
}

function renderSingleton(symbol, term) {
  const otherwise = docsText("common.docs.otherwise", "інакше");
  return (
    wrapKatex(
      `\\mu_{${latexMu(term.mu)}}(${symbol}) = \\begin{cases} 1, & ${symbol} = ${term.singleton} \\\\ 0, & \\text{${otherwise}} \\end{cases}`
    ) + wrapKatex(`${symbol}^{*} = ${term.singleton}`)
  );
}

function renderTermBlock(variable, term) {
  const color = docsTermColor[term.term] || "#3498db";
  let body = "";
  if (term.gaussian) body = renderGaussian(variable.symbol, term);
  else if (term.singleton !== undefined) body = renderSingleton(variable.symbol, term);
  else body = renderPiecewise(variable.symbol, term);

  return `
    <article class="docs-term">
      <header class="docs-term-head">
        <i style="background:${color}"></i>
        <strong>${docsEscape(lingLabel(term.term, variable.gender))}</strong>
      </header>
      ${body}
    </article>
  `;
}

function renderDomain(variable) {
  const sep = (window.i18nHelper?.currentLang || "uk") === "en" ? "," : ";";
  const tex = Array.isArray(variable.domainValues)
    ? `${variable.symbol} \\in \\{ ${variable.domainValues.join(",\\ ") } \\}`
    : `${variable.symbol} \\in [${variable.domain?.[0] ?? 0}${sep} ${variable.domain?.[1] ?? 100}]`;

  return `
    <p class="docs-domain">
      <span>${docsEscape(docsText("common.docs.domain"))}:</span>
      <span class="docs-katex">${renderKatex(tex, false)}</span>
    </p>
  `;
}

function renderVariable(variable) {
  return `
    <section class="docs-variable">
      <h3>${docsEscape(docsText(variable.titleKey, variable.symbol))}</h3>
      ${renderDomain(variable)}
      <div class="docs-terms">${variable.terms.map((term) => renderTermBlock(variable, term)).join("")}</div>
    </section>
  `;
}

function renderDocsSwitch(kind, hintHtml) {
  const nextKind = kind === "rules" ? "formulas" : "rules";
  const label = docsText(nextKind === "rules" ? "common.docs.rulesBtn" : "common.docs.formulasBtn");
  return `
    <div class="docs-modal-switch-row">
      ${hintHtml || ""}
      <button type="button" class="docs-btn docs-modal-switch" data-docs-switch="${nextKind}">${docsEscape(label)}</button>
    </div>
  `;
}

function renderFormulas(spec) {
  const hint = spec.hintKey ? `<p class="docs-hint">${docsEscape(docsText(spec.hintKey))}</p>` : "";
  const outputHint = spec.outputHintKey
    ? `<p class="docs-hint">${docsEscape(docsText(spec.outputHintKey))}</p>`
    : "";

  return `
    ${renderDocsSwitch("formulas", hint)}
    <h2 class="docs-section-title">${docsEscape(docsText("common.docs.inputs"))}</h2>
    ${spec.inputs.map(renderVariable).join("")}
    <h2 class="docs-section-title">${docsEscape(docsText("common.docs.output"))}</h2>
    ${outputHint}
    ${renderVariable(spec.output)}
  `;
}

function ruleColumnLabel(col) {
  return docsText(col.titleKey, col.key);
}

function renderRulesInterpretation(pageKey) {
  return `
    <section class="docs-rules-interpretation">
      <h3>${docsEscape(docsText(`${pageKey}.rules.title`))}</h3>
      <p>${docsEscape(docsText(`${pageKey}.rules.description`))}</p>
      <div class="rules-summary">
        <div class="rule-category">${docsEscape(docsText(`${pageKey}.rules.category1`))}</div>
        <div class="rule-category">${docsEscape(docsText(`${pageKey}.rules.category2`))}</div>
        <div class="rule-category">${docsEscape(docsText(`${pageKey}.rules.category3`))}</div>
      </div>
    </section>
  `;
}

function renderRules(spec, pageKey) {
  const { columns, rows } = spec.rules;
  const head = [
    `<th>${docsEscape(docsText("common.docs.rule"))}</th>`,
    ...columns.map(
      (col) => `<th${col.output ? ' class="docs-out"' : ""}>${docsEscape(ruleColumnLabel(col))}</th>`
    ),
  ].join("");

  const body = rows
    .map((cells, index) => {
      const tds = cells
        .map((term, i) => {
          const col = columns[i];
          const color = docsTermColor[term] || "#7f8c8d";
          return `<td${col.output ? ' class="docs-out"' : ""}>
            <span class="docs-chip"><i style="background:${color}"></i>${docsEscape(
              lingLabel(term, col.gender)
            )}</span>
          </td>`;
        })
        .join("");
      return `<tr><td class="docs-num">${index + 1}</td>${tds}</tr>`;
    })
    .join("");

  const ifParts = columns
    .filter((col) => !col.output)
    .map((col) => `${col.key} = …`)
    .join(` ${docsText("common.docs.and")} `);
  const outCol = columns.find((col) => col.output);

  return `
    ${renderDocsSwitch("rules", `<p class="docs-hint">${docsEscape(docsText("common.docs.ifThenHint"))}</p>`)}
    <p class="docs-rule-read">
      ${docsEscape(docsText("common.docs.if"))}
      ${docsEscape(ifParts)}
      ${docsEscape(docsText("common.docs.then"))}
      ${docsEscape(outCol ? `${outCol.key} = …` : "")}
    </p>
    <div class="docs-table-wrap">
      <table class="docs-rules-table">
        <thead><tr>${head}</tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    ${renderRulesInterpretation(pageKey)}
  `;
}

function ensureDocsModal() {
  let modal = document.getElementById("docsModal");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.id = "docsModal";
  modal.className = "docs-modal";
  modal.hidden = true;
  modal.innerHTML = `
    <div class="docs-modal-backdrop" data-docs-close="1"></div>
    <div class="docs-modal-dialog" role="dialog" aria-modal="true" aria-labelledby="docsModalTitle">
      <div class="docs-modal-header">
        <h2 id="docsModalTitle"></h2>
        <button type="button" class="docs-modal-close" data-docs-close="1" aria-label="">×</button>
      </div>
      <div class="docs-modal-body" id="docsModalBody"></div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener("click", (event) => {
    if (event.target.closest("[data-docs-close]")) {
      closeDocsModal();
      return;
    }

    const switchBtn = event.target.closest("[data-docs-switch]");
    if (switchBtn) {
      openDocsModal(modal.dataset.controller, switchBtn.getAttribute("data-docs-switch"));
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.hidden) closeDocsModal();
  });

  return modal;
}

function openDocsModal(controller, kind) {
  const spec = controllerDocs[controller];
  if (!spec) return;

  const modal = ensureDocsModal();
  const title = document.getElementById("docsModalTitle");
  const body = document.getElementById("docsModalBody");
  const closeBtn = modal.querySelector(".docs-modal-close");

  modal.dataset.controller = controller;
  modal.dataset.kind = kind;
  const pageKey = { trust: "index", security: "security", intrusion: "intrusion" }[controller] || "index";
  const titleKind = kind === "rules" ? "rulesTitle" : "formulasTitle";
  title.textContent = docsText(`${pageKey}.docs.${titleKind}`, docsText(`common.docs.${titleKind}`));
  closeBtn.setAttribute("aria-label", docsText("common.docs.close"));
  body.innerHTML = kind === "rules" ? renderRules(spec, pageKey) : renderFormulas(spec);
  modal.hidden = false;
  document.body.classList.add("docs-modal-open");
  const dialog = modal.querySelector(".docs-modal-dialog");
  if (dialog) dialog.scrollTop = 0;
  closeBtn.focus();
}

function closeDocsModal() {
  const modal = document.getElementById("docsModal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("docs-modal-open");
}

function setupDocsModals(controller) {
  ensureDocsModal();
  document.querySelectorAll("[data-docs]").forEach((btn) => {
    btn.addEventListener("click", () => openDocsModal(controller, btn.getAttribute("data-docs")));
  });

  window.addEventListener("languageChanged", () => {
    const modal = document.getElementById("docsModal");
    if (!modal || modal.hidden) return;
    openDocsModal(controller, modal.dataset.kind || "formulas");
  });
}

window.setupDocsModals = setupDocsModals;
window.controllerDocs = controllerDocs;

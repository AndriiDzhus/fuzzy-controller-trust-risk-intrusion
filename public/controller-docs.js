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
        symbol: "ER",
        titleKey: "index.membership.errors",
        gender: "f",
        domain: [0, 1],
        unitKey: "index.docs.units.errors",
        noteKey: "index.docs.notes.errors",
        terms: [
          {
            term: L,
            mu: "L",
            pieces: [
              ["1", "ER ≤ 0.05"],
              ["(0.15 − ER) / (0.15 − 0.05)", "0.05 < ER ≤ 0.15"],
              ["0", "ER > 0.15"],
            ],
          },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "ER ≤ 0.05"],
              ["(ER − 0.05) / (0.15 − 0.05)", "0.05 < ER ≤ 0.15"],
              ["1", "0.15 < ER ≤ 0.4"],
              ["(0.6 − ER) / (0.6 − 0.4)", "0.4 < ER < 0.6"],
              ["0", "ER ≥ 0.6"],
            ],
          },
          {
            term: H,
            mu: "H",
            pieces: [
              ["0", "ER ≤ 0.4"],
              ["(ER − 0.4) / (0.6 − 0.4)", "0.4 < ER ≤ 0.6"],
              ["1", "ER > 0.6"],
            ],
          },
        ],
      },
      {
        symbol: "CC",
        titleKey: "index.membership.connections",
        gender: "f",
        domain: [0, 200],
        unitKey: "index.docs.units.connections",
        noteKey: "index.docs.notes.connections",
        terms: [
          {
            term: L,
            mu: "L",
            pieces: [
              ["1", "CC ≤ 15"],
              ["(30 − CC) / (30 − 15)", "15 < CC ≤ 30"],
              ["0", "CC > 30"],
            ],
          },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "CC ≤ 15"],
              ["(CC − 15) / (30 − 15)", "15 < CC ≤ 30"],
              ["1", "30 < CC ≤ 80"],
              ["(120 − CC) / (120 − 80)", "80 < CC < 120"],
              ["0", "CC ≥ 120"],
            ],
          },
          {
            term: H,
            mu: "H",
            pieces: [
              ["0", "CC ≤ 80"],
              ["(CC − 80) / (120 − 80)", "80 < CC ≤ 120"],
              ["1", "CC > 120"],
            ],
          },
        ],
      },
      {
        symbol: "BS",
        titleKey: "index.membership.bytes",
        gender: "f",
        domain: [0, 12],
        unitKey: "index.docs.units.bytes",
        noteKey: "index.docs.notes.bytes",
        terms: [
          {
            term: L,
            mu: "L",
            pieces: [
              ["1", "BS ≤ 4"],
              ["(6.5 − BS) / (6.5 − 4)", "4 < BS ≤ 6.5"],
              ["0", "BS > 6.5"],
            ],
          },
          {
            term: M,
            mu: "M",
            pieces: [
              ["0", "BS ≤ 4"],
              ["(BS − 4) / (6.5 − 4)", "4 < BS ≤ 6.5"],
              ["1", "6.5 < BS ≤ 9"],
              ["(11 − BS) / (11 − 9)", "9 < BS < 11"],
              ["0", "BS ≥ 11"],
            ],
          },
          {
            term: H,
            mu: "H",
            pieces: [
              ["0", "BS ≤ 9"],
              ["(BS − 9) / (11 − 9)", "9 < BS ≤ 11"],
              ["1", "BS > 11"],
            ],
          },
        ],
      },
    ],
    output: {
      symbol: "TI",
      titleKey: "index.membership.trust",
      gender: "m",
      // A higher trust index is the favourable end of the scale.
      higherIsBetter: true,
      // Terms read "very low … very high", as in the assignment.
      commonTermLabels: true,
      domain: [0, 100],
      unitKey: "index.docs.units.trust",
      noteKey: "index.docs.notes.trust",
      terms: [
        {
          term: VL,
          mu: "VL",
          pieces: [
            ["1", "TI ≤ 0"],
            ["(25 − TI) / 25", "0 < TI ≤ 25"],
            ["0", "TI > 25"],
          ],
        },
        {
          term: L,
          mu: "L",
          pieces: [
            ["0", "TI ≤ 0"],
            ["TI / 25", "0 < TI ≤ 25"],
            ["(50 − TI) / (50 − 25)", "25 < TI ≤ 50"],
            ["0", "50 < TI"],
          ],
        },
        {
          term: M,
          mu: "M",
          pieces: [
            ["0", "TI ≤ 25"],
            ["(TI − 25) / (50 − 25)", "25 < TI ≤ 50"],
            ["(75 − TI) / (75 − 50)", "50 < TI ≤ 75"],
            ["0", "75 < TI"],
          ],
        },
        {
          term: H,
          mu: "H",
          pieces: [
            ["0", "TI ≤ 50"],
            ["(TI − 50) / (75 − 50)", "50 < TI ≤ 75"],
            ["(100 − TI) / (100 − 75)", "75 < TI ≤ 100"],
            ["0", "100 < TI"],
          ],
        },
        {
          term: VH,
          mu: "VH",
          pieces: [
            ["0", "TI ≤ 75"],
            ["(TI − 75) / (100 − 75)", "75 < TI ≤ 100"],
            ["1", "TI > 100"],
          ],
        },
      ],
    },
    rules: {
      columns: [
        { key: "ER", gender: "f", titleKey: "index.membership.errors" },
        { key: "CC", gender: "f", titleKey: "index.membership.connections" },
        { key: "BS", gender: "f", titleKey: "index.membership.bytes" },
        { key: "TI", gender: "m", titleKey: "index.membership.trust", output: true },
      ],
      rows: [
        [L, L, L, VH],
        [L, L, M, H],
        [L, L, H, M],
        [L, M, L, H],
        [L, M, M, M],
        [L, M, H, L],
        [L, H, L, L],
        [L, H, M, L],
        [L, H, H, VL],
        [M, L, L, M],
        [M, L, M, M],
        [M, L, H, L],
        [M, M, L, L],
        [M, M, M, L],
        [M, M, H, VL],
        [M, H, L, VL],
        [M, H, M, VL],
        [M, H, H, VL],
        [H, L, L, L],
        [H, L, M, VL],
        [H, L, H, VL],
        [H, M, L, VL],
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
        symbol: "EC",
        titleKey: "security.membership.energy",
        gender: "f",
        domain: [0, 0.05],
        unitKey: "security.docs.units.energy",
        noteKey: "security.docs.notes.energy",
        terms: [
          { term: L, mu: "L", pieces: [["(0.025 − EC) / 0.025", "0 ≤ EC ≤ 0.025"], ["0", "EC > 0.025"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["EC / 0.025", "0 ≤ EC ≤ 0.025"],
              ["(0.05 − EC) / 0.025", "0.025 < EC ≤ 0.05"],
              ["0", "EC > 0.05"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "EC < 0.025"], ["(EC − 0.025) / 0.025", "0.025 ≤ EC ≤ 0.05"]] },
        ],
      },
      {
        symbol: "TP",
        titleKey: "security.membership.strength",
        gender: "f",
        domain: [0, 40],
        unitKey: "security.docs.units.strength",
        noteKey: "security.docs.notes.strength",
        terms: [
          { term: L, mu: "L", pieces: [["(20 − TP) / 20", "0 ≤ TP ≤ 20"], ["0", "TP > 20"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["TP / 20", "0 ≤ TP ≤ 20"],
              ["(40 − TP) / 20", "20 < TP ≤ 40"],
              ["0", "TP > 40"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "TP < 20"], ["(TP − 20) / 20", "20 ≤ TP ≤ 40"]] },
        ],
      },
      {
        symbol: "Lat",
        titleKey: "security.membership.response",
        gender: "f",
        domain: [0, 10],
        unitKey: "security.docs.units.response",
        noteKey: "security.docs.notes.response",
        terms: [
          { term: L, mu: "L", pieces: [["(5 − Lat) / 5", "0 ≤ Lat ≤ 5"], ["0", "Lat > 5"]] },
          {
            term: M,
            mu: "M",
            pieces: [
              ["Lat / 5", "0 ≤ Lat ≤ 5"],
              ["(10 − Lat) / 5", "5 < Lat ≤ 10"],
              ["0", "Lat > 10"],
            ],
          },
          { term: H, mu: "H", pieces: [["0", "Lat < 5"], ["(Lat − 5) / 5", "5 ≤ Lat ≤ 10"]] },
        ],
      },
    ],
    output: {
      symbol: "SR",
      titleKey: "security.membership.risk",
      gender: "m",
      kind: "singleton",
      domainValues: [0, 20, 40, 60, 80, 100],
      unitKey: "security.docs.units.risk",
      noteKey: "security.docs.notes.risk",
      terms: [
        { term: NONE, mu: "SR1", singleton: 0 },
        { term: VL, mu: "SR2", singleton: 20 },
        { term: L, mu: "SR3", singleton: 40 },
        { term: M, mu: "SR4", singleton: 60 },
        { term: H, mu: "SR5", singleton: 80 },
        { term: VH, mu: "SR6", singleton: 100 },
      ],
    },
    rules: {
      columns: [
        { key: "EC", gender: "f", titleKey: "security.membership.energy" },
        { key: "TP", gender: "f", titleKey: "security.membership.strength" },
        { key: "Lat", gender: "f", titleKey: "security.membership.response" },
        { key: "SR", gender: "m", titleKey: "security.membership.risk", output: true },
      ],
      rows: [
        [L, L, L, NONE],
        [M, M, M, VL],
        [H, L, L, L],
        [M, H, M, M],
        [H, M, H, H],
        [H, H, H, VH],
      ],
    },
  },
  intrusion: {
    hintKey: "common.docs.gaussianHint",
    inputs: [
      {
        symbol: "NP",
        latex: "\\mathrm{NP}",
        titleKey: "intrusion.membership.packets",
        gender: "f",
        domain: [0, 15],
        unitKey: "intrusion.docs.units.packets",
        noteKey: "intrusion.docs.notes.packets",
        terms: [
          { term: L, mu: "L", gaussian: { center: 3, denom: 12.5, centerLabel: "3.0" } },
          { term: M, mu: "M", gaussian: { center: 9.5, denom: 4.5 } },
          { term: H, mu: "H", gaussian: { center: 15, denom: 8 } },
        ],
      },
      {
        symbol: "Rate",
        latex: "\\mathrm{Rate}",
        titleKey: "intrusion.membership.rate",
        gender: "f",
        domain: [0, 3000],
        unitKey: "intrusion.docs.units.rate",
        noteKey: "intrusion.docs.notes.rate",
        terms: [
          { term: L, mu: "L", gaussian: { center: 15, denom: 800 } },
          { term: M, mu: "M", gaussian: { center: 150, denom: 5000 } },
          { term: H, mu: "H", gaussian: { center: 1500, denom: 500000 } },
        ],
      },
      {
        symbol: "We",
        latex: "\\mathrm{We}",
        titleKey: "intrusion.membership.weight",
        gender: "n",
        domain: [0, 250],
        unitKey: "intrusion.docs.units.weight",
        noteKey: "intrusion.docs.notes.weight",
        terms: [
          { term: L, mu: "L", gaussian: { center: 1, denom: 3200 } },
          { term: M, mu: "M", gaussian: { center: 141.5, denom: 200 } },
          { term: H, mu: "H", gaussian: { center: 245, denom: 2450, centerLabel: "245.0" } },
        ],
      },
    ],
    output: {
      symbol: "IP",
      latex: "\\mathrm{IP}",
      titleKey: "intrusion.membership.intrusion",
      gender: "f",
      domain: [0, 100],
      unitKey: "intrusion.docs.units.intrusion",
      noteKey: "intrusion.docs.notes.intrusion",
      terms: [
        { term: NONE, mu: "N", gaussian: { center: 0, denom: 288 } },
        { term: L, mu: "L", gaussian: { center: 30, denom: 200 } },
        { term: M, mu: "M", gaussian: { center: 60, denom: 288 } },
        { term: H, mu: "H", gaussian: { center: 100, denom: 450 } },
      ],
    },
    rules: {
      columns: [
        { key: "NP", gender: "f", titleKey: "intrusion.membership.packets" },
        { key: "Rate", gender: "f", titleKey: "intrusion.membership.rate" },
        { key: "We", gender: "n", titleKey: "intrusion.membership.weight" },
        { key: "IP", gender: "f", titleKey: "intrusion.membership.intrusion", output: true },
      ],
      rows: [
        [M, L, M, NONE],
        [L, L, M, NONE],
        [M, M, M, L],
        [M, L, L, M],
        [L, M, L, M],
        [H, L, H, M],
        [L, H, M, M],
        [H, H, L, H],
        [H, H, H, H],
        [H, M, H, H],
        [M, H, H, H],
        [L, H, L, H],
      ],
    },
  },
};

function docsTermColor(term, siblingTerms, higherIsBetter = false) {
  if (typeof window.resolveTermColor === "function") {
    return window.resolveTermColor(term, siblingTerms, { higherIsBetter });
  }
  return "#3498db";
}

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

// Variables whose terms read "low / high" rather than "small / large" (the
// trust index TI in its assignment) take their labels from common.terms, the
// same dictionary as the rest of the page.
function commonTermLabel(term) {
  const pascal = term.charAt(0).toUpperCase() + term.slice(1);
  return docsText(`common.terms.${pascal}`, term);
}

function variableTermLabel(term, variable) {
  if (variable?.commonTermLabels) return commonTermLabel(term);
  return lingLabel(term, variable?.gender);
}

function lingLabel(term, gender = "m") {
  if (term === NONE) {
    if (gender === "f") return docsText("common.docs.ling.noneF", docsText("common.docs.ling.none", "—"));
    return docsText("common.docs.ling.none", "—");
  }
  if (term === VL) return docsText("common.docs.ling.veryLow");
  if (term === VH) return docsText("common.docs.ling.veryHigh");
  const suffix = { f: "F", n: "N", m: "M" }[gender] || "M";
  return docsText(`common.docs.ling.${term}${suffix}`, term);
}

function latexVar(variable) {
  if (variable && variable.latex) return variable.latex;
  return variable?.symbol || variable;
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

function renderGaussian(variable, term, punct = "") {
  const symbol = latexVar(variable);
  const { center, denom, sigma, centerLabel } = term.gaussian;
  const spread = denom ?? 2 * sigma * sigma;
  const cDisp = centerLabel ?? center;
  const numer = Number(center) === 0 ? `${symbol}^{2}` : `(${symbol} - ${cDisp})^{2}`;
  return wrapKatex(
    `\\mu_{${latexMu(term.mu)}}(${symbol}) = e^{-\\dfrac{${numer}}{${spread}}}${punct}`
  );
}

function renderPiecewise(symbol, term) {
  const rows = term.pieces
    .map(([expr, cond], index, all) => {
      const end = index === all.length - 1 ? "." : ",";
      return `${latexExpr(expr)}, & ${latexCond(cond)}${end}`;
    })
    .join(" \\\\ ");
  return wrapKatex(`\\mu_{${latexMu(term.mu)}}(${symbol}) = \\begin{cases} ${rows} \\end{cases}`);
}

function renderSingleton(symbol, term) {
  return (
    wrapKatex(
      `\\mu_{${latexMu(term.mu)}}(${symbol}) = \\begin{cases} 1, & ${symbol} = ${term.singleton}, \\\\ 0, & ${symbol} \\ne ${term.singleton}. \\end{cases}`
    ) + wrapKatex(`${symbol}^{*} = ${term.singleton}.`)
  );
}

function renderTermBlock(variable, term, punct = "") {
  const siblings = (variable.terms || []).map((item) => item.term);
  const color = docsTermColor(term.term, siblings, Boolean(variable.higherIsBetter));
  let body = "";
  if (term.gaussian) body = renderGaussian(variable, term, punct);
  else if (term.singleton !== undefined) body = renderSingleton(variable.symbol, term);
  else body = renderPiecewise(variable.symbol, term);

  return `
    <article class="docs-term">
      <header class="docs-term-head">
        <i style="background:${color}"></i>
        <strong>${docsEscape(variableTermLabel(term.term, variable))}</strong>
      </header>
      ${body}
    </article>
  `;
}

function renderDomain(variable) {
  const sep = (window.i18nHelper?.currentLang || "uk") === "en" ? "," : ";";
  const symbol = latexVar(variable);
  const tex = Array.isArray(variable.domainValues)
    ? `${symbol} \\in \\{ ${variable.domainValues.join(",\\ ") } \\}`
    : `${symbol} \\in [${variable.domain?.[0] ?? 0}${sep} ${variable.domain?.[1] ?? 100}]`;

  const unit = variable.unitKey ? docsText(variable.unitKey) : "";
  const note = variable.noteKey ? docsText(variable.noteKey) : "";

  return `
    <p class="docs-domain">
      <span>${docsEscape(docsText("common.docs.domain"))}:</span>
      <span class="docs-katex">${renderKatex(tex, false)}</span>
    </p>
    ${
      unit
        ? `<p class="docs-unit"><span>${docsEscape(docsText("common.docs.units"))}:</span> ${docsEscape(unit)}</p>`
        : ""
    }
    ${note ? `<p class="docs-note">${docsEscape(note)}</p>` : ""}
  `;
}

function renderVariable(variable) {
  const last = variable.terms.length - 1;
  return `
    <section class="docs-variable">
      <h3>${docsEscape(docsText(variable.titleKey, variable.symbol))}</h3>
      ${renderDomain(variable)}
      <div class="docs-terms">${variable.terms
        .map((term, index) => renderTermBlock(variable, term, index === last ? "." : ","))
        .join("")}</div>
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

function columnHigherIsBetter(spec, colIndex) {
  const col = spec.rules.columns[colIndex];
  const variable = col?.output ? spec.output : spec.inputs[colIndex];
  return Boolean(variable?.higherIsBetter);
}

function siblingTermsForColumn(spec, colIndex) {
  const col = spec.rules.columns[colIndex];
  if (col?.output) return (spec.output.terms || []).map((item) => item.term);
  return (spec.inputs[colIndex]?.terms || []).map((item) => item.term);
}

function renderRules(spec, pageKey) {
  const interpretation = spec.interpretationHtml ?? renderRulesInterpretation(pageKey);
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
          const color = docsTermColor(
            term,
            siblingTermsForColumn(spec, i),
            columnHigherIsBetter(spec, i)
          );
          return `<td${col.output ? ' class="docs-out"' : ""}>
            <span class="docs-chip"><i style="background:${color}"></i>${docsEscape(
              col.output && spec.output.commonTermLabels
                ? commonTermLabel(term)
                : lingLabel(term, col.gender)
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
    ${interpretation}
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

// ---------------------------------------------------------------------------
// Trained model: the same layout, with the parameters found by training
// (meta.params of the membership-function data, see model-variant.js).
// ---------------------------------------------------------------------------

function docsNumber(value, span) {
  const digits = span < 1 ? 4 : span <= 20 ? 3 : 2;
  return String(Number(Number(value).toFixed(digits)));
}

/** Pieces of a trained triangle / shoulder in the notation of the docs. */
function trainedPieces(symbol, termName, cfg, [min, max]) {
  const span = max - min;
  const n = (v) => docsNumber(v, span);
  const p = cfg.params;
  if (termName === L) {
    const c = p[2];
    return [
      [`(${n(c)} − ${symbol}) / ${n(c - min)}`, `${n(min)} ≤ ${symbol} ≤ ${n(c)}`],
      ["0", `${symbol} > ${n(c)}`],
    ];
  }
  if (termName === M) {
    const [a, b, c] = p;
    const rising =
      a <= min ? [`${symbol} / ${n(b)}`, `${n(min)} ≤ ${symbol} ≤ ${n(b)}`] : [`(${symbol} − ${n(a)}) / ${n(b - a)}`, `${n(a)} ≤ ${symbol} ≤ ${n(b)}`];
    return [
      ...(a > min ? [["0", `${symbol} < ${n(a)}`]] : []),
      rising,
      [`(${n(c)} − ${symbol}) / ${n(c - b)}`, `${n(b)} < ${symbol} ≤ ${n(c)}`],
      ...(c < max ? [["0", `${symbol} > ${n(c)}`]] : []),
    ];
  }
  const [a, b] = p;
  if (b >= max) {
    return [
      ["0", `${symbol} < ${n(a)}`],
      [`(${symbol} − ${n(a)}) / ${n(max - a)}`, `${n(a)} ≤ ${symbol} ≤ ${n(max)}`],
    ];
  }
  return [
    ["0", `${symbol} < ${n(a)}`],
    [`(${symbol} − ${n(a)}) / ${n(b - a)}`, `${n(a)} ≤ ${symbol} < ${n(b)}`],
    ["1", `${n(b)} ≤ ${symbol} ≤ ${n(max)}`],
  ];
}

function trainedGaussian(cfg, span) {
  const [sigma, center] = cfg.params;
  return { center, denom: docsNumber(2 * sigma * sigma, span), centerLabel: docsNumber(center, span) };
}

function trainingInterpretation(controller) {
  const pageKey = { security: "security", intrusion: "intrusion" }[controller];
  return `
    <section class="docs-rules-interpretation">
      <h3>${docsEscape(docsText(`${pageKey}.training.rulesTitle`))}</h3>
      <p>${docsEscape(docsText(`${pageKey}.training.rulesDescription`))}</p>
    </section>
  `;
}

/**
 * Docs spec of a trained model: copy of the base spec with the trained
 * membership functions, singletons and rules.
 * @param {string} controller security | intrusion
 * @param {object} params meta.params of the trained model
 */
function buildTrainedDocs(controller, params) {
  const base = controllerDocs[controller];
  if (!base || !params) return base;
  const spec = JSON.parse(JSON.stringify(base));

  if (controller === "security") {
    spec.inputs.forEach((variable) => {
      const terms = params.inputs[variable.symbol];
      variable.terms.forEach((term) => {
        term.pieces = trainedPieces(variable.symbol, term.term, terms[term.term], variable.domain);
      });
    });
    spec.output.terms.forEach((term) => {
      term.singleton = Number(Number(params.consequents[term.term]).toFixed(2));
    });
    spec.output.domainValues = spec.output.terms.map((term) => term.singleton);
  }

  if (controller === "intrusion") {
    spec.inputs.forEach((variable) => {
      const key = { NP: "packets", Rate: "rate", We: "weight" }[variable.symbol];
      const range = params.ranges?.[key];
      if (range) variable.domain = [range.min, range.max];
      if (variable.symbol === "Rate" && params.rateScale === "log10p1") {
        variable.titleKey = "intrusion.membership.rateLog";
        variable.unitKey = "intrusion.docs.units.rateLog";
        variable.noteKey = "intrusion.docs.notes.rateLog";
      }
      const span = variable.domain[1] - variable.domain[0];
      variable.terms.forEach((term) => {
        term.gaussian = trainedGaussian(params.inputs[variable.symbol][term.term], span);
      });
    });
    spec.output.terms.forEach((term) => {
      term.gaussian = trainedGaussian(params.output[term.term], 100);
    });
    spec.rules.rows = params.rules.map(([conditions, out]) => [...conditions, out]);
    const rateColumn = spec.rules.columns.find((col) => col.key === "Rate");
    if (rateColumn && params.rateScale === "log10p1") rateColumn.titleKey = "intrusion.membership.rateLog";
  }

  spec.interpretationHtml = trainingInterpretation(controller);
  return spec;
}

/** Docs of the model shown on the page (base or trained). */
function currentDocsSpec(controller) {
  const trained = window.fuzzyModel?.current === "trained";
  const params = window.fuzzyPageState?.mfData?.meta?.params;
  return trained && params ? buildTrainedDocs(controller, params) : controllerDocs[controller];
}

function openDocsModal(controller, kind) {
  const spec = currentDocsSpec(controller);
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
    if (!modal || modal.hidden || modal.dataset.kind === "training") return;
    openDocsModal(controller, modal.dataset.kind || "formulas");
  });
}

window.setupDocsModals = setupDocsModals;
window.controllerDocs = controllerDocs;
window.buildTrainedDocs = buildTrainedDocs;
window.ensureDocsModal = ensureDocsModal;

/**
 * Training datasets of the Security and Intrusion controllers: the table
 * format the user downloads and uploads, its parsing and the split into
 * training / validation / test samples.
 *
 * Table columns (header names are matched case-insensitively, a few aliases
 * are accepted, extra columns are ignored):
 *   intrusion   NP, Rate (pps), We, IP (target 0–100) [, label, category, split]
 *   security    EC, TP, Lat, SR (target 0–100) [, split]
 *
 * Works in Node and in the browser bundle (no Node-only APIs here).
 */
const xlsx = require("../../public/xlsx-lite");
const { createRandom, parseCsv, cellNumber } = require("./utils");

const SCHEMAS = {
  intrusion: {
    inputs: [
      { key: "NP", inputKey: "packets", aliases: ["np", "number", "packets"] },
      { key: "Rate", inputKey: "rate", aliases: ["rate", "pps"] },
      { key: "We", inputKey: "weight", aliases: ["we", "weight"] },
    ],
    target: { key: "IP", aliases: ["ip", "ip_target", "target", "intrusion", "y"] },
    extra: ["label", "category", "split"],
    splits: { train: 0.7, validation: 0.15, test: 0.15 },
  },
  security: {
    inputs: [
      { key: "EC", inputKey: "energy", aliases: ["ec", "energy", "energy consumption"] },
      { key: "TP", inputKey: "strength", aliases: ["tp", "tr", "transmit power", "strength"] },
      { key: "Lat", inputKey: "response", aliases: ["lat", "latency", "response"] },
    ],
    target: { key: "SR", aliases: ["sr", "sr_expert", "target", "risk", "y"] },
    extra: ["split", "row_id"],
    splits: { train: 0.7, test: 0.3 },
  },
};

const TARGET_RANGE = [0, 100];
const MIN_TRAIN_ROWS = 10;

function normalizeHeader(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s*\(.*$/, "") // "Energy Consumption (kWh/Gb)" -> "energy consumption"
    .replace(/[\s_-]+/g, " ")
    .trim();
}

/** Maps the columns of a header to the schema; null for a missing column. */
function matchColumns(controller, header) {
  const schema = SCHEMAS[controller];
  if (!schema) throw new Error(`unknown controller "${controller}"`);
  const normalized = header.map(normalizeHeader);
  const find = (aliases) => {
    const index = normalized.findIndex((h) => aliases.includes(h) || aliases.includes(h.replace(/ /g, "_")));
    return index >= 0 ? header[index] : null;
  };
  const columns = { inputs: {}, target: null, extra: {} };
  schema.inputs.forEach((input) => {
    columns.inputs[input.key] = find([input.key.toLowerCase(), ...input.aliases]);
  });
  columns.target = find([schema.target.key.toLowerCase(), ...schema.target.aliases]);
  schema.extra.forEach((name) => {
    columns.extra[name] = find([name]);
  });
  return columns;
}

/**
 * Parses table records into samples.
 * @param {string} controller
 * @param {{header: string[], records: object[]}} table
 * @returns {{samples, columns, skipped, missing}}
 *   samples: {raw: {NP, Rate, We}, y, split, label, category}
 */
function parseTable(controller, table) {
  const schema = SCHEMAS[controller];
  const columns = matchColumns(controller, table.header || []);
  const missing = [
    ...schema.inputs.filter((i) => !columns.inputs[i.key]).map((i) => i.key),
    ...(columns.target ? [] : [schema.target.key]),
  ];
  if (missing.length) {
    return { samples: [], columns, skipped: 0, missing };
  }
  const samples = [];
  let skipped = 0;
  (table.records || []).forEach((record, index) => {
    const raw = {};
    let ok = true;
    schema.inputs.forEach((input) => {
      const value = cellNumber(record[columns.inputs[input.key]]);
      if (value === null) ok = false;
      raw[input.key] = value;
    });
    const y = cellNumber(record[columns.target]);
    if (!ok || y === null || y < TARGET_RANGE[0] || y > TARGET_RANGE[1]) {
      skipped += 1;
      return;
    }
    const split = columns.extra.split ? String(record[columns.extra.split] ?? "").trim().toLowerCase() : "";
    samples.push({
      index,
      raw,
      y,
      split: ["train", "validation", "test"].includes(split) ? split : null,
      label: columns.extra.label ? String(record[columns.extra.label] ?? "") : null,
      category: columns.extra.category ? String(record[columns.extra.category] ?? "") : null,
    });
  });
  return { samples, columns, skipped, missing };
}

/**
 * Assigns a split to every sample without one: a seeded shuffle, then the
 * shares of the schema (70/15/15 or 70/30). A "validation" split of a
 * security table is used as test.
 */
function assignSplits(controller, samples, seed = 42) {
  const shares = SCHEMAS[controller].splits;
  const names = Object.keys(shares);
  samples.forEach((s) => {
    if (s.split && !shares[s.split]) s.split = s.split === "validation" ? "test" : null;
  });
  const unassigned = samples.filter((s) => !s.split);
  if (unassigned.length) {
    const rnd = createRandom(seed);
    const shuffled = rnd.shuffle(unassigned);
    const counts = {};
    let assigned = 0;
    names.forEach((name, i) => {
      counts[name] = i === names.length - 1 ? shuffled.length - assigned : Math.round(shuffled.length * shares[name]);
      assigned += counts[name];
    });
    // Every split gets at least one row when there are enough rows.
    names.forEach((name) => {
      if (counts[name] === 0 && counts.train > names.length) {
        counts[name] = 1;
        counts.train -= 1;
      }
    });
    let cursor = 0;
    names.forEach((name) => {
      shuffled.slice(cursor, cursor + counts[name]).forEach((s) => {
        s.split = name;
      });
      cursor += counts[name];
    });
  }
  const bySplit = {};
  names.forEach((name) => {
    bySplit[name] = samples.filter((s) => s.split === name);
  });
  return bySplit;
}

/**
 * Full preparation of an uploaded table: parse, split, check the size.
 * @returns {{ok: boolean, error?: string, bySplit?, counts?, skipped?, columns?}}
 */
function prepareDataset(controller, table, { seed = 42 } = {}) {
  const parsed = parseTable(controller, table);
  if (parsed.missing.length) {
    return { ok: false, error: "missingColumns", missing: parsed.missing, columns: parsed.columns };
  }
  const bySplit = assignSplits(controller, parsed.samples, seed);
  const counts = {};
  Object.entries(bySplit).forEach(([name, rows]) => {
    counts[name] = rows.length;
  });
  if ((counts.train || 0) < MIN_TRAIN_ROWS) {
    return { ok: false, error: "tooFewRows", counts, skipped: parsed.skipped, columns: parsed.columns, minTrain: MIN_TRAIN_ROWS };
  }
  return { ok: true, bySplit, counts, skipped: parsed.skipped, columns: parsed.columns, total: parsed.samples.length };
}

// ---------------------------------------------------------------------------
// Files: CSV / XLSX -> table
// ---------------------------------------------------------------------------

function tableFromRows(rows) {
  const { header, records } = xlsx.toObjects(rows);
  return { header, records };
}

function tableFromCsv(text) {
  const records = parseCsv(text);
  const header = records.length ? Object.keys(records[0]) : text.split("\n")[0].split(",").map((h) => h.trim());
  return { header, records };
}

/**
 * @param {{name: string, bytes?: Uint8Array, text?: string}} file
 * @returns {Promise<{header: string[], records: object[], sheet?: string}>}
 */
async function tableFromFile(file) {
  const name = String(file.name || "").toLowerCase();
  // An .xlsx file is a zip archive ("PK"); the name alone is not trusted.
  const isZip = file.bytes && file.bytes.length > 2 && file.bytes[0] === 0x50 && file.bytes[1] === 0x4b;
  if (name.endsWith(".xlsx") || isZip) {
    const sheets = await xlsx.read(file.bytes);
    if (!sheets.length) throw new Error("emptyWorkbook");
    // The first sheet whose header has at least three columns.
    const sheet = sheets.find((s) => s.rows.length && s.rows[0].filter((v) => v !== null && v !== "").length >= 3) || sheets[0];
    return { ...tableFromRows(sheet.rows), sheet: sheet.name };
  }
  const text = file.text !== undefined ? file.text : new TextDecoder("utf-8").decode(file.bytes);
  return tableFromCsv(text.replace(/^﻿/, ""));
}

// ---------------------------------------------------------------------------
// Default datasets (data/<controller>.csv of the repository)
// ---------------------------------------------------------------------------

/** The default dataset of each controller, relative to the repository root. */
const DEFAULT_DATASET_FILES = {
  intrusion: { data: "data/intrusion.csv" },
  security: { data: "data/security.csv" },
};

/** Name of the default dataset file, e.g. "intrusion.csv". */
function defaultDatasetName(controller) {
  const files = DEFAULT_DATASET_FILES[controller];
  return files ? files.data.split("/").pop() : null;
}

/** Round-robin over groups, keeping the order inside a group. */
function roundRobin(groups, limit) {
  const queues = groups.map((g) => g.slice());
  const out = [];
  while (out.length < limit && queues.some((q) => q.length)) {
    for (const q of queues) {
      if (q.length && out.length < limit) out.push(q.shift());
    }
  }
  return out;
}

/** n rows evenly spread over a list (all of them when n >= length). */
function spread(rows, n) {
  if (n >= rows.length) return rows.slice();
  if (n <= 0) return [];
  if (n === 1) return [rows[Math.floor(rows.length / 2)]];
  return Array.from({ length: n }, (_, i) => rows[Math.round((i * (rows.length - 1)) / (n - 1))]);
}

/**
 * Rows of the default dataset: the file as it is, or `limit` rows of it with
 * the shares of the splits kept (70/15/15, 70/30) and, inside a split, spread
 * over the categories (Intrusion) or the rows (Security).
 *
 * @param {string} controller
 * @param {{data: string}} csv text of the file in DEFAULT_DATASET_FILES
 * @param {number|null} limit number of rows, or null for all; a limit at or
 *   above the dataset size gives all rows
 * @returns {{header: string[], rows: any[][], total: number, limit: number|null}}
 *   `limit` is the effective one (null when all rows are returned)
 */
function defaultDataset(controller, csv, limit = null) {
  if (!DEFAULT_DATASET_FILES[controller]) throw new Error(`no default dataset for "${controller}"`);
  const { header, records } = tableFromCsv(csv.data);
  const toRow = (r) => header.map((h) => (["label", "category", "split"].includes(h) ? r[h] : cellNumber(r[h])));
  const total = records.length;
  // A limit at or above the dataset size means the whole dataset.
  if (limit !== null && limit >= total) limit = null;
  if (limit === null) return { header, rows: records.map(toRow), total, limit };

  const shares = SCHEMAS[controller].splits;
  const rows = [];
  Object.keys(shares).forEach((split) => {
    const ofSplit = records.filter((r) => (r.split || "train") === split);
    const take = Math.max(1, Math.round(limit * shares[split]));
    const groups = {};
    ofSplit.forEach((r) => {
      const key = r.category || "";
      (groups[key] = groups[key] || []).push(r);
    });
    const keys = Object.keys(groups).sort();
    const picked =
      keys.length > 1
        ? roundRobin(keys.map((k) => spread(groups[k], Math.ceil(take / keys.length))), take)
        : spread(ofSplit, take);
    rows.push(...picked.map(toRow));
  });
  return { header, rows: rows.slice(0, Math.max(limit, 1)), total, limit };
}

const DATASET_ROW_OPTIONS = [20, 40, 100, null];

module.exports = {
  SCHEMAS,
  MIN_TRAIN_ROWS,
  DEFAULT_DATASET_FILES,
  DATASET_ROW_OPTIONS,
  defaultDatasetName,
  normalizeHeader,
  matchColumns,
  parseTable,
  assignSplits,
  prepareDataset,
  tableFromRows,
  tableFromCsv,
  tableFromFile,
  defaultDataset,
};

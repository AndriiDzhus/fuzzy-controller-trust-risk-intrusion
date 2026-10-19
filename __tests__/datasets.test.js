/**
 * Training datasets: the xlsx codec, table parsing, splits, the default
 * datasets and the training session shared by the CLI, the API and the
 * browser worker.
 */
const fs = require("fs");
const path = require("path");
const xlsx = require("../public/xlsx-lite");
const datasets = require("../src/training/datasets");
const session = require("../src/training/session");
const intrusion = require("../src/controllers/intrusionController");

const root = path.join(__dirname, "..");
/** The default dataset of a controller, as the table the app downloads. */
const defaultTable = (controller) =>
  datasets.defaultDataset(controller, fs.readFileSync(path.join(root, datasets.datasetFile(controller)), "utf8"));
const ROWS = datasets.DEFAULT_DATASET_ROWS;

describe("xlsx-lite", () => {
  test("writes and reads numbers, strings and several sheets", async () => {
    const sheets = [
      { name: "Dataset", rows: [["NP", "Rate", "label"], [9.5, 12.25, "DDoS & <SYN>"], [5.5, 0, "Benign"]] },
      { name: "Meta", rows: [["k", "v"], ["a", 1]] },
    ];
    const bytes = await xlsx.write(sheets);
    expect(bytes[0]).toBe(0x50); // "PK"
    const back = await xlsx.read(bytes);
    expect(back).toEqual(sheets);
  });

  test("toObjects keys records by the header and skips empty rows", () => {
    const { header, records } = xlsx.toObjects([["a", "b"], [1, "x"], [null, null], [2, null]]);
    expect(header).toEqual(["a", "b"]);
    expect(records).toEqual([{ a: 1, b: "x" }, { a: 2, b: null }]);
  });

  test("rejects data that is not a workbook", async () => {
    await expect(xlsx.read(new TextEncoder().encode("a,b\n1,2"))).rejects.toThrow(/zip/);
  });
});

describe("datasets", () => {
  test("column matching accepts aliases and ignores case", () => {
    const columns = datasets.matchColumns("intrusion", ["number", "RATE", " Weight ", "IP_target", "Label", "split"]);
    expect(columns.inputs).toEqual({ NP: "number", Rate: "RATE", We: " Weight " });
    expect(columns.target).toBe("IP_target");
    expect(columns.extra.label).toBe("Label");
    expect(datasets.matchColumns("security", ["Energy Consumption (kWh/Gb)", "Transmit Power (dBm)", "Latency (ms)", "SR"]).inputs).toEqual({
      EC: "Energy Consumption (kWh/Gb)",
      TP: "Transmit Power (dBm)",
      Lat: "Latency (ms)",
    });
  });

  test("parseTable skips rows without a valid target and reports missing columns", () => {
    const table = {
      header: ["NP", "Rate", "We", "IP"],
      records: [
        { NP: "9.5", Rate: "12", We: "141.55", IP: "100" },
        { NP: "9.5", Rate: "12", We: "141.55", IP: "" },
        { NP: "x", Rate: "12", We: "141.55", IP: "50" },
        { NP: "5.5", Rate: "1", We: "38.5", IP: "120" },
      ],
    };
    const parsed = datasets.parseTable("intrusion", table);
    expect(parsed.samples).toHaveLength(1);
    expect(parsed.skipped).toBe(3);
    expect(datasets.parseTable("intrusion", { header: ["NP", "We"], records: [] }).missing).toEqual(["Rate", "IP"]);
  });

  test("splits are deterministic and follow the schema shares", () => {
    const records = Array.from({ length: 100 }, (_, i) => ({ NP: 9.5, Rate: i, We: 141.55, IP: i % 2 ? 100 : 0 }));
    const prepared = datasets.prepareDataset("intrusion", { header: ["NP", "Rate", "We", "IP"], records });
    expect(prepared.ok).toBe(true);
    expect(prepared.counts).toEqual({ train: 70, validation: 15, test: 15 });
    const again = datasets.prepareDataset("intrusion", { header: ["NP", "Rate", "We", "IP"], records });
    expect(again.bySplit.test.map((s) => s.index)).toEqual(prepared.bySplit.test.map((s) => s.index));
    // A split column is respected; "validation" of a security table becomes test.
    const withSplit = records.map((r, i) => ({ EC: 0.02, TP: 20, Lat: 5, SR: 40, split: i < 80 ? "train" : "validation" }));
    const security = datasets.prepareDataset("security", { header: ["EC", "TP", "Lat", "SR", "split"], records: withSplit });
    expect(security.counts).toEqual({ train: 80, test: 20 });
  });

  test("too few rows is refused", () => {
    const records = Array.from({ length: 8 }, () => ({ EC: 0.02, TP: 20, Lat: 5, SR: 40 }));
    const prepared = datasets.prepareDataset("security", { header: ["EC", "TP", "Lat", "SR"], records });
    expect(prepared.ok).toBe(false);
    expect(prepared.error).toBe("tooFewRows");
  });

  test("each trained controller has one default dataset of 100 rows", () => {
    expect(datasets.DEFAULT_DATASET_ROWS).toBe(100);
    expect(datasets.datasetName("security")).toBe("security-100.csv");
    expect(datasets.datasetFile("intrusion")).toBe("data/intrusion-100.csv");
    expect(datasets.hasDefaultDataset("security")).toBe(true);
    expect(datasets.hasDefaultDataset("trust")).toBe(false);
    expect(() => datasets.datasetName("trust")).toThrow();
    expect(() => datasets.defaultDataset("trust", "a\n1")).toThrow();
    // Only the 100-row files are shipped.
    expect(fs.readdirSync(path.join(root, "data")).filter((name) => name.endsWith(".csv")).sort()).toEqual(["intrusion-100.csv", "security-100.csv"]);
  });

  test("default intrusion dataset: the file size is the row count, the split is made by the app", () => {
    const table = defaultTable("intrusion");
    expect(table.header).toEqual(["NP", "Rate", "We", "IP"]);
    expect(table.rows).toHaveLength(ROWS);
    expect(table.total).toBe(ROWS);
    table.rows.forEach((row) => {
      expect(row[3]).toBeGreaterThanOrEqual(0);
      expect(row[3]).toBeLessThanOrEqual(100);
    });
    const prepared = datasets.prepareDataset("intrusion", datasets.tableFromRows([table.header, ...table.rows]));
    expect(prepared.ok).toBe(true);
    expect(prepared.counts).toEqual({ train: 70, validation: 15, test: 15 });
  });

  test("every default dataset covers the whole range of every input and of the target", () => {
    // The working ranges of the inputs (data/README.md); Rate reaches from the quiet end to the flood end.
    const ranges = { intrusion: [[0, 15], [0, 3000], [0, 250]], security: [[0.01, 0.05], [10, 35], [1, 10]] };
    {
      Object.entries(ranges).forEach(([controller, universe]) => {
        const { rows } = defaultTable(controller);
        universe.forEach(([lo, hi], c) => {
          const values = rows.map((r) => r[c]);
          values.forEach((v) => {
            expect(v).toBeGreaterThanOrEqual(lo);
            expect(v).toBeLessThanOrEqual(hi);
          });
          if (controller === "intrusion" && c === 1) {
            expect(Math.min(...values)).toBeLessThan(1);
            expect(Math.max(...values)).toBeGreaterThan(2000);
            return;
          }
          // Four equal bins of the range all hold at least one row (the top bin of NP is a plateau of rare rows).
          const bins = new Set(values.map((v) => Math.min(3, Math.floor(((v - lo) / (hi - lo)) * 4))));
          expect(bins.size).toBe(4);
        });
      });
    }
  });

  test("default security datasets: SR within [0, 100], all six rules fire", () => {
    const security = require("../src/controllers/securityController");
    {
      const all = defaultTable("security");
      expect(all.header).toEqual(["EC", "TP", "Lat", "SR"]);
      expect(all.rows).toHaveLength(ROWS);
      const fired = new Set();
      all.rows.forEach(([energy, strength, response, sr]) => {
        expect(sr).toBeGreaterThanOrEqual(0);
        expect(sr).toBeLessThanOrEqual(100);
        security.calculate({ energy, strength, response }).ruleEvaluations.forEach((rule, i) => {
          if (rule.alpha > 0) fired.add(i);
        });
      });
      expect(fired.size).toBe(6);
    }
    expect(datasets.prepareDataset("security", datasets.tableFromRows([defaultTable("security").header, ...defaultTable("security").rows])).counts).toEqual({ train: 70, test: 30 });
  });

  test("a downloaded xlsx dataset can be uploaded back (file sniffing by content)", async () => {
    const table = defaultTable("intrusion");
    const bytes = await xlsx.write([{ name: "Dataset", rows: [table.header, ...table.rows] }]);
    const back = await datasets.tableFromFile({ name: "no-extension", bytes });
    expect(back.header).toEqual(table.header);
    expect(back.records).toHaveLength(ROWS);
    const csv = await datasets.tableFromFile({ name: "d.csv", text: "NP,Rate,We,IP\n9.5,1,141.55,100\n" });
    expect(csv.records).toEqual([{ NP: "9.5", Rate: "1", We: "141.55", IP: "100" }]);
  });
});

describe("training session", () => {
  const bySplitOf = (controller) => {
    const table = defaultTable(controller);
    return datasets.prepareDataset(controller, datasets.tableFromRows([table.header, ...table.rows])).bySplit;
  };

  test("runs the genetic algorithm with progress, produces valid params and a diff", async () => {
    const progress = [];
    const result = await session.runTraining({
      controller: "intrusion",
      bySplit: bySplitOf("intrusion"),
      options: { generations: 6, initialPopulation: 20, populationSize: 10 },
      datasetName: "test.xlsx",
      onProgress: (entry) => progress.push(entry),
    });
    expect(progress).toHaveLength(7); // generation 0 … 6
    expect(result.method).toBe("ga");
    expect(result.training.steps).toBe(6);
    expect(result.training.stopReason).toBe("generations");
    // Rate in pps, the universe of the expert model.
    expect(result.params.rateScale).toBe("linear");
    expect(result.params.ranges.rate.max).toBe(3000);
    expect(session.validateParams("intrusion", result.params)).toEqual([]);
    expect(result.training.metrics.trained.test.rmse).toBeDefined();
    expect(result.changes.variables.map((v) => v.symbol)).toEqual(["NP", "Rate", "We", "IP"]);
    // The model built from the params reproduces the reported metrics.
    const model = session.buildModelFromParams("intrusion", result.params);
    expect(model.calculate({ packets: 9.5, rate: 4, weight: 141.55 }).value).toBeGreaterThanOrEqual(0);
  });

  test("the expert chromosome scores the expert model: generation 0 equals the base RMSE", async () => {
    // Targets = the expert model's own outputs: the expert chromosome
    // (validated, centroid grid 0.2) must reproduce them exactly.
    const intrusionModel = require("../src/controllers/intrusionController");
    const bySplit = bySplitOf("intrusion");
    Object.values(bySplit).forEach((rows) =>
      rows.forEach((s) => {
        s.y = intrusionModel.calculate({ packets: s.raw.NP, rate: Math.min(s.raw.Rate, 3000), weight: s.raw.We }).value;
      })
    );
    const result = await session.runTraining({
      controller: "intrusion",
      bySplit,
      options: { generations: 1, initialPopulation: 8, populationSize: 4 },
    });
    expect(result.training.metrics.base.train.rmse).toBeLessThan(1e-6);
    // The GA caches centroids by clip heights rounded to 1e-4.
    expect(result.training.history[0].bestRmse).toBeLessThan(0.01);
  });

  test("ANFIS on the default dataset lowers the training error from the expert model", async () => {
    const result = await session.runTraining({
      controller: "security",
      bySplit: bySplitOf("security"),
      options: { epochs: 5 },
    });
    const h = result.training.history;
    expect(h[0].trainRmse).toBeGreaterThan(result.training.metrics.trained.train.rmse);
    expect(result.training.metrics.trained.test.rmse).toBeLessThan(h[0].testRmse);
  });

  test("can be stopped between steps", async () => {
    let seen = 0;
    const result = await session.runTraining({
      controller: "intrusion",
      bySplit: bySplitOf("intrusion"),
      options: { generations: 50, initialPopulation: 20, populationSize: 10 },
      onProgress: () => {
        seen += 1;
      },
      shouldStop: () => seen >= 3,
    });
    expect(result.training.stopReason).toBe("stopped");
    expect(result.training.steps).toBeLessThan(10);
  });

  test("runs ANFIS and keeps the 6-rule base", async () => {
    const result = await session.runTraining({
      controller: "security",
      bySplit: bySplitOf("security"),
      options: { epochs: 20 },
      coverage: session.securityCoverage([]),
    });
    expect(result.method).toBe("anfis");
    expect(Object.keys(result.params.consequents)).toHaveLength(6);
    expect(session.validateParams("security", result.params)).toEqual([]);
    expect(result.changes.rules).toEqual([]);
    expect(result.training.metrics.trained.train.notFired).toBe(0);
  });

  test("validateParams rejects broken parameters", () => {
    const bad = JSON.parse(JSON.stringify(intrusion.BASE_PARAMS));
    bad.inputs.NP.low.params = [0, 3];
    bad.rules[0] = [["low", "low"], "none"];
    const errors = session.validateParams("intrusion", bad);
    expect(errors.some((e) => e.includes("inputs.NP.low"))).toBe(true);
    expect(errors.some((e) => e.includes("rules[0]"))).toBe(true);
    expect(() => session.buildModelFromParams("intrusion", bad)).toThrow(/invalid params/);
  });
});

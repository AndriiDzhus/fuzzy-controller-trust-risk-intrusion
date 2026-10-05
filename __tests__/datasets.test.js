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
const readCsvFiles = (controller) => {
  const csv = {};
  Object.entries(datasets.DEFAULT_DATASET_FILES[controller]).forEach(([key, file]) => {
    csv[key] = fs.readFileSync(path.join(root, file), "utf8");
  });
  return csv;
};

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

  test("default intrusion dataset: 500 rows of 4 columns, balanced prefix, split assigned by the app", () => {
    const table = datasets.defaultDataset("intrusion", readCsvFiles("intrusion"), 40);
    expect(table.header).toEqual(["NP", "Rate", "We", "IP"]);
    expect(table.rows).toHaveLength(40);
    const prepared = datasets.prepareDataset("intrusion", datasets.tableFromRows([table.header, ...table.rows]));
    expect(prepared.counts).toEqual({ train: 28, validation: 6, test: 6 });
    const all = datasets.defaultDataset("intrusion", readCsvFiles("intrusion"), null);
    expect(all.rows).toHaveLength(500);
    all.rows.forEach((row) => {
      expect(row[3]).toBeGreaterThanOrEqual(0);
      expect(row[3]).toBeLessThanOrEqual(100);
    });
    // The first rows carry the whole range of IP (benign … DDoS), not one class.
    expect(new Set(table.rows.map((row) => row[3])).size).toBeGreaterThan(5);
  });

  test("a limit at or above the dataset size gives the whole dataset", () => {
    const intrusion = datasets.defaultDataset("intrusion", readCsvFiles("intrusion"), 100000);
    expect(intrusion.rows).toHaveLength(500);
    expect(intrusion.total).toBe(500);
    expect(intrusion.limit).toBeNull();
    const security = datasets.defaultDataset("security", readCsvFiles("security"), 200);
    expect(security.rows).toHaveLength(200);
    expect(security.limit).toBeNull();
    const part = datasets.defaultDataset("security", readCsvFiles("security"), 199);
    expect(part.rows.length).toBeLessThanOrEqual(199);
    expect(part.total).toBe(200);
    expect(part.limit).toBe(199);
    expect(datasets.defaultDatasetName("security")).toBe("security.csv");
    expect(datasets.defaultDatasetName("trust")).toBeNull();
  });

  test("default security dataset: 200 rows of 4 columns, SR within [0, 100], all six rules fire", () => {
    const all = datasets.defaultDataset("security", readCsvFiles("security"), null);
    expect(all.header).toEqual(["EC", "TP", "Lat", "SR"]);
    expect(all.rows).toHaveLength(200);
    all.rows.forEach((row) => {
      expect(row[3]).toBeGreaterThanOrEqual(0);
      expect(row[3]).toBeLessThanOrEqual(100);
    });
    const security = require("../src/controllers/securityController");
    const fired = new Set();
    all.rows.forEach(([energy, strength, response]) => {
      security.calculate({ energy, strength, response }).ruleEvaluations.forEach((rule, i) => {
        if (rule.alpha > 0) fired.add(i);
      });
    });
    expect(fired.size).toBe(6);
    const part = datasets.defaultDataset("security", readCsvFiles("security"), 20);
    expect(part.rows).toHaveLength(20);
    expect(datasets.prepareDataset("security", datasets.tableFromRows([part.header, ...part.rows])).counts).toEqual({ train: 14, test: 6 });
  });

  test("a downloaded xlsx dataset can be uploaded back (file sniffing by content)", async () => {
    const table = datasets.defaultDataset("intrusion", readCsvFiles("intrusion"), 30);
    const bytes = await xlsx.write([{ name: "Dataset", rows: [table.header, ...table.rows] }]);
    const back = await datasets.tableFromFile({ name: "no-extension", bytes });
    expect(back.header).toEqual(table.header);
    expect(back.records).toHaveLength(30);
    const csv = await datasets.tableFromFile({ name: "d.csv", text: "NP,Rate,We,IP\n9.5,1,141.55,100\n" });
    expect(csv.records).toEqual([{ NP: "9.5", Rate: "1", We: "141.55", IP: "100" }]);
  });
});

describe("training session", () => {
  const bySplitOf = (controller, rows) => {
    const csv = readCsvFiles(controller);
    const table = datasets.defaultDataset(controller, csv, rows);
    return datasets.prepareDataset(controller, datasets.tableFromRows([table.header, ...table.rows])).bySplit;
  };

  test("runs the genetic algorithm with progress, produces valid params and a diff", async () => {
    const progress = [];
    const result = await session.runTraining({
      controller: "intrusion",
      bySplit: bySplitOf("intrusion", 40),
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
    const bySplit = bySplitOf("intrusion", 60);
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
      bySplit: bySplitOf("security", null),
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
      bySplit: bySplitOf("intrusion", 40),
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
      bySplit: bySplitOf("security", 100),
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

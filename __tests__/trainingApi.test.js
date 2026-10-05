/**
 * Training API: dataset download, jobs with server-sent progress, custom
 * parameters in calculations.
 */
const request = require("supertest");
const app = require("../server");
const xlsx = require("../public/xlsx-lite");

const binary = (req) =>
  req.buffer().parse((res, callback) => {
    const chunks = [];
    res.on("data", (chunk) => chunks.push(chunk));
    res.on("end", () => callback(null, Buffer.concat(chunks)));
  });

async function datasetBytes(controller, size) {
  const response = await binary(request(app).get(`/api/controllers/${controller}/dataset?size=${size}`));
  expect(response.status).toBe(200);
  return response.body;
}

async function waitForJob(id, timeoutMs = 20000) {
  const started = Date.now();
  for (;;) {
    const response = await request(app).get(`/api/training/jobs/${id}`);
    if (["done", "stopped", "error"].includes(response.body.status)) return response.body;
    if (Date.now() - started > timeoutMs) throw new Error("job did not finish");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe("dataset download", () => {
  test("returns an xlsx with the dataset of the requested size", async () => {
    const bytes = await datasetBytes("intrusion", 20);
    const sheets = await xlsx.read(new Uint8Array(bytes));
    expect(sheets[0].rows[0]).toEqual(["NP", "Rate", "We", "IP"]);
    expect(sheets[0].rows).toHaveLength(21);
  });

  test("reports the four sizes, the preselected one and the file names", async () => {
    const info = await request(app).get("/api/controllers/security/dataset/info");
    expect(info.status).toBe(200);
    expect(info.body.sizes).toEqual([20, 50, 100, 500]);
    expect(info.body.defaultSize).toBe(50);
    expect(info.body.files["100"]).toBe("security-100.csv");
    expect(info.body.columns).toEqual(["EC", "TP", "Lat", "SR"]);
    const intrusion = await request(app).get("/api/controllers/intrusion/dataset/info");
    expect(intrusion.body.defaultSize).toBe(100);
    for (const size of [20, 50, 100, 500]) {
      const response = await binary(request(app).get(`/api/controllers/security/dataset?size=${size}`));
      expect(response.status).toBe(200);
      expect(response.headers["x-row-count"]).toBe(String(size));
      expect(response.headers["content-disposition"]).toContain(`security-${size}.xlsx`);
    }
    // No size → the preselected one.
    const preselected = await binary(request(app).get("/api/controllers/intrusion/dataset"));
    expect(preselected.headers["x-row-count"]).toBe("100");
    expect((await request(app).get("/api/controllers/trust/dataset/info")).status).toBe(404);
  });

  test("validates the size parameter and the controller", async () => {
    expect((await request(app).get("/api/controllers/intrusion/dataset?size=3")).status).toBe(400);
    expect((await request(app).get("/api/controllers/intrusion/dataset?size=all")).status).toBe(400);
    expect((await request(app).get("/api/controllers/trust/dataset")).status).toBe(404);
  });
});

describe("training jobs", () => {
  test("trains from an uploaded xlsx, streams progress and returns the result", async () => {
    const bytes = await datasetBytes("intrusion", 50);
    const created = await request(app)
      .post("/api/training/intrusion/jobs?name=ds.xlsx&generations=5&initialPopulation=16&populationSize=8")
      .set("Content-Type", "application/octet-stream")
      .send(bytes);
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("running");
    expect(created.body.dataset.counts).toEqual({ train: 35, validation: 8, test: 7 });
    expect(created.body.options.generations).toBe(5);

    const job = await waitForJob(created.body.id);
    expect(job.status).toBe("done");
    expect(job.result.training.steps).toBe(5);
    expect(job.result.params.rules).toHaveLength(12);

    const events = await request(app).get(`/api/training/jobs/${created.body.id}/events`);
    expect(events.status).toBe(200);
    expect(events.headers["content-type"]).toMatch(/text\/event-stream/);
    expect(events.text).toContain("event: snapshot");
    expect(events.text.match(/event: progress/g)).toHaveLength(6);
    expect(events.text).toContain("event: done");
    expect(events.text.trim().endsWith("data: {}")).toBe(true);
  });

  test("rejects a file without the required columns", async () => {
    const response = await request(app)
      .post("/api/training/security/jobs?name=bad.csv")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("a,b\n1,2\n"));
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("missingColumns");
    expect(response.body.details.missing).toEqual(["EC", "TP", "Lat", "SR"]);
  });

  test("can be stopped", async () => {
    const bytes = await datasetBytes("intrusion", 50);
    const created = await request(app)
      .post("/api/training/intrusion/jobs?name=ds.xlsx&generations=4000&initialPopulation=16&populationSize=8&stagnation=100000")
      .set("Content-Type", "application/octet-stream")
      .send(bytes);
    expect(created.status).toBe(201);
    await new Promise((resolve) => setTimeout(resolve, 150));
    const stopped = await request(app).post(`/api/training/jobs/${created.body.id}/stop`);
    expect(stopped.status).toBe(200);
    const job = await waitForJob(created.body.id);
    expect(job.status).toBe("stopped");
    expect(job.result.training.stopReason).toBe("stopped");
    expect(job.result.training.steps).toBeLessThan(4000);
  });

  test("unknown job and controller give 404", async () => {
    expect((await request(app).get("/api/training/jobs/nope")).status).toBe(404);
    expect((await request(app).post("/api/training/jobs/nope/stop")).status).toBe(404);
    const response = await request(app)
      .post("/api/training/trust/jobs?name=x.csv")
      .set("Content-Type", "application/octet-stream")
      .send(Buffer.from("a\n1\n"));
    expect(response.status).toBe(404);
  });
});

describe("custom parameters", () => {
  const trained = require("../src/controllers/trained/intrusion.json");

  test("calculate, membership-functions and surface use the params of the body", async () => {
    const params = trained.params;
    const calc = await request(app)
      .post("/api/controllers/intrusion/calculate")
      .send({ packets: 9.5, rate: 4, weight: 141.55, params });
    expect(calc.status).toBe(200);
    expect(calc.body.value).toBeGreaterThanOrEqual(0);
    const mf = await request(app).post("/api/controllers/intrusion/membership-functions").send({ params });
    expect(mf.status).toBe(200);
    expect(mf.body.meta.variant).toBe("custom");
    expect(mf.body.meta.rateScale).toBe("log10p1");
    expect(mf.body.meta.inputDomains.rate).toEqual({ min: 0, max: 7 });
    const surface = await request(app)
      .post("/api/controllers/intrusion/surface")
      .send({ xKey: "packets", yKey: "rate", inputs: { packets: 9, rate: 3, weight: 100 }, points: 5, params });
    expect(surface.status).toBe(200);
    expect(surface.body.z).toHaveLength(5);
  });

  test("invalid params and non-trainable controllers are refused", async () => {
    const bad = await request(app)
      .post("/api/controllers/intrusion/calculate")
      .send({ packets: 9.5, rate: 4, weight: 141.55, params: { inputs: {} } });
    expect(bad.status).toBe(400);
    const trust = await request(app)
      .post("/api/controllers/trust/calculate")
      .send({ errors: 0.2, connections: 50, bytes: 7, params: {} });
    expect(trust.status).toBe(400);
  });
});

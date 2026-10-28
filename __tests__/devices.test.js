/**
 * Device backend: the status indicator (LED) of the node. A stub HTTP server
 * plays the ESP32 node: it answers /led?state=… like the firmware and records
 * what the gateway sent.
 */
const http = require("http");
const express = require("express");
const request = require("supertest");

let node, nodePort, received;

beforeAll(async () => {
  received = [];
  node = http.createServer((req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/led") {
      const state = url.searchParams.get("state");
      received.push(state);
      if (!["normal", "warning", "critical", "off"].includes(state)) {
        res.writeHead(400, { "Content-Type": "application/json" }); res.end('{"error":"bad state"}'); return;
      }
      res.writeHead(200, { "Content-Type": "application/json" }); res.end(JSON.stringify({ led: state })); return;
    }
    if (url.pathname === "/ping") { res.writeHead(200, { "Content-Type": "text/plain" }); res.end("pong"); return; }
    if (url.pathname === "/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ node: "stub", fw_version: "1.1.0", sensors: { bme280: false, ina219: false, bh1750: false }, tx_power_dbm: 19.5, rssi_dbm: -60,
        indicator: { present: true, state: received[received.length - 1] || "off", age_s: 0 } }));
      return;
    }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => node.listen(0, "127.0.0.1", r));
  nodePort = node.address().port;
});
afterAll(() => new Promise((r) => node.close(r)));

function appFor(host) {
  process.env.DEVICE_HOST = host;
  process.env.DEVICE_ID = "esp32";
  jest.resetModules();
  const devices = require("../src/devices");
  const app = express();
  app.use(express.json());
  app.use("/api/devices", devices.buildRouter());
  return app;
}

describe("mapping of the measured flow to the inputs", () => {
  test("Rate uses the packets-per-request ratio measured on the test bed; ER/CC/BS have no scaling", () => {
    const devices = require("../src/devices");
    expect(devices.PACKETS_PER_REQUEST).toBe(12);
    const x = devices.toInputs({ issued: 100, err: 0, bytesIn: 44800, reqPerSec: 50, rttMean: 21, conc: 4 }, { tx_power_dbm: 19.5 });
    expect(x.rate).toBe(600);
    expect(x.connections).toBe(100);
    expect(x.errors).toBe(0);
    expect(x.bytes).toBeCloseTo(Math.log10(44801), 10);
  });
});

describe("device status indicator (LED)", () => {
  test("POST /indicate forwards the decided state to the node's /led", async () => {
    const app = appFor(`127.0.0.1:${nodePort}`);
    const r = await request(app).post("/api/devices/esp32/indicate").send({ status: "critical" });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true, status: "critical" });
    expect(received).toContain("critical");
  });

  test("an unknown state is rejected before reaching the node", async () => {
    const app = appFor(`127.0.0.1:${nodePort}`);
    const before = received.length;
    const r = await request(app).post("/api/devices/esp32/indicate").send({ status: "purple" });
    expect(r.status).toBe(400);
    expect(r.body.allowed).toEqual(["normal", "warning", "critical", "standby", "off"]);
    expect(received.length).toBe(before);
  });

  test("standby on firmware that does not know it gives 422 (the page then turns the LED off)", async () => {
    // the stub plays the older firmware: normal|warning|critical|off only
    const app = appFor(`127.0.0.1:${nodePort}`);
    const r = await request(app).post("/api/devices/esp32/indicate").send({ status: "standby" });
    expect(r.status).toBe(422);
    expect(received[received.length - 1]).toBe("standby");
  });

  test("the telemetry passes the indicator of the node through", async () => {
    const app = appFor(`127.0.0.1:${nodePort}`);
    await request(app).post("/api/devices/esp32/indicate").send({ status: "normal" });
    const r = await request(app).get("/api/devices/esp32/telemetry");
    expect(r.status).toBe(200);
    expect(r.body.indicator).toEqual({ present: true, state: "normal", age_s: 0 });
    expect(r.body.fw_version).toBe("1.1.0"); // firmware version passes through to the page
  });

  test("the device check reports the running scenario (normal when idle)", async () => {
    const app = appFor(`127.0.0.1:${nodePort}`);
    const r = await request(app).get("/api/devices/esp32");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: "esp32", reachable: true, mode: "normal" });
    await request(app).post("/api/devices/esp32/command").send({ scenario: "scan" });
    const r2 = await request(app).get("/api/devices/esp32");
    expect(r2.body.mode).toBe("scan");
  });

  test("intense error-free traffic is a command like the others; rps/conc override only within limits", async () => {
    const app = appFor(`127.0.0.1:${nodePort}`);
    const ok = await request(app).post("/api/devices/esp32/command").send({ scenario: "surge" });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ ok: true, mode: "surge" });
    const cal = await request(app).post("/api/devices/esp32/command").send({ scenario: "surge", rps: 40, conc: 3 });
    expect(cal.body).toEqual({ ok: true, mode: "surge", override: { rps: 40, conc: 3 } });
    const bad = await request(app).post("/api/devices/esp32/command").send({ scenario: "surge", rps: 1000 });
    expect(bad.status).toBe(400);
    const info = await request(app).get("/api/devices/esp32");
    expect(info.body.mode).toBe("surge");
  });

  test("an unreachable node gives 502, an unknown device 404", async () => {
    const app = appFor("127.0.0.1:1"); // nothing listens there
    const r = await request(app).post("/api/devices/esp32/indicate").send({ status: "off" });
    expect(r.status).toBe(502);
    const r2 = await request(app).post("/api/devices/nope/indicate").send({ status: "off" });
    expect(r2.status).toBe(404);
  });
});

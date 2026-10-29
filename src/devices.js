/**
 * Real-device backend (Variant A, gateway as endpoint).
 *
 * The gateway (this server) exchanges real HTTP traffic with an ESP32 test
 * node and measures, over a fixed observation window, the quantities a flow
 * monitor would see — request/response counts, byte volume, round-trip
 * latency and error rate — then maps them to the nine controller inputs.
 * Three inputs come from the node's own telemetry (TX power, latency, and
 * energy from an INA219 when fitted). Under an "attack" command the gateway
 * really floods / scans / holds connections against the node, so the measured
 * features reflect real network behaviour, not a generated profile.
 *
 * The traffic patterns of the modes are fixed, typical loads (normal polling,
 * HTTP flood, path scan, slow heavy downloads, intense error-free polling); the
 * node's real behaviour under them is measured, not prescribed.
 * Mapping from the measured application-level quantities to the controller
 * ranges (features of NSL-KDD, the 6G IoT dataset and CIC IoT 2023) is linear
 * with fixed constants (see toInputs). ER, CC and BS are taken as measured; Rate
 * uses PACKETS_PER_REQUEST measured with tcpdump on the test bed; the divisors
 * of NP, We and Lat are fixed scaling constants (a proxy, documented as such).
 * Sensitivity of the results to these constants was checked on the test bed.
 *
 * Endpoints (mounted at /api/devices):
 *   GET  /                 list of configured devices
 *   GET  /:id              reachability check (pings the node)
 *   GET  /:id/stream       SSE of readings, one per window: { inputs, telemetry, flow }
 *   GET  /:id/reading      latest reading (polling fallback)
 *   POST /:id/command      { scenario: normal|ddos|scan|exhaustion|surge } sets the mode;
 *                          optional { rps, conc } override the pattern of the mode
 *                          until the next command (test-bed calibration only — the
 *                          page never sends them)
 *   POST /:id/indicate     { status: normal|warning|critical|standby|off } sets the
 *                          node's status indicator (WS2812B pixel) to the decided
 *                          state; standby = connected, no assessment yet
 */
const http = require("http");
const os = require("os");
const express = require("express");

const WINDOW_MS = 2000; // one observation window (CC is "per 2 s" in the dataset)
const REQ_TIMEOUT_MS = 800;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// --- configured devices (from environment) --------------------------------
function configuredDevices() {
  const host = process.env.DEVICE_HOST;
  if (!host) return [];
  return [{ id: process.env.DEVICE_ID || "esp32", name: process.env.DEVICE_NAME || "ESP32 node", host }];
}

function parseHost(host) {
  const clean = String(host).replace(/^https?:\/\//, "");
  const [h, p] = clean.split(":");
  return { host: h, port: Number(p) || 80 };
}

/** One HTTP GET to the node. Resolves with {ok, ms, bytes, status}. Never rejects. */
function hit(host, path, timeoutMs = REQ_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const { host: h, port } = parseHost(host);
    const start = Date.now();
    const req = http.get({ host: h, port, path, timeout: timeoutMs, agent: false }, (res) => {
      let bytes = 0;
      res.on("data", (c) => { bytes += c.length; });
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 400, ms: Date.now() - start, bytes, status: res.statusCode }));
    });
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, ms: Date.now() - start, bytes: 0, status: 0, timeout: true }); });
    req.on("error", () => resolve({ ok: false, ms: Date.now() - start, bytes: 0, status: 0, error: true }));
  });
}

/** Fetch and parse /status telemetry. Resolves with the object or null. */
function fetchStatus(host, timeoutMs = REQ_TIMEOUT_MS) {
  return new Promise((resolve) => {
    const { host: h, port } = parseHost(host);
    const req = http.get({ host: h, port, path: "/status", timeout: timeoutMs, agent: false }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => { try { resolve(JSON.parse(body)); } catch (_) { resolve(null); } });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

// --- traffic patterns per mode --------------------------------------------
// rps: requests/second, conc: concurrency, bytes: payload size via /load,
// paths: endpoints hit (scan mixes non-existent paths -> 404 -> errors).
const MODES = {
  normal: { rps: 3, conc: 1, bytes: 0, paths: ["/status"] },
  ddos: { rps: 120, conc: 24, bytes: 1200, paths: ["/load"] },
  scan: { rps: 50, conc: 10, bytes: 0, paths: ["/status", "/a", "/b", "/cfg", "/x1", "/y2", "/admin"] },
  exhaustion: { rps: 12, conc: 20, bytes: 6000, paths: ["/load"] },
  // Intense but error-free traffic: as many requests per window as the DoS/DDoS
  // mode reaches on the test bed (~100), but with the largest concurrency the
  // node still serves without failures (4; with 6+ connections failures appear),
  // small responses and no payload. Calibrated 28.10.2026 (firmware 1.2.1):
  // ~96 requests/window, 1 failure in 1735 requests.
  surge: { rps: 60, conc: 4, bytes: 0, paths: ["/status"] },
};
const OVERRIDE_LIMITS = { rps: [1, 200], conc: [1, 32] };
const DEFAULT_MODE = "normal";

/** Run the traffic pattern of `mode` for ~WINDOW_MS, collecting flow stats. */
async function runWindow(host, mode, override = null) {
  const m = { ...(MODES[mode] || MODES[DEFAULT_MODE]), ...(override || {}) };
  const deadline = Date.now() + WINDOW_MS;
  const pathFor = (i) => {
    const base = m.paths[i % m.paths.length];
    return m.bytes ? `${base}?n=${m.bytes}` : base;
  };
  let issued = 0, ok = 0, err = 0, bytesIn = 0, rttSum = 0, rttMax = 0, i = 0;
  const target = Math.max(1, Math.round((m.rps * WINDOW_MS) / 1000));

  async function worker() {
    while (Date.now() < deadline && issued < target) {
      const idx = i++; issued += 1;
      // eslint-disable-next-line no-await-in-loop
      const r = await hit(host, pathFor(idx));
      if (r.ok) { ok += 1; bytesIn += r.bytes; rttSum += r.ms; rttMax = Math.max(rttMax, r.ms); }
      else err += 1;
      // pace each worker to approximate the target rate
      const perReq = (1000 / m.rps) * m.conc;
      const wait = perReq - 5;
      if (wait > 0 && Date.now() < deadline) await new Promise((res) => setTimeout(res, wait));
    }
  }
  await Promise.all(Array.from({ length: m.conc }, worker));

  const elapsed = Math.max(1, WINDOW_MS) / 1000;
  const reqPerSec = issued / elapsed;
  const rttMean = ok ? rttSum / ok : REQ_TIMEOUT_MS; // no success -> treat as max latency
  return { issued, ok, err, bytesIn, reqPerSec, rttMean, rttMax, conc: m.conc };
}

// --- mapping measured flow + telemetry to the nine inputs -----------------
// TCP packets (both directions) per successful HTTP request between the gateway
// and the node: new connection, request, response, close. Measured with tcpdump
// on the test bed 29.10.2026 (firmware 1.2.1): 11.2-12.6 per request for the
// modes without failures (normal, scan, intense traffic). Rate = requests/s x this.
const PACKETS_PER_REQUEST = 12;

// EC from the INA219 (firmware >= 1.3.0, mean power over the 2 s sensor period).
// Calibration 29.10.2026 (esp32-node, 5.08 V power bank, Wi-Fi sleep off,
// indicator off): idle 704 mW; traffic adds only 5-36 mW (<= 5 %), so the
// absolute power cannot be put on the dataset scale (0.01-0.05). EC is the
// relative increase over the node's idle power: 0 % -> 0.01, IDLE_POWER_SPAN
// (10 %) and more -> 0.05. Chosen from the power data only, before the security
// scores were computed. Another node / wiring: measure its idle power and set
// NODE_IDLE_POWER_MW.
const IDLE_POWER_MW = Number(process.env.NODE_IDLE_POWER_MW) || 704;
const IDLE_POWER_SPAN = 0.10;

function energyFromPower(powerMw, idleMw = IDLE_POWER_MW) {
  const rise = (powerMw / idleMw - 1) / IDLE_POWER_SPAN;
  return 0.01 + 0.04 * clamp(rise, 0, 1);
}

function toInputs(flow, tele) {
  const { issued, err, bytesIn, reqPerSec, rttMean, conc } = flow;
  const txPower = tele && tele.tx_power_dbm != null ? Number(tele.tx_power_dbm) : 18;
  const powerMw = tele && tele.power_mw != null ? Number(tele.power_mw) : null;

  return {
    // Trust controller — behaviour of the connection
    errors: clamp(issued ? err / issued : 0, 0, 1),            // ER: real error fraction
    connections: clamp(issued, 0, 200),                        // CC: requests (~connections) per window
    bytes: clamp(Math.log10(bytesIn + 1), 0, 12),              // BS: log10 of bytes from the node
    // Security controller — resources and channel
    energy: powerMw != null
      ? energyFromPower(powerMw)                               // EC: real, rise of INA219 power over idle
      : clamp(0.015 + reqPerSec * 0.00025, 0.01, 0.05),        // EC: estimate from activity until INA219 is fitted
    strength: clamp(txPower, 0, 40),                           // TP: configured Wi-Fi TX power of the node (constant, not a measurement)
    response: clamp(rttMean / 12, 0, 10),                      // Lat: mean time of a successful request, ms / 12 (scaling)
    // Intrusion controller — traffic intensity
    packets: clamp(issued / 16, 0, 15),                        // NP: requests per window / 16 (proxy)
    rate: clamp(reqPerSec * PACKETS_PER_REQUEST, 0, 3000),     // Rate: packets/s from requests/s (measured ratio)
    weight: clamp((issued * conc) / 20, 0, 250),               // We: requests x concurrency / 20 (proxy)
  };
}

// --- per-device monitor ----------------------------------------------------
class Monitor {
  constructor(dev) {
    this.dev = dev;
    this.mode = DEFAULT_MODE;
    this.override = null; // { rps, conc } for calibration, cleared by the next command
    this.subs = new Set();
    this.last = null;
    this.running = false;
    this.busy = false;
  }
  setMode(m, override = null) { if (MODES[m]) { this.mode = m; this.override = override; } }
  addSub(res) { this.subs.add(res); if (!this.running) this.start(); }
  removeSub(res) { this.subs.delete(res); if (this.subs.size === 0) this.stop(); }
  start() { if (this.running) return; this.running = true; this.loop(); }
  stop() { this.running = false; this.mode = DEFAULT_MODE; this.override = null; }

  async loop() {
    if (!this.running || this.busy) return;
    this.busy = true;
    try {
      // the window is labelled with the mode it was measured in (a command
      // during the window takes effect from the next one)
      const mode = this.mode;
      const flow = await runWindow(this.dev.host, mode, this.override);
      const tele = await fetchStatus(this.dev.host);
      const reading = { deviceId: this.dev.id, mode, ts: Date.now(), inputs: toInputs(flow, tele), telemetry: tele, flow };
      this.last = reading;
      this.broadcast(reading);
    } catch (_) { /* keep looping */ }
    finally { this.busy = false; }
    if (this.running) setTimeout(() => this.loop(), 50);
  }
  broadcast(reading) {
    const line = `data: ${JSON.stringify(reading)}\n\n`;
    for (const res of this.subs) { try { res.write(line); } catch (_) { /* dropped */ } }
  }
}

// --- network discovery -----------------------------------------------------
// Find ESP32 nodes running our firmware by probing /status on the LAN /24 and
// matching the firmware signature (a `node` name and a `sensors` object).
function localSubnets() {
  const out = [];
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) {
    for (const a of ifs[name] || []) {
      if (a.family === "IPv4" && !a.internal) out.push(a.address.split(".").slice(0, 3).join("."));
    }
  }
  return [...new Set(out)];
}

/** Probe one host for our firmware signature. Resolves with device info or null. */
function probe(host, timeoutMs = 500) {
  return new Promise((resolve) => {
    const { host: h, port } = parseHost(host);
    const req = http.get({ host: h, port, path: "/status", timeout: timeoutMs, agent: false }, (res) => {
      let b = "";
      res.on("data", (c) => { b += c; });
      res.on("end", () => {
        try {
          const j = JSON.parse(b);
          if (j && typeof j.node === "string" && j.sensors && j.tx_power_dbm != null) {
            resolve({ host, node: j.node, rssi: j.rssi_dbm, tx: j.tx_power_dbm, sensors: j.sensors });
          } else resolve(null);
        } catch (_) { resolve(null); }
      });
    });
    req.on("timeout", () => { req.destroy(); resolve(null); });
    req.on("error", () => resolve(null));
  });
}

async function discover(subnetArg, extraSubnets = []) {
  const subnets = [...new Set([...(subnetArg ? [subnetArg] : localSubnets()), ...extraSubnets])];
  const found = [];
  for (const sub of subnets) {
    if (!/^\d+\.\d+\.\d+$/.test(sub)) continue;
    const hosts = [];
    for (let i = 1; i <= 254; i += 1) hosts.push(`${sub}.${i}`);
    let idx = 0;
    const worker = async () => {
      while (idx < hosts.length) {
        const h = hosts[idx]; idx += 1;
        // eslint-disable-next-line no-await-in-loop
        const r = await probe(h);
        if (r) found.push(r);
      }
    };
    // eslint-disable-next-line no-await-in-loop
    await Promise.all(Array.from({ length: 48 }, worker));
  }
  return found;
}

// --- router ----------------------------------------------------------------
function buildRouter() {
  const router = express.Router();
  const configured = configuredDevices();           // manual device(s) from options
  const dynamic = new Map();                         // discovered devices: id(host) -> {id,name,host}
  const monitors = new Map();                        // id -> Monitor

  function deviceById(id) {
    return configured.find((d) => d.id === id) || dynamic.get(id) || null;
  }
  function getMonitor(id) {
    if (monitors.has(id)) return monitors.get(id);
    const dev = deviceById(id);
    if (!dev) return null;
    const m = new Monitor(dev);
    monitors.set(id, m);
    return m;
  }
  function deviceList() {
    const seen = new Set(configured.map((d) => d.host));
    const list = configured.map((d) => ({ id: d.id, name: d.name, host: d.host }));
    for (const d of dynamic.values()) if (!seen.has(d.host)) list.push({ id: d.id, name: d.name, host: d.host });
    return list;
  }

  router.get("/", (req, res) => res.json(deviceList()));

  router.get("/discover", async (req, res) => {
    const subnet = typeof req.query.subnet === "string" ? req.query.subnet : null;
    // also scan the subnet of a manually configured device, if any
    const extra = configured.map((d) => parseHost(d.host).host.split(".").slice(0, 3).join("."))
      .filter((s) => /^\d+\.\d+\.\d+$/.test(s));
    const found = await discover(subnet, extra);
    dynamic.clear();
    for (const f of found) dynamic.set(f.host, { id: f.host, name: f.node, host: f.host });
    res.json(deviceList());
  });

  router.get("/:id", async (req, res) => {
    const m = getMonitor(req.params.id);
    if (!m) return res.status(404).json({ error: "Unknown device" });
    const r = await hit(m.dev.host, "/ping", 1200);
    if (!r.ok) return res.status(502).json({ error: "Device unreachable", host: m.dev.host });
    // mode: the traffic scenario the gateway is currently running against the node
    // (another page may have started one); "normal" when nobody is listening.
    return res.json({ id: m.dev.id, name: m.dev.name, host: m.dev.host, reachable: true, latencyMs: r.ms, mode: m.mode });
  });

  router.get("/:id/reading", (req, res) => {
    const m = getMonitor(req.params.id);
    if (!m) return res.status(404).json({ error: "Unknown device" });
    if (!m.last) return res.status(503).json({ error: "No reading yet" });
    return res.json(m.last);
  });

  router.get("/:id/telemetry", async (req, res) => {
    const m = getMonitor(req.params.id);
    if (!m) return res.status(404).json({ error: "Unknown device" });
    const tele = await fetchStatus(m.dev.host, 1500);
    if (!tele) return res.status(502).json({ error: "Device unreachable", host: m.dev.host });
    return res.json(tele);
  });

  router.post("/:id/command", (req, res) => {
    const m = getMonitor(req.params.id);
    if (!m) return res.status(404).json({ error: "Unknown device" });
    const scenario = req.body && req.body.scenario;
    if (!MODES[scenario]) return res.status(400).json({ error: "Unknown scenario", allowed: Object.keys(MODES) });
    // optional override of the pattern (calibration of the test bed)
    const override = {};
    for (const [key, [lo, hi]] of Object.entries(OVERRIDE_LIMITS)) {
      if (req.body[key] === undefined) continue;
      const v = Number(req.body[key]);
      if (!Number.isInteger(v) || v < lo || v > hi) return res.status(400).json({ error: `Invalid ${key}`, range: [lo, hi] });
      override[key] = v;
    }
    const used = Object.keys(override).length ? override : null;
    m.setMode(scenario, used);
    return res.json(used ? { ok: true, mode: scenario, override: used } : { ok: true, mode: scenario });
  });

  // Status indicator on the node (one WS2812B pixel, firmware endpoint /led).
  // The page sends the state decided by the policy; the request is sent outside
  // the measurement window, so it is not counted in the flow statistics.
  const INDICATOR_STATES = ["normal", "warning", "critical", "standby", "off"];
  router.post("/:id/indicate", async (req, res) => {
    const m = getMonitor(req.params.id);
    if (!m) return res.status(404).json({ error: "Unknown device" });
    const status = req.body && req.body.status;
    if (!INDICATOR_STATES.includes(status)) return res.status(400).json({ error: "Unknown status", allowed: INDICATOR_STATES });
    const r = await hit(m.dev.host, `/led?state=${encodeURIComponent(status)}`, 1500);
    if (r.ok) return res.json({ ok: true, status });
    if (r.status === 404) return res.status(404).json({ error: "Device has no indicator", host: m.dev.host });
    // older firmware knows only normal|warning|critical|off
    if (r.status === 400) return res.status(422).json({ error: "State not supported by the device firmware", status, host: m.dev.host });
    return res.status(502).json({ error: "Device unreachable", host: m.dev.host });
  });

  router.get("/:id/stream", (req, res) => {
    const m = getMonitor(req.params.id);
    if (!m) return res.status(404).end();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    res.write(": connected\n\n");
    if (m.last) res.write(`data: ${JSON.stringify(m.last)}\n\n`);
    m.addSub(res);
    req.on("close", () => m.removeSub(res));
    return undefined;
  });

  return router;
}

module.exports = { buildRouter, toInputs, runWindow, MODES, PACKETS_PER_REQUEST, IDLE_POWER_MW, energyFromPower, configuredDevices, discover, probe, localSubnets };

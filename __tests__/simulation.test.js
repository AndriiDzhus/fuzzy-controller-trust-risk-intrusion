const sim = require("../public/simulation.js");
const { controllers } = require("../src/controllers");

describe("simulation page: integral assessment", () => {
  test("partial scores and the weakest link (t-norm min)", () => {
    const a = sim.assess({ trust: 80, security: 30, intrusion: 10 });
    expect(a.partial).toEqual({ trust: 80, security: 70, intrusion: 90 });
    expect(a.level).toBe(70);
    expect(a.weakest).toBe("security");
    expect(a.term).toBe("High");
    expect(a.status).toBe("normal");
  });

  test("status follows the policy thresholds", () => {
    expect(sim.assess({ trust: 60, security: 55, intrusion: 10 }).status).toBe("warning");
    expect(sim.assess({ trust: 60, security: 20, intrusion: 90 }).status).toBe("critical");
    expect(sim.assess({ trust: 60, security: 55, intrusion: 10 }, { warn: 40, critical: 20 }).status).toBe("normal");
  });

  test("a missing output is skipped; no outputs at all give no level", () => {
    const a = sim.assess({ trust: 70, security: null, intrusion: 20 });
    expect(a.level).toBe(70);
    expect(a.weakest).toBe("trust");
    expect(sim.assess({ trust: null, security: null, intrusion: null }).status).toBe("unknown");
  });

  test("policy zones of the gauges follow the thresholds; SR and IP use the inverted scale", () => {
    expect(sim.policyZones({ warn: 50, critical: 25 })).toEqual([
      { from: 0, to: 25, status: "critical" }, { from: 25, to: 50, status: "warning" }, { from: 50, to: 100, status: "normal" },
    ]);
    expect(sim.policyZones({ warn: 50, critical: 25 }, true)).toEqual([
      { from: 0, to: 50, status: "normal" }, { from: 50, to: 75, status: "warning" }, { from: 75, to: 100, status: "critical" },
    ]);
    // critical above warning: the warning zone disappears, as in assess()
    expect(sim.policyZones({ warn: 20, critical: 40 })).toEqual([{ from: 0, to: 40, status: "critical" }, { from: 40, to: 100, status: "normal" }]);
    expect(sim.policyZones({ warn: 0, critical: 0 })).toEqual([{ from: 0, to: 100, status: "normal" }]);
  });

  test("the level is described by the five terms of the trust index", () => {
    expect(sim.levelTerm(5)).toBe("VeryLow");
    expect(sim.levelTerm(30)).toBe("Low");
    expect(sim.levelTerm(50)).toBe("Medium");
    expect(sim.levelTerm(70)).toBe("High");
    expect(sim.levelTerm(95)).toBe("VeryHigh");
  });
});

describe("simulation page: scenarios", () => {
  const ranges = Object.fromEntries(sim.INPUTS.map((i) => [i.key, [i.min, i.max]]));

  test("every scenario keeps every input inside its range at every step", () => {
    Object.keys(sim.SCENARIOS).forEach((name) => {
      const rnd = sim.createRandom(3);
      for (let t = 0; t < sim.STEPS; t += 1) {
        const values = sim.scenarioInputs(name, t, { rnd, noise: 2 });
        Object.entries(values).forEach(([key, v]) => {
          expect(v).toBeGreaterThanOrEqual(ranges[key][0]);
          expect(v).toBeLessThanOrEqual(ranges[key][1]);
        });
      }
    });
  });

  test("without noise the normal scenario is the baseline, and the DDoS attack raises the intrusion probability", () => {
    expect(sim.scenarioInputs("normal", 50, { noise: 0 })).toEqual(sim.BASELINE);
    const quiet = sim.scenarioInputs("ddos", 0, { noise: 0 });
    const attack = sim.scenarioInputs("ddos", 60, { noise: 0, start: 30, duration: 60 });
    const ip = (inputs) => controllers.intrusion.calculate(controllers.intrusion.parseInputs({ packets: inputs.packets, rate: inputs.rate, weight: inputs.weight }).values).value;
    const ti = (inputs) => controllers.trust.calculate(controllers.trust.parseInputs({ errors: inputs.errors, connections: inputs.connections, bytes: inputs.bytes }).values).value;
    expect(ip(attack)).toBeGreaterThan(ip(quiet) + 40);
    expect(ti(attack)).toBeLessThan(ti(quiet) - 40);
    expect(sim.assess({ trust: ti(attack), security: 0, intrusion: ip(attack) }).status).toBe("critical");
  });

  test("the seeded generator replays identically", () => {
    const a = sim.scenarioInputs("scan", 40, { rnd: sim.createRandom(9) });
    const b = sim.scenarioInputs("scan", 40, { rnd: sim.createRandom(9) });
    expect(a).toEqual(b);
  });
});

describe("simulation page: live numbers of the active device command", () => {
  test("rate, error share and latency of the successful requests over the last windows", () => {
    const f = sim.flowSummary([
      { issued: 100, ok: 60, err: 40, reqPerSec: 50, rttMean: 20 },
      { issued: 100, ok: 70, err: 30, reqPerSec: 50, rttMean: 30 },
    ]);
    expect(f.rps).toBe(50);
    expect(f.errPct).toBe(35);
    expect(f.rttMs).toBeCloseTo((20 * 60 + 30 * 70) / 130, 6);
    expect(f.n).toBe(2);
  });
  test("no windows yet, or no successful request: nothing / no latency", () => {
    expect(sim.flowSummary([])).toBeNull();
    expect(sim.flowSummary([{ issued: 10, ok: 0, err: 10, reqPerSec: 5, rttMean: 800 }]).rttMs).toBeNull();
  });
});

describe("simulation page: response policy thresholds", () => {
  const norm = sim.normalizePolicy;
  test("integers in 0..100", () => {
    expect(norm({ warn: 49.6, critical: -3 })).toEqual({ warn: 50, critical: 0 });
    expect(norm({ warn: 140, critical: "25" })).toEqual({ warn: 100, critical: 25 });
  });
  test("the moved threshold stops at the other one (critical ≤ warn)", () => {
    expect(norm({ warn: 50, critical: 70 }, "critical")).toEqual({ warn: 50, critical: 50 });
    expect(norm({ warn: 10, critical: 25 }, "warn")).toEqual({ warn: 25, critical: 25 });
  });
  test("the zones follow the thresholds", () => {
    expect(sim.policyZones(norm({ warn: 60, critical: 30 }))).toEqual([
      { from: 0, to: 30, status: "critical" }, { from: 30, to: 60, status: "warning" }, { from: 60, to: 100, status: "normal" },
    ]);
  });
});

describe("simulation page: device selector after a scan", () => {
  const pick = sim.scanSelection;
  test("a found node replaces the demo device (disconnects it, no auto-connect)", () => {
    expect(pick(["192.168.50.173"], "demo", "demo")).toEqual({ select: "192.168.50.173", disconnect: true });
    expect(pick(["192.168.50.173"], "demo", null)).toEqual({ select: "192.168.50.173", disconnect: false });
  });
  test("an already selected node found again stays selected; else the first found", () => {
    expect(pick(["a", "b"], "b", null)).toEqual({ select: "b", disconnect: false });
    expect(pick(["a", "b"], "c", null)).toEqual({ select: "a", disconnect: false });
  });
  test("a connected real device is not disturbed; nothing found changes nothing", () => {
    expect(pick(["a", "b"], "b", "b")).toEqual({ select: "b", disconnect: false });
    expect(pick([], "demo", "demo")).toEqual({ select: "demo", disconnect: false });
  });
});

describe("simulation page: status indicator hysteresis", () => {
  const step = sim.indicatorStep;
  test("a new status is sent only after two consecutive windows", () => {
    let t = step(null, "normal");
    expect(t.send).toBeNull();
    t = step(t, "normal");
    expect(t.send).toBe("normal");
    expect(t.shown).toBe("normal");
    // one window of "critical" (noise) does not change the LED
    t = step(t, "critical");
    expect(t.send).toBeNull();
    expect(t.shown).toBe("normal");
    // back to normal: the candidate is dropped, nothing is sent again
    t = step(t, "normal");
    expect(t.send).toBeNull();
    expect(t.candidate).toBeNull();
    // two windows of "critical" switch the LED
    t = step(t, "critical");
    t = step(t, "critical");
    expect(t.send).toBe("critical");
    expect(t.shown).toBe("critical");
  });

  test("an unknown status is ignored and keeps the track", () => {
    let t = step({ shown: "normal", candidate: "warning", count: 1, sentAt: 1000 }, "unknown", 2000);
    expect(t.send).toBeNull();
    expect(t.candidate).toBe("warning");
    expect(sim.INDICATOR_CONFIRM).toBe(2);
  });

  test("a stable state is re-sent as a keep-alive every 20 s", () => {
    let t = step(null, "normal", 0);
    t = step(t, "normal", 2000);
    expect(t.send).toBe("normal");
    expect(t.sentAt).toBe(2000);
    t = step(t, "normal", 12000);
    expect(t.send).toBeNull();
    t = step(t, "normal", 2000 + sim.INDICATOR_KEEPALIVE_MS);
    expect(t.send).toBe("normal");
    expect(t.sentAt).toBe(22000);
    // a change resets the keep-alive clock
    t = step(t, "critical", 24000); t = step(t, "critical", 26000);
    expect(t.send).toBe("critical");
    expect(t.sentAt).toBe(26000);
  });

  test("switched on during listening: the last status is shown at once, changes keep the hysteresis", () => {
    expect(sim.indicatorSeed(null)).toBeNull();
    expect(sim.indicatorSeed("unknown")).toBeNull();
    let t = sim.indicatorSeed("critical", 1000);
    expect(t).toEqual({ shown: "critical", candidate: null, count: 0, sentAt: 1000 });
    t = step(t, "critical", 3000);
    expect(t.send).toBeNull(); // already shown, nothing re-sent
    t = step(t, "normal", 5000);
    expect(t.send).toBeNull(); // one window is not enough to change it
    t = step(t, "normal", 7000);
    expect(t.send).toBe("normal");
  });
});

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

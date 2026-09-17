const trustController = require("./fuzzyController");

function trapezoidalMF(x, a, b, c, d) {
  if (x < a || x > d) return 0;
  if (x >= b && x <= c) return 1;
  if (x >= a && x < b) return (x - a) / (b - a || 1);
  if (x > c && x <= d) return (d - x) / (d - c || 1);
  return 0;
}

function triangularMF(x, a, b, c) {
  if (x < a || x > c) return 0;
  if (a === b) return (c - x) / (c - a || 1);
  if (b === c) return (x - a) / (b - a || 1);
  if (x <= b) return (x - a) / (b - a || 1);
  return (c - x) / (c - b || 1);
}

function gaussianMF(x, center, sigma) {
  return Math.exp(-Math.pow(x - center, 2) / (2 * sigma * sigma));
}

function sampleMF(fn, step = 1, max = 100) {
  const out = [];
  const n = Math.round(max / step);
  for (let i = 0; i <= n; i += 1) {
    const x = i === n ? max : Number((i * step).toFixed(10));
    out.push({ x, y: fn(x) });
  }
  return out;
}

function leftShoulderMF(x, peak) {
  if (x <= 0) return 1;
  if (x <= peak) return 1 - x / peak;
  return 0;
}

function trianglePeakMF(x, peak, max) {
  if (x < 0 || x > max) return 0;
  if (x <= peak) return x / peak;
  return (max - x) / (max - peak);
}

function rightRampMF(x, start, max) {
  if (x < start) return 0;
  if (x <= max) return (x - start) / (max - start);
  return 1;
}

function maxTerm(memberships) {
  const entries = Object.entries(memberships);
  if (!entries.length) return "N/A";
  return entries.sort((a, b) => b[1] - a[1])[0][0];
}

function nearestSingletonTerm(singletons, value) {
  const entries = Object.entries(singletons);
  if (!entries.length) return "N/A";
  const tieBreakPriority = ["medium", "low", "high", "veryLow", "veryHigh", "none"];
  const priority = (term) => {
    const idx = tieBreakPriority.indexOf(term);
    return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
  };

  let bestTerm = entries[0][0];
  let bestDist = Math.abs(entries[0][1] - value);

  for (let i = 1; i < entries.length; i += 1) {
    const [term, termValue] = entries[i];
    const dist = Math.abs(termValue - value);
    if (dist < bestDist || (dist === bestDist && priority(term) < priority(bestTerm))) {
      bestDist = dist;
      bestTerm = term;
    }
  }

  return bestTerm;
}

const securityRanges = {
  energy: { min: 0, max: 0.05 },
  strength: { min: 0, max: 40 },
  response: { min: 0, max: 10 },
};

const securityDef = {
  singletons: {
    none: 0,
    veryLow: 20,
    low: 40,
    medium: 60,
    high: 80,
    veryHigh: 100,
  },
  rules: [
    { EC: "low", TP: "low", Lat: "low", out: "none" },
    { EC: "medium", TP: "medium", Lat: "medium", out: "veryLow" },
    { EC: "high", TP: "low", Lat: "low", out: "low" },
    { EC: "medium", TP: "high", Lat: "medium", out: "medium" },
    { EC: "high", TP: "medium", Lat: "high", out: "high" },
    { EC: "high", TP: "high", Lat: "high", out: "veryHigh" },
  ],
  mfs: {
    EC: {
      low: (x) => leftShoulderMF(x, 0.025),
      medium: (x) => trianglePeakMF(x, 0.025, 0.05),
      high: (x) => rightRampMF(x, 0.025, 0.05),
    },
    TP: {
      low: (x) => leftShoulderMF(x, 20),
      medium: (x) => trianglePeakMF(x, 20, 40),
      high: (x) => rightRampMF(x, 20, 40),
    },
    Lat: {
      low: (x) => leftShoulderMF(x, 5),
      medium: (x) => trianglePeakMF(x, 5, 10),
      high: (x) => rightRampMF(x, 5, 10),
    },
  },
};

const intrusionDef = {
  rules: [
    { N: "low", R: "low", D: "medium", out: "low" },
    { N: "low", R: "medium", D: "low", out: "none" },
    { N: "low", R: "medium", D: "high", out: "none" },
    { N: "low", R: "high", D: "medium", out: "none" },
    { N: "medium", R: "low", D: "low", out: "medium" },
    { N: "medium", R: "medium", D: "low", out: "medium" },
    { N: "medium", R: "medium", D: "high", out: "low" },
    { N: "medium", R: "high", D: "high", out: "low" },
    { N: "high", R: "low", D: "medium", out: "high" },
    { N: "high", R: "medium", D: "low", out: "high" },
    { N: "high", R: "medium", D: "high", out: "high" },
    { N: "high", R: "high", D: "medium", out: "medium" },
  ],
  mfs: {
    N: {
      low: (x) => gaussianMF(x, 0, 18),
      medium: (x) => gaussianMF(x, 60, 20),
      high: (x) => gaussianMF(x, 100, 12),
    },
    R: {
      low: (x) => gaussianMF(x, 0, 8),
      medium: (x) => gaussianMF(x, 45, 24),
      high: (x) => gaussianMF(x, 100, 12),
    },
    D: {
      low: (x) => gaussianMF(x, 0, 20),
      medium: (x) => gaussianMF(x, 65, 16),
      high: (x) => gaussianMF(x, 100, 6),
    },
    I: {
      none: (x) => gaussianMF(x, 0, 12),
      low: (x) => gaussianMF(x, 35, 12),
      medium: (x) => gaussianMF(x, 65, 12),
      high: (x) => gaussianMF(x, 100, 12),
    },
  },
};

function roundMu(value) {
  return Math.round((Number(value) || 0) * 1e6) / 1e6;
}

function evaluateAndRules(rules, maps) {
  return rules.map((rule, index) => {
    const conditions = maps.map((item) => ({
      key: item.key,
      symbol: item.symbol,
      term: rule[item.field],
      mu: roundMu(item.terms[rule[item.field]]),
    }));
    return {
      index: index + 1,
      conditions,
      out: rule.out,
      alpha: roundMu(Math.min(...conditions.map((item) => item.mu))),
    };
  });
}

function validateRange(values) {
  return Object.values(values).every((v) => Number.isFinite(v) && v >= 0 && v <= 100);
}

function validateInputRanges(inputs, ranges) {
  return Object.entries(ranges).every(([key, range]) => {
    const value = Number(inputs[key]);
    return Number.isFinite(value) && value >= range.min && value <= range.max;
  });
}

function calculateTrust(inputs) {
  const value = trustController.calculateTrustIndex(inputs.errors, inputs.connections, inputs.bytes);
  const membershipData = {
    errors: trustController.calculateMembershipValues("errors", inputs.errors),
    connections: trustController.calculateMembershipValues("connections", inputs.connections),
    bytes: trustController.calculateMembershipValues("bytes", inputs.bytes),
    trustIndex: trustController.calculateMembershipValues("trustIndex", value),
  };

  return {
    value,
    dominantTerm: trustController.getMostActiveTerm(membershipData.trustIndex),
    membershipData,
    ruleOutputs: trustController.getOutputTermActivations(),
    ruleEvaluations: trustController.getTrustRuleEvaluations(membershipData),
    aggregatedOutput: trustController.getAggregatedOutput(
      inputs.errors,
      inputs.connections,
      inputs.bytes
    ),
  };
}

function trustMembershipFunctions() {
  const build = (name) => {
    const params = trustController.membershipParams[name];
    const out = {};
    Object.entries(params).forEach(([term, cfg]) => {
      out[term] = sampleMF((x) => {
        if (cfg.type === "trapeze") return trapezoidalMF(x, ...cfg.params);
        return triangularMF(x, ...cfg.params);
      }, 1, 100);
    });
    return out;
  };

  return {
    inputs: {
      errors: build("errors"),
      connections: build("connections"),
      bytes: build("bytes"),
    },
    output: {
      trustIndex: build("trustIndex"),
    },
    meta: {
      inputKeys: ["errors", "connections", "bytes"],
      outputKey: "trustIndex",
    },
  };
}

function calculateSecurity(inputs) {
  const fuzzy = {
    energy: {
      low: securityDef.mfs.EC.low(inputs.energy),
      medium: securityDef.mfs.EC.medium(inputs.energy),
      high: securityDef.mfs.EC.high(inputs.energy),
    },
    strength: {
      low: securityDef.mfs.TP.low(inputs.strength),
      medium: securityDef.mfs.TP.medium(inputs.strength),
      high: securityDef.mfs.TP.high(inputs.strength),
    },
    response: {
      low: securityDef.mfs.Lat.low(inputs.response),
      medium: securityDef.mfs.Lat.medium(inputs.response),
      high: securityDef.mfs.Lat.high(inputs.response),
    },
  };

  const ruleOutputs = {
    none: 0,
    veryLow: 0,
    low: 0,
    medium: 0,
    high: 0,
    veryHigh: 0,
  };

  securityDef.rules.forEach((rule) => {
    const alpha = Math.min(
      fuzzy.energy[rule.EC],
      fuzzy.strength[rule.TP],
      fuzzy.response[rule.Lat]
    );
    ruleOutputs[rule.out] = Math.max(ruleOutputs[rule.out], alpha);
  });

  const ruleEvaluations = evaluateAndRules(securityDef.rules, [
    { key: "energy", symbol: "EC", field: "EC", terms: fuzzy.energy },
    { key: "strength", symbol: "TP", field: "TP", terms: fuzzy.strength },
    { key: "response", symbol: "Lat", field: "Lat", terms: fuzzy.response },
  ]);

  let numerator = 0;
  let denominator = 0;
  Object.entries(ruleOutputs).forEach(([term, mu]) => {
    numerator += securityDef.singletons[term] * mu;
    denominator += mu;
  });

  const noRuleFired = denominator === 0;

  const membershipData = {
    energy: fuzzy.energy,
    strength: fuzzy.strength,
    response: fuzzy.response,
    risk: ruleOutputs,
  };

  return {
    value: noRuleFired ? null : numerator / denominator,
    dominantTerm: noRuleFired ? null : maxTerm(ruleOutputs),
    noRuleFired,
    membershipData,
    ruleOutputs,
    ruleEvaluations,
  };
}

function securityMembershipFunctions() {
  return {
    inputs: {
      energy: {
        low: sampleMF(securityDef.mfs.EC.low, 0.0005, 0.05),
        medium: sampleMF(securityDef.mfs.EC.medium, 0.0005, 0.05),
        high: sampleMF(securityDef.mfs.EC.high, 0.0005, 0.05),
      },
      strength: {
        low: sampleMF(securityDef.mfs.TP.low, 0.2, 40),
        medium: sampleMF(securityDef.mfs.TP.medium, 0.2, 40),
        high: sampleMF(securityDef.mfs.TP.high, 0.2, 40),
      },
      response: {
        low: sampleMF(securityDef.mfs.Lat.low, 0.05, 10),
        medium: sampleMF(securityDef.mfs.Lat.medium, 0.05, 10),
        high: sampleMF(securityDef.mfs.Lat.high, 0.05, 10),
      },
    },
    output: {
      risk: {},
    },
    meta: {
      inputKeys: ["energy", "strength", "response"],
      inputDomains: {
        energy: { min: 0, max: 0.05 },
        strength: { min: 0, max: 40 },
        response: { min: 0, max: 10 },
      },
      outputKey: "risk",
      singletonValues: securityDef.singletons,
    },
  };
}

function calculateIntrusion(inputs) {
  const fuzzy = {
    packets: {
      low: intrusionDef.mfs.N.low(inputs.packets),
      medium: intrusionDef.mfs.N.medium(inputs.packets),
      high: intrusionDef.mfs.N.high(inputs.packets),
    },
    rate: {
      low: intrusionDef.mfs.R.low(inputs.rate),
      medium: intrusionDef.mfs.R.medium(inputs.rate),
      high: intrusionDef.mfs.R.high(inputs.rate),
    },
    delivery: {
      low: intrusionDef.mfs.D.low(inputs.delivery),
      medium: intrusionDef.mfs.D.medium(inputs.delivery),
      high: intrusionDef.mfs.D.high(inputs.delivery),
    },
  };

  const ruleOutputs = { none: 0, low: 0, medium: 0, high: 0 };

  intrusionDef.rules.forEach((rule) => {
    const alpha = Math.min(
      fuzzy.packets[rule.N],
      fuzzy.rate[rule.R],
      fuzzy.delivery[rule.D]
    );
    ruleOutputs[rule.out] = Math.max(ruleOutputs[rule.out], alpha);
  });

  const ruleEvaluations = evaluateAndRules(intrusionDef.rules, [
    { key: "packets", symbol: "N", field: "N", terms: fuzzy.packets },
    { key: "rate", symbol: "R", field: "R", terms: fuzzy.rate },
    { key: "delivery", symbol: "D", field: "D", terms: fuzzy.delivery },
  ]);

  let numerator = 0;
  let denominator = 0;
  const aggregatedOutput = [];
  for (let x = 0; x <= 100; x += 0.2) {
    let mu = 0;
    Object.entries(ruleOutputs).forEach(([term, alpha]) => {
      mu = Math.max(mu, Math.min(alpha, intrusionDef.mfs.I[term](x)));
    });
    aggregatedOutput.push({ x, y: mu });
    numerator += x * mu;
    denominator += mu;
  }

  const value = denominator === 0 ? 0 : numerator / denominator;

  const outputMemberships = {
    none: intrusionDef.mfs.I.none(value),
    low: intrusionDef.mfs.I.low(value),
    medium: intrusionDef.mfs.I.medium(value),
    high: intrusionDef.mfs.I.high(value),
  };

  const membershipData = {
    packets: fuzzy.packets,
    rate: fuzzy.rate,
    delivery: fuzzy.delivery,
    intrusion: outputMemberships,
  };

  return {
    value,
    dominantTerm: maxTerm(outputMemberships),
    membershipData,
    ruleOutputs,
    ruleEvaluations,
    aggregatedOutput,
  };
}

function intrusionMembershipFunctions() {
  return {
    inputs: {
      packets: {
        low: sampleMF(intrusionDef.mfs.N.low, 0.5),
        medium: sampleMF(intrusionDef.mfs.N.medium, 0.5),
        high: sampleMF(intrusionDef.mfs.N.high, 0.5),
      },
      rate: {
        low: sampleMF(intrusionDef.mfs.R.low, 0.5),
        medium: sampleMF(intrusionDef.mfs.R.medium, 0.5),
        high: sampleMF(intrusionDef.mfs.R.high, 0.5),
      },
      delivery: {
        low: sampleMF(intrusionDef.mfs.D.low, 0.5),
        medium: sampleMF(intrusionDef.mfs.D.medium, 0.5),
        high: sampleMF(intrusionDef.mfs.D.high, 0.5),
      },
    },
    output: {
      intrusion: {
        none: sampleMF(intrusionDef.mfs.I.none, 0.5),
        low: sampleMF(intrusionDef.mfs.I.low, 0.5),
        medium: sampleMF(intrusionDef.mfs.I.medium, 0.5),
        high: sampleMF(intrusionDef.mfs.I.high, 0.5),
      },
    },
    meta: {
      inputKeys: ["packets", "rate", "delivery"],
      outputKey: "intrusion",
    },
  };
}

const controllers = {
  trust: {
    validate: (inputs) => validateRange(inputs),
    calculate: calculateTrust,
    membershipFunctions: trustMembershipFunctions,
  },
  security: {
    validate: (inputs) => validateInputRanges(inputs, securityRanges),
    calculate: calculateSecurity,
    membershipFunctions: securityMembershipFunctions,
  },
  intrusion: {
    validate: (inputs) => validateRange(inputs),
    calculate: calculateIntrusion,
    membershipFunctions: intrusionMembershipFunctions,
  },
};

module.exports = {
  controllers,
  trapezoidalMF,
  triangularMF,
  gaussianMF,
  calculateSecurity,
  calculateIntrusion,
};

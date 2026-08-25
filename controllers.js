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
  for (let x = 0; x <= max; x += step) {
    out.push({ x, y: fn(x) });
  }
  return out;
}

function sampleSingletonPeaks(singletons, halfWidth = 10) {
  const out = {};

  Object.entries(singletons).forEach(([term, center]) => {
    out[term] = sampleMF((x) => {
      if (center <= 0) {
        return triangularMF(x, 0, 0, halfWidth * 2);
      }
      if (center >= 100) {
        return triangularMF(x, 100 - halfWidth * 2, 100, 100);
      }
      return triangularMF(x, center - halfWidth, center, center + halfWidth);
    }, 1, 100);
  });

  return out;
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
    { E: "low", S: "high", T: "low", out: "none" },
    { E: "low", S: "high", T: "medium", out: "veryLow" },
    { E: "medium", S: "medium", T: "low", out: "low" },
    { E: "medium", S: "low", T: "medium", out: "medium" },
    { E: "high", S: "medium", T: "high", out: "high" },
    { E: "high", S: "low", T: "high", out: "veryHigh" },
  ],
  mfs: {
    E: {
      low: (x) => (x <= 0 ? 1 : x <= 20 ? (20 - x) / 20 : 0),
      medium: (x) => {
        if (x <= 10 || x >= 70) return 0;
        if (x <= 40) return (x - 10) / 30;
        return (70 - x) / 30;
      },
      high: (x) => (x <= 50 ? 0 : x <= 100 ? (x - 50) / 50 : 1),
    },
    S: {
      low: (x) => (x <= 0 ? 1 : x <= 50 ? (50 - x) / 50 : 0),
      medium: (x) => {
        if (x <= 30 || x >= 90) return 0;
        if (x <= 60) return (x - 30) / 30;
        return (90 - x) / 30;
      },
      high: (x) => (x <= 70 ? 0 : x <= 100 ? (x - 70) / 30 : 1),
    },
    T: {
      low: (x) => (x <= 0 ? 1 : x <= 20 ? (20 - x) / 20 : 0),
      medium: (x) => {
        if (x <= 10 || x >= 90) return 0;
        if (x <= 50) return (x - 10) / 40;
        return (90 - x) / 40;
      },
      high: (x) => (x <= 80 ? 0 : x <= 100 ? (x - 80) / 20 : 1),
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

function validateRange(values) {
  return Object.values(values).every((v) => Number.isFinite(v) && v >= 0 && v <= 100);
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
    ruleOutputs: null,
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
      low: securityDef.mfs.E.low(inputs.energy),
      medium: securityDef.mfs.E.medium(inputs.energy),
      high: securityDef.mfs.E.high(inputs.energy),
    },
    strength: {
      low: securityDef.mfs.S.low(inputs.strength),
      medium: securityDef.mfs.S.medium(inputs.strength),
      high: securityDef.mfs.S.high(inputs.strength),
    },
    response: {
      low: securityDef.mfs.T.low(inputs.response),
      medium: securityDef.mfs.T.medium(inputs.response),
      high: securityDef.mfs.T.high(inputs.response),
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
      fuzzy.energy[rule.E],
      fuzzy.strength[rule.S],
      fuzzy.response[rule.T]
    );
    ruleOutputs[rule.out] = Math.max(ruleOutputs[rule.out], alpha);
  });

  let numerator = 0;
  let denominator = 0;
  Object.entries(ruleOutputs).forEach(([term, mu]) => {
    numerator += securityDef.singletons[term] * mu;
    denominator += mu;
  });

  // The assignment defines only 6 sparse rules; uncovered combinations should map
  // to a neutral midpoint instead of collapsing risk to zero.
  const value = denominator === 0 ? 50 : numerator / denominator;
  const dominantTerm = denominator === 0
    ? nearestSingletonTerm(securityDef.singletons, value)
    : maxTerm(ruleOutputs);

  const membershipData = {
    energy: fuzzy.energy,
    strength: fuzzy.strength,
    response: fuzzy.response,
    risk: ruleOutputs,
  };

  return {
    value,
    dominantTerm,
    membershipData,
    ruleOutputs,
  };
}

function securityMembershipFunctions() {
  return {
    inputs: {
      energy: {
        low: sampleMF(securityDef.mfs.E.low),
        medium: sampleMF(securityDef.mfs.E.medium),
        high: sampleMF(securityDef.mfs.E.high),
      },
      strength: {
        low: sampleMF(securityDef.mfs.S.low),
        medium: sampleMF(securityDef.mfs.S.medium),
        high: sampleMF(securityDef.mfs.S.high),
      },
      response: {
        low: sampleMF(securityDef.mfs.T.low),
        medium: sampleMF(securityDef.mfs.T.medium),
        high: sampleMF(securityDef.mfs.T.high),
      },
    },
    output: {
      risk: sampleSingletonPeaks(securityDef.singletons),
    },
    meta: {
      inputKeys: ["energy", "strength", "response"],
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

  let numerator = 0;
  let denominator = 0;
  for (let x = 0; x <= 100; x += 0.2) {
    let mu = 0;
    Object.entries(ruleOutputs).forEach(([term, alpha]) => {
      mu = Math.max(mu, Math.min(alpha, intrusionDef.mfs.I[term](x)));
    });
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
    intrusion: ruleOutputs,
  };

  return {
    value,
    dominantTerm: maxTerm(outputMemberships),
    membershipData,
    ruleOutputs,
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
    validate: (inputs) => validateRange(inputs),
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

const express = require("express");
const path = require("path");
const pkg = require("./package.json");
const fuzzyController = require("./fuzzyController");
const { controllers } = require("./controllers");

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use("/vendor/katex", express.static(path.join(__dirname, "node_modules/katex/dist")));
app.use(express.static("public"));
app.use(express.json());

// API endpoint for calculation
app.post("/api/calculate", (req, res) => {
  try {
    const {
      errors: e,
      connections: c,
      bytes: b,
    } = req.body;

    // Validate input values
    if (
      isNaN(e) ||
      isNaN(c) ||
      isNaN(b) ||
      e < 0 ||
      e > 100 ||
      c < 0 ||
      c > 100 ||
      b < 0 ||
      b > 100
    ) {
      return res.status(400).json({
        error: "Invalid input values. All values must be between 0 and 100.",
      });
    }

    // Run fuzzy inference via fuzzyController
    const trustIndex = fuzzyController.calculateTrustIndex(e, c, b);

    // Calculate membership degrees for input and output values
    const inputMemberships = {
      errors: fuzzyController.calculateMembershipValues(
        "errors",
        e
      ),
      connections: fuzzyController.calculateMembershipValues(
        "connections",
        c
      ),
      bytes: fuzzyController.calculateMembershipValues(
        "bytes",
        b
      ),
    };

    const outputMemberships = fuzzyController.calculateMembershipValues(
      "trustIndex",
      trustIndex
    );
    const mostActiveTerm = fuzzyController.getMostActiveTerm(outputMemberships);

    // Build membership data payload
    const membershipData = {
      errors: inputMemberships.errors,
      connections: inputMemberships.connections,
      bytes: inputMemberships.bytes,
      trustIndex: outputMemberships,
    };

    // Return the result
    res.json({
      trustIndex: parseFloat(trustIndex.toFixed(2)),
      mostActiveTerm: mostActiveTerm,
      membershipData: membershipData,
      inputValues: { e, c, b },
    });
  } catch (error) {
    console.error("Error in calculation:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.post("/api/controllers/:controller/calculate", (req, res) => {
  try {
    const controllerName = req.params.controller;
    const controller = controllers[controllerName];

    if (!controller) {
      return res.status(404).json({ error: "Controller not found" });
    }

    const inputs = req.body || {};
    if (!controller.validate(inputs)) {
      return res.status(400).json({
        error: "Invalid input values. All values must be between 0 and 100.",
      });
    }

    const result = controller.calculate(inputs);
    return res.json({
      value: parseFloat(result.value.toFixed(2)),
      dominantTerm: result.dominantTerm,
      membershipData: result.membershipData,
      ruleOutputs: result.ruleOutputs,
      aggregatedOutput: result.aggregatedOutput || null,
      inputs,
    });
  } catch (error) {
    console.error("Error in unified calculation:", error);
    return res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

// API endpoint for membership function data
app.get("/api/membership-functions", (req, res) => {
  try {
    const data = {
      inputs: {
        errors: generateMembershipData("errors", 100),
        connections: generateMembershipData("connections", 100),
        bytes: generateMembershipData("bytes", 100),
      },
      output: {
        trustIndex: generateMembershipData("trustIndex", 100),
      },
    };
    res.json(data);
  } catch (error) {
    console.error("Error getting membership functions:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.get("/api/controllers/:controller/membership-functions", (req, res) => {
  try {
    const controllerName = req.params.controller;
    const controller = controllers[controllerName];

    if (!controller) {
      return res.status(404).json({ error: "Controller not found" });
    }

    return res.json(controller.membershipFunctions());
  } catch (error) {
    console.error("Error getting unified membership functions:", error);
    return res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

// Generate membership function chart data
function generateMembershipData(variableName, maxRange = 100) {
  const data = {};
  const params = fuzzyController.membershipParams[variableName];
  const step = 2; // Sample every 2 units for a cleaner chart

  for (const termName in params) {
    data[termName] = [];
    const termParams = params[termName];

    for (let x = 0; x <= maxRange; x += step) {
      let membershipValue = 0;

      if (termParams.type === "trapeze") {
        membershipValue = fuzzyController.trapezoidalMF(
          x,
          ...termParams.params
        );
      } else if (termParams.type === "triangle") {
        membershipValue = fuzzyController.triangularMF(x, ...termParams.params);
      }

      data[termName].push({
        x: parseFloat(x.toFixed(2)),
        y: membershipValue,
      });
    }
  }

  return data;
}

// Home page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint for rule metadata
app.get("/api/rules", (req, res) => {
  try {
    res.json({
      totalRules: fuzzyController.fuzzySystem.rules.length,
      rules: fuzzyController.fuzzySystem.rules.map((rule, index) => {
        // fuzzyis rule shape: conditions and conclusions
        const conditions = rule.conditions || [];
        const conclusions = rule.conclusions || [];

        return {
          id: index + 1,
          condition: `IF errors IS ${
            conditions[0] || "Unknown"
          } AND connections IS ${
            conditions[1] || "Unknown"
          } AND bytes IS ${conditions[2] || "Unknown"}`,
          conclusion: `THEN trustIndex IS ${
            conclusions[0] || "Unknown"
          }`,
          beliefDegree: rule.beliefDegree || 0,
        };
      }),
    });
  } catch (error) {
    console.error("Error getting rules:", error);
    res.status(500).json({
      error: "Internal server error: " + error.message,
      rulesLength: fuzzyController.fuzzySystem.rules
        ? fuzzyController.fuzzySystem.rules.length
        : 0,
    });
  }
});

// API endpoint for system information
app.get("/api/system-info", (req, res) => {
  res.json({
    systemName: fuzzyController.fuzzySystem.name,
    inputVariables: [
      {
        name: "errors",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.errors),
      },
      {
        name: "connections",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.connections),
      },
      {
        name: "bytes",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.bytes),
      },
    ],
    outputVariables: [
      {
        name: "trustIndex",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.trustIndex),
      },
    ],
    totalRules: fuzzyController.fuzzySystem.rules.length,
    fuzzyLibrary: "FuzzyIS",
  });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(pkg.description);
    console.log(`${pkg.name} v${pkg.version}`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log("Controllers: trust, security, intrusion");
    console.log(`Using FuzzyIS library for fuzzy inference`);
    console.log(`Total trust rules: ${fuzzyController.fuzzySystem.rules.length}`);
  });
}

module.exports = app;

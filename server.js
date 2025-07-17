const express = require("express");
const path = require("path");
const fuzzyController = require("./fuzzyController");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static("public"));
app.use(express.json());

// API endpoint для обчислення результату
app.post("/api/calculate", (req, res) => {
  try {
    const {
      connectionStrength: cs,
      responseTime: rt,
      energyConsumption: ec,
    } = req.body;

    // Валідація вхідних даних
    if (
      isNaN(cs) ||
      isNaN(rt) ||
      isNaN(ec) ||
      cs < 0 ||
      cs > 100 ||
      rt < 0 ||
      rt > 100 ||
      ec < 0 ||
      ec > 100
    ) {
      return res.status(400).json({
        error: "Invalid input values. All values must be between 0 and 100.",
      });
    }

    // Виконуємо нечіткий вивід за допомогою fuzzyController
    const securityRisk = fuzzyController.calculateSecurityRisk(cs, rt, ec);

    // Обчислюємо ступені приналежності для вхідних та вихідних значень
    const inputMemberships = {
      connectionStrength: fuzzyController.calculateMembershipValues(
        "connectionStrength",
        cs
      ),
      responseTime: fuzzyController.calculateMembershipValues(
        "responseTime",
        rt
      ),
      energyConsumption: fuzzyController.calculateMembershipValues(
        "energyConsumption",
        ec
      ),
    };

    const outputMemberships = fuzzyController.calculateMembershipValues(
      "securityRiskLevel",
      securityRisk
    );
    const mostActiveTerm = fuzzyController.getMostActiveTerm(outputMemberships);

    // Формуємо дані про приналежність
    const membershipData = {
      connectionStrength: inputMemberships.connectionStrength,
      responseTime: inputMemberships.responseTime,
      energyConsumption: inputMemberships.energyConsumption,
      securityRiskLevel: outputMemberships,
    };

    // Повертаємо результат
    res.json({
      securityRisk: parseFloat(securityRisk.toFixed(2)),
      mostActiveTerm: mostActiveTerm,
      membershipData: membershipData,
      inputValues: { cs, rt, ec },
    });
  } catch (error) {
    console.error("Error in calculation:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

// API endpoint для отримання даних функцій приналежності
app.get("/api/membership-functions", (req, res) => {
  try {
    const data = {
      inputs: {
        connectionStrength: generateMembershipData("connectionStrength"),
        responseTime: generateMembershipData("responseTime"),
        energyConsumption: generateMembershipData("energyConsumption"),
      },
      output: {
        securityRiskLevel: generateMembershipData("securityRiskLevel"),
      },
    };
    res.json(data);
  } catch (error) {
    console.error("Error getting membership functions:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

// Функція для генерації даних функцій приналежності
function generateMembershipData(variableName) {
  const data = {};
  const params = fuzzyController.membershipParams[variableName];
  const step = 2; // Генеруємо точки через кожні 2 одиниці для більш читабельного графіка

  for (const termName in params) {
    data[termName] = [];
    const termParams = params[termName];

    for (let x = 0; x <= 100; x += step) {
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

// Головна сторінка
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// API endpoint для отримання інформації про правила
app.get("/api/rules", (req, res) => {
  try {
    res.json({
      totalRules: fuzzyController.fuzzySystem.rules.length,
      rules: fuzzyController.fuzzySystem.rules.map((rule, index) => {
        // Правильна структура для fuzzyis - використовуємо conditions і conclusions
        const conditions = rule.conditions || [];
        const conclusions = rule.conclusions || [];

        return {
          id: index + 1,
          condition: `IF connectionStrength IS ${
            conditions[0] || "Unknown"
          } AND responseTime IS ${
            conditions[1] || "Unknown"
          } AND energyConsumption IS ${conditions[2] || "Unknown"}`,
          conclusion: `THEN securityRiskLevel IS ${
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

// API endpoint для отримання інформації про систему
app.get("/api/system-info", (req, res) => {
  res.json({
    systemName: fuzzyController.fuzzySystem.name,
    inputVariables: [
      {
        name: "connectionStrength",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.connectionStrength),
      },
      {
        name: "responseTime",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.responseTime),
      },
      {
        name: "energyConsumption",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.energyConsumption),
      },
    ],
    outputVariables: [
      {
        name: "securityRiskLevel",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.securityRiskLevel),
      },
    ],
    totalRules: fuzzyController.fuzzySystem.rules.length,
    fuzzyLibrary: "FuzzyIS",
  });
});

app.listen(PORT, () => {
  console.log(`Fuzzy Controller Server running on http://localhost:${PORT}`);
  console.log(`Using FuzzyIS library for fuzzy inference`);
  console.log(`Total fuzzy rules: ${fuzzyController.fuzzySystem.rules.length}`);
  console.log("System configuration:");
  console.log(
    "- Input variables: connectionStrength, responseTime, energyConsumption"
  );
  console.log("- Output variable: securityRiskLevel");
  console.log("- Inference method: Mamdani");
  console.log("Ready to process fuzzy logic calculations!");
});

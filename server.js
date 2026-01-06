const express = require("express");
const path = require("path");
const fuzzyController = require("./fuzzyController");

const app = express();
const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.static("public"));
app.use(express.json());

// API endpoint для обчислення результату
app.post("/api/calculate", (req, res) => {
  try {
    const {
      errors: e,
      connections: c,
      bytes: b,
    } = req.body;

    // Валідація вхідних даних
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

    // Виконуємо нечіткий вивід за допомогою fuzzyController
    const trustIndex = fuzzyController.calculateTrustIndex(e, c, b);

    // Обчислюємо ступені приналежності для вхідних та вихідних значень
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

    // Формуємо дані про приналежність
    const membershipData = {
      errors: inputMemberships.errors,
      connections: inputMemberships.connections,
      bytes: inputMemberships.bytes,
      trustIndex: outputMemberships,
    };

    // Повертаємо результат
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

// API endpoint для отримання даних функцій приналежності
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

// Функція для генерації даних функцій приналежності
function generateMembershipData(variableName, maxRange = 100) {
  const data = {};
  const params = fuzzyController.membershipParams[variableName];
  const step = 2; // Генеруємо точки через кожні 2 одиниці для більш читабельного графіка

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

// API endpoint для отримання інформації про систему
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

app.listen(PORT, () => {
  console.log(`Fuzzy Controller Server running on http://localhost:${PORT}`);
  console.log(`Using FuzzyIS library for fuzzy inference`);
  console.log(`Total fuzzy rules: ${fuzzyController.fuzzySystem.rules.length}`);
  console.log("System configuration:");
  console.log(
    "- Input variables: errors (0-100), connections (0-100), bytes (0-100)"
  );
  console.log("- Output variable: trustIndex (0-100)");
  console.log("- Inference method: Mamdani");
  console.log("Ready to process fuzzy logic calculations!");
});

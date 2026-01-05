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
      residualEnergy: e,
      transmissionCoefficient: t,
      delayCoefficient: d,
    } = req.body;

    // Валідація вхідних даних
    if (
      isNaN(e) ||
      isNaN(t) ||
      isNaN(d) ||
      e < 0 ||
      e > 100 ||
      t < 0 ||
      t > 100 ||
      d < 0 ||
      d > 100
    ) {
      return res.status(400).json({
        error: "Invalid input values. All values must be between 0 and 100.",
      });
    }

    // Виконуємо нечіткий вивід за допомогою fuzzyController
    const probability = fuzzyController.calculateProbability(e, t, d);

    // Обчислюємо ступені приналежності для вхідних та вихідних значень
    const inputMemberships = {
      residualEnergy: fuzzyController.calculateMembershipValues(
        "residualEnergy",
        e
      ),
      transmissionCoefficient: fuzzyController.calculateMembershipValues(
        "transmissionCoefficient",
        t
      ),
      delayCoefficient: fuzzyController.calculateMembershipValues(
        "delayCoefficient",
        d
      ),
    };

    const outputMemberships = fuzzyController.calculateMembershipValues(
      "probability",
      probability
    );
    const mostActiveTerm = fuzzyController.getMostActiveTerm(outputMemberships);

    // Формуємо дані про приналежність
    const membershipData = {
      residualEnergy: inputMemberships.residualEnergy,
      transmissionCoefficient: inputMemberships.transmissionCoefficient,
      delayCoefficient: inputMemberships.delayCoefficient,
      probability: outputMemberships,
    };

    // Повертаємо результат
    res.json({
      probability: parseFloat(probability.toFixed(2)),
      mostActiveTerm: mostActiveTerm,
      membershipData: membershipData,
      inputValues: { e, t, d },
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
        residualEnergy: generateMembershipData("residualEnergy"),
        transmissionCoefficient: generateMembershipData("transmissionCoefficient"),
        delayCoefficient: generateMembershipData("delayCoefficient"),
      },
      output: {
        probability: generateMembershipData("probability"),
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
          condition: `IF residualEnergy IS ${
            conditions[0] || "Unknown"
          } AND transmissionCoefficient IS ${
            conditions[1] || "Unknown"
          } AND delayCoefficient IS ${conditions[2] || "Unknown"}`,
          conclusion: `THEN probability IS ${
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
        name: "residualEnergy",
        displayName: "Залишкова енергія (E)",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.residualEnergy),
      },
      {
        name: "transmissionCoefficient",
        displayName: "Коефіцієнт передавання (T)",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.transmissionCoefficient),
      },
      {
        name: "delayCoefficient",
        displayName: "Коефіцієнт затримки (D)",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.delayCoefficient),
      },
    ],
    outputVariables: [
      {
        name: "probability",
        displayName: "Вірогідність (P)",
        range: [0, 100],
        terms: Object.keys(fuzzyController.membershipParams.probability),
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
    "- Input variables: residualEnergy (E), transmissionCoefficient (T), delayCoefficient (D)"
  );
  console.log("- Output variable: probability (P)");
  console.log("- Inference method: Mamdani");
  console.log("Ready to process fuzzy logic calculations!");
});

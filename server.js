const express = require("express");
const path = require("path");
const fuzzyis = require("fuzzyis");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static("public"));
app.use(express.json());

// --- Fuzzy Logic Controller Implementation using FuzzyIS ---

const { LinguisticVariable, Term, Rule, FIS } = fuzzyis;

// Створюємо нову систему нечіткого виводу
const fuzzySystem = new FIS("Security Risk Controller");

// Створюємо вхідні лінгвістичні змінні
const connectionStrength = new LinguisticVariable(
  "connectionStrength",
  [0, 100]
);
const responseTime = new LinguisticVariable("responseTime", [0, 100]);
const energyConsumption = new LinguisticVariable("energyConsumption", [0, 100]);

// Створюємо вихідну лінгвістичну змінну
const securityRiskLevel = new LinguisticVariable("securityRiskLevel", [0, 100]);

// Додаємо терми для Connection Strength
connectionStrength.addTerm(new Term("Low", "trapeze", [0, 0, 35, 60]));
connectionStrength.addTerm(new Term("Medium", "trapeze", [30, 55, 75, 90]));
connectionStrength.addTerm(new Term("High", "trapeze", [80, 95, 100, 100]));

// Додаємо терми для Response Time
responseTime.addTerm(new Term("Low", "trapeze", [0, 0, 35, 60]));
responseTime.addTerm(new Term("Medium", "trapeze", [30, 55, 75, 90]));
responseTime.addTerm(new Term("High", "trapeze", [80, 95, 100, 100]));

// Додаємо терми для Energy Consumption
energyConsumption.addTerm(new Term("Low", "trapeze", [0, 0, 35, 60]));
energyConsumption.addTerm(new Term("Medium", "trapeze", [30, 55, 75, 90]));
energyConsumption.addTerm(new Term("High", "trapeze", [80, 95, 100, 100]));

// Додаємо терми для Security Risk Level
securityRiskLevel.addTerm(new Term("VeryLow", "triangle", [0, 0, 20]));
securityRiskLevel.addTerm(new Term("Low", "triangle", [10, 30, 50]));
securityRiskLevel.addTerm(new Term("Medium", "triangle", [40, 60, 80]));
securityRiskLevel.addTerm(new Term("High", "triangle", [70, 90, 100]));
securityRiskLevel.addTerm(new Term("VeryHigh", "triangle", [85, 100, 100]));

// Додаємо змінні до системи
fuzzySystem.addInput(connectionStrength);
fuzzySystem.addInput(responseTime);
fuzzySystem.addInput(energyConsumption);
fuzzySystem.addOutput(securityRiskLevel);

// Створюємо правила нечіткого виводу
// Порядок важливий! Має відповідати порядку додавання вхідних змінних
fuzzySystem.rules = [
  // Low Connection Strength
  new Rule(["Low", "Low", "Low"], ["High"], "and"),
  new Rule(["Low", "Low", "Medium"], ["High"], "and"),
  new Rule(["Low", "Low", "High"], ["High"], "and"),
  new Rule(["Low", "Medium", "Low"], ["High"], "and"),
  new Rule(["Low", "Medium", "Medium"], ["VeryHigh"], "and"),
  new Rule(["Low", "Medium", "High"], ["VeryHigh"], "and"),
  new Rule(["Low", "High", "Low"], ["High"], "and"),
  new Rule(["Low", "High", "Medium"], ["VeryHigh"], "and"),
  new Rule(["Low", "High", "High"], ["VeryHigh"], "and"),

  // Medium Connection Strength
  new Rule(["Medium", "Low", "Low"], ["VeryLow"], "and"),
  new Rule(["Medium", "Low", "Medium"], ["Medium"], "and"),
  new Rule(["Medium", "Low", "High"], ["Medium"], "and"),
  new Rule(["Medium", "Medium", "Low"], ["Low"], "and"),
  new Rule(["Medium", "Medium", "Medium"], ["Medium"], "and"),
  new Rule(["Medium", "Medium", "High"], ["High"], "and"),
  new Rule(["Medium", "High", "Low"], ["Medium"], "and"),
  new Rule(["Medium", "High", "Medium"], ["Medium"], "and"),
  new Rule(["Medium", "High", "High"], ["VeryHigh"], "and"),

  // High Connection Strength
  new Rule(["High", "Low", "Low"], ["VeryLow"], "and"),
  new Rule(["High", "Low", "Medium"], ["VeryLow"], "and"),
  new Rule(["High", "Low", "High"], ["Low"], "and"),
  new Rule(["High", "Medium", "Low"], ["VeryLow"], "and"),
  new Rule(["High", "Medium", "Medium"], ["VeryLow"], "and"),
  new Rule(["High", "Medium", "High"], ["Low"], "and"),
  new Rule(["High", "High", "Low"], ["Low"], "and"),
  new Rule(["High", "High", "Medium"], ["Low"], "and"),
  new Rule(["High", "High", "High"], ["Low"], "and"),
];

// Функції для роботи з даними функцій приналежності
function trapezoidalMF(x, a, b, c, d) {
  if (x <= a || x >= d) return 0;
  if (x >= b && x <= c) return 1;
  if (x > a && x < b) return (x - a) / (b - a);
  if (x > c && x < d) return (d - x) / (d - c);
  return 0;
}

function triangularMF(x, a, b, c) {
  if (x <= a || x >= c) return 0;
  if (x >= a && x <= b) return (x - a) / (b - a);
  if (x > b && x <= c) return (c - x) / (c - b);
  return 0;
}

// Визначаємо параметри функцій приналежності для візуалізації
const membershipParams = {
  connectionStrength: {
    Low: { type: "trapeze", params: [0, 0, 35, 60] },
    Medium: { type: "trapeze", params: [30, 55, 75, 90] },
    High: { type: "trapeze", params: [80, 95, 100, 100] },
  },
  responseTime: {
    Low: { type: "trapeze", params: [0, 0, 35, 60] },
    Medium: { type: "trapeze", params: [30, 55, 75, 90] },
    High: { type: "trapeze", params: [80, 95, 100, 100] },
  },
  energyConsumption: {
    Low: { type: "trapeze", params: [0, 0, 35, 60] },
    Medium: { type: "trapeze", params: [30, 55, 75, 90] },
    High: { type: "trapeze", params: [80, 95, 100, 100] },
  },
  securityRiskLevel: {
    VeryLow: { type: "triangle", params: [0, 0, 20] },
    Low: { type: "triangle", params: [10, 30, 50] },
    Medium: { type: "triangle", params: [40, 60, 80] },
    High: { type: "triangle", params: [70, 90, 100] },
    VeryHigh: { type: "triangle", params: [85, 100, 100] },
  },
};

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

    // Виконуємо нечітке виведення за допомогою FuzzyIS
    const result = fuzzySystem.getPreciseOutput([cs, rt, ec]);
    const securityRisk = result[0];

    // Обчислюємо ступені приналежності для вхідних значень
    const inputMemberships = {
      connectionStrength: {},
      responseTime: {},
      energyConsumption: {},
    };

    // Connection Strength memberships
    for (const termName in membershipParams.connectionStrength) {
      const params = membershipParams.connectionStrength[termName];
      if (params.type === "trapeze") {
        inputMemberships.connectionStrength[termName] = trapezoidalMF(
          cs,
          ...params.params
        );
      }
    }

    // Response Time memberships
    for (const termName in membershipParams.responseTime) {
      const params = membershipParams.responseTime[termName];
      if (params.type === "trapeze") {
        inputMemberships.responseTime[termName] = trapezoidalMF(
          rt,
          ...params.params
        );
      }
    }

    // Energy Consumption memberships
    for (const termName in membershipParams.energyConsumption) {
      const params = membershipParams.energyConsumption[termName];
      if (params.type === "trapeze") {
        inputMemberships.energyConsumption[termName] = trapezoidalMF(
          ec,
          ...params.params
        );
      }
    }

    // Знаходимо найактивніший терм для вихідного значення
    let maxMembership = -1;
    let mostActiveTerm = "N/A";
    const outputMemberships = {};

    for (const termName in membershipParams.securityRiskLevel) {
      const params = membershipParams.securityRiskLevel[termName];
      let membership = 0;

      if (params.type === "triangle") {
        membership = triangularMF(securityRisk, ...params.params);
      }

      outputMemberships[termName] = membership;

      if (membership > maxMembership) {
        maxMembership = membership;
        mostActiveTerm = termName;
      }
    }

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
  const params = membershipParams[variableName];
  const step = 100 / 200; // 200 точок для плавної кривої

  for (const termName in params) {
    data[termName] = [];
    const termParams = params[termName];

    for (let x = 0; x <= 100; x += step) {
      let membershipValue = 0;

      if (termParams.type === "trapeze") {
        membershipValue = trapezoidalMF(x, ...termParams.params);
      } else if (termParams.type === "triangle") {
        membershipValue = triangularMF(x, ...termParams.params);
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
  res.json({
    totalRules: fuzzySystem.rules.length,
    rules: fuzzySystem.rules.map((rule, index) => ({
      id: index + 1,
      condition: `IF connectionStrength IS ${rule.condition[0]} AND responseTime IS ${rule.condition[1]} AND energyConsumption IS ${rule.condition[2]}`,
      conclusion: `THEN securityRiskLevel IS ${rule.conclusion[0]}`,
    })),
  });
});

// API endpoint для отримання інформації про систему
app.get("/api/system-info", (req, res) => {
  res.json({
    systemName: fuzzySystem.name,
    inputVariables: [
      {
        name: "connectionStrength",
        range: [0, 100],
        terms: Object.keys(membershipParams.connectionStrength),
      },
      {
        name: "responseTime",
        range: [0, 100],
        terms: Object.keys(membershipParams.responseTime),
      },
      {
        name: "energyConsumption",
        range: [0, 100],
        terms: Object.keys(membershipParams.energyConsumption),
      },
    ],
    outputVariables: [
      {
        name: "securityRiskLevel",
        range: [0, 100],
        terms: Object.keys(membershipParams.securityRiskLevel),
      },
    ],
    totalRules: fuzzySystem.rules.length,
    fuzzyLibrary: "FuzzyIS",
  });
});

app.listen(PORT, () => {
  console.log(`Fuzzy Controller Server running on http://localhost:${PORT}`);
  console.log(`Using FuzzyIS library for fuzzy inference`);
  console.log(`Total fuzzy rules: ${fuzzySystem.rules.length}`);
  console.log("System configuration:");
  console.log(
    "- Input variables: connectionStrength, responseTime, energyConsumption"
  );
  console.log("- Output variable: securityRiskLevel");
  console.log("- Inference method: Mamdani");
  console.log("Ready to process fuzzy logic calculations!");
});

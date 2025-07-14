const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static("public"));
app.use(express.json());

// --- Fuzzy Logic Controller Implementation ---

// Функції приналежності
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

// Визначення функцій приналежності для вхідних змінних
const membershipFunctions = {
  connectionStrength: {
    Low: (x) => trapezoidalMF(x, 0, 0, 35, 60),
    Medium: (x) => trapezoidalMF(x, 30, 55, 75, 90),
    High: (x) => trapezoidalMF(x, 80, 95, 100, 100),
  },
  responseTime: {
    Low: (x) => trapezoidalMF(x, 0, 0, 35, 60),
    Medium: (x) => trapezoidalMF(x, 30, 55, 75, 90),
    High: (x) => trapezoidalMF(x, 80, 95, 100, 100),
  },
  energyConsumption: {
    Low: (x) => trapezoidalMF(x, 0, 0, 35, 60),
    Medium: (x) => trapezoidalMF(x, 30, 55, 75, 90),
    High: (x) => trapezoidalMF(x, 80, 95, 100, 100),
  },
  securityRiskLevel: {
    VeryLow: (x) => triangularMF(x, 0, 0, 20),
    Low: (x) => triangularMF(x, 10, 30, 50),
    Medium: (x) => triangularMF(x, 40, 60, 80),
    High: (x) => triangularMF(x, 70, 90, 100),
    VeryHigh: (x) => triangularMF(x, 85, 100, 100),
  },
};

// База правил нечіткого виводу
const rules = [
  // Low Connection Strength
  { inputs: ["Low", "Low", "Low"], output: "High" },
  { inputs: ["Low", "Low", "Medium"], output: "High" },
  { inputs: ["Low", "Low", "High"], output: "High" },
  { inputs: ["Low", "Medium", "Low"], output: "High" },
  { inputs: ["Low", "Medium", "Medium"], output: "VeryHigh" },
  { inputs: ["Low", "Medium", "High"], output: "VeryHigh" },
  { inputs: ["Low", "High", "Low"], output: "High" },
  { inputs: ["Low", "High", "Medium"], output: "VeryHigh" },
  { inputs: ["Low", "High", "High"], output: "VeryHigh" },

  // Medium Connection Strength
  { inputs: ["Medium", "Low", "Low"], output: "VeryLow" },
  { inputs: ["Medium", "Low", "Medium"], output: "Medium" },
  { inputs: ["Medium", "Low", "High"], output: "Medium" },
  { inputs: ["Medium", "Medium", "Low"], output: "Low" },
  { inputs: ["Medium", "Medium", "Medium"], output: "Medium" },
  { inputs: ["Medium", "Medium", "High"], output: "High" },
  { inputs: ["Medium", "High", "Low"], output: "Medium" },
  { inputs: ["Medium", "High", "Medium"], output: "Medium" },
  { inputs: ["Medium", "High", "High"], output: "VeryHigh" },

  // High Connection Strength
  { inputs: ["High", "Low", "Low"], output: "VeryLow" },
  { inputs: ["High", "Low", "Medium"], output: "VeryLow" },
  { inputs: ["High", "Low", "High"], output: "Low" },
  { inputs: ["High", "Medium", "Low"], output: "VeryLow" },
  { inputs: ["High", "Medium", "Medium"], output: "VeryLow" },
  { inputs: ["High", "Medium", "High"], output: "Low" },
  { inputs: ["High", "High", "Low"], output: "Low" },
  { inputs: ["High", "High", "Medium"], output: "Low" },
  { inputs: ["High", "High", "High"], output: "Low" },
];

// Функція для виконання нечіткого виводу (Mamdani)
function fuzzyInference(connectionStrength, responseTime, energyConsumption) {
  // Крок 1: Фазифікація - обчислення ступенів приналежності
  const inputMemberships = {
    connectionStrength: {},
    responseTime: {},
    energyConsumption: {},
  };

  for (const term in membershipFunctions.connectionStrength) {
    inputMemberships.connectionStrength[term] =
      membershipFunctions.connectionStrength[term](connectionStrength);
  }
  for (const term in membershipFunctions.responseTime) {
    inputMemberships.responseTime[term] =
      membershipFunctions.responseTime[term](responseTime);
  }
  for (const term in membershipFunctions.energyConsumption) {
    inputMemberships.energyConsumption[term] =
      membershipFunctions.energyConsumption[term](energyConsumption);
  }

  // Крок 2: Активація правил
  const outputActivations = {};
  for (const outputTerm in membershipFunctions.securityRiskLevel) {
    outputActivations[outputTerm] = 0;
  }

  rules.forEach((rule) => {
    const [cs, rt, ec] = rule.inputs;
    const output = rule.output;

    // Обчислення сили активації правила (MIN для AND)
    const activation = Math.min(
      inputMemberships.connectionStrength[cs],
      inputMemberships.responseTime[rt],
      inputMemberships.energyConsumption[ec]
    );

    // Акумуляція (MAX для OR)
    outputActivations[output] = Math.max(outputActivations[output], activation);
  });

  // Крок 3: Дефазифікація (метод центру ваги)
  let numerator = 0;
  let denominator = 0;
  const step = 0.5;

  for (let x = 0; x <= 100; x += step) {
    let maxActivation = 0;

    // Знаходимо максимальну активацію для даного x
    for (const outputTerm in outputActivations) {
      const membershipValue =
        membershipFunctions.securityRiskLevel[outputTerm](x);
      const clippedValue = Math.min(
        membershipValue,
        outputActivations[outputTerm]
      );
      maxActivation = Math.max(maxActivation, clippedValue);
    }

    numerator += x * maxActivation;
    denominator += maxActivation;
  }

  const result = denominator === 0 ? 0 : numerator / denominator;

  return {
    crispOutput: result,
    activations: outputActivations,
    inputMemberships: inputMemberships,
  };
}

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

    // Виконуємо нечітке виведення
    const inference = fuzzyInference(cs, rt, ec);
    const securityRisk = inference.crispOutput;

    // Знаходимо найактивніший терм для вихідного значення
    let maxMembership = -1;
    let mostActiveTerm = "N/A";

    for (const termName in membershipFunctions.securityRiskLevel) {
      const membership =
        membershipFunctions.securityRiskLevel[termName](securityRisk);
      if (membership > maxMembership) {
        maxMembership = membership;
        mostActiveTerm = termName;
      }
    }

    // Формуємо дані про приналежність
    const membershipData = {
      connectionStrength: inference.inputMemberships.connectionStrength,
      responseTime: inference.inputMemberships.responseTime,
      energyConsumption: inference.inputMemberships.energyConsumption,
      securityRiskLevel: {},
    };

    // Додаємо приналежність для вихідної змінної
    for (const termName in membershipFunctions.securityRiskLevel) {
      membershipData.securityRiskLevel[termName] =
        membershipFunctions.securityRiskLevel[termName](securityRisk);
    }

    // Повертаємо результат
    res.json({
      securityRisk: parseFloat(securityRisk.toFixed(2)),
      mostActiveTerm: mostActiveTerm,
      membershipData: membershipData,
      activations: inference.activations,
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
  const functions = membershipFunctions[variableName];
  const step = 100 / 200; // 200 точок для плавної кривої

  for (const termName in functions) {
    data[termName] = [];
    const membershipFunction = functions[termName];

    for (let x = 0; x <= 100; x += step) {
      data[termName].push({
        x: parseFloat(x.toFixed(2)),
        y: membershipFunction(x),
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
    totalRules: rules.length,
    rules: rules.map((rule, index) => ({
      id: index + 1,
      condition: `IF connectionStrength IS ${rule.inputs[0]} AND responseTime IS ${rule.inputs[1]} AND energyConsumption IS ${rule.inputs[2]}`,
      conclusion: `THEN securityRiskLevel IS ${rule.output}`,
    })),
  });
});

app.listen(PORT, () => {
  console.log(`Fuzzy Controller Server running on http://localhost:${PORT}`);
  console.log(`Total fuzzy rules: ${rules.length}`);
  console.log("Ready to process fuzzy logic calculations!");
});

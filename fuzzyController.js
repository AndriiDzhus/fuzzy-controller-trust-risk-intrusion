const fuzzyis = require("fuzzyis");

// Импортируем необходимые компоненты из fuzzyis
const { LinguisticVariable, Term, Rule, FIS } = fuzzyis;

// --- Fuzzy Logic Controller Implementation using FuzzyIS ---

// Створюємо нову систему нечіткого виводу
const fuzzySystem = new FIS("Security Risk Controller");

// Створюємо вхідні лінгвістичні змінні
const connectionStrength = new LinguisticVariable("connectionStrength", [0, 100]);
const responseTime = new LinguisticVariable("responseTime", [0, 100]);
const energyConsumption = new LinguisticVariable("energyConsumption", [0, 100]);

// Створюємо вихідну лінгвістичну змінну
const securityRiskLevel = new LinguisticVariable("securityRiskLevel", [0, 100]);

// Додаємо терми для Connection Strength
connectionStrength.addTerm(new Term("Low", "trapeze", [0, 0, 35, 60]));
connectionStrength.addTerm(new Term("Medium", "trapeze", [30, 55, 75, 90]));
connectionStrength.addTerm(new Term("High", "trapeze", [75, 85, 100, 100]));

// Додаємо терми для Response Time
responseTime.addTerm(new Term("Low", "trapeze", [0, 0, 35, 60]));
responseTime.addTerm(new Term("Medium", "trapeze", [30, 55, 75, 90]));
responseTime.addTerm(new Term("High", "trapeze", [75, 85, 100, 100]));

// Додаємо терми для Energy Consumption
energyConsumption.addTerm(new Term("Low", "trapeze", [0, 0, 35, 60]));
energyConsumption.addTerm(new Term("Medium", "trapeze", [30, 55, 75, 90]));
energyConsumption.addTerm(new Term("High", "trapeze", [75, 85, 100, 100]));

// Додаємо терми для Security Risk Level
securityRiskLevel.addTerm(new Term("VeryLow", "triangle", [0, 0, 25]));
securityRiskLevel.addTerm(new Term("Low", "triangle", [10, 30, 50]));
securityRiskLevel.addTerm(new Term("Medium", "triangle", [35, 50, 65]));
securityRiskLevel.addTerm(new Term("High", "triangle", [50, 70, 90]));
securityRiskLevel.addTerm(new Term("VeryHigh", "triangle", [75, 100, 100]));

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

// Функції для роботи з даними функцій приналежності (для візуалізації)
function trapezoidalMF(x, a, b, c, d) {
  if (x < a || x > d) return 0;
  if (x >= b && x <= c) return 1;
  if (x >= a && x < b) return (x - a) / (b - a);
  if (x > c && x <= d) return (d - x) / (d - c);
  return 0;
}

function triangularMF(x, a, b, c) {
  if (x < a || x > c) return 0;
  if (a === b) {
    // Випадок лівого прямокутного трикутника (VeryLow)
    if (x >= a && x <= c) return (c - x) / (c - a);
  } else if (b === c) {
    // Випадок правого прямокутного трикутника (VeryHigh)
    if (x >= a && x <= b) return (x - a) / (b - a);
  } else {
    // Звичайний трикутник
    if (x >= a && x <= b) return (x - a) / (b - a);
    if (x > b && x <= c) return (c - x) / (c - b);
  }
  return 0;
}

// Визначаємо параметри функцій приналежності для візуалізації
const membershipParams = {
  connectionStrength: {
    Low: { type: "trapeze", params: [0, 0, 35, 60] },
    Medium: { type: "trapeze", params: [30, 55, 75, 90] },
    High: { type: "trapeze", params: [75, 85, 100, 100] },
  },
  responseTime: {
    Low: { type: "trapeze", params: [0, 0, 35, 60] },
    Medium: { type: "trapeze", params: [30, 55, 75, 90] },
    High: { type: "trapeze", params: [75, 85, 100, 100] },
  },
  energyConsumption: {
    Low: { type: "trapeze", params: [0, 0, 35, 60] },
    Medium: { type: "trapeze", params: [30, 55, 75, 90] },
    High: { type: "trapeze", params: [75, 85, 100, 100] },
  },
  securityRiskLevel: {
    VeryLow: { type: "triangle", params: [0, 0, 25] },
    Low: { type: "triangle", params: [10, 30, 50] },
    Medium: { type: "triangle", params: [35, 50, 65] },
    High: { type: "triangle", params: [50, 70, 90] },
    VeryHigh: { type: "triangle", params: [75, 100, 100] },
  },
};

// Функція для обчислення рівня безпеки
function calculateSecurityRisk(connectionStrengthVal, responseTimeVal, energyConsumptionVal) {
  try {
    // Виконуємо нечіткий вивід за допомогою fuzzyis
    const result = fuzzySystem.getPreciseOutput([
      connectionStrengthVal,
      responseTimeVal,
      energyConsumptionVal,
    ]);
    
    return result[0]; // Повертаємо перше (і єдине) значення з масиву результатів
  } catch (error) {
    console.error("Error in fuzzy inference:", error);
    throw error;
  }
}

// Функція для обчислення ступенів приналежності
function calculateMembershipValues(variable, value) {
  const memberships = {};
  
  if (variable === "connectionStrength") {
    memberships.Low = trapezoidalMF(value, 0, 0, 35, 60);
    memberships.Medium = trapezoidalMF(value, 30, 55, 75, 90);
    memberships.High = trapezoidalMF(value, 75, 85, 100, 100);
  } else if (variable === "responseTime") {
    memberships.Low = trapezoidalMF(value, 0, 0, 35, 60);
    memberships.Medium = trapezoidalMF(value, 30, 55, 75, 90);
    memberships.High = trapezoidalMF(value, 75, 85, 100, 100);
  } else if (variable === "energyConsumption") {
    memberships.Low = trapezoidalMF(value, 0, 0, 35, 60);
    memberships.Medium = trapezoidalMF(value, 30, 55, 75, 90);
    memberships.High = trapezoidalMF(value, 75, 85, 100, 100);
  } else if (variable === "securityRiskLevel") {
    memberships.VeryLow = triangularMF(value, 0, 0, 25);
    memberships.Low = triangularMF(value, 10, 30, 50);
    memberships.Medium = triangularMF(value, 35, 50, 65);
    memberships.High = triangularMF(value, 50, 70, 90);
    memberships.VeryHigh = triangularMF(value, 75, 100, 100);
  }
  
  return memberships;
}

// Функція для знаходження найактивнішого терма
function getMostActiveTerm(memberships) {
  let maxMembership = -1;
  let mostActiveTerm = "N/A";
  
  for (const [term, value] of Object.entries(memberships)) {
    if (value > maxMembership) {
      maxMembership = value;
      mostActiveTerm = term;
    }
  }
  
  return mostActiveTerm;
}

// Експорт функцій та даних
module.exports = {
  fuzzySystem,
  calculateSecurityRisk,
  calculateMembershipValues,
  getMostActiveTerm,
  membershipParams,
  trapezoidalMF,
  triangularMF,
};

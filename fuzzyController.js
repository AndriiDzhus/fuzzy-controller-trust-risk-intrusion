const fuzzyis = require("fuzzyis");

// Імпортуємо необхідні компоненти з fuzzyis
const { LinguisticVariable, Term, Rule, FIS } = fuzzyis;

// --- Fuzzy Logic Controller Implementation using FuzzyIS ---
// Система для визначення Вірогідності (P) на основі:
// - Залишкова енергія (E)
// - Коефіцієнт передавання (T)
// - Коефіцієнт затримки (D)

// Створюємо нову систему нечіткого виводу
const fuzzySystem = new FIS("Communication System Probability Controller");

// Створюємо вхідні лінгвістичні змінні
const residualEnergy = new LinguisticVariable("residualEnergy", [0, 100]);
const transmissionCoefficient = new LinguisticVariable("transmissionCoefficient", [0, 100]);
const delayCoefficient = new LinguisticVariable("delayCoefficient", [0, 100]);

// Створюємо вихідну лінгвістичну змінну
const probability = new LinguisticVariable("probability", [0, 100]);

// Додаємо терми для Залишкової енергії (E)
// μ_м(E): 1 if E ≤ 10, (30-E)/(30-10) if 10 < E ≤ 30, 0 if E > 30
// μ_с(E): 0 if E ≤ 10, (E-10)/(30-10) if 10 < E ≤ 30, 1 if 30 < E ≤ 50, (70-E)/(70-50) if 50 < E < 70, 0 if E ≥ 70
// μ_в(E): 0 if E ≤ 50, (E-50)/(70-50) if 50 < E ≤ 70, 1 if E > 70
residualEnergy.addTerm(new Term("Low", "trapeze", [0, 0, 10, 30]));
residualEnergy.addTerm(new Term("Medium", "trapeze", [10, 30, 50, 70]));
residualEnergy.addTerm(new Term("High", "trapeze", [50, 70, 100, 100]));

// Додаємо терми для Коефіцієнта передавання (T)
// μ_м(T): 1 if T ≤ 20, (40-T)/(40-20) if 20 < T ≤ 40, 0 if T > 40
// μ_с(T): 0 if T ≤ 20, (T-20)/(40-20) if 20 < T ≤ 40, 1 if 40 < T ≤ 60, (80-T)/(80-60) if 60 < T < 80, 0 if T ≥ 80
// μ_в(T): 0 if T ≤ 60, (T-60)/(80-60) if 60 < T ≤ 80, 1 if T > 80
transmissionCoefficient.addTerm(new Term("Low", "trapeze", [0, 0, 20, 40]));
transmissionCoefficient.addTerm(new Term("Medium", "trapeze", [20, 40, 60, 80]));
transmissionCoefficient.addTerm(new Term("High", "trapeze", [60, 80, 100, 100]));

// Додаємо терми для Коефіцієнта затримки (D)
// μ_м(D): 1 if D ≤ 30, (50-D)/(50-30) if 30 < D ≤ 50, 0 if D > 50
// μ_с(D): 0 if D ≤ 30, (D-30)/(50-30) if 30 < D ≤ 50, 1 if 50 < D ≤ 70, (90-D)/(90-70) if 70 < D < 90, 0 if D ≥ 90
// μ_в(D): 0 if D ≤ 70, (D-70)/(90-70) if 70 < D ≤ 90, 1 if D > 90
delayCoefficient.addTerm(new Term("Low", "trapeze", [0, 0, 30, 50]));
delayCoefficient.addTerm(new Term("Medium", "trapeze", [30, 50, 70, 90]));
delayCoefficient.addTerm(new Term("High", "trapeze", [70, 90, 100, 100]));

// Додаємо терми для Вірогідності (P)
// μ_дм(P): 1 if P ≤ 0, (25-P)/25 if 0 < P ≤ 25, 0 if P > 25
// μ_м(P): 0 if P ≤ 0, P/25 if 0 < P ≤ 25, (50-P)/(50-25) if 25 < P ≤ 50, 0 if 50 < P
// μ_с(P): 0 if P ≤ 25, (P-25)/(50-25) if 25 < P ≤ 50, (75-P)/(75-50) if 50 < P ≤ 75, 0 if 75 < P
// μ_в(P): 0 if P ≤ 50, (P-50)/(75-50) if 50 < P ≤ 75, (100-P)/(100-75) if 75 < P ≤ 100, 0 if 100 < P
// μ_дв(P): 0 if P ≤ 75, (P-75)/(100-75) if 75 < P ≤ 100, 1 if P > 100
probability.addTerm(new Term("VeryLow", "triangle", [0, 0, 25]));
probability.addTerm(new Term("Low", "triangle", [0, 25, 50]));
probability.addTerm(new Term("Medium", "triangle", [25, 50, 75]));
probability.addTerm(new Term("High", "triangle", [50, 75, 100]));
probability.addTerm(new Term("VeryHigh", "triangle", [75, 100, 100]));

// Додаємо змінні до системи
fuzzySystem.addInput(residualEnergy);
fuzzySystem.addInput(transmissionCoefficient);
fuzzySystem.addInput(delayCoefficient);
fuzzySystem.addOutput(probability);

// Створюємо правила нечіткого виводу на основі таблиці rule_v2.jpeg
// Порядок: [E, T, D] → [P]
fuzzySystem.rules = [
  // E = Low (Мала)
  new Rule(["Low", "Low", "Low"], ["Low"], "and"),       // 1: Мала, Малий, Малий → Мала
  new Rule(["Low", "Low", "Medium"], ["VeryLow"], "and"), // 2: Мала, Малий, Середній → Дуже мала
  new Rule(["Low", "Low", "High"], ["VeryLow"], "and"),   // 3: Мала, Малий, Великий → Дуже мала
  new Rule(["Low", "Medium", "Low"], ["VeryLow"], "and"), // 4: Мала, Середній, Малий → Дуже мала
  new Rule(["Low", "Medium", "Medium"], ["VeryLow"], "and"), // 5: Мала, Середній, Середній → Дуже мала
  new Rule(["Low", "Medium", "High"], ["VeryLow"], "and"), // 6: Мала, Середній, Великий → Дуже мала
  new Rule(["Low", "High", "Low"], ["Low"], "and"),       // 7: Мала, Великий, Малий → Мала
  new Rule(["Low", "High", "Medium"], ["Low"], "and"),    // 8: Мала, Великий, Середній → Мала
  new Rule(["Low", "High", "High"], ["Low"], "and"),      // 9: Мала, Великий, Великий → Мала

  // E = Medium (Середня)
  new Rule(["Medium", "Low", "Low"], ["Medium"], "and"),  // 10: Середня, Малий, Малий → Середня
  new Rule(["Medium", "Low", "Medium"], ["Low"], "and"),  // 11: Середня, Малий, Середній → Мала
  new Rule(["Medium", "Low", "High"], ["Low"], "and"),    // 12: Середня, Малий, Великий → Мала
  new Rule(["Medium", "Medium", "Low"], ["Medium"], "and"), // 13: Середня, Середній, Малий → Середня
  new Rule(["Medium", "Medium", "Medium"], ["Medium"], "and"), // 14: Середня, Середній, Середній → Середня
  new Rule(["Medium", "Medium", "High"], ["Medium"], "and"), // 15: Середня, Середній, Великий → Середня
  new Rule(["Medium", "High", "Low"], ["High"], "and"),   // 16: Середня, Великий, Малий → Велика
  new Rule(["Medium", "High", "Medium"], ["High"], "and"), // 17: Середня, Великий, Середній → Велика
  new Rule(["Medium", "High", "High"], ["Medium"], "and"), // 18: Середня, Великий, Великий → Середня

  // E = High (Велика)
  new Rule(["High", "Low", "Low"], ["High"], "and"),      // 19: Велика, Малий, Малий → Велика
  new Rule(["High", "Low", "Medium"], ["High"], "and"),   // 20: Велика, Малий, Середній → Велика
  new Rule(["High", "Low", "High"], ["High"], "and"),     // 21: Велика, Малий, Великий → Велика
  new Rule(["High", "Medium", "Low"], ["VeryHigh"], "and"), // 22: Велика, Середній, Малий → Дуже велика
  new Rule(["High", "Medium", "Medium"], ["VeryHigh"], "and"), // 23: Велика, Середній, Середній → Дуже велика
  new Rule(["High", "Medium", "High"], ["VeryHigh"], "and"), // 24: Велика, Середній, Великий → Дуже велика
  new Rule(["High", "High", "Low"], ["VeryHigh"], "and"), // 25: Велика, Великий, Малий → Дуже велика
  new Rule(["High", "High", "Medium"], ["VeryHigh"], "and"), // 26: Велика, Великий, Середній → Дуже велика
  new Rule(["High", "High", "High"], ["High"], "and"),    // 27: Велика, Великий, Великий → Велика
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
  residualEnergy: {
    Low: { type: "trapeze", params: [0, 0, 10, 30] },
    Medium: { type: "trapeze", params: [10, 30, 50, 70] },
    High: { type: "trapeze", params: [50, 70, 100, 100] },
  },
  transmissionCoefficient: {
    Low: { type: "trapeze", params: [0, 0, 20, 40] },
    Medium: { type: "trapeze", params: [20, 40, 60, 80] },
    High: { type: "trapeze", params: [60, 80, 100, 100] },
  },
  delayCoefficient: {
    Low: { type: "trapeze", params: [0, 0, 30, 50] },
    Medium: { type: "trapeze", params: [30, 50, 70, 90] },
    High: { type: "trapeze", params: [70, 90, 100, 100] },
  },
  probability: {
    VeryLow: { type: "triangle", params: [0, 0, 25] },
    Low: { type: "triangle", params: [0, 25, 50] },
    Medium: { type: "triangle", params: [25, 50, 75] },
    High: { type: "triangle", params: [50, 75, 100] },
    VeryHigh: { type: "triangle", params: [75, 100, 100] },
  },
};

// Функція для обчислення вірогідності системи
function calculateProbability(residualEnergyVal, transmissionCoefficientVal, delayCoefficientVal) {
  try {
    // Виконуємо нечіткий вивід за допомогою fuzzyis
    const result = fuzzySystem.getPreciseOutput([
      residualEnergyVal,
      transmissionCoefficientVal,
      delayCoefficientVal,
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
  
  if (variable === "residualEnergy") {
    memberships.Low = trapezoidalMF(value, 0, 0, 10, 30);
    memberships.Medium = trapezoidalMF(value, 10, 30, 50, 70);
    memberships.High = trapezoidalMF(value, 50, 70, 100, 100);
  } else if (variable === "transmissionCoefficient") {
    memberships.Low = trapezoidalMF(value, 0, 0, 20, 40);
    memberships.Medium = trapezoidalMF(value, 20, 40, 60, 80);
    memberships.High = trapezoidalMF(value, 60, 80, 100, 100);
  } else if (variable === "delayCoefficient") {
    memberships.Low = trapezoidalMF(value, 0, 0, 30, 50);
    memberships.Medium = trapezoidalMF(value, 30, 50, 70, 90);
    memberships.High = trapezoidalMF(value, 70, 90, 100, 100);
  } else if (variable === "probability") {
    memberships.VeryLow = triangularMF(value, 0, 0, 25);
    memberships.Low = triangularMF(value, 0, 25, 50);
    memberships.Medium = triangularMF(value, 25, 50, 75);
    memberships.High = triangularMF(value, 50, 75, 100);
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
  calculateProbability,
  calculateMembershipValues,
  getMostActiveTerm,
  membershipParams,
  trapezoidalMF,
  triangularMF,
};

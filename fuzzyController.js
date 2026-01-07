const { 
  variable, 
  triangle, 
  trapezoid, 
  and,
  defuzz, 
  centroidStrategy
} = require('@thi.ng/fuzzy');

// --- Fuzzy Logic Controller Implementation using @thi.ng/fuzzy ---
// Система для визначення Вірогідності (P) на основі:
// - Залишкова енергія (E)
// - Коефіцієнт передавання (T)
// - Коефіцієнт затримки (D)

// Вхідні лінгвістичні змінні
// E: Залишкова енергія [0, 100]
const residualEnergy = variable([0, 100], {
  Low: trapezoid(0, 0, 10, 30),
  Medium: trapezoid(10, 30, 50, 70),
  High: trapezoid(50, 70, 100, 100)
});

// T: Коефіцієнт передавання [0, 100]
const transmissionCoefficient = variable([0, 100], {
  Low: trapezoid(0, 0, 20, 40),
  Medium: trapezoid(20, 40, 60, 80),
  High: trapezoid(60, 80, 100, 100)
});

// D: Коефіцієнт затримки [0, 100]
const delayCoefficient = variable([0, 100], {
  Low: trapezoid(0, 0, 30, 50),
  Medium: trapezoid(30, 50, 70, 90),
  High: trapezoid(70, 90, 100, 100)
});

// Вихідна лінгвістична змінна
// P: Вірогідність [0, 100]
const probability = variable([0, 100], {
  VeryLow: triangle(0, 0, 25),
  Low: triangle(0, 25, 50),
  Medium: triangle(25, 50, 75),
  High: triangle(50, 75, 100),
  VeryHigh: triangle(75, 100, 100)
});

// База правил на основі таблиці rule_v2.jpeg
// Порядок: [E, T, D] → [P]
const rules = [
  // E = Low (Мала)
  and({ E: 'Low', T: 'Low', D: 'Low' }, { P: 'Low' }),       // 1: Мала, Малий, Малий → Мала
  and({ E: 'Low', T: 'Low', D: 'Medium' }, { P: 'VeryLow' }), // 2: Мала, Малий, Середній → Дуже мала
  and({ E: 'Low', T: 'Low', D: 'High' }, { P: 'VeryLow' }),   // 3: Мала, Малий, Великий → Дуже мала
  and({ E: 'Low', T: 'Medium', D: 'Low' }, { P: 'VeryLow' }), // 4: Мала, Середній, Малий → Дуже мала
  and({ E: 'Low', T: 'Medium', D: 'Medium' }, { P: 'VeryLow' }), // 5: Мала, Середній, Середній → Дуже мала
  and({ E: 'Low', T: 'Medium', D: 'High' }, { P: 'VeryLow' }), // 6: Мала, Середній, Великий → Дуже мала
  and({ E: 'Low', T: 'High', D: 'Low' }, { P: 'Low' }),       // 7: Мала, Великий, Малий → Мала
  and({ E: 'Low', T: 'High', D: 'Medium' }, { P: 'Low' }),    // 8: Мала, Великий, Середній → Мала
  and({ E: 'Low', T: 'High', D: 'High' }, { P: 'Low' }),      // 9: Мала, Великий, Великий → Мала

  // E = Medium (Середня)
  and({ E: 'Medium', T: 'Low', D: 'Low' }, { P: 'Medium' }),  // 10: Середня, Малий, Малий → Середня
  and({ E: 'Medium', T: 'Low', D: 'Medium' }, { P: 'Low' }),  // 11: Середня, Малий, Середній → Мала
  and({ E: 'Medium', T: 'Low', D: 'High' }, { P: 'Low' }),    // 12: Середня, Малий, Великий → Мала
  and({ E: 'Medium', T: 'Medium', D: 'Low' }, { P: 'Medium' }), // 13: Середня, Середній, Малий → Середня
  and({ E: 'Medium', T: 'Medium', D: 'Medium' }, { P: 'Medium' }), // 14: Середня, Середній, Середній → Середня
  and({ E: 'Medium', T: 'Medium', D: 'High' }, { P: 'Medium' }), // 15: Середня, Середній, Великий → Середня
  and({ E: 'Medium', T: 'High', D: 'Low' }, { P: 'High' }),   // 16: Середня, Великий, Малий → Велика
  and({ E: 'Medium', T: 'High', D: 'Medium' }, { P: 'High' }), // 17: Середня, Великий, Середній → Велика
  and({ E: 'Medium', T: 'High', D: 'High' }, { P: 'Medium' }), // 18: Середня, Великий, Великий → Середня

  // E = High (Велика)
  and({ E: 'High', T: 'Low', D: 'Low' }, { P: 'High' }),      // 19: Велика, Малий, Малий → Велика
  and({ E: 'High', T: 'Low', D: 'Medium' }, { P: 'High' }),   // 20: Велика, Малий, Середній → Велика
  and({ E: 'High', T: 'Low', D: 'High' }, { P: 'High' }),     // 21: Велика, Малий, Великий → Велика
  and({ E: 'High', T: 'Medium', D: 'Low' }, { P: 'VeryHigh' }), // 22: Велика, Середній, Малий → Дуже велика
  and({ E: 'High', T: 'Medium', D: 'Medium' }, { P: 'VeryHigh' }), // 23: Велика, Середній, Середній → Дуже велика
  and({ E: 'High', T: 'Medium', D: 'High' }, { P: 'VeryHigh' }), // 24: Велика, Середній, Великий → Дуже велика
  and({ E: 'High', T: 'High', D: 'Low' }, { P: 'VeryHigh' }), // 25: Велика, Великий, Малий → Дуже велика
  and({ E: 'High', T: 'High', D: 'Medium' }, { P: 'VeryHigh' }), // 26: Велика, Великий, Середній → Дуже велика
  and({ E: 'High', T: 'High', D: 'High' }, { P: 'High' }),    // 27: Велика, Великий, Великий → Велика
];

// Вхідні та вихідні змінні для defuzz
const inputs = { E: residualEnergy, T: transmissionCoefficient, D: delayCoefficient };
const outputs = { P: probability };

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

// Функція для обчислення вірогідності системи (з центроїдною дефазифікацією)
function calculateProbability(residualEnergyVal, transmissionCoefficientVal, delayCoefficientVal) {
  try {
    const vals = { 
      E: residualEnergyVal, 
      T: transmissionCoefficientVal, 
      D: delayCoefficientVal 
    };
    
    // Виконуємо нечіткий вивід з центроїдною стратегією дефазифікації
    const result = defuzz(inputs, outputs, rules, vals, centroidStrategy());
    
    // Якщо результат NaN або undefined, повертаємо значення за замовчуванням
    if (result.P === undefined || Number.isNaN(result.P)) {
      // Для граничних випадків, коли жодне правило не спрацьовує
      return 25; // Низька вірогідність як fallback
    }
    
    return result.P;
  } catch (error) {
    // Обробка випадку, коли жодне правило не спрацьовує
    if (error.message === 'no fuzzy sets given') {
      // Для граничних випадків (0,0,0) повертаємо низьку вірогідність
      return 25;
    }
    console.error("Error in fuzzy inference:", error);
    throw error;
  }
}

// Функція для обчислення ступенів приналежності
function calculateMembershipValues(variableName, value) {
  const memberships = {};
  
  if (variableName === "residualEnergy") {
    memberships.Low = trapezoidalMF(value, 0, 0, 10, 30);
    memberships.Medium = trapezoidalMF(value, 10, 30, 50, 70);
    memberships.High = trapezoidalMF(value, 50, 70, 100, 100);
  } else if (variableName === "transmissionCoefficient") {
    memberships.Low = trapezoidalMF(value, 0, 0, 20, 40);
    memberships.Medium = trapezoidalMF(value, 20, 40, 60, 80);
    memberships.High = trapezoidalMF(value, 60, 80, 100, 100);
  } else if (variableName === "delayCoefficient") {
    memberships.Low = trapezoidalMF(value, 0, 0, 30, 50);
    memberships.Medium = trapezoidalMF(value, 30, 50, 70, 90);
    memberships.High = trapezoidalMF(value, 70, 90, 100, 100);
  } else if (variableName === "probability") {
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
  calculateProbability,
  calculateMembershipValues,
  getMostActiveTerm,
  membershipParams,
  trapezoidalMF,
  triangularMF,
  // Для сумісності
  inputs,
  outputs,
  rules,
};

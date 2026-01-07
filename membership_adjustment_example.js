// Приклад коригування функцій приналежності відповідно до ТЗ

// === ПОТОЧНА КОНФІГУРАЦІЯ СИСТЕМИ ===

// Вхідні змінні:
// 1. Залишкова енергія (E) - residualEnergy
// 2. Коефіцієнт передавання (T) - transmissionCoefficient  
// 3. Коефіцієнт затримки (D) - delayCoefficient

// Вихідна змінна:
// Вірогідність (P) - probability

// === ФУНКЦІЇ ПРИНАЛЕЖНОСТІ ДЛЯ ВХОДІВ ===

// Залишкова енергія (E):
/*
residualEnergy.addTerm(new Term("Low", "trapeze", [0, 0, 10, 30]));
residualEnergy.addTerm(new Term("Medium", "trapeze", [10, 30, 50, 70]));
residualEnergy.addTerm(new Term("High", "trapeze", [50, 70, 100, 100]));
*/

// Коефіцієнт передавання (T):
/*
transmissionCoefficient.addTerm(new Term("Low", "trapeze", [0, 0, 20, 40]));
transmissionCoefficient.addTerm(new Term("Medium", "trapeze", [20, 40, 60, 80]));
transmissionCoefficient.addTerm(new Term("High", "trapeze", [60, 80, 100, 100]));
*/

// Коефіцієнт затримки (D):
/*
delayCoefficient.addTerm(new Term("Low", "trapeze", [0, 0, 30, 50]));
delayCoefficient.addTerm(new Term("Medium", "trapeze", [30, 50, 70, 90]));
delayCoefficient.addTerm(new Term("High", "trapeze", [70, 90, 100, 100]));
*/

// === ФУНКЦІЇ ПРИНАЛЕЖНОСТІ ДЛЯ ВИХОДУ ===

// Вірогідність (P):
/*
probability.addTerm(new Term("VeryLow", "triangle", [0, 0, 25]));
probability.addTerm(new Term("Low", "triangle", [0, 25, 50]));
probability.addTerm(new Term("Medium", "triangle", [25, 50, 75]));
probability.addTerm(new Term("High", "triangle", [50, 75, 100]));
probability.addTerm(new Term("VeryHigh", "triangle", [75, 100, 100]));
*/

// === ПАРАМЕТРИ ДЛЯ ВІЗУАЛІЗАЦІЇ ===

/*
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
*/

// === КРОКИ ДЛЯ ЗАСТОСУВАННЯ ЗМІН ===
/*
1. Відредагуйте fuzzyController.js у трьох місцях:
   - Терми для fuzzyis бібліотеки
   - Об'єкт membershipParams
   - Функція calculateMembershipValues

2. Перезапустіть сервер:
   npm start

3. Перевірте результат:
   curl "http://localhost:3000/api/membership-functions"

4. Перегляньте графіки у браузері:
   http://localhost:3000
*/

console.log("Цей файл містить приклади коригування функцій приналежності");
console.log("Вхідні змінні: E (Залишкова енергія), T (Коефіцієнт передавання), D (Коефіцієнт затримки)");
console.log("Вихідна змінна: P (Вірогідність)");

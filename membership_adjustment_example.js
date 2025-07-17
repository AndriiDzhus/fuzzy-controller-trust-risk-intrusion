// Приклад коригування функцій приналежності відповідно до ТЗ

// === ВАРІАНТ 1: Більш рівномірний розподіл ===

// В fuzzyController.js, рядки 19-34, замініть:
/*
connectionStrength.addTerm(new Term("Low", "trapeze", [0, 0, 30, 50]));
connectionStrength.addTerm(new Term("Medium", "trapeze", [25, 45, 55, 75]));
connectionStrength.addTerm(new Term("High", "trapeze", [50, 70, 100, 100]));
*/

// В membershipParams, рядки 110-130, замініть:
/*
connectionStrength: {
  Low: { type: "trapeze", params: [0, 0, 30, 50] },
  Medium: { type: "trapeze", params: [25, 45, 55, 75] },
  High: { type: "trapeze", params: [50, 70, 100, 100] },
},
*/

// В calculateMembershipValues, рядки 156-166, замініть:
/*
if (variable === "connectionStrength") {
  memberships.Low = trapezoidalMF(value, 0, 0, 30, 50);
  memberships.Medium = trapezoidalMF(value, 25, 45, 55, 75);
  memberships.High = trapezoidalMF(value, 50, 70, 100, 100);
}
*/

// === ВАРІАНТ 2: Згідно з технічним завданням ===
// Якщо у вашому ТЗ вказані конкретні значення, використайте їх
// Наприклад, якщо ТЗ вимагає:

// Входи - більш чіткі межі:
/*
Low: [0, 0, 25, 45]
Medium: [20, 40, 60, 80] 
High: [55, 75, 100, 100]
*/

// Виходи - п'ять рівномірних рівнів:
/*
VeryLow: [0, 0, 15]
Low: [10, 25, 40]
Medium: [35, 50, 65]
High: [60, 75, 90]
VeryHigh: [85, 100, 100]
*/

// === КРОКИ ДЛЯ ЗАСТОСУВАННЯ ЗМІН ===
/*
1. Відредагуйте fuzzyController.js у трьох місцях:
   - Рядки термів для fuzzyis (19-34)
   - Об'єкт membershipParams (110-130)
   - Функція calculateMembershipValues (156-166)

2. Перезапустіть сервер:
   pkill -f "node server.js"
   npm start

3. Перевірте результат:
   curl "http://localhost:3000/api/membership-functions"

4. Перегляньте графіки у браузері:
   http://localhost:3000
*/

console.log("Цей файл містить приклади коригування функцій приналежності");

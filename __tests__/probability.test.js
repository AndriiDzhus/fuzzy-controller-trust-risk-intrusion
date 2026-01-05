const { calculateProbability } = require('../fuzzyController');

describe('Probability Calculation Tests', () => {
  
  // Тести для оптимальних сценаріїв (висока вірогідність)
  describe('Optimal Scenarios (High Probability)', () => {
    test('should return high probability for high energy with medium/high transmission', () => {
      // Велика енергія + середній/великий коефіцієнт передавання → висока вірогідність
      const probability = calculateProbability(85, 50, 40);
      expect(probability).toBeGreaterThan(75); // VeryHigh range
      expect(probability).toBeLessThanOrEqual(100);
    });

    test('should return high probability for high energy conditions', () => {
      // Велика енергія + великий коефіцієнт передавання
      const probability = calculateProbability(80, 70, 40);
      expect(probability).toBeGreaterThan(75); // VeryHigh range
      expect(probability).toBeLessThanOrEqual(100);
    });

    test('should return medium probability for medium energy with good transmission', () => {
      // Середня енергія + великий коефіцієнт передавання + малий затримки
      const probability = calculateProbability(40, 80, 30);
      expect(probability).toBeGreaterThan(50); // High range
      expect(probability).toBeLessThanOrEqual(100);
    });
  });

  // Тести для критичних сценаріїв (низька вірогідність)
  describe('Critical Scenarios (Low Probability)', () => {
    test('should return very low probability for low energy with medium transmission', () => {
      // Мала енергія + середній коефіцієнт → дуже мала вірогідність
      const probability = calculateProbability(5, 50, 60);
      expect(probability).toBeLessThan(25); // VeryLow range
      expect(probability).toBeGreaterThanOrEqual(0);
    });

    test('should return low probability for low energy conditions', () => {
      // Мала енергія завжди дає низьку вірогідність
      const probability = calculateProbability(15, 25, 30);
      expect(probability).toBeLessThan(50); // Low range
      expect(probability).toBeGreaterThanOrEqual(0);
    });

    test('should return low probability for medium energy with low transmission', () => {
      // Середня енергія + малий коефіцієнт передавання + великий затримки
      const probability = calculateProbability(40, 20, 80);
      expect(probability).toBeLessThan(50); // Low range
      expect(probability).toBeGreaterThanOrEqual(0);
    });
  });

  // Тести для граничних значень
  describe('Boundary Value Tests', () => {
    test('should handle minimum input values', () => {
      const probability = calculateProbability(0, 0, 0);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);
      expect(typeof probability).toBe('number');
      expect(Number.isFinite(probability)).toBe(true);
    });

    test('should handle maximum input values', () => {
      const probability = calculateProbability(100, 100, 100);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);
      expect(typeof probability).toBe('number');
      expect(Number.isFinite(probability)).toBe(true);
    });

    test('should handle mid-range values', () => {
      const probability = calculateProbability(50, 50, 50);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);
      expect(typeof probability).toBe('number');
      expect(Number.isFinite(probability)).toBe(true);
    });
  });

  // Тести для консистентності
  describe('Consistency Tests', () => {
    test('should return same result for same inputs', () => {
      const prob1 = calculateProbability(75, 35, 20);
      const prob2 = calculateProbability(75, 35, 20);
      expect(prob1).toBe(prob2);
    });

    test('should be monotonic for residual energy', () => {
      // При збільшенні залишкової енергії вірогідність має збільшуватися
      const prob1 = calculateProbability(20, 50, 50); // Low energy
      const prob2 = calculateProbability(50, 50, 50); // Medium energy  
      const prob3 = calculateProbability(80, 50, 50); // High energy
      
      expect(prob1).toBeLessThan(prob2);
      expect(prob2).toBeLessThan(prob3);
    });

    test('should handle transmission coefficient effect', () => {
      // Перевіряємо що система стабільно обчислює вірогідність для різних коефіцієнтів передавання
      const prob1 = calculateProbability(70, 15, 30); // Low transmission
      const prob2 = calculateProbability(70, 50, 30); // Medium transmission
      const prob3 = calculateProbability(70, 85, 30); // High transmission
      
      // Всі значення мають бути валідними
      expect(prob1).toBeGreaterThanOrEqual(0);
      expect(prob1).toBeLessThanOrEqual(100);
      expect(prob2).toBeGreaterThanOrEqual(0);
      expect(prob2).toBeLessThanOrEqual(100);
      expect(prob3).toBeGreaterThanOrEqual(0);
      expect(prob3).toBeLessThanOrEqual(100);
      
      expect(typeof prob1).toBe('number');
      expect(typeof prob2).toBe('number');
      expect(typeof prob3).toBe('number');
    });

    test('should increase probability with higher transmission at high energy', () => {
      // При високій енергії збільшення коефіцієнта передавання збільшує вірогідність
      const prob1 = calculateProbability(80, 30, 40); // Lower transmission
      const prob2 = calculateProbability(80, 70, 40); // Higher transmission
      
      expect(prob1).toBeLessThan(prob2);
    });
  });

  // Тести для специфічних правил
  describe('Fuzzy Rules Validation', () => {
    test('should validate rule: High E + Medium T + Low D -> VeryHigh', () => {
      // Правило 22: ["High", "Medium", "Low"] -> ["VeryHigh"]
      const probability = calculateProbability(85, 50, 35);
      expect(probability).toBeGreaterThan(75); // VeryHigh range
    });

    test('should validate rule: Low E + Medium T + Medium D -> VeryLow', () => {
      // Правило 5: ["Low", "Medium", "Medium"] -> ["VeryLow"] 
      const probability = calculateProbability(10, 50, 60);
      expect(probability).toBeLessThan(25); // VeryLow range
    });

    test('should validate rule: Medium E + Low T + Low D -> Medium', () => {
      // Правило 10: ["Medium", "Low", "Low"] -> ["Medium"]
      const probability = calculateProbability(40, 20, 35);
      expect(probability).toBeGreaterThanOrEqual(25);
      expect(probability).toBeLessThanOrEqual(75);
    });

    test('should validate rule: Medium E + High T + Low D -> High', () => {
      // Правило 16: ["Medium", "High", "Low"] -> ["High"]
      const probability = calculateProbability(40, 85, 35);
      expect(probability).toBeGreaterThan(50); // High range
    });
  });
});

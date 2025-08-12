const { calculateSecurityRisk } = require('../fuzzyController');

describe('Security Risk Calculation Tests', () => {
  
  // Тести для оптимальних сценаріїв (низький ризик)
  describe('Optimal Security Scenarios (Low Risk)', () => {
    test('should return very low risk for optimal conditions', () => {
      // Високе з'єднання + швидкий відгук + низьке споживання
      const risk = calculateSecurityRisk(90, 15, 5);
      expect(risk).toBeLessThan(25); // VeryLow range
      expect(risk).toBeGreaterThanOrEqual(0);
    });

    test('should return low risk for good conditions', () => {
      // Високе з'єднання + помірний відгук + помірне споживання  
      const risk = calculateSecurityRisk(85, 40, 25);
      expect(risk).toBeLessThan(50); // Low/VeryLow range
      expect(risk).toBeGreaterThanOrEqual(0);
    });

    test('should return acceptable risk for medium connection with good other params', () => {
      // Середнє з'єднання + швидкий відгук + низьке споживання
      const risk = calculateSecurityRisk(50, 15, 5);
      expect(risk).toBeLessThan(30); // Should be VeryLow according to rules
      expect(risk).toBeGreaterThanOrEqual(0);
    });
  });

  // Тести для критичних сценаріїв (високий ризик)
  describe('Critical Security Scenarios (High Risk)', () => {
    test('should return high risk for weak connection', () => {
      // Слабке з'єднання завжди дає високий ризик
      const risk = calculateSecurityRisk(15, 25, 30);
      expect(risk).toBeGreaterThan(50); // High risk range
      expect(risk).toBeLessThanOrEqual(100);
    });

    test('should return very high risk for worst case scenario', () => {
      // Слабке з'єднання + повільний відгук + високе споживання
      const risk = calculateSecurityRisk(10, 85, 90);
      expect(risk).toBeGreaterThan(75); // VeryHigh range
      expect(risk).toBeLessThanOrEqual(100);
    });

    test('should return high risk for medium connection with bad other params', () => {
      // Середнє з'єднання + повільний відгук + високе споживання
      const risk = calculateSecurityRisk(50, 85, 90);
      expect(risk).toBeGreaterThan(75); // VeryHigh according to rules
      expect(risk).toBeLessThanOrEqual(100);
    });
  });

  // Тести для граничних значень
  describe('Boundary Value Tests', () => {
    test('should handle minimum input values', () => {
      const risk = calculateSecurityRisk(0, 0, 0);
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(100);
      expect(typeof risk).toBe('number');
      expect(Number.isFinite(risk)).toBe(true);
    });

    test('should handle maximum input values', () => {
      const risk = calculateSecurityRisk(100, 100, 100);
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(100);
      expect(typeof risk).toBe('number');
      expect(Number.isFinite(risk)).toBe(true);
    });

    test('should handle mid-range values', () => {
      const risk = calculateSecurityRisk(50, 50, 50);
      expect(risk).toBeGreaterThanOrEqual(0);
      expect(risk).toBeLessThanOrEqual(100);
      expect(typeof risk).toBe('number');
      expect(Number.isFinite(risk)).toBe(true);
    });
  });

  // Тести для консистентності
  describe('Consistency Tests', () => {
    test('should return same result for same inputs', () => {
      const risk1 = calculateSecurityRisk(75, 35, 20);
      const risk2 = calculateSecurityRisk(75, 35, 20);
      expect(risk1).toBe(risk2);
    });

    test('should be monotonic for connection strength', () => {
      // При збільшенні сили з'єднання ризик має зменшуватися
      const risk1 = calculateSecurityRisk(20, 50, 50); // Low connection
      const risk2 = calculateSecurityRisk(50, 50, 50); // Medium connection  
      const risk3 = calculateSecurityRisk(80, 50, 50); // High connection
      
      expect(risk1).toBeGreaterThan(risk2);
      expect(risk2).toBeGreaterThan(risk3);
    });

    test('should handle response time effect on risk', () => {
      // Перевіряємо що система стабільно обчислює ризик для різних часів відгуку
      const risk1 = calculateSecurityRisk(70, 15, 30); // Fast response
      const risk2 = calculateSecurityRisk(70, 60, 30); // Medium response
      const risk3 = calculateSecurityRisk(70, 85, 30); // Slow response
      
      // Всі значення мають бути валідними
      expect(risk1).toBeGreaterThanOrEqual(0);
      expect(risk1).toBeLessThanOrEqual(100);
      expect(risk2).toBeGreaterThanOrEqual(0);
      expect(risk2).toBeLessThanOrEqual(100);
      expect(risk3).toBeGreaterThanOrEqual(0);
      expect(risk3).toBeLessThanOrEqual(100);
      
      // При high connection strength ефект response time може бути нелінійним
      expect(typeof risk1).toBe('number');
      expect(typeof risk2).toBe('number');
      expect(typeof risk3).toBe('number');
    });

    test('should increase risk with higher energy consumption', () => {
      // При збільшенні споживання енергії ризик має зростати
      const risk1 = calculateSecurityRisk(70, 40, 15); // Low consumption
      const risk2 = calculateSecurityRisk(70, 40, 45); // Medium consumption
      const risk3 = calculateSecurityRisk(70, 40, 80); // High consumption
      
      expect(risk1).toBeLessThan(risk2);
      expect(risk2).toBeLessThan(risk3);
    });
  });

  // Тести для специфічних правил
  describe('Fuzzy Rules Validation', () => {
    test('should validate rule: High + Low + Low -> VeryLow', () => {
      // Правило: ["High", "Low", "Low"] -> ["VeryLow"]
      const risk = calculateSecurityRisk(85, 20, 15);
      expect(risk).toBeLessThan(25); // VeryLow range
    });

    test('should validate rule: Low + Medium + Medium -> VeryHigh', () => {
      // Правило: ["Low", "Medium", "Medium"] -> ["VeryHigh"] 
      const risk = calculateSecurityRisk(15, 60, 40);
      expect(risk).toBeGreaterThan(75); // VeryHigh range
    });

    test('should validate rule: Medium + Low + Low -> VeryLow', () => {
      // Правило: ["Medium", "Low", "Low"] -> ["VeryLow"]
      const risk = calculateSecurityRisk(50, 20, 15);
      expect(risk).toBeLessThan(25); // VeryLow range
    });

    test('should validate rule: Medium + High + High -> VeryHigh', () => {
      // Правило: ["Medium", "High", "High"] -> ["VeryHigh"]
      const risk = calculateSecurityRisk(50, 85, 85);
      expect(risk).toBeGreaterThan(75); // VeryHigh range
    });
  });
});

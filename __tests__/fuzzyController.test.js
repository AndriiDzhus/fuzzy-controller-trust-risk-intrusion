const {
  calculateSecurityRisk,
  calculateMembershipValues,
  getMostActiveTerm,
  trapezoidalMF,
  triangularMF
} = require('../fuzzyController');

describe('Fuzzy Logic Security Risk Controller Tests', () => {
  
  // Тести для трапецоїдальної функції приналежності
  describe('Trapezoidal Membership Function', () => {
    test('should return 0 for values outside range', () => {
      // Тестуємо функцію [0, 0, 20, 40] - Connection Strength Low
      expect(trapezoidalMF(-5, 0, 0, 20, 40)).toBe(0);
      expect(trapezoidalMF(50, 0, 0, 20, 40)).toBe(0);
    });

    test('should return 1 for values in flat top region', () => {
      // Тестуємо функцію [0, 0, 20, 40] - Connection Strength Low
      expect(trapezoidalMF(10, 0, 0, 20, 40)).toBe(1);
      expect(trapezoidalMF(15, 0, 0, 20, 40)).toBe(1);
    });

    test('should return correct slope values', () => {
      // Тестуємо функцію [20, 40, 60, 80] - Connection Strength Medium
      expect(trapezoidalMF(30, 20, 40, 60, 80)).toBe(0.5); // на підйомі
      expect(trapezoidalMF(70, 20, 40, 60, 80)).toBe(0.5); // на спуску
      expect(trapezoidalMF(50, 20, 40, 60, 80)).toBe(1);   // на плато
    });

    test('should handle edge cases correctly', () => {
      // Граничні значення
      expect(trapezoidalMF(0, 0, 0, 20, 40)).toBe(1);
      expect(trapezoidalMF(20, 0, 0, 20, 40)).toBe(1);
      expect(trapezoidalMF(40, 0, 0, 20, 40)).toBe(0);
    });
  });

  // Тести для трикутної функції приналежності
  describe('Triangular Membership Function', () => {
    test('should return 0 for values outside range', () => {
      // Тестуємо функцію [25, 50, 75] - Security Risk Medium
      expect(triangularMF(20, 25, 50, 75)).toBe(0);
      expect(triangularMF(80, 25, 50, 75)).toBe(0);
    });

    test('should return 1 at peak', () => {
      expect(triangularMF(50, 25, 50, 75)).toBe(1);
    });

    test('should return correct slope values', () => {
      // Тестуємо функцію [25, 50, 75] - Security Risk Medium
      expect(triangularMF(37.5, 25, 50, 75)).toBe(0.5); // на підйомі
      expect(triangularMF(62.5, 25, 50, 75)).toBe(0.5); // на спуску
    });

    test('should handle special triangular cases', () => {
      // VeryLow [0, 0, 25] - лівий прямокутний трикутник
      expect(triangularMF(0, 0, 0, 25)).toBe(1);
      expect(triangularMF(12.5, 0, 0, 25)).toBe(0.5);
      expect(triangularMF(25, 0, 0, 25)).toBe(0);

      // VeryHigh [75, 100, 100] - правий прямокутний трикутник  
      expect(triangularMF(75, 75, 100, 100)).toBe(0);
      expect(triangularMF(87.5, 75, 100, 100)).toBe(0.5);
      expect(triangularMF(100, 75, 100, 100)).toBe(1);
    });
  });

  // Тести для обчислення значень приналежності
  describe('Calculate Membership Values', () => {
    test('should calculate correct membership for Connection Strength', () => {
      const memberships = calculateMembershipValues('connectionStrength', 30);
      
      expect(memberships).toHaveProperty('Low');
      expect(memberships).toHaveProperty('Medium');
      expect(memberships).toHaveProperty('High');
      
      // При значенні 30: Low має бути 0.5, Medium має бути 0.5, High має бути 0
      expect(memberships.Low).toBeCloseTo(0.5, 2);
      expect(memberships.Medium).toBeCloseTo(0.5, 2);
      expect(memberships.High).toBe(0);
    });

    test('should calculate correct membership for Response Time', () => {
      const memberships = calculateMembershipValues('responseTime', 40);
      
      // При значенні 40: Low має бути 0.5, Medium має бути 0.5, High має бути 0
      expect(memberships.Low).toBeCloseTo(0.5, 2);
      expect(memberships.Medium).toBeCloseTo(0.5, 2);
      expect(memberships.High).toBe(0);
    });

    test('should calculate correct membership for Energy Consumption', () => {
      const memberships = calculateMembershipValues('energyConsumption', 20);
      
      // При значенні 20: Low має бути 0.5, Medium має бути 0.5, High має бути 0
      expect(memberships.Low).toBeCloseTo(0.5, 2);
      expect(memberships.Medium).toBeCloseTo(0.5, 2);
      expect(memberships.High).toBe(0);
    });

    test('should calculate correct membership for Security Risk Level', () => {
      const memberships = calculateMembershipValues('securityRiskLevel', 37.5);
      
      // При значенні 37.5: Low має бути 0.5, Medium має бути 0.5
      // VeryLow [0,0,25] при x=37.5 має бути 0 (за межами)
      expect(memberships.Low).toBeCloseTo(0.5, 2);      // [0,25,50] при 37.5
      expect(memberships.Medium).toBeCloseTo(0.5, 2);   // [25,50,75] при 37.5
      expect(memberships.VeryLow).toBe(0);              // [0,0,25] при 37.5 = 0
      expect(memberships.High).toBe(0);
      expect(memberships.VeryHigh).toBe(0);
    });
  });

  // Тести для знаходження найактивнішого терма
  describe('Get Most Active Term', () => {
    test('should return term with highest membership', () => {
      const memberships = {
        VeryLow: 0.1,
        Low: 0.8,
        Medium: 0.3,
        High: 0.0,
        VeryHigh: 0.0
      };
      
      expect(getMostActiveTerm(memberships)).toBe('Low');
    });

    test('should handle equal memberships', () => {
      const memberships = {
        Low: 0.5,
        Medium: 0.5,
        High: 0.0
      };
      
      // Повинен повернути перший знайдений максимальний
      const result = getMostActiveTerm(memberships);
      expect(['Low', 'Medium']).toContain(result);
    });

    test('should return N/A for empty memberships', () => {
      const memberships = {};
      expect(getMostActiveTerm(memberships)).toBe('N/A');
    });
  });
});

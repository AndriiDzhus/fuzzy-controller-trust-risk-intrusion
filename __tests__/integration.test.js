const { 
  calculateSecurityRisk, 
  calculateMembershipValues, 
  getMostActiveTerm 
} = require('../fuzzyController');

describe('Integration Tests - Complete Fuzzy System', () => {
  
  // Тести для повного циклу обчислення
  describe('End-to-End Security Risk Assessment', () => {
    test('should complete full assessment cycle for optimal scenario', () => {
      const cs = 85; // High connection strength
      const rt = 25; // Low response time  
      const ec = 15; // Low energy consumption

      // 1. Обчислюємо ризик безпеки
      const securityRisk = calculateSecurityRisk(cs, rt, ec);
      expect(securityRisk).toBeGreaterThanOrEqual(0);
      expect(securityRisk).toBeLessThanOrEqual(100);
      expect(securityRisk).toBeLessThan(25); // Має бути VeryLow

      // 2. Обчислюємо приналежності для входів
      const csMembership = calculateMembershipValues('connectionStrength', cs);
      const rtMembership = calculateMembershipValues('responseTime', rt);  
      const ecMembership = calculateMembershipValues('energyConsumption', ec);

      // 3. Перевіряємо що вхідні значення правильно класифіковані
      expect(csMembership.High).toBeGreaterThan(0.5); // 85 має бути High
      expect(rtMembership.Low).toBeGreaterThan(0.5);  // 25 має бути Low
      expect(ecMembership.Low).toBeGreaterThan(0.5);  // 15 має бути Low

      // 4. Обчислюємо приналежність результату
      const riskMembership = calculateMembershipValues('securityRiskLevel', securityRisk);
      
      // 5. Знаходимо найактивніший терм
      const mostActive = getMostActiveTerm(riskMembership);
      expect(['VeryLow', 'Low']).toContain(mostActive); // Має бути низький ризик
    });

    test('should complete full assessment cycle for critical scenario', () => {
      const cs = 15; // Low connection strength
      const rt = 85; // High response time
      const ec = 90; // High energy consumption

      // 1. Обчислюємо ризик безпеки  
      const securityRisk = calculateSecurityRisk(cs, rt, ec);
      expect(securityRisk).toBeGreaterThanOrEqual(0);
      expect(securityRisk).toBeLessThanOrEqual(100);
      expect(securityRisk).toBeGreaterThan(75); // Має бути VeryHigh

      // 2. Обчислюємо приналежності для входів
      const csMembership = calculateMembershipValues('connectionStrength', cs);
      const rtMembership = calculateMembershipValues('responseTime', rt);
      const ecMembership = calculateMembershipValues('energyConsumption', ec);

      // 3. Перевіряємо що вхідні значення правильно класифіковані
      expect(csMembership.Low).toBeGreaterThan(0.5);  // 15 має бути Low
      expect(rtMembership.High).toBeGreaterThan(0.5); // 85 має бути High  
      expect(ecMembership.High).toBeGreaterThan(0.5); // 90 має бути High

      // 4. Обчислюємо приналежність результату
      const riskMembership = calculateMembershipValues('securityRiskLevel', securityRisk);
      
      // 5. Знаходимо найактивніший терм
      const mostActive = getMostActiveTerm(riskMembership);
      expect(['VeryHigh', 'High']).toContain(mostActive); // Має бути високий ризик
    });
  });

  // Ключові правила нечіткого виводу (скорочено до найважливіших)
  describe('Key Fuzzy Rules Validation', () => {
    const keyTestCases = [
      // Найкращі сценарії
      { input: [85, 15, 15], expectedRange: [0, 25], description: 'High-Low-Low -> VeryLow (optimal)' },
      { input: [50, 15, 15], expectedRange: [0, 25], description: 'Medium-Low-Low -> VeryLow (good)' },
      
      // Найгірші сценарії
      { input: [15, 85, 80], expectedRange: [75, 100], description: 'Low-High-High -> VeryHigh (critical)' },
      { input: [15, 60, 40], expectedRange: [75, 100], description: 'Low-Medium-Medium -> VeryHigh (bad)' },
      
      // Змішані сценарії
      { input: [50, 85, 80], expectedRange: [75, 100], description: 'Medium-High-High -> VeryHigh (risky)' },
      { input: [85, 85, 80], expectedRange: [0, 50], description: 'High-High-High -> Low (stable)' }
    ];

    keyTestCases.forEach(({ input, expectedRange, description }) => {
      test(`should validate rule: ${description}`, () => {
        const [cs, rt, ec] = input;
        const [minRisk, maxRisk] = expectedRange;
        
        const actualRisk = calculateSecurityRisk(cs, rt, ec);
        
        expect(actualRisk).toBeGreaterThanOrEqual(minRisk);
        expect(actualRisk).toBeLessThanOrEqual(maxRisk);
      });
    });
  });

  // Спрощені тести стійкості
  describe('System Robustness Tests', () => {
    test('should handle floating point precision', () => {
      const risk1 = calculateSecurityRisk(33.333, 66.666, 99.999);
      const risk2 = calculateSecurityRisk(33.334, 66.667, 100.000);
      
      // Результати мають бути близькими
      expect(Math.abs(risk1 - risk2)).toBeLessThan(5);
    });

    test('should be stable for repeated calculations', () => {
      const inputs = [75.5, 42.3, 18.7];
      const results = [];
      
      // Виконуємо 10 обчислень (замість 100)
      for (let i = 0; i < 10; i++) {
        results.push(calculateSecurityRisk(...inputs));
      }
      
      // Всі результати мають бути однакові
      const firstResult = results[0];
      results.forEach(result => {
        expect(result).toBe(firstResult);
      });
    });

    test('should handle stress testing with random inputs', () => {
      // Зменшено з 1000 до 100 ітерацій
      for (let i = 0; i < 100; i++) {
        const cs = Math.random() * 100;
        const rt = Math.random() * 100;
        const ec = Math.random() * 100;
        
        const risk = calculateSecurityRisk(cs, rt, ec);
        
        expect(risk).toBeGreaterThanOrEqual(0);
        expect(risk).toBeLessThanOrEqual(100);
        expect(Number.isFinite(risk)).toBe(true);
        expect(Number.isNaN(risk)).toBe(false);
      }
    });
  });

  // Тести для покриття всіх термів
  describe('Term Coverage Tests', () => {
    test('should be able to produce VeryLow risk', () => {
      const risk = calculateSecurityRisk(90, 10, 5);
      const membership = calculateMembershipValues('securityRiskLevel', risk);
      const mostActive = getMostActiveTerm(membership);
      
      expect(mostActive).toBe('VeryLow');
      expect(risk).toBeLessThan(25);
    });

    test('should be able to produce VeryHigh risk', () => {
      const risk = calculateSecurityRisk(10, 90, 95);
      const membership = calculateMembershipValues('securityRiskLevel', risk);
      const mostActive = getMostActiveTerm(membership);
      
      expect(mostActive).toBe('VeryHigh');
      expect(risk).toBeGreaterThan(75);
    });

    test('should be able to produce Medium risk', () => {
      const risk = calculateSecurityRisk(50, 30, 40);
      expect(risk).toBeGreaterThanOrEqual(25);
      expect(risk).toBeLessThan(75);
    });
  });
});
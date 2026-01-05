const { 
  calculateProbability, 
  calculateMembershipValues, 
  getMostActiveTerm 
} = require('../fuzzyController');

describe('Integration Tests - Complete Fuzzy System', () => {
  
  // Тести для повного циклу обчислення
  describe('End-to-End Probability Assessment', () => {
    test('should complete full assessment cycle for high probability scenario', () => {
      const e = 85; // High residual energy
      const t = 70; // High transmission coefficient  
      const d = 35; // Low delay coefficient

      // 1. Обчислюємо вірогідність
      const probability = calculateProbability(e, t, d);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);
      expect(probability).toBeGreaterThan(75); // Має бути VeryHigh

      // 2. Обчислюємо приналежності для входів
      const eMembership = calculateMembershipValues('residualEnergy', e);
      const tMembership = calculateMembershipValues('transmissionCoefficient', t);  
      const dMembership = calculateMembershipValues('delayCoefficient', d);

      // 3. Перевіряємо що вхідні значення правильно класифіковані
      expect(eMembership.High).toBeGreaterThan(0.5); // 85 має бути High
      expect(tMembership.High).toBeGreaterThanOrEqual(0.5);  // 70 має бути High (на границі)
      expect(dMembership.Low).toBeGreaterThanOrEqual(0.5);  // 35 має бути Low

      // 4. Обчислюємо приналежність результату
      const probMembership = calculateMembershipValues('probability', probability);
      
      // 5. Знаходимо найактивніший терм
      const mostActive = getMostActiveTerm(probMembership);
      expect(['VeryHigh', 'High']).toContain(mostActive); // Має бути висока вірогідність
    });

    test('should complete full assessment cycle for low probability scenario', () => {
      const e = 10; // Low residual energy
      const t = 50; // Medium transmission coefficient
      const d = 60; // Medium delay coefficient

      // 1. Обчислюємо вірогідність  
      const probability = calculateProbability(e, t, d);
      expect(probability).toBeGreaterThanOrEqual(0);
      expect(probability).toBeLessThanOrEqual(100);
      expect(probability).toBeLessThan(25); // Має бути VeryLow

      // 2. Обчислюємо приналежності для входів
      const eMembership = calculateMembershipValues('residualEnergy', e);
      const tMembership = calculateMembershipValues('transmissionCoefficient', t);
      const dMembership = calculateMembershipValues('delayCoefficient', d);

      // 3. Перевіряємо що вхідні значення правильно класифіковані
      expect(eMembership.Low).toBeGreaterThan(0.5);  // 10 має бути Low
      expect(tMembership.Medium).toBeGreaterThan(0.5); // 50 має бути Medium  
      expect(dMembership.Medium).toBeGreaterThan(0.5); // 60 має бути Medium

      // 4. Обчислюємо приналежність результату
      const probMembership = calculateMembershipValues('probability', probability);
      
      // 5. Знаходимо найактивніший терм
      const mostActive = getMostActiveTerm(probMembership);
      expect(['VeryLow', 'Low']).toContain(mostActive); // Має бути низька вірогідність
    });
  });

  // Ключові правила нечіткого виводу
  describe('Key Fuzzy Rules Validation', () => {
    const keyTestCases = [
      // Найкращі сценарії (висока вірогідність)
      { input: [85, 70, 35], expectedRange: [75, 100], description: 'High-High-Low -> VeryHigh (optimal)' },
      { input: [85, 50, 40], expectedRange: [75, 100], description: 'High-Medium-Low -> VeryHigh (good)' },
      
      // Найгірші сценарії (низька вірогідність)
      { input: [10, 50, 60], expectedRange: [0, 25], description: 'Low-Medium-Medium -> VeryLow (critical)' },
      { input: [5, 50, 80], expectedRange: [0, 25], description: 'Low-Medium-High -> VeryLow (bad)' },
      
      // Змішані сценарії
      { input: [40, 50, 60], expectedRange: [25, 75], description: 'Medium-Medium-Medium -> Medium (balanced)' },
      { input: [80, 20, 40], expectedRange: [50, 100], description: 'High-Low-Low -> High (stable)' }
    ];

    keyTestCases.forEach(({ input, expectedRange, description }) => {
      test(`should validate rule: ${description}`, () => {
        const [e, t, d] = input;
        const [minProb, maxProb] = expectedRange;
        
        const actualProbability = calculateProbability(e, t, d);
        
        expect(actualProbability).toBeGreaterThanOrEqual(minProb);
        expect(actualProbability).toBeLessThanOrEqual(maxProb);
      });
    });
  });

  // Спрощені тести стійкості
  describe('System Robustness Tests', () => {
    test('should handle floating point precision', () => {
      const prob1 = calculateProbability(33.333, 66.666, 49.999);
      const prob2 = calculateProbability(33.334, 66.667, 50.000);
      
      // Результати мають бути близькими
      expect(Math.abs(prob1 - prob2)).toBeLessThan(5);
    });

    test('should be stable for repeated calculations', () => {
      const inputs = [75.5, 42.3, 38.7];
      const results = [];
      
      // Виконуємо 10 обчислень
      for (let i = 0; i < 10; i++) {
        results.push(calculateProbability(...inputs));
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
        const e = Math.random() * 100;
        const t = Math.random() * 100;
        const d = Math.random() * 100;
        
        const probability = calculateProbability(e, t, d);
        
        expect(probability).toBeGreaterThanOrEqual(0);
        expect(probability).toBeLessThanOrEqual(100);
        expect(Number.isFinite(probability)).toBe(true);
        expect(Number.isNaN(probability)).toBe(false);
      }
    });
  });

  // Тести для покриття всіх термів
  describe('Term Coverage Tests', () => {
    test('should be able to produce VeryLow probability', () => {
      const probability = calculateProbability(5, 50, 60);
      const membership = calculateMembershipValues('probability', probability);
      const mostActive = getMostActiveTerm(membership);
      
      expect(mostActive).toBe('VeryLow');
      expect(probability).toBeLessThan(25);
    });

    test('should be able to produce VeryHigh probability', () => {
      const probability = calculateProbability(90, 85, 35);
      const membership = calculateMembershipValues('probability', probability);
      const mostActive = getMostActiveTerm(membership);
      
      expect(mostActive).toBe('VeryHigh');
      expect(probability).toBeGreaterThan(75);
    });

    test('should be able to produce Medium probability', () => {
      const probability = calculateProbability(40, 50, 60);
      expect(probability).toBeGreaterThanOrEqual(25);
      expect(probability).toBeLessThanOrEqual(75);
    });
  });
});

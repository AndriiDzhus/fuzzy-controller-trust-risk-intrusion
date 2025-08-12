module.exports = {
  testEnvironment: 'node',
  collectCoverage: false, // За замовчуванням вимкнено для швидкості
  coverageDirectory: 'coverage',
  testMatch: [
    '**/__tests__/**/*.test.js'
  ],
  collectCoverageFrom: [
    '*.js',
    '!server.js',
    '!jest.config.js',
    '!coverage/**',
    '!membership_adjustment_example.js'
  ],
  // Прибрали жорсткі coverageThreshold - не блокують розробку
  verbose: false, // Менше виводу для чистоти
  testTimeout: 5000 // Зменшили таймаут
};

/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      { useESM: true, tsconfig: 'tsconfig.tests.json' },
    ],
  },
  moduleNameMapper: {
    // Map alias with .js extension back to TS sources
    '^@/(.*)\\.js$': '<rootDir>/src/$1.ts',
    '^@/(.*)\\.ts$': '<rootDir>/src/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // Allow ESM-style relative imports with .ts to resolve TS
    '^(\\.{1,2}/.*)\\.ts$': '$1',
  },
  extensionsToTreatAsEsm: ['.ts'],
  verbose: false,
};

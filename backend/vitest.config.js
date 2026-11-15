import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    globals: false,
    testTimeout: 20000,
    // Starting the in-memory MongoDB server (binary download on first run) can
    // take noticeably longer than a normal test.
    hookTimeout: 180000,
    // Deterministic, non-secret values for the test run only. These are never
    // used outside the test process.
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'phase4-test-only-jwt-secret',
      JWT_EXPIRES_IN: '1d',
      AUTH_COOKIE_NAME: 'mediconsent_token',
      MASTER_ENCRYPTION_KEY: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    },
  },
});

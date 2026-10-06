import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['background/**/*.js', 'content/**/*.js', 'popup/**/*.js'],
      // Two-line entry points that only call into tested modules with the real chrome global.
      exclude: ['background/service-worker.js', 'content/main.js', 'popup/main.js'],
      reporter: ['text', 'html'],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});

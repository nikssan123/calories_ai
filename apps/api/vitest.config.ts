import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/helpers/global-setup.ts'],
    setupFiles: ['./test/helpers/setup.ts'],
    // Every test shares one Postgres database and truncates between cases, so
    // they must not run concurrently. Correctness beats a faster suite here.
    fileParallelism: false,
    pool: 'forks',
    maxForks: 1,
    minForks: 1,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        // Process wiring: listen(), signal handlers, the log line at boot.
        // Nothing here is reachable without starting a real server.
        'src/index.ts',
      ],
      thresholds: {
        lines: 95,
        functions: 95,
        statements: 95,
        branches: 92,
      },
    },
  },
});

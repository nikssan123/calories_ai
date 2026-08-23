import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/helpers/global-setup.ts'],
    setupFiles: ['./test/helpers/setup.ts'],
    // Every test shares one Postgres database and truncates between cases, so
    // they must not run concurrently. Correctness beats a faster suite here.
    //
    // `fileParallelism: false` is the load-bearing one — it pins the worker
    // count to 1 by itself. `maxWorkers` says the same thing explicitly.
    //
    // It used to read `maxForks: 1, minForks: 1`. Vitest 4 renamed the first and
    // removed the second, so both keys sat here being silently ignored from the
    // upgrade until `tsconfig` was widened to cover this file. Nothing was
    // actually running in parallel — `fileParallelism` was carrying it alone —
    // but the config had stopped saying what it meant.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
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

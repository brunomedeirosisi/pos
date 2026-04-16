import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: [
        'src/routes/auth.ts',
        'src/routes/sales.ts',
        'src/routes/customers.ts',
        'src/routes/admin-backups.ts',
        'src/routes/admin-legacy-import.ts',
        'src/middleware/error-handler.ts',
      ],
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 60,
        statements: 70,
      },
    },
  },
});


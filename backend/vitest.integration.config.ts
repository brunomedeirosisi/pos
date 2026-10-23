import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/integration/**/*.test.ts'], setupFiles: ['test/support/environment.ts'], fileParallelism: false, testTimeout: 15000, hookTimeout: 30000 } });

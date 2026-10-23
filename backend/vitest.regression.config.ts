import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { include: ['test/regression/**/*.test.ts'], setupFiles: ['test/support/environment.ts'], fileParallelism: false } });

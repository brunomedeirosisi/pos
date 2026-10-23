import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: { include: ['src/**/*.test.ts', 'src/**/*.test.tsx'] },
  resolve: {
    extensions: ['.mjs', '.mts', '.ts', '.jsx', '.tsx', '.js', '.json'],
  },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 5173 }
})

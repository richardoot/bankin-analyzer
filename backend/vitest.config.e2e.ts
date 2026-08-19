import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Neutralises DATABASE_URL so nothing can reach a real server by accident.
    setupFiles: ['./test/e2e-setup.ts'],
    environment: 'node',
    // Each file starts its own database server and replays the migrations
    // into it, which takes a second or so before the first test runs.
    testTimeout: 30000,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  plugins: [swc.vite()],
})

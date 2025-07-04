import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [vue()],
  test: {
    // Environnement de test
    environment: 'happy-dom',

    // Setup files
    setupFiles: ['./src/test/setup.ts'],

    // Fichiers de test
    include: [
      'src/**/*.{test,spec}.{js,ts,vue}',
      'tests/**/*.{test,spec}.{js,ts,vue}',
    ],
    exclude: ['node_modules', 'dist', 'build', 'coverage', '.nuxt'],

    // Configuration du coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
        'coverage/**',
        'dist/**',
        '**/*.test.*',
        '**/*.spec.*',
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 80,
          statements: 80,
        },
      },
    },

    // Configuration UI
    ui: true,
    open: false,

    // Performance
    testTimeout: 10000,
    hookTimeout: 10000,

    // Reporters
    reporter: ['verbose', 'json', 'html'],
    outputFile: {
      json: './coverage/test-results.json',
      html: './coverage/test-results.html',
    },
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '~/': resolve(__dirname, 'src/'),
    },
  },
})

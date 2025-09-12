import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // Template compilation options
      template: {
        compilerOptions: {
          // Enable production optimizations
          hoistStatic: true,
          cacheHandlers: true,
        },
      },
      // Script setup optimizations
      script: {
        defineModel: true,
        propsDestructure: true,
      },
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },

  // Build optimizations
  build: {
    // Target modern browsers for better performance
    target: 'esnext',

    // Chunk size optimization
    chunkSizeWarningLimit: 600,

    // Rollup options for manual chunking
    rollupOptions: {
      output: {
        // Manual chunking for better caching
        manualChunks: {
          // Vendor chunks
          'vendor-vue': ['vue'],
          'vendor-pdf': ['jspdf', 'html2canvas'],

          // Component chunks
          charts: [
            './src/components/charts/BarChart.vue',
            './src/components/charts/PieChart.vue',
            './src/composables/useBarChart.ts',
            './src/composables/usePieChart.ts',
          ],

          // Reimbursement feature chunk
          reimbursement: [
            './src/components/reimbursement/ReimbursementManager.vue',
            './src/components/reimbursement/ExpensesReimbursementManager.vue',
            './src/components/reimbursement/ReimbursementCategoriesManager.vue',
            './src/components/reimbursement/ReimbursementStats.vue',
            './src/components/reimbursement/ReimbursementSummary.vue',
          ],
        },

        // Optimize asset filenames for caching
        chunkFileNames: chunkInfo => {
          const facadeModuleId = chunkInfo.facadeModuleId

          if (facadeModuleId) {
            if (facadeModuleId.includes('charts')) {
              return 'assets/charts-[hash].js'
            }
            if (facadeModuleId.includes('reimbursement')) {
              return 'assets/reimbursement-[hash].js'
            }
          }

          return 'assets/[name]-[hash].js'
        },

        // Optimize asset naming
        assetFileNames: assetInfo => {
          const info = assetInfo.name?.split('.') ?? []
          const extType = info[info.length - 1]

          if (/\.(png|jpe?g|gif|svg|webp|avif)$/.test(assetInfo.name ?? '')) {
            return 'assets/images/[name]-[hash][extname]'
          }

          if (/\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name ?? '')) {
            return 'assets/fonts/[name]-[hash][extname]'
          }

          return 'assets/[name]-[hash][extname]'
        },
      },

      // External dependencies optimization
      external: id => {
        // Don't externalize anything in production build
        return false
      },
    },

    // Source map optimization
    sourcemap: false,

    // Minification settings
    minify: 'esbuild',

    // CSS code splitting
    cssCodeSplit: true,

    // Asset inlining threshold
    assetsInlineLimit: 4096,
  },

  // Development server optimization
  server: {
    port: 5173,
    host: true,
    open: false,
  },

  // Preview server optimization
  preview: {
    port: 4173,
    host: true,
    open: false,
  },

  // Dependencies optimization
  optimizeDeps: {
    include: ['vue', 'jspdf', 'html2canvas'],
    exclude: [
      // Exclude test utilities from optimization
      '@testing-library/vue',
      '@vue/test-utils',
      'vitest',
      'happy-dom',
    ],
  },

  // CSS optimization
  css: {
    devSourcemap: false,
    preprocessorOptions: {
      css: {
        charset: false,
      },
    },
    // PostCSS optimizations would go here if using PostCSS
    // Enable CSS modules for better scoping if needed
    modules: false,
  },

  // Advanced build optimizations
  esbuild: {
    // Enable advanced minification in production
    legalComments: 'none',
    // Tree shaking for better bundle size
    treeShaking: true,
  },

  // Environment-specific optimizations
  define: {
    // Remove development code in production
    __DEV__: JSON.stringify(false),
    // Enable better tree shaking
    'process.env.NODE_ENV': JSON.stringify('production'),
  },

  // Worker support for potential background processing
  worker: {
    format: 'es',
    plugins: () => [],
  },
})

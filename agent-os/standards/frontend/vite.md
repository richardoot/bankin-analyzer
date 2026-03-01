# Vite

## Pourquoi cette pratique

Vite s'impose comme l'outil de build de référence en 2025 grâce à son architecture native ESM, son HMR ultra-rapide (<50ms) et son écosystème Rolldown/Oxc en Rust. Cette stack offre des builds 7x plus rapides qu'avec Webpack et améliore l'expérience développeur avec des démarrages quasi-instantanés et une intégration TypeScript native 20-30x plus performante qu'avec tsc.

## Configuration de base optimisée

### Configuration Vite 6.0 moderne

```typescript
// vite.config.ts
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  
  return {
    // Rolldown intégration (Vite 6+)
    experimental: {
      rolldown: true
    },
    
    plugins: [
      react({
        // SWC/Oxc pour performance maximale
        jsxRuntime: 'automatic',
        babel: false, // Désactiver Babel pour utiliser SWC
      }),
    ],
    
    // Résolution optimisée
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@types': resolve(__dirname, 'src/types'),
      },
    },
    
    // Variables d'environnement
    define: {
      __APP_VERSION__: JSON.stringify(process.env.npm_package_version),
      __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    },
  }
})
```

### Configuration avancée par environnement

```typescript
// Configuration conditionnelle par mode
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'
  const isDevelopment = mode === 'development'
  
  const config: UserConfig = {
    base: env.VITE_BASE_URL || '/',
    
    // Optimisation dev server
    server: isDevelopment ? {
      port: parseInt(env.VITE_PORT) || 3000,
      host: true,
      open: env.VITE_OPEN_BROWSER === 'true',
      
      // Warm up des fichiers critiques
      warmup: {
        clientFiles: [
          './src/App.tsx',
          './src/main.tsx',
          './src/components/Layout.tsx',
        ],
      },
      
      // Proxy API
      proxy: {
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:8000',
          changeOrigin: true,
          secure: false,
        },
      },
    } : undefined,
    
    // Build optimisé
    build: isProduction ? {
      target: 'esnext', // Cible navigateurs modernes
      sourcemap: env.VITE_SOURCEMAP === 'true',
      
      // Optimisation bundle
      rollupOptions: {
        output: {
          // Chunking stratégique
          manualChunks: {
            vendor: ['react', 'react-dom'],
            router: ['react-router-dom'],
            ui: ['@mui/material', '@emotion/react'],
          },
          
          // Nommage optimisé
          chunkFileNames: 'js/[name]-[hash].js',
          entryFileNames: 'js/[name]-[hash].js',
          assetFileNames: (assetInfo) => {
            const info = assetInfo.name?.split('.') || []
            const ext = info[info.length - 1]
            if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
              return `images/[name]-[hash][extname]`
            }
            if (/woff2?|eot|ttf|otf/i.test(ext)) {
              return `fonts/[name]-[hash][extname]`
            }
            return `assets/[name]-[hash][extname]`
          },
        },
        
        // Tree shaking agressif
        treeshake: {
          moduleSideEffects: false,
          propertyReadSideEffects: false,
          tryCatchDeoptimization: false,
        },
      },
      
      // Minification avancée
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log'],
        },
      },
    } : undefined,
  }
  
  return config
})
```

## Plugins essentiels 2025

### Stack plugins optimisée

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'
import { imageOptimization } from 'vite-plugin-image-optimizer'
import { compression } from 'vite-plugin-compression2'

export default defineConfig({
  plugins: [
    // React avec SWC
    react({
      jsxRuntime: 'automatic',
      babel: false,
    }),
    
    // PWA avec service worker
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,avif}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\./,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24, // 24h
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Mon App',
        short_name: 'App',
        description: 'Description de l\'application',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
    
    // Optimisation images
    imageOptimization({
      formats: ['webp', 'avif'],
      quality: 80,
      mozjpeg: { quality: 80 },
      webp: { quality: 80 },
      avif: { quality: 70 },
    }),
    
    // Compression Gzip/Brotli
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br)$ /, /\.(gz)$/],
    }),
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br)$ /, /\.(gz)$/],
    }),
    
    // Analyse bundle (production uniquement)
    process.env.ANALYZE && visualizer({
      filename: 'dist/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
      template: 'treemap',
    }),
  ],
})
```

### Plugins de développement

```typescript
// Configuration dev uniquement
const devPlugins = [
  // Mock API
  {
    name: 'mock-api',
    configureServer(server) {
      server.middlewares.use('/api', (req, res, next) => {
        if (req.url?.startsWith('/users')) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ users: [] }))
        } else {
          next()
        }
      })
    },
  },
  
  // Hot reload pour des fichiers custom
  {
    name: 'custom-hmr',
    handleHotUpdate(ctx) {
      if (ctx.file.endsWith('.md')) {
        ctx.server.ws.send({
          type: 'full-reload',
        })
        return []
      }
    },
  },
]
```

## Optimisation des dépendances

### Pre-bundling intelligent

```typescript
export default defineConfig({
  // Optimisation des dépendances
  optimizeDeps: {
    // Inclusion explicite de dépendances ESM
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      'lodash-es',
    ],
    
    // Exclusion des packages monorepo
    exclude: [
      '@my-org/shared-components',
      '@my-org/utils',
    ],
    
    // Force la re-bundling
    force: process.env.FORCE_REBUILD === 'true',
    
    // Configuration esbuild
    esbuildOptions: {
      target: 'esnext',
      define: {
        global: 'globalThis',
      },
    },
  },
  
  // Gestion SSR
  ssr: {
    // Optimisation côté serveur
    optimizeDeps: {
      include: ['react/jsx-runtime'],
    },
    // Exclusions SSR
    noExternal: ['@my-org/ui-kit'],
  },
})
```

### Configuration monorepo

```typescript
// Configuration pour monorepo avec pnpm workspaces
export default defineConfig({
  resolve: {
    // Préservation des symlinks
    preserveSymlinks: true,
    alias: {
      // Mapping direct pour développement
      '@my-org/ui-kit': resolve(__dirname, '../packages/ui-kit/src'),
      '@my-org/utils': resolve(__dirname, '../packages/utils/src'),
    },
  },
  
  server: {
    // Watch des packages externes
    watch: {
      ignored: ['!**/node_modules/@my-org/**'],
    },
    
    // File system routing pour monorepo
    fs: {
      allow: ['..'],
    },
  },
  
  optimizeDeps: {
    // Exclusion workspace packages
    exclude: ['@my-org/*'],
  },
})
```

## Variables d'environnement

### Structure fichiers .env

```bash
# .env (base pour tous les environnements)
VITE_APP_NAME="Mon Application"
VITE_APP_VERSION="1.0.0"

# .env.local (local uniquement, ignoré par git)
VITE_API_KEY="dev-api-key-secret"
VITE_DEBUG_MODE="true"

# .env.development
VITE_API_URL="http://localhost:8000"
VITE_ENABLE_DEVTOOLS="true"
VITE_LOG_LEVEL="debug"

# .env.staging
VITE_API_URL="https://api-staging.example.com"
VITE_ENABLE_DEVTOOLS="false"
VITE_LOG_LEVEL="info"

# .env.production
VITE_API_URL="https://api.example.com"
VITE_ENABLE_DEVTOOLS="false"
VITE_LOG_LEVEL="error"
VITE_SENTRY_DSN="https://..."
```

### Configuration TypeScript pour env

```typescript
// env.d.ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME: string
  readonly VITE_APP_VERSION: string
  readonly VITE_API_URL: string
  readonly VITE_API_KEY: string
  readonly VITE_ENABLE_DEVTOOLS: string
  readonly VITE_LOG_LEVEL: 'debug' | 'info' | 'warn' | 'error'
  readonly VITE_SENTRY_DSN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

### Utilitaires de configuration

```typescript
// src/config/env.ts
export const config = {
  app: {
    name: import.meta.env.VITE_APP_NAME,
    version: import.meta.env.VITE_APP_VERSION,
  },
  api: {
    url: import.meta.env.VITE_API_URL,
    key: import.meta.env.VITE_API_KEY,
  },
  features: {
    devtools: import.meta.env.VITE_ENABLE_DEVTOOLS === 'true',
    logLevel: import.meta.env.VITE_LOG_LEVEL as LogLevel,
  },
  sentry: {
    dsn: import.meta.env.VITE_SENTRY_DSN,
  },
} as const

// Validation au runtime
function validateEnv() {
  const required = ['VITE_APP_NAME', 'VITE_API_URL']
  const missing = required.filter(key => !import.meta.env[key])
  
  if (missing.length > 0) {
    throw new Error(`Variables d'environnement manquantes: ${missing.join(', ')}`)
  }
}

if (import.meta.env.DEV) {
  validateEnv()
}
```

## Performance et optimisation build

### Tree shaking avancé

```typescript
export default defineConfig({
  build: {
    rollupOptions: {
      // Tree shaking agressif
      treeshake: {
        moduleSideEffects: (id) => {
          // Préserver les side effects pour les CSS
          return id.includes('.css')
        },
        propertyReadSideEffects: false,
        tryCatchDeoptimization: false,
      },
      
      // Optimisation des chunks
      output: {
        experimentalMinChunkSize: 20000,
        manualChunks: (id) => {
          // Vendor chunks
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom')) {
              return 'react-vendor'
            }
            if (id.includes('@mui') || id.includes('@emotion')) {
              return 'ui-vendor'
            }
            if (id.includes('lodash') || id.includes('date-fns')) {
              return 'utils-vendor'
            }
            return 'vendor'
          }
          
          // Feature chunks
          if (id.includes('src/features/auth')) {
            return 'auth'
          }
          if (id.includes('src/features/dashboard')) {
            return 'dashboard'
          }
        },
      },
    },
    
    // CSS code splitting
    cssCodeSplit: true,
    
    // Assets inlining threshold
    assetsInlineLimit: 4096,
    
    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info'],
        remove_unused: true,
      },
      mangle: {
        safari10: true,
      },
    },
  },
})
```

### Lazy loading et code splitting

```typescript
// Router avec lazy loading
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingSpinner } from './components/LoadingSpinner'

// Lazy loading des pages
const Home = lazy(() => import('./pages/Home'))
const Dashboard = lazy(() => 
  import('./pages/Dashboard').then(module => ({
    default: module.Dashboard
  }))
)
const Profile = lazy(() => 
  import('./pages/Profile')
    .then(module => ({ default: module.Profile }))
)

// Preload conditionnel
const preloadDashboard = () => import('./pages/Dashboard')

export function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <Suspense fallback={<LoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route 
              path="/dashboard" 
              element={<Dashboard />}
              onMouseEnter={preloadDashboard} // Preload au hover
            />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </BrowserRouter>
  )
}
```

## Testing et debugging

### Configuration test avec Vitest

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    
    // Coverage
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.*',
      ],
    },
    
    // Mock automatique
    deps: {
      inline: ['@my-org/ui-kit'],
    },
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
```

### Scripts package.json optimisés

```json
{
  "scripts": {
    "dev": "vite",
    "dev:host": "vite --host",
    "dev:debug": "DEBUG=vite:* vite",
    
    "build": "tsc && vite build",
    "build:analyze": "ANALYZE=true vite build",
    "build:staging": "vite build --mode staging",
    
    "preview": "vite preview",
    "preview:dist": "vite preview --port 4173",
    
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    
    "lint": "eslint . --ext ts,tsx --report-unused-disable-directives --max-warnings 0",
    "lint:fix": "eslint . --ext ts,tsx --fix",
    
    "type-check": "tsc --noEmit",
    "format": "prettier --write src",
    
    "clean": "rm -rf dist node_modules/.vite",
    "reset": "npm run clean && npm install"
  }
}
```

Cette configuration Vite 2025 optimise les performances de développement et de production tout en maintenant une excellente DX avec des builds ultra-rapides et un HMR quasi-instantané.
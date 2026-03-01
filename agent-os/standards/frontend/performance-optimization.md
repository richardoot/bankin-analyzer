# Frontend Performance Optimization Standards

## Core Web Vitals Optimization

**Optimize Largest Contentful Paint (LCP) for fast loading.**  
Implement strategies to achieve LCP under 2.5 seconds by optimizing critical resources and rendering paths.  

*Why?* LCP directly impacts user experience and SEO rankings, with sub-2.5s loading being essential for user retention.

**Example:**
```vue
<!-- ✅ Optimized image loading for LCP -->
<template>
  <div class="hero-section">
    <!-- Priority hints for critical images -->
    <img
      :src="heroImage.src"
      :alt="heroImage.alt"
      :width="heroImage.width"
      :height="heroImage.height"
      fetchpriority="high"
      decoding="async"
      class="hero-image"
      @load="onHeroImageLoad"
    />
    
    <!-- Preload critical resources -->
    <link
      v-for="font in criticalFonts"
      :key="font.url"
      rel="preload"
      :href="font.url"
      as="font"
      type="font/woff2"
      crossorigin
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

interface HeroImage {
  src: string
  alt: string
  width: number
  height: number
}

const heroImage = ref<HeroImage>({
  src: '/images/hero-optimized.webp',
  alt: 'Hero banner showing our main product',
  width: 1200,
  height: 600
})

const criticalFonts = [
  { url: '/fonts/inter-variable.woff2' },
  { url: '/fonts/inter-bold.woff2' }
]

const onHeroImageLoad = () => {
  // Mark LCP element as loaded for analytics
  performance.mark('hero-image-loaded')
}

// Preload critical resources
onMounted(() => {
  // Preload next route's critical resources
  const router = useRouter()
  router.prefetch('/products')
  
  // Preload critical API data
  prefetchCriticalData()
})

const prefetchCriticalData = async () => {
  try {
    // Preload data that will be needed immediately
    await Promise.all([
      useFetch('/api/featured-products', { server: false }),
      useFetch('/api/user-preferences', { server: false })
    ])
  } catch (error) {
    console.warn('Prefetch failed:', error)
  }
}
</script>

<style>
/* Optimize CSS for LCP */
.hero-image {
  /* Prevent layout shift */
  aspect-ratio: 2 / 1;
  width: 100%;
  height: auto;
  
  /* Optimize rendering */
  content-visibility: auto;
  contain: layout style paint;
  
  /* Critical CSS inlined */
  display: block;
  object-fit: cover;
}

/* Font loading optimization */
@font-face {
  font-family: 'Inter Variable';
  src: url('/fonts/inter-variable.woff2') format('woff2-variations');
  font-weight: 100 900;
  font-style: normal;
  font-display: swap;
}
</style>
```

**Minimize Cumulative Layout Shift (CLS) with stable layouts.**  
Prevent layout shifts by reserving space for dynamic content and using stable loading patterns.  

*Why?* CLS under 0.1 prevents user frustration from jumping content and improves usability scores.

**Example:**
```vue
<template>
  <div class="product-grid">
    <!-- Fixed aspect ratio containers prevent layout shift -->
    <div
      v-for="product in products"
      :key="product.id"
      class="product-card"
    >
      <!-- Image with reserved space -->
      <div class="image-container">
        <img
          v-if="product.image"
          :src="product.image.src"
          :alt="product.image.alt"
          :width="product.image.width"
          :height="product.image.height"
          class="product-image"
          loading="lazy"
          decoding="async"
        />
        <div v-else class="image-placeholder">
          <!-- Skeleton with exact dimensions -->
        </div>
      </div>
      
      <!-- Text content with consistent heights -->
      <div class="product-info">
        <h3 class="product-title" :class="{ skeleton: !product.title }">
          {{ product.title || '' }}
        </h3>
        <p class="product-price" :class="{ skeleton: !product.price }">
          {{ product.price ? formatPrice(product.price) : '' }}
        </p>
        
        <!-- Button with fixed dimensions -->
        <button 
          class="add-to-cart-btn"
          :disabled="!product.available"
          @click="addToCart(product)"
        >
          Add to Cart
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
interface Product {
  id: string
  title?: string
  price?: number
  image?: {
    src: string
    alt: string
    width: number
    height: number
  }
  available: boolean
}

const products = ref<Product[]>([])

// Load products progressively to prevent layout shift
const { data: productsData, pending } = await useFetch('/api/products')

watchEffect(() => {
  if (productsData.value) {
    // Add products gradually to prevent CLS
    products.value = productsData.value
  } else {
    // Show skeleton items with exact same dimensions
    products.value = Array(12).fill(null).map((_, index) => ({
      id: `skeleton-${index}`,
      available: false
    }))
  }
})

const formatPrice = (price: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(price)
}
</script>

<style>
.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 1.5rem;
  padding: 1rem;
}

.product-card {
  /* Fixed aspect ratio prevents layout shift */
  display: flex;
  flex-direction: column;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  
  /* Contain layout changes */
  contain: layout style;
}

.image-container {
  /* Fixed aspect ratio container */
  aspect-ratio: 4 / 3;
  position: relative;
  overflow: hidden;
  background-color: #f3f4f6;
}

.product-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  
  /* Optimize rendering */
  will-change: auto;
}

.image-placeholder {
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.product-info {
  padding: 1rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  
  /* Minimum height prevents layout shift */
  min-height: 120px;
}

.product-title {
  /* Fixed height prevents text reflow issues */
  height: 2.5rem;
  line-height: 1.25rem;
  margin-bottom: 0.5rem;
  font-weight: 600;
  
  /* Prevent text overflow layout shift */
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-price {
  height: 1.5rem;
  margin-bottom: 1rem;
  font-size: 1.125rem;
  font-weight: 700;
  color: #059669;
}

.add-to-cart-btn {
  /* Fixed button dimensions */
  height: 2.5rem;
  width: 100%;
  margin-top: auto;
  
  background-color: #3b82f6;
  color: white;
  border: none;
  border-radius: 4px;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.2s;
}

.add-to-cart-btn:hover:not(:disabled) {
  background-color: #2563eb;
}

.add-to-cart-btn:disabled {
  background-color: #9ca3af;
  cursor: not-allowed;
}

/* Skeleton loading states */
.skeleton {
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
  color: transparent;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Reduce motion for accessibility */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none;
    background: #f0f0f0;
  }
}
</style>
```

## Bundle Optimization & Code Splitting

**Implement strategic code splitting for optimal loading.**  
Use route-level and component-level code splitting to minimize initial bundle size and improve loading performance.  

*Why?* Reduces initial bundle size by 60-80% and enables faster first page loads.

**Example:**
```typescript
// ✅ Advanced code splitting with Vite
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        // Strategic chunk splitting
        manualChunks: {
          // Vendor chunks
          'vue-vendor': ['vue', 'vue-router', 'pinia'],
          'ui-vendor': ['@headlessui/vue', '@heroicons/vue'],
          'utils-vendor': ['lodash-es', 'date-fns'],
          
          // Feature-based chunks
          'admin': ['src/pages/admin/**'],
          'auth': ['src/pages/auth/**'],
          'dashboard': ['src/pages/dashboard/**']
        },
        
        // Dynamic chunk naming
        chunkFileNames: (chunkInfo) => {
          const facadeModuleId = chunkInfo.facadeModuleId
          if (facadeModuleId) {
            if (facadeModuleId.includes('pages/')) {
              return 'pages/[name]-[hash].js'
            }
            if (facadeModuleId.includes('components/')) {
              return 'components/[name]-[hash].js'
            }
          }
          return 'chunks/[name]-[hash].js'
        }
      }
    },
    
    // Enable advanced minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info']
      }
    }
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: ['vue', 'vue-router', 'pinia'],
    exclude: ['@vueuse/core'] // Large library, load on demand
  }
})

// ✅ Smart component lazy loading
// router/index.ts
import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    component: () => import('@/layouts/DefaultLayout.vue'),
    children: [
      {
        path: '',
        name: 'Home',
        component: () => import('@/pages/HomePage.vue')
      },
      {
        path: '/dashboard',
        name: 'Dashboard',
        component: () => import('@/pages/DashboardPage.vue'),
        meta: { requiresAuth: true }
      }
    ]
  },
  
  // Heavy admin section - separate chunk
  {
    path: '/admin',
    component: () => import('@/layouts/AdminLayout.vue'),
    children: [
      {
        path: '',
        name: 'AdminDashboard',
        component: () => import('@/pages/admin/AdminDashboard.vue')
      },
      {
        path: 'users',
        name: 'AdminUsers',
        component: () => import('@/pages/admin/AdminUsers.vue')
      }
    ],
    meta: { requiresAdmin: true }
  }
]

export const router = createRouter({
  history: createWebHistory(),
  routes
})

// ✅ Dynamic component loading with error boundaries
// components/DynamicComponentLoader.vue
<template>
  <Suspense>
    <template #default>
      <component :is="dynamicComponent" v-bind="componentProps" />
    </template>
    
    <template #fallback>
      <div class="loading-container">
        <div class="spinner"></div>
        <p>Loading component...</p>
      </div>
    </template>
  </Suspense>
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'

interface Props {
  componentName: string
  componentProps?: Record<string, any>
}

const props = defineProps<Props>()

// Component loading with error handling
const dynamicComponent = defineAsyncComponent({
  loader: () => {
    // Dynamic import based on component name
    return import(`@/components/${props.componentName}.vue`)
  },
  
  // Loading component
  loadingComponent: {
    template: '<div class="component-loading">Loading...</div>'
  },
  
  // Error component
  errorComponent: {
    template: `
      <div class="component-error">
        <p>Failed to load component</p>
        <button @click="$emit('retry')">Retry</button>
      </div>
    `
  },
  
  // Delay before showing loading component
  delay: 200,
  
  // Timeout for loading
  timeout: 10000
})
</script>

// ✅ Feature-based dynamic imports
// composables/useDynamicFeatures.ts
export function useDynamicFeatures() {
  const loadedFeatures = new Set<string>()
  
  const loadFeature = async (featureName: string) => {
    if (loadedFeatures.has(featureName)) {
      return
    }
    
    try {
      switch (featureName) {
        case 'charts':
          const { Chart } = await import('chart.js/auto')
          window.Chart = Chart
          break
          
        case 'richTextEditor':
          await import('@/components/RichTextEditor.vue')
          break
          
        case 'analytics':
          await import('@/modules/analytics')
          break
          
        default:
          console.warn(`Unknown feature: ${featureName}`)
          return
      }
      
      loadedFeatures.add(featureName)
      console.log(`Feature loaded: ${featureName}`)
    } catch (error) {
      console.error(`Failed to load feature ${featureName}:`, error)
    }
  }
  
  const preloadFeature = (featureName: string) => {
    // Use requestIdleCallback for non-critical preloading
    if ('requestIdleCallback' in window) {
      requestIdleCallback(() => loadFeature(featureName))
    } else {
      setTimeout(() => loadFeature(featureName), 1000)
    }
  }
  
  return {
    loadFeature,
    preloadFeature,
    isFeatureLoaded: (featureName: string) => loadedFeatures.has(featureName)
  }
}
```

**Optimize assets and implement efficient caching.**  
Configure asset optimization, compression, and intelligent caching strategies for maximum performance.  

*Why?* Reduces asset load times by 70-90% and improves repeat visit performance significantly.

**Example:**
```typescript
// ✅ Asset optimization configuration
// vite.config.ts
export default defineConfig({
  plugins: [
    vue(),
    
    // Image optimization plugin
    {
      name: 'image-optimization',
      generateBundle(options, bundle) {
        // Generate multiple image formats and sizes
        Object.keys(bundle).forEach(async (fileName) => {
          if (fileName.match(/\.(jpg|jpeg|png)$/)) {
            // Generate WebP versions
            // Generate different sizes for responsive images
          }
        })
      }
    }
  ],
  
  build: {
    // Asset optimization
    assetsInlineLimit: 4096, // Inline small assets
    cssCodeSplit: true,      // Split CSS by routes
    
    rollupOptions: {
      output: {
        // Optimize asset file names for caching
        assetFileNames: (assetInfo) => {
          const extType = assetInfo.name.split('.').pop()
          
          // Different directories for different asset types
          if (/\.(png|jpe?g|svg|gif|webp|avif)$/.test(assetInfo.name)) {
            return `images/[name]-[hash][extname]`
          }
          if (/\.(woff2?|eot|ttf|otf)$/.test(assetInfo.name)) {
            return `fonts/[name]-[hash][extname]`
          }
          if (extType === 'css') {
            return `styles/[name]-[hash][extname]`
          }
          
          return `assets/[name]-[hash][extname]`
        }
      }
    }
  }
})

// ✅ Service Worker for caching
// public/sw.js
const CACHE_NAME = 'app-cache-v1'
const STATIC_CACHE_NAME = 'static-cache-v1'

// Assets to cache immediately
const STATIC_ASSETS = [
  '/',
  '/offline.html',
  '/fonts/inter-variable.woff2',
  '/images/logo.svg'
]

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  )
})

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)
  
  // Different strategies for different types of requests
  if (request.destination === 'image') {
    // Images: Cache first, network fallback
    event.respondWith(cacheFirst(request))
  } else if (url.pathname.startsWith('/api/')) {
    // API: Network first, cache fallback
    event.respondWith(networkFirst(request))
  } else if (request.destination === 'document') {
    // HTML: Stale while revalidate
    event.respondWith(staleWhileRevalidate(request))
  } else {
    // Static assets: Cache first
    event.respondWith(cacheFirst(request))
  }
})

async function cacheFirst(request) {
  const cachedResponse = await caches.match(request)
  if (cachedResponse) {
    return cachedResponse
  }
  
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    // Return offline page for navigation requests
    if (request.destination === 'document') {
      return caches.match('/offline.html')
    }
    throw error
  }
}

async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request)
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME)
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  } catch (error) {
    const cachedResponse = await caches.match(request)
    if (cachedResponse) {
      return cachedResponse
    }
    throw error
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME)
  const cachedResponse = await cache.match(request)
  
  const networkResponsePromise = fetch(request).then((networkResponse) => {
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone())
    }
    return networkResponse
  }).catch(() => cachedResponse)
  
  return cachedResponse || networkResponsePromise
}

// ✅ Image optimization component
// components/OptimizedImage.vue
<template>
  <picture class="optimized-image">
    <!-- Modern formats for supported browsers -->
    <source
      v-if="sources.avif"
      :srcset="sources.avif"
      type="image/avif"
    />
    <source
      v-if="sources.webp"
      :srcset="sources.webp"
      type="image/webp"
    />
    
    <!-- Fallback image -->
    <img
      :src="fallbackSrc"
      :alt="alt"
      :width="width"
      :height="height"
      :loading="loading"
      :decoding="decoding"
      :class="imageClasses"
      @load="onLoad"
      @error="onError"
    />
  </picture>
</template>

<script setup lang="ts">
interface Props {
  src: string
  alt: string
  width?: number
  height?: number
  sizes?: string
  loading?: 'lazy' | 'eager'
  decoding?: 'async' | 'auto' | 'sync'
  quality?: number
  format?: 'webp' | 'avif' | 'original'
}

const props = withDefaults(defineProps<Props>(), {
  loading: 'lazy',
  decoding: 'async',
  quality: 85,
  format: 'webp'
})

const sources = computed(() => {
  const baseSrc = props.src.replace(/\.[^.]+$/, '')
  const sizes = props.sizes || `${props.width}px`
  
  return {
    avif: props.format === 'avif' ? `${baseSrc}.avif ${props.width}w` : null,
    webp: ['webp', 'avif'].includes(props.format) ? `${baseSrc}.webp ${props.width}w` : null
  }
})

const fallbackSrc = computed(() => {
  if (props.quality !== 85) {
    return `${props.src}?quality=${props.quality}`
  }
  return props.src
})

const imageClasses = computed(() => [
  'block',
  'max-w-full',
  'h-auto',
  {
    'opacity-0 transition-opacity duration-300': !loaded.value,
    'opacity-100': loaded.value
  }
])

const loaded = ref(false)

const onLoad = () => {
  loaded.value = true
  // Report successful load for LCP tracking
  if (props.loading === 'eager') {
    performance.mark('critical-image-loaded')
  }
}

const onError = () => {
  console.warn(`Failed to load image: ${props.src}`)
}
</script>
```

## Vue.js Specific Optimizations

**Use Vue 3 performance features effectively.**  
Leverage v-memo, Suspense, and KeepAlive for optimal component performance and user experience.  

*Why?* These Vue 3 features can improve rendering performance by 30-50% in the right scenarios.

**Example:**
```vue
<!-- ✅ v-memo for expensive list items -->
<template>
  <div class="dashboard">
    <!-- Expensive chart component with v-memo -->
    <div
      v-for="chart in charts"
      :key="chart.id"
      v-memo="[chart.data, chart.config, chart.lastUpdate]"
      class="chart-container"
    >
      <ExpensiveChart
        :data="chart.data"
        :config="chart.config"
        :last-update="chart.lastUpdate"
      />
    </div>
    
    <!-- Large list with v-memo -->
    <div class="user-list">
      <div
        v-for="user in users"
        :key="user.id"
        v-memo="[user.name, user.status, user.lastSeen]"
        class="user-item"
      >
        <UserCard :user="user" />
      </div>
    </div>
    
    <!-- Suspense for async components -->
    <Suspense>
      <template #default>
        <AsyncAnalytics :date-range="selectedDateRange" />
      </template>
      
      <template #fallback>
        <div class="analytics-skeleton">
          <SkeletonChart />
          <SkeletonTable />
        </div>
      </template>
    </Suspense>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

// ✅ Efficient data management
const users = ref<User[]>([])
const charts = ref<ChartData[]>([])
const selectedDateRange = ref<DateRange>({
  start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  end: new Date()
})

// Only update when necessary
const memoizedUsers = computed(() => {
  return users.value.map(user => ({
    id: user.id,
    name: user.name,
    status: user.status,
    lastSeen: user.lastSeen
  }))
})

// Lazy load heavy components
const AsyncAnalytics = defineAsyncComponent({
  loader: () => import('@/components/AnalyticsDashboard.vue'),
  delay: 200,
  timeout: 10000
})
</script>

<!-- ✅ KeepAlive for route caching -->
<!-- App.vue -->
<template>
  <div id="app">
    <RouterView v-slot="{ Component, route }">
      <Transition name="page" mode="out-in">
        <KeepAlive :include="cachedRoutes" :max="5">
          <component :is="Component" :key="route.path" />
        </KeepAlive>
      </Transition>
    </RouterView>
  </div>
</template>

<script setup lang="ts">
// Cache expensive routes
const cachedRoutes = ['Dashboard', 'UserList', 'Analytics']
</script>

<style>
/* Smooth page transitions */
.page-enter-active,
.page-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.page-enter-from {
  opacity: 0;
  transform: translateX(20px);
}

.page-leave-to {
  opacity: 0;
  transform: translateX(-20px);
}
</style>

<!-- ✅ Optimized component with composables -->
<script setup lang="ts">
import { useVirtualizer } from '@tanstack/vue-virtual'

// Virtual scrolling for large lists
function useLargeList(items: Ref<any[]>) {
  const containerRef = ref<HTMLElement>()
  
  const virtualizer = useVirtualizer({
    count: () => items.value.length,
    getScrollElement: () => containerRef.value,
    estimateSize: () => 50,
    overscan: 5
  })
  
  const virtualItems = computed(() => virtualizer.value.getVirtualItems())
  
  return {
    containerRef,
    virtualItems,
    totalSize: computed(() => virtualizer.value.getTotalSize())
  }
}

// Performance monitoring composable
function usePerformanceMonitoring() {
  const metrics = ref({
    renderTime: 0,
    componentCount: 0,
    memoryUsage: 0
  })
  
  const measureRender = (name: string, fn: Function) => {
    const start = performance.now()
    const result = fn()
    const end = performance.now()
    
    metrics.value.renderTime = end - start
    console.log(`${name} render time: ${end - start}ms`)
    
    return result
  }
  
  const trackMemoryUsage = () => {
    if ('memory' in performance) {
      metrics.value.memoryUsage = (performance as any).memory.usedJSHeapSize
    }
  }
  
  onMounted(() => {
    // Track memory usage periodically
    const interval = setInterval(trackMemoryUsage, 10000)
    
    onUnmounted(() => {
      clearInterval(interval)
    })
  })
  
  return {
    metrics: readonly(metrics),
    measureRender,
    trackMemoryUsage
  }
}

// Usage in component
const { metrics, measureRender } = usePerformanceMonitoring()
const expensiveData = ref([])

const processExpensiveData = () => {
  return measureRender('expensive-calculation', () => {
    // Expensive computation
    return expensiveData.value.map(item => 
      heavyTransformation(item)
    )
  })
}
</script>
```

## Runtime Performance Monitoring

**Implement client-side performance monitoring.**  
Track real user performance metrics and identify bottlenecks in production applications.  

*Why?* Provides insights into actual user experience and helps identify performance regressions early.

**Example:**
```typescript
// ✅ Performance monitoring service
// services/performanceMonitoring.ts
export class PerformanceMonitoringService {
  private observer: PerformanceObserver | null = null
  private metrics: Map<string, number[]> = new Map()
  
  constructor() {
    this.initializeObserver()
    this.trackVitals()
  }
  
  private initializeObserver() {
    if (!('PerformanceObserver' in window)) return
    
    this.observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.processPerformanceEntry(entry)
      }
    })
    
    // Observe different types of performance entries
    try {
      this.observer.observe({ entryTypes: ['measure', 'navigation', 'resource', 'paint'] })
    } catch (error) {
      console.warn('Performance observer not supported:', error)
    }
  }
  
  private processPerformanceEntry(entry: PerformanceEntry) {
    switch (entry.entryType) {
      case 'navigation':
        this.trackNavigationTiming(entry as PerformanceNavigationTiming)
        break
      case 'paint':
        this.trackPaintTiming(entry)
        break
      case 'resource':
        this.trackResourceTiming(entry as PerformanceResourceTiming)
        break
      case 'measure':
        this.trackCustomMeasure(entry)
        break
    }
  }
  
  private trackNavigationTiming(entry: PerformanceNavigationTiming) {
    const metrics = {
      dns: entry.domainLookupEnd - entry.domainLookupStart,
      tcp: entry.connectEnd - entry.connectStart,
      request: entry.responseStart - entry.requestStart,
      response: entry.responseEnd - entry.responseStart,
      dom: entry.domContentLoadedEventEnd - entry.responseEnd,
      load: entry.loadEventEnd - entry.loadEventStart
    }
    
    // Send to analytics
    this.sendMetrics('navigation', metrics)
  }
  
  private trackPaintTiming(entry: PerformanceEntry) {
    if (entry.name === 'first-contentful-paint') {
      this.recordMetric('fcp', entry.startTime)
    }
    if (entry.name === 'largest-contentful-paint') {
      this.recordMetric('lcp', entry.startTime)
    }
  }
  
  private trackResourceTiming(entry: PerformanceResourceTiming) {
    const duration = entry.responseEnd - entry.startTime
    const resourceType = this.getResourceType(entry.name)
    
    this.recordMetric(`resource-${resourceType}`, duration)
    
    // Track slow resources
    if (duration > 1000) {
      this.sendSlowResourceAlert(entry.name, duration)
    }
  }
  
  public trackVitals() {
    // Core Web Vitals tracking
    this.trackLCP()
    this.trackFID()
    this.trackCLS()
  }
  
  private trackLCP() {
    if (!('PerformanceObserver' in window)) return
    
    const observer = new PerformanceObserver((list) => {
      const entries = list.getEntries()
      const lastEntry = entries[entries.length - 1]
      
      this.recordMetric('lcp', lastEntry.startTime)
    })
    
    observer.observe({ entryTypes: ['largest-contentful-paint'] })
  }
  
  private trackFID() {
    if (!('PerformanceObserver' in window)) return
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.recordMetric('fid', (entry as any).processingStart - entry.startTime)
      }
    })
    
    observer.observe({ entryTypes: ['first-input'] })
  }
  
  private trackCLS() {
    if (!('PerformanceObserver' in window)) return
    
    let clsValue = 0
    
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value
        }
      }
      
      this.recordMetric('cls', clsValue)
    })
    
    observer.observe({ entryTypes: ['layout-shift'] })
  }
  
  public trackCustomMetric(name: string, value: number) {
    this.recordMetric(name, value)
    performance.mark(`custom-${name}`)
  }
  
  public trackUserInteraction(action: string, element: string) {
    const start = performance.now()
    
    return () => {
      const duration = performance.now() - start
      this.recordMetric(`interaction-${action}`, duration)
      
      // Track slow interactions
      if (duration > 100) {
        this.sendSlowInteractionAlert(action, element, duration)
      }
    }
  }
  
  private recordMetric(name: string, value: number) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, [])
    }
    
    const values = this.metrics.get(name)!
    values.push(value)
    
    // Keep only last 100 values
    if (values.length > 100) {
      values.shift()
    }
  }
  
  public getMetricStats(name: string) {
    const values = this.metrics.get(name) || []
    if (values.length === 0) return null
    
    const sorted = [...values].sort((a, b) => a - b)
    
    return {
      count: values.length,
      min: sorted[0],
      max: sorted[sorted.length - 1],
      mean: values.reduce((sum, val) => sum + val, 0) / values.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)]
    }
  }
  
  private sendMetrics(type: string, data: any) {
    // Send to your analytics service
    if (typeof window.gtag !== 'undefined') {
      window.gtag('event', 'performance_metric', {
        metric_type: type,
        metric_data: data
      })
    }
  }
  
  private getResourceType(url: string): string {
    if (url.match(/\.(css)$/)) return 'css'
    if (url.match(/\.(js)$/)) return 'javascript'
    if (url.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return 'image'
    if (url.match(/\.(woff|woff2|eot|ttf)$/)) return 'font'
    return 'other'
  }
}

// ✅ Vue composable for performance tracking
// composables/usePerformanceTracking.ts
export function usePerformanceTracking() {
  const performanceService = new PerformanceMonitoringService()
  
  const trackComponentRender = (componentName: string) => {
    const startTime = performance.now()
    
    onMounted(() => {
      const renderTime = performance.now() - startTime
      performanceService.trackCustomMetric(`component-render-${componentName}`, renderTime)
    })
  }
  
  const trackAsyncOperation = async <T>(
    name: string,
    operation: () => Promise<T>
  ): Promise<T> => {
    const start = performance.now()
    
    try {
      const result = await operation()
      const duration = performance.now() - start
      performanceService.trackCustomMetric(`async-${name}`, duration)
      return result
    } catch (error) {
      const duration = performance.now() - start
      performanceService.trackCustomMetric(`async-${name}-error`, duration)
      throw error
    }
  }
  
  const trackUserAction = (action: string, element: string) => {
    return performanceService.trackUserInteraction(action, element)
  }
  
  return {
    trackComponentRender,
    trackAsyncOperation,
    trackUserAction,
    getMetrics: () => performanceService.getMetricStats,
    trackCustomMetric: performanceService.trackCustomMetric.bind(performanceService)
  }
}

// ✅ Usage in Vue component
<script setup lang="ts">
const { trackComponentRender, trackAsyncOperation, trackUserAction } = usePerformanceTracking()

// Track component render time
trackComponentRender('ProductList')

const handleProductClick = (product: Product) => {
  const endTracking = trackUserAction('product-click', `product-${product.id}`)
  
  // Perform action
  navigateToProduct(product.id)
  
  // End tracking
  endTracking()
}

const loadProducts = async () => {
  return trackAsyncOperation('load-products', async () => {
    const response = await fetch('/api/products')
    return response.json()
  })
}
</script>
```
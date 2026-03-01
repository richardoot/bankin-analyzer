# Tailwind CSS Development Standards

## Configuration & Setup

**Use Tailwind CSS v4 with CSS-first configuration.**  
Configure Tailwind using CSS imports and @config directives instead of JavaScript configuration files.  

*Why?* CSS-first configuration provides better IDE support, faster builds with the Oxide engine, and eliminates build-time JavaScript execution.

**Example:**
```css
/* app.css */
@import "tailwindcss";

@config {
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff6ff',
          500: '#3b82f6',
          900: '#1e3a8a'
        }
      },
      fontFamily: {
        sans: ['Inter Variable', 'system-ui', 'sans-serif']
      }
    }
  }
}

@layer base {
  :root {
    --color-background: theme(colors.white);
    --color-foreground: theme(colors.gray.950);
  }
  
  [data-theme="dark"] {
    --color-background: theme(colors.gray.950);
    --color-foreground: theme(colors.gray.50);
  }
}
```

**Optimize build performance with Oxide engine features.**  
Leverage Tailwind v4's microsecond incremental builds and automatic JIT compilation.  

*Why?* Provides up to 5x faster builds and eliminates the need for manual JIT configuration.

**Example:**
```javascript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  css: {
    postcss: {
      plugins: [
        require('@tailwindcss/postcss')
      ]
    }
  },
  build: {
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        assetFileNames: 'assets/[name].[hash][extname]'
      }
    }
  }
})
```

## Component Composition Strategies

**Use component-first architecture with Tailwind classes.**  
Build reusable Vue components that encapsulate Tailwind utilities while maintaining composability.  

*Why?* Combines the power of utility-first CSS with Vue's component system for maximum reusability and maintainability.

**Example:**
```vue
<!-- BaseButton.vue -->
<template>
  <button
    :class="buttonClasses"
    :disabled="disabled"
    @click="$emit('click', $event)"
  >
    <slot />
  </button>
</template>

<script setup lang="ts">
interface Props {
  variant?: 'primary' | 'secondary' | 'destructive'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
}

const { variant = 'primary', size = 'md', disabled = false } = defineProps<Props>()

const buttonClasses = computed(() => [
  // Base styles
  'inline-flex items-center justify-center font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  
  // Size variants
  {
    'h-8 px-3 text-sm': size === 'sm',
    'h-10 px-4 text-sm': size === 'md',
    'h-12 px-6 text-base': size === 'lg'
  },
  
  // Color variants
  {
    'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'primary',
    'border border-input bg-background hover:bg-accent hover:text-accent-foreground': variant === 'secondary',
    'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive'
  }
])

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>
```

**Use @apply strategically for complex component patterns.**  
Apply @apply directive only for genuinely reusable component patterns, not for "cleaner" HTML.  

*Why?* Maintains the benefits of utility-first while creating truly reusable patterns without losing Tailwind's debugging advantages.

**Example:**
```vue
<template>
  <div class="form-group">
    <label :for="id" class="form-label">{{ label }}</label>
    <input 
      :id="id"
      v-model="model"
      :type="type"
      :class="inputClasses"
      :placeholder="placeholder"
    />
    <p v-if="error" class="form-error">{{ error }}</p>
  </div>
</template>

<script setup lang="ts">
interface Props {
  id: string
  label: string
  type?: string
  placeholder?: string
  error?: string
  modelValue: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text'
})

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const inputClasses = computed(() => [
  'form-input',
  {
    'form-input--error': props.error
  }
])

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()
</script>

<style>
@layer components {
  .form-group {
    @apply space-y-2;
  }
  
  .form-label {
    @apply text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70;
  }
  
  .form-input {
    @apply flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50;
  }
  
  .form-input--error {
    @apply border-destructive focus-visible:ring-destructive;
  }
  
  .form-error {
    @apply text-sm text-destructive;
  }
}
</style>
```

## Responsive Design with Container Queries

**Use container queries for component-level responsiveness.**  
Implement @container queries for components that adapt based on their container size rather than viewport.  

*Why?* Enables truly portable components that respond to their actual available space, not just viewport size.

**Example:**
```vue
<template>
  <div class="product-card @container">
    <img :src="product.image" :alt="product.name" class="product-image" />
    <div class="product-content">
      <h3 class="product-title">{{ product.name }}</h3>
      <p class="product-description">{{ product.description }}</p>
      <div class="product-footer">
        <span class="product-price">${{ product.price }}</span>
        <button class="product-button">Add to Cart</button>
      </div>
    </div>
  </div>
</template>

<style>
.product-card {
  @apply border rounded-lg overflow-hidden bg-card text-card-foreground shadow-sm;
}

.product-image {
  @apply w-full h-48 object-cover;
}

.product-content {
  @apply p-4;
}

.product-title {
  @apply font-semibold text-lg mb-2;
}

.product-description {
  @apply text-muted-foreground text-sm mb-4;
}

.product-footer {
  @apply flex items-center justify-between;
}

.product-price {
  @apply font-bold text-lg;
}

.product-button {
  @apply bg-primary text-primary-foreground px-4 py-2 rounded text-sm hover:bg-primary/90;
}

/* Container query breakpoints */
@container (min-width: 300px) {
  .product-card {
    @apply flex;
  }
  
  .product-image {
    @apply w-32 h-32 flex-shrink-0;
  }
  
  .product-content {
    @apply flex-1;
  }
}

@container (min-width: 500px) {
  .product-image {
    @apply w-48 h-48;
  }
  
  .product-title {
    @apply text-xl;
  }
  
  .product-description {
    @apply text-base;
  }
}
</style>
```

**Combine viewport and container queries strategically.**  
Use viewport queries for layout and container queries for component adaptation.  

*Why?* Provides the most flexible responsive design system that works at both macro and micro levels.

**Example:**
```vue
<template>
  <div class="dashboard">
    <aside class="sidebar">
      <Navigation />
    </aside>
    
    <main class="main-content">
      <div class="widget-grid">
        <div 
          v-for="widget in widgets" 
          :key="widget.id"
          class="widget @container"
        >
          <component :is="widget.component" v-bind="widget.props" />
        </div>
      </div>
    </main>
  </div>
</template>

<style>
/* Viewport-based layout */
.dashboard {
  @apply min-h-screen bg-background;
  
  /* Mobile-first layout */
  @apply flex flex-col;
}

.sidebar {
  @apply border-b bg-muted/40;
}

.main-content {
  @apply flex-1 p-4;
}

/* Tablet and up */
@media (min-width: 768px) {
  .dashboard {
    @apply flex-row;
  }
  
  .sidebar {
    @apply w-64 border-r border-b-0;
  }
  
  .main-content {
    @apply p-6;
  }
}

/* Grid layout responsive to viewport */
.widget-grid {
  @apply grid gap-4;
  @apply grid-cols-1;
}

@media (min-width: 640px) {
  .widget-grid {
    @apply grid-cols-2;
  }
}

@media (min-width: 1024px) {
  .widget-grid {
    @apply grid-cols-3;
  }
}

@media (min-width: 1280px) {
  .widget-grid {
    @apply grid-cols-4;
  }
}

/* Container-based widget adaptation */
.widget {
  @apply bg-card rounded-lg border p-4;
}

/* Compact widget layout for smaller containers */
@container (max-width: 250px) {
  .widget {
    @apply p-3;
  }
  
  .widget h3 {
    @apply text-sm;
  }
  
  .widget .metric {
    @apply text-lg;
  }
}

/* Expanded widget layout for larger containers */
@container (min-width: 400px) {
  .widget {
    @apply p-6;
  }
  
  .widget h3 {
    @apply text-lg;
  }
  
  .widget .metric {
    @apply text-3xl;
  }
}
</style>
```

## Design System Implementation

**Create a cohesive design system with CSS custom properties.**  
Build design tokens using CSS custom properties for themeable, maintainable design systems.  

*Why?* Enables dynamic theming, better organization, and seamless integration with design tools.

**Example:**
```css
/* design-system.css */
@layer base {
  :root {
    /* Color palette */
    --color-gray-50: #f9fafb;
    --color-gray-100: #f3f4f6;
    --color-gray-500: #6b7280;
    --color-gray-900: #111827;
    
    --color-blue-50: #eff6ff;
    --color-blue-500: #3b82f6;
    --color-blue-600: #2563eb;
    --color-blue-900: #1e3a8a;
    
    /* Semantic tokens */
    --color-background: var(--color-gray-50);
    --color-foreground: var(--color-gray-900);
    --color-card: #ffffff;
    --color-card-foreground: var(--color-gray-900);
    --color-popover: #ffffff;
    --color-popover-foreground: var(--color-gray-900);
    --color-primary: var(--color-blue-600);
    --color-primary-foreground: #ffffff;
    --color-secondary: var(--color-gray-100);
    --color-secondary-foreground: var(--color-gray-900);
    --color-muted: var(--color-gray-100);
    --color-muted-foreground: var(--color-gray-500);
    --color-accent: var(--color-gray-100);
    --color-accent-foreground: var(--color-gray-900);
    --color-destructive: #ef4444;
    --color-destructive-foreground: #ffffff;
    --color-border: var(--color-gray-200);
    --color-input: var(--color-gray-200);
    --color-ring: var(--color-blue-500);
    
    /* Spacing scale */
    --spacing-0: 0;
    --spacing-px: 1px;
    --spacing-0-5: 0.125rem;
    --spacing-1: 0.25rem;
    --spacing-2: 0.5rem;
    --spacing-3: 0.75rem;
    --spacing-4: 1rem;
    --spacing-5: 1.25rem;
    --spacing-6: 1.5rem;
    --spacing-8: 2rem;
    --spacing-10: 2.5rem;
    --spacing-12: 3rem;
    --spacing-16: 4rem;
    --spacing-20: 5rem;
    --spacing-24: 6rem;
    
    /* Typography scale */
    --font-size-xs: 0.75rem;
    --font-size-sm: 0.875rem;
    --font-size-base: 1rem;
    --font-size-lg: 1.125rem;
    --font-size-xl: 1.25rem;
    --font-size-2xl: 1.5rem;
    --font-size-3xl: 1.875rem;
    --font-size-4xl: 2.25rem;
    
    /* Border radius */
    --radius-sm: 0.125rem;
    --radius: 0.375rem;
    --radius-md: 0.375rem;
    --radius-lg: 0.5rem;
    --radius-xl: 0.75rem;
    
    /* Shadows */
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  }
  
  [data-theme="dark"] {
    --color-background: #0a0a0a;
    --color-foreground: var(--color-gray-50);
    --color-card: #0a0a0a;
    --color-card-foreground: var(--color-gray-50);
    --color-popover: #0a0a0a;
    --color-popover-foreground: var(--color-gray-50);
    --color-primary: var(--color-blue-500);
    --color-primary-foreground: var(--color-gray-900);
    --color-secondary: var(--color-gray-800);
    --color-secondary-foreground: var(--color-gray-50);
    --color-muted: var(--color-gray-800);
    --color-muted-foreground: var(--color-gray-400);
    --color-accent: var(--color-gray-800);
    --color-accent-foreground: var(--color-gray-50);
    --color-border: var(--color-gray-800);
    --color-input: var(--color-gray-800);
  }
}

@config {
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--color-border))",
        input: "hsl(var(--color-input))",
        ring: "hsl(var(--color-ring))",
        background: "hsl(var(--color-background))",
        foreground: "hsl(var(--color-foreground))",
        primary: {
          DEFAULT: "hsl(var(--color-primary))",
          foreground: "hsl(var(--color-primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--color-secondary))",
          foreground: "hsl(var(--color-secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--color-destructive))",
          foreground: "hsl(var(--color-destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--color-muted))",
          foreground: "hsl(var(--color-muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--color-accent))",
          foreground: "hsl(var(--color-accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--color-popover))",
          foreground: "hsl(var(--color-popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--color-card))",
          foreground: "hsl(var(--color-card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius-lg)",
        md: "var(--radius-md)",
        sm: "var(--radius-sm)",
      },
    }
  }
}
```

## Vue.js Integration Best Practices

**Use computed properties for dynamic class composition.**  
Leverage Vue's reactivity system for efficient class computation and conditional styling.  

*Why?* Provides optimal performance through Vue's dependency tracking and enables complex conditional styling patterns.

**Example:**
```vue
<template>
  <div :class="cardClasses">
    <div class="card-header">
      <h3 :class="titleClasses">{{ title }}</h3>
      <button 
        v-if="dismissible"
        @click="$emit('dismiss')"
        class="card-dismiss"
      >
        ×
      </button>
    </div>
    
    <div class="card-content">
      <slot />
    </div>
    
    <div v-if="$slots.footer" class="card-footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  title: string
  variant?: 'default' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
  elevated?: boolean
  dismissible?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
  size: 'md',
  elevated: false,
  dismissible: false,
  loading: false
})

const cardClasses = computed(() => [
  // Base classes
  'card relative overflow-hidden transition-all duration-200',
  
  // Size variants
  {
    'p-3 space-y-2': props.size === 'sm',
    'p-4 space-y-3': props.size === 'md',
    'p-6 space-y-4': props.size === 'lg'
  },
  
  // Visual variants
  {
    'bg-card border border-border': props.variant === 'default',
    'bg-green-50 border border-green-200 dark:bg-green-950/20 dark:border-green-800': props.variant === 'success',
    'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950/20 dark:border-yellow-800': props.variant === 'warning',
    'bg-red-50 border border-red-200 dark:bg-red-950/20 dark:border-red-800': props.variant === 'error'
  },
  
  // Elevation
  {
    'shadow-lg': props.elevated,
    'shadow-sm': !props.elevated
  },
  
  // Loading state
  {
    'opacity-75 pointer-events-none': props.loading
  }
])

const titleClasses = computed(() => [
  'font-semibold',
  {
    'text-sm': props.size === 'sm',
    'text-base': props.size === 'md',
    'text-lg': props.size === 'lg'
  },
  {
    'text-card-foreground': props.variant === 'default',
    'text-green-900 dark:text-green-100': props.variant === 'success',
    'text-yellow-900 dark:text-yellow-100': props.variant === 'warning',
    'text-red-900 dark:text-red-100': props.variant === 'error'
  }
])

defineEmits<{
  dismiss: []
}>()
</script>

<style>
.card-header {
  @apply flex items-center justify-between;
}

.card-dismiss {
  @apply w-5 h-5 text-muted-foreground hover:text-foreground rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2;
}

.card-content {
  @apply text-sm text-card-foreground;
}

.card-footer {
  @apply flex items-center pt-2;
}
</style>
```

**Create reusable composables for Tailwind utilities.**  
Build Vue composables that encapsulate common Tailwind patterns and responsive logic.  

*Why?* Promotes code reuse, centralizes responsive logic, and provides a Vue-specific API for Tailwind patterns.

**Example:**
```typescript
// composables/useTailwindBreakpoints.ts
export function useTailwindBreakpoints() {
  const isSmall = useMediaQuery('(min-width: 640px)')
  const isMedium = useMediaQuery('(min-width: 768px)')
  const isLarge = useMediaQuery('(min-width: 1024px)')
  const isExtraLarge = useMediaQuery('(min-width: 1280px)')
  
  const breakpoint = computed(() => {
    if (isExtraLarge.value) return 'xl'
    if (isLarge.value) return 'lg'
    if (isMedium.value) return 'md'
    if (isSmall.value) return 'sm'
    return 'xs'
  })
  
  const columns = computed(() => {
    switch (breakpoint.value) {
      case 'xl': return 4
      case 'lg': return 3
      case 'md': return 2
      default: return 1
    }
  })
  
  return {
    isSmall,
    isMedium,
    isLarge,
    isExtraLarge,
    breakpoint,
    columns
  }
}

// composables/useTheme.ts
export function useTheme() {
  const isDark = useDark()
  const toggleDark = useToggle(isDark)
  
  const theme = computed(() => isDark.value ? 'dark' : 'light')
  
  const setTheme = (newTheme: 'light' | 'dark' | 'auto') => {
    if (newTheme === 'auto') {
      isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches
    } else {
      isDark.value = newTheme === 'dark'
    }
    
    document.documentElement.setAttribute('data-theme', newTheme)
    localStorage.setItem('theme', newTheme)
  }
  
  const getContrastColor = (bgColor: string): string => {
    // Simple contrast calculation for accessibility
    const hex = bgColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const brightness = ((r * 299) + (g * 587) + (b * 114)) / 1000
    return brightness > 128 ? '#000000' : '#ffffff'
  }
  
  return {
    isDark,
    theme,
    toggleDark,
    setTheme,
    getContrastColor
  }
}

// composables/useFormStyles.ts
export function useFormStyles() {
  const getInputClasses = (hasError = false, disabled = false) => [
    // Base styles
    'flex h-10 w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    
    // State variants
    {
      'border-input': !hasError,
      'border-destructive focus-visible:ring-destructive': hasError,
      'opacity-50 cursor-not-allowed': disabled
    }
  ]
  
  const getLabelClasses = (required = false) => [
    'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
    {
      'after:content-["*"] after:ml-0.5 after:text-destructive': required
    }
  ]
  
  const getErrorClasses = () => 'text-sm text-destructive mt-1'
  
  return {
    getInputClasses,
    getLabelClasses,
    getErrorClasses
  }
}
```

## Performance Optimization

**Optimize for production with advanced purging strategies.**  
Configure intelligent CSS purging to minimize bundle size while maintaining all necessary styles.  

*Why?* Reduces CSS bundle size by 90%+ in production while ensuring no styles are accidentally removed.

**Example:**
```javascript
// tailwind.config.js
module.exports = {
  content: {
    files: [
      './index.html',
      './src/**/*.{vue,js,ts,jsx,tsx}',
      './src/**/*.{html,js,ts,vue}',
    ],
    transform: {
      vue: (content) => {
        // Extract classes from computed properties and template strings
        return content.replace(/(?:class|className)\s*=\s*["'`]([^"'`]*)["'`]/g, '$1')
      }
    }
  },
  safelist: [
    // Always include these patterns
    /^grid-cols-/,
    /^col-span-/,
    /^bg-(red|green|blue|yellow)-(50|100|500|600|700|800|900)$/,
    {
      pattern: /^(text|bg|border)-(primary|secondary|destructive)/,
      variants: ['hover', 'focus', 'active']
    }
  ],
  blocklist: [
    // Never include these classes
    'container',
    'debug-*'
  ]
}

// vite.config.ts for production optimization
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'tailwind-base': ['tailwindcss/base'],
          'tailwind-components': ['tailwindcss/components'],
          'tailwind-utilities': ['tailwindcss/utilities']
        }
      }
    },
    cssCodeSplit: true,
    cssMinify: 'lightningcss'
  },
  css: {
    lightningcss: {
      minify: true,
      sourceMap: false
    }
  }
})
```

**Implement critical CSS extraction for faster loading.**  
Extract above-the-fold CSS for immediate rendering while lazy-loading the rest.  

*Why?* Improves First Contentful Paint and Largest Contentful Paint metrics significantly.

**Example:**
```javascript
// vite-plugin-critical-css.js
import { createHash } from 'crypto'

export function criticalCssPlugin() {
  return {
    name: 'critical-css',
    generateBundle(options, bundle) {
      // Extract critical CSS classes
      const criticalClasses = [
        // Layout
        'min-h-screen', 'flex', 'flex-col', 'container',
        // Typography
        'text-base', 'font-sans', 'leading-normal',
        // Colors
        'bg-background', 'text-foreground',
        // Loading states
        'animate-pulse', 'opacity-50'
      ]
      
      // Generate critical CSS bundle
      const criticalCss = generateCriticalCss(criticalClasses)
      const hash = createHash('md5').update(criticalCss).digest('hex').substring(0, 8)
      
      this.emitFile({
        type: 'asset',
        fileName: `critical.${hash}.css`,
        source: criticalCss
      })
    }
  }
}

// Usage in Vue app
// main.ts
if (import.meta.env.PROD) {
  // Preload critical CSS
  const criticalLink = document.createElement('link')
  criticalLink.rel = 'preload'
  criticalLink.as = 'style'
  criticalLink.href = '/assets/critical.css'
  document.head.appendChild(criticalLink)
  
  // Load full CSS asynchronously
  const fullCssLink = document.createElement('link')
  fullCssLink.rel = 'stylesheet'
  fullCssLink.href = '/assets/style.css'
  fullCssLink.media = 'print'
  fullCssLink.onload = function() { this.media = 'all' }
  document.head.appendChild(fullCssLink)
}
```

## Accessibility & Best Practices

**Implement accessible color systems with WCAG compliance.**  
Use Tailwind's color system to ensure proper contrast ratios and accessible color combinations.  

*Why?* Ensures accessibility compliance and provides a better user experience for users with visual impairments.

**Example:**
```vue
<template>
  <div>
    <!-- High contrast text combinations -->
    <section class="bg-white text-gray-900 dark:bg-gray-900 dark:text-gray-100">
      <h2 class="text-2xl font-bold mb-4">Accessible Content</h2>
      <p class="text-gray-700 dark:text-gray-300">
        This text maintains proper contrast ratios in both light and dark themes.
      </p>
    </section>
    
    <!-- Accessible button variants -->
    <div class="space-y-2">
      <button class="btn-primary">
        Primary Action
      </button>
      
      <button class="btn-secondary">
        Secondary Action
      </button>
      
      <button class="btn-destructive">
        Destructive Action
      </button>
    </div>
    
    <!-- Focus indicators -->
    <form class="space-y-4">
      <div>
        <label for="email" class="form-label">
          Email Address <span class="text-red-500" aria-label="required">*</span>
        </label>
        <input 
          id="email"
          type="email"
          class="form-input"
          aria-describedby="email-error"
          aria-invalid="false"
        />
        <p id="email-error" class="form-error" role="alert">
          <!-- Error message will appear here -->
        </p>
      </div>
    </form>
  </div>
</template>

<style>
/* Accessible button styles with proper contrast */
.btn-primary {
  @apply bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:outline-none px-4 py-2 rounded-md font-medium transition-colors;
}

.btn-secondary {
  @apply bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 focus:outline-none px-4 py-2 rounded-md font-medium transition-colors;
}

.btn-destructive {
  @apply bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:outline-none px-4 py-2 rounded-md font-medium transition-colors;
}

/* Accessible form styles */
.form-label {
  @apply block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1;
}

.form-input {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white dark:placeholder-gray-500;
}

.form-input:invalid {
  @apply border-red-300 focus:ring-red-500 focus:border-red-500;
}

.form-error {
  @apply text-sm text-red-600 dark:text-red-400 mt-1;
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .btn-primary {
    @apply border-2 border-blue-800;
  }
  
  .btn-secondary {
    @apply border-2 border-gray-800;
  }
  
  .form-input {
    @apply border-2 border-gray-800;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  * {
    @apply transition-none;
  }
}
</style>
```

**Use semantic HTML with Tailwind styling.**  
Combine proper HTML semantics with Tailwind classes for both visual appeal and accessibility.  

*Why?* Maintains semantic meaning for assistive technologies while achieving desired visual design.

**Example:**
```vue
<template>
  <article class="prose prose-lg max-w-none dark:prose-invert">
    <header class="mb-8">
      <h1 class="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-2">
        Article Title
      </h1>
      <div class="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400">
        <address class="not-italic">
          By <a href="/author" class="text-blue-600 hover:text-blue-800 dark:text-blue-400">John Doe</a>
        </address>
        <time :datetime="publishDate" class="flex items-center gap-1">
          <CalendarIcon class="w-4 h-4" />
          {{ formatDate(publishDate) }}
        </time>
        <span class="flex items-center gap-1">
          <ClockIcon class="w-4 h-4" />
          {{ readingTime }} min read
        </span>
      </div>
    </header>
    
    <nav class="toc bg-gray-50 dark:bg-gray-800 rounded-lg p-4 mb-8" aria-labelledby="toc-heading">
      <h2 id="toc-heading" class="text-lg font-semibold mb-3">Table of Contents</h2>
      <ol class="space-y-1">
        <li v-for="heading in tableOfContents" :key="heading.id">
          <a 
            :href="`#${heading.id}`"
            class="text-blue-600 hover:text-blue-800 dark:text-blue-400 hover:underline"
            :style="{ paddingLeft: `${(heading.level - 1) * 1}rem` }"
          >
            {{ heading.text }}
          </a>
        </li>
      </ol>
    </nav>
    
    <main class="space-y-6">
      <section>
        <h2 id="introduction" class="text-2xl font-semibold mb-4">Introduction</h2>
        <p class="text-gray-700 dark:text-gray-300 leading-relaxed">
          Content with proper semantic structure and accessible styling.
        </p>
      </section>
      
      <aside class="bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 p-4 my-6" role="note">
        <div class="flex">
          <InfoIcon class="w-5 h-5 text-blue-400 mr-2 flex-shrink-0 mt-0.5" />
          <div>
            <h3 class="text-sm font-medium text-blue-800 dark:text-blue-200 mb-1">
              Pro Tip
            </h3>
            <p class="text-sm text-blue-700 dark:text-blue-300">
              Additional information that supports the main content.
            </p>
          </div>
        </div>
      </aside>
    </main>
    
    <footer class="mt-12 pt-8 border-t border-gray-200 dark:border-gray-700">
      <div class="flex flex-wrap gap-2 mb-4">
        <span class="text-sm text-gray-600 dark:text-gray-400">Tags:</span>
        <div class="flex flex-wrap gap-2">
          <span 
            v-for="tag in tags" 
            :key="tag"
            class="inline-block bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs px-2 py-1 rounded-full"
          >
            {{ tag }}
          </span>
        </div>
      </div>
      
      <nav aria-label="Article navigation" class="flex justify-between">
        <a 
          v-if="previousArticle"
          :href="previousArticle.url"
          class="flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400"
        >
          <ArrowLeftIcon class="w-4 h-4" />
          Previous: {{ previousArticle.title }}
        </a>
        <a 
          v-if="nextArticle"
          :href="nextArticle.url"
          class="flex items-center gap-2 text-blue-600 hover:text-blue-800 dark:text-blue-400 ml-auto"
        >
          Next: {{ nextArticle.title }}
          <ArrowRightIcon class="w-4 h-4" />
        </a>
      </nav>
    </footer>
  </article>
</template>
```
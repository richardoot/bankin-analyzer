# Design System & UI/UX Standards

## Design Token Architecture

**Implement a three-tier token system for scalable theming.**  
Use primitive, semantic, and component tokens to create a flexible design system architecture.  

*Why?* Provides consistency across the application while enabling easy theme customization and maintenance.

**Example:**
```css
/* Primitive tokens */
:root {
  --color-blue-50: #eff6ff;
  --color-blue-500: #3b82f6;
  --color-blue-900: #1e3a8a;
  
  --space-1: 0.25rem;
  --space-4: 1rem;
  --space-8: 2rem;
  
  --radius-sm: 0.125rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;
}

/* Semantic tokens */
:root {
  --color-primary: var(--color-blue-500);
  --color-background: white;
  --color-text: var(--color-gray-900);
  
  --space-component-padding: var(--space-4);
  --border-radius-button: var(--radius-md);
}

/* Component tokens */
.btn {
  background-color: var(--color-primary);
  color: white;
  padding: var(--space-component-padding);
  border-radius: var(--border-radius-button);
}
```

**Use CSS custom properties for dynamic theming.**  
Implement theme switching with CSS custom properties for smooth transitions and performance.  

*Why?* Enables real-time theme switching without page reloads and maintains excellent performance.

**Example:**
```vue
<script setup lang="ts">
import { ref, computed } from 'vue'
import { useDark, useToggle } from '@vueuse/core'

type Theme = 'light' | 'dark' | 'auto'

const currentTheme = ref<Theme>('auto')
const isDarkMode = useDark()
const toggleDark = useToggle(isDarkMode)

const setTheme = (theme: Theme) => {
  currentTheme.value = theme
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('theme', theme)
}

const themes = [
  { value: 'light', label: 'Light', icon: '☀️' },
  { value: 'dark', label: 'Dark', icon: '🌙' },
  { value: 'auto', label: 'System', icon: '💻' }
]
</script>

<template>
  <div class="theme-switcher">
    <button
      v-for="theme in themes"
      :key="theme.value"
      @click="setTheme(theme.value)"
      :class="{ 'active': currentTheme === theme.value }"
      class="theme-option"
    >
      <span class="icon">{{ theme.icon }}</span>
      <span class="label">{{ theme.label }}</span>
    </button>
  </div>
</template>

<style>
:root {
  --color-background: #ffffff;
  --color-text: #1a1a1a;
  --color-primary: #3b82f6;
  --color-border: #e5e7eb;
}

[data-theme="dark"] {
  --color-background: #1a1a1a;
  --color-text: #ffffff;
  --color-primary: #60a5fa;
  --color-border: #374151;
}

* {
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
}
</style>
```

## Component Libraries & Headless UI

**Use Radix Vue for accessible headless components.**  
Implement Radix Vue as the foundation for complex UI components with full accessibility compliance.  

*Why?* Provides ARIA-compliant components without styling constraints, enabling custom design while maintaining accessibility.

**Example:**
```vue
<template>
  <AlertDialog>
    <AlertDialogTrigger as-child>
      <Button variant="destructive">Delete Account</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription>
          This action cannot be undone. This will permanently delete your account.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction @click="handleDelete">Continue</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

<script setup lang="ts">
import { 
  AlertDialog, 
  AlertDialogTrigger, 
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction
} from 'radix-vue'

const handleDelete = () => {
  // Delete logic
}
</script>
```

**Build a consistent component library with design tokens.**  
Create reusable components that leverage your design token system for consistency.  

*Why?* Ensures visual consistency across the application and reduces development time for new features.

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
  'btn',
  `btn--${variant}`,
  `btn--${size}`,
  { 'btn--disabled': disabled }
])

defineEmits<{
  click: [event: MouseEvent]
}>()
</script>

<style>
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--border-radius-button);
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn--primary {
  background-color: var(--color-primary);
  color: white;
}

.btn--secondary {
  background-color: transparent;
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
}

.btn--destructive {
  background-color: #ef4444;
  color: white;
}

.btn--sm {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

.btn--md {
  padding: 0.75rem 1.5rem;
  font-size: 1rem;
}

.btn--lg {
  padding: 1rem 2rem;
  font-size: 1.125rem;
}

.btn--disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

## Responsive Design & Layout

**Use modern CSS Grid and Flexbox for layout systems.**  
Implement responsive layouts using CSS Grid for page structure and Flexbox for component-level layouts.  

*Why?* Provides flexible, maintainable layouts that adapt to different screen sizes and content requirements.

**Example:**
```vue
<template>
  <div class="layout-grid">
    <header class="header">
      <Navigation />
    </header>
    
    <nav class="sidebar">
      <SidebarMenu />
    </nav>
    
    <main class="main">
      <div class="content-flex">
        <article class="content">
          <slot />
        </article>
        <aside class="aside">
          <RelatedContent />
        </aside>
      </div>
    </main>
    
    <footer class="footer">
      <FooterContent />
    </footer>
  </div>
</template>

<style>
.layout-grid {
  display: grid;
  grid-template-areas: 
    "header header"
    "sidebar main"
    "footer footer";
  grid-template-columns: 250px 1fr;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  gap: 1rem;
}

.header { grid-area: header; }
.sidebar { grid-area: sidebar; }
.main { grid-area: main; }
.footer { grid-area: footer; }

.content-flex {
  display: flex;
  gap: 2rem;
  flex-wrap: wrap;
}

.content {
  flex: 1;
  min-width: 0; /* Allow shrinking */
}

.aside {
  flex: 0 0 300px;
}

/* Mobile-first responsive design */
@media (max-width: 768px) {
  .layout-grid {
    grid-template-areas: 
      "header"
      "main"
      "sidebar"
      "footer";
    grid-template-columns: 1fr;
  }
  
  .content-flex {
    flex-direction: column;
  }
  
  .aside {
    flex: none;
  }
}
</style>
```

**Implement container queries for truly responsive components.**  
Use container queries to make components responsive based on their container size rather than viewport size.  

*Why?* Enables component-level responsiveness that works in any context, improving reusability.

**Example:**
```vue
<template>
  <div class="card-container">
    <div class="card">
      <img :src="image" :alt="title" class="card-image" />
      <div class="card-content">
        <h3 class="card-title">{{ title }}</h3>
        <p class="card-description">{{ description }}</p>
        <div class="card-actions">
          <button class="btn btn--primary">Read More</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
.card-container {
  container-type: inline-size;
}

.card {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.card-content {
  padding: 1rem;
}

/* Container query for larger cards */
@container (min-width: 400px) {
  .card {
    display: grid;
    grid-template-columns: 200px 1fr;
  }
  
  .card-content {
    padding: 2rem;
  }
}

/* Container query for very large cards */
@container (min-width: 600px) {
  .card-content {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }
}
</style>
```

## Typography & Visual Hierarchy

**Use variable fonts for optimal typography.**  
Implement variable fonts with proper fallbacks for better performance and design flexibility.  

*Why?* Reduces font file sizes while providing more design control and better performance.

**Example:**
```css
/* Load variable font */
@font-face {
  font-family: 'Inter Variable';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/Inter-Variable.woff2') format('woff2');
}

/* Typography scale with fluid sizing */
.heading-1 {
  font-family: 'Inter Variable', sans-serif;
  font-weight: 800;
  font-size: clamp(2rem, 5vw, 4rem);
  line-height: 1.1;
  letter-spacing: -0.02em;
}

.heading-2 {
  font-family: 'Inter Variable', sans-serif;
  font-weight: 700;
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.body-large {
  font-family: 'Inter Variable', sans-serif;
  font-weight: 400;
  font-size: clamp(1.125rem, 2.5vw, 1.25rem);
  line-height: 1.6;
}

.body-text {
  font-family: 'Inter Variable', sans-serif;
  font-weight: 400;
  font-size: clamp(1rem, 2.5vw, 1.125rem);
  line-height: 1.6;
}

/* Dynamic weight based on context */
@media (max-width: 768px) {
  .heading-1 {
    font-weight: 700; /* Lighter weight for smaller screens */
  }
}
```

**Establish clear visual hierarchy with consistent spacing.**  
Use a modular spacing scale and consistent typography hierarchy for better readability.  

*Why?* Improves content scanability and creates a more professional, polished user experience.

**Example:**
```css
/* Spacing scale based on powers of 2 */
:root {
  --space-0: 0;
  --space-1: 0.25rem;   /* 4px */
  --space-2: 0.5rem;    /* 8px */
  --space-3: 0.75rem;   /* 12px */
  --space-4: 1rem;      /* 16px */
  --space-6: 1.5rem;    /* 24px */
  --space-8: 2rem;      /* 32px */
  --space-12: 3rem;     /* 48px */
  --space-16: 4rem;     /* 64px */
  --space-24: 6rem;     /* 96px */
}

/* Consistent component spacing */
.section {
  margin-bottom: var(--space-16);
}

.card {
  padding: var(--space-6);
  margin-bottom: var(--space-8);
}

.form-group {
  margin-bottom: var(--space-4);
}

.button-group {
  gap: var(--space-3);
}
```

## Accessibility & Inclusive Design

**Implement comprehensive keyboard navigation.**  
Ensure all interactive elements are accessible via keyboard with visible focus indicators.  

*Why?* Essential for users who rely on keyboards and meets WCAG 2.2 compliance requirements.

**Example:**
```vue
<script setup lang="ts">
import { ref, nextTick } from 'vue'

const modalOpen = ref(false)
const triggerRef = ref<HTMLButtonElement>()
const modalRef = ref<HTMLDivElement>()

const openModal = async () => {
  modalOpen.value = true
  await nextTick()
  modalRef.value?.focus()
}

const closeModal = async () => {
  modalOpen.value = false
  await nextTick()
  triggerRef.value?.focus()
}

const handleKeydown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    closeModal()
  }
}
</script>

<template>
  <div>
    <button 
      ref="triggerRef"
      @click="openModal"
      aria-haspopup="dialog"
      aria-expanded="modalOpen"
    >
      Open Modal
    </button>
    
    <div 
      v-if="modalOpen"
      ref="modalRef"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      tabindex="-1"
      class="modal"
      @keydown="handleKeydown"
    >
      <div class="modal-content">
        <h2 id="modal-title">Modal Title</h2>
        <p>Modal content goes here.</p>
        <button @click="closeModal">Close</button>
      </div>
    </div>
  </div>
</template>

<style>
/* Focus indicators */
button:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

/* Skip links for keyboard navigation */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: var(--color-primary);
  color: white;
  padding: 8px;
  text-decoration: none;
  transition: top 0.3s;
}

.skip-link:focus {
  top: 6px;
}
</style>
```

**Use semantic HTML and ARIA attributes appropriately.**  
Structure content with proper HTML semantics and enhance with ARIA when necessary.  

*Why?* Provides context for assistive technologies and improves overall accessibility and SEO.

**Example:**
```vue
<template>
  <div>
    <!-- Skip to main content -->
    <a href="#main-content" class="skip-link">Skip to main content</a>
    
    <header>
      <nav aria-label="Main navigation">
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/products">Products</a></li>
          <li><a href="/about">About</a></li>
        </ul>
      </nav>
    </header>
    
    <main id="main-content" tabindex="-1">
      <h1>Page Title</h1>
      
      <section aria-labelledby="products-heading">
        <h2 id="products-heading">Featured Products</h2>
        
        <div role="group" aria-label="Product filters">
          <button 
            :aria-pressed="activeFilter === 'all'"
            @click="setFilter('all')"
          >
            All Products
          </button>
          <button 
            :aria-pressed="activeFilter === 'sale'"
            @click="setFilter('sale')"
          >
            On Sale
          </button>
        </div>
        
        <div 
          role="region" 
          aria-live="polite" 
          aria-label="Product search results"
        >
          <div v-for="product in filteredProducts" :key="product.id">
            {{ product.name }}
          </div>
        </div>
      </section>
    </main>
  </div>
</template>
```

## Animation & Micro-interactions

**Use Vue transitions for enhanced user experience.**  
Implement smooth transitions and animations to provide feedback and improve perceived performance.  

*Why?* Animations provide visual feedback, improve perceived performance, and create a more engaging user experience.

**Example:**
```vue
<template>
  <div>
    <Transition name="slide-fade" mode="out-in">
      <component :is="currentComponent" :key="currentView" />
    </Transition>
    
    <TransitionGroup name="list" tag="ul" class="product-list">
      <li 
        v-for="product in products" 
        :key="product.id"
        class="product-item"
      >
        {{ product.name }}
      </li>
    </TransitionGroup>
  </div>
</template>

<style>
/* Page transition */
.slide-fade-enter-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.slide-fade-enter-from {
  transform: translateX(20px);
  opacity: 0;
}

.slide-fade-leave-to {
  transform: translateX(-20px);
  opacity: 0;
}

/* List transitions */
.list-enter-active,
.list-leave-active {
  transition: all 0.3s ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(30px);
}

.list-move {
  transition: transform 0.3s ease;
}
</style>
```

**Implement loading states and skeleton screens.**  
Provide visual feedback during data loading to improve perceived performance.  

*Why?* Reduces perceived loading time and provides better user experience during data fetching.

**Example:**
```vue
<script setup lang="ts">
const { data: users, loading, error } = await useAsyncData(() => fetchUsers())
</script>

<template>
  <div>
    <div v-if="loading" class="skeleton-container">
      <div v-for="n in 5" :key="n" class="skeleton-item">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-content">
          <div class="skeleton-line skeleton-line--title"></div>
          <div class="skeleton-line skeleton-line--subtitle"></div>
        </div>
      </div>
    </div>
    
    <div v-else-if="error" class="error-state">
      <p>Failed to load users. Please try again.</p>
      <button @click="refresh">Retry</button>
    </div>
    
    <div v-else class="user-list">
      <UserCard v-for="user in users" :key="user.id" :user="user" />
    </div>
  </div>
</template>

<style>
.skeleton-container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.skeleton-item {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
}

.skeleton-avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-line {
  height: 1rem;
  border-radius: 0.25rem;
  background: linear-gradient(90deg, #f0f0f0 25%, #e0e0e0 50%, #f0f0f0 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s infinite;
}

.skeleton-line--title {
  width: 150px;
  margin-bottom: 0.5rem;
}

.skeleton-line--subtitle {
  width: 100px;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
</style>
```
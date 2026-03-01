# Vue.js Development Standards

## Configuration & Build Setup

**Use Vue 3 with `<script setup>` as the default syntax.**  
Leverage the modern Composition API syntax for better TypeScript inference and cleaner code organization.  

*Why?* Provides better type inference, removes ceremony, and is the recommended approach for Vue 3 applications.

**Example:**
```vue
<template>
  <div>
    <h1>{{ title }}</h1>
    <button @click="increment">Count: {{ count }}</button>
    <UserList :users="users" @user-selected="handleUserSelection" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import UserList from './components/UserList.vue'

// Reactive state
const count = ref(0)
const users = ref<User[]>([])

// Computed properties
const title = computed(() => `Welcome! Clicked ${count.value} times`)

// Methods
const increment = () => count.value++
const handleUserSelection = (user: User) => console.log('Selected:', user)

// Lifecycle hooks
onMounted(async () => {
  users.value = await fetchUsers()
})
</script>
```

**Configure Vite for optimal development experience.**  
Use modern build configuration with proper optimization and type checking.  

*Why?* Vite provides the fastest development experience and excellent production builds for Vue 3.

**Example:**
```typescript
// vite.config.ts
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    vue({
      script: {
        defineModel: true,
        propsDestructure: true
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@composables': resolve(__dirname, 'src/composables')
    }
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
          ui: ['@headlessui/vue']
        }
      }
    }
  }
})
```

## Component Architecture & Design Patterns

**Follow Single Responsibility Principle for components.**  
Each component should have one clear purpose and well-defined boundaries.  

*Why?* Improves maintainability, testability, and enables better code reuse across the application.

**Example:**
```vue
<!-- Good: UserCard.vue - Only handles user display -->
<template>
  <div class="user-card">
    <img :src="user.avatar" :alt="user.name" />
    <h3>{{ user.name }}</h3>
    <p>{{ user.email }}</p>
    <button @click="$emit('edit', user)">Edit</button>
  </div>
</template>

<script setup lang="ts">
interface Props {
  user: User
}

interface Emits {
  edit: [user: User]
}

defineProps<Props>()
defineEmits<Emits>()
</script>
```

**Use provide/inject for deep component communication.**  
Implement dependency injection pattern for sharing data across component trees without prop drilling.  

*Why?* Eliminates prop drilling while maintaining clean component interfaces and explicit dependencies.

**Example:**
```vue
<!-- Parent Component -->
<script setup lang="ts">
import { provide, reactive } from 'vue'

const theme = reactive({
  primaryColor: '#007bff',
  fontSize: '16px'
})

provide('theme', theme)
</script>

<!-- Child Component (any level deep) -->
<script setup lang="ts">
import { inject } from 'vue'

const theme = inject<Theme>('theme')
</script>
```

## Composables Creation & Management

**Create reusable logic with composables following naming conventions.**  
Extract complex logic into composables with proper TypeScript typing and lifecycle management.  

*Why?* Enables code reuse, improves testability, and provides clear separation of concerns.

**Example:**
```typescript
// composables/useApi.ts
export function useApi<T>(url: string) {
  const data = ref<T | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  const execute = async (): Promise<void> => {
    loading.value = true
    error.value = null
    
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error('API request failed')
      data.value = await response.json()
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error'
    } finally {
      loading.value = false
    }
  }
  
  // Cleanup on unmount
  onUnmounted(() => {
    // Cancel any pending requests
  })
  
  return {
    data: readonly(data),
    loading: readonly(loading),
    error: readonly(error),
    execute,
    refetch: execute
  }
}
```

**Return readonly refs for state that shouldn't be mutated externally.**  
Protect internal state while exposing controlled mutation methods.  

*Why?* Prevents accidental mutations and provides clear API boundaries for composables.

**Example:**
```typescript
// composables/useFormValidation.ts
export function useFormValidation<T extends Record<string, any>>(
  initialValues: T,
  validationRules: ValidationRules<T>
) {
  const values = reactive({ ...initialValues })
  const errors = ref<Partial<Record<keyof T, string>>>({})
  const isValid = computed(() => Object.keys(errors.value).length === 0)
  
  const validate = (field?: keyof T): boolean => {
    // Validation logic
    return true
  }
  
  const reset = (): void => {
    Object.assign(values, initialValues)
    errors.value = {}
  }
  
  return {
    values,
    errors: readonly(errors),
    isValid,
    validate,
    reset
  }
}
```

## State Management with Pinia

**Use Composition API style for defining Pinia stores.**  
Leverage modern store definitions with clear separation between state, getters, and actions.  

*Why?* Provides better TypeScript inference and aligns with Vue 3 Composition API patterns.

**Example:**
```typescript
// stores/userStore.ts
export const useUserStore = defineStore('user', () => {
  // State
  const users = ref<User[]>([])
  const currentUser = ref<User | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  
  // Getters
  const isAdmin = computed(() => currentUser.value?.role === 'admin')
  const activeUsers = computed(() => users.value.filter(user => user.active))
  
  // Actions
  async function fetchUsers(): Promise<void> {
    loading.value = true
    error.value = null
    
    try {
      const response = await api.get('/users')
      users.value = response.data
    } catch (err) {
      error.value = 'Failed to fetch users'
      throw err
    } finally {
      loading.value = false
    }
  }
  
  async function updateUser(id: string, updates: Partial<User>): Promise<void> {
    const index = users.value.findIndex(user => user.id === id)
    if (index > -1) {
      users.value[index] = { ...users.value[index], ...updates }
    }
  }
  
  return {
    // State
    users: readonly(users),
    currentUser,
    loading: readonly(loading),
    error: readonly(error),
    // Getters
    isAdmin,
    activeUsers,
    // Actions
    fetchUsers,
    updateUser
  }
})
```

**Implement store composition for complex state management.**  
Use multiple stores and compose them together for better modularity.  

*Why?* Maintains clear boundaries between different domains while enabling store collaboration.

**Example:**
```typescript
// stores/appStore.ts
export const useAppStore = defineStore('app', () => {
  const authStore = useAuthStore()
  const userStore = useUserStore()
  
  const initializeApp = async () => {
    if (authStore.isAuthenticated) {
      await userStore.fetchUsers()
    }
  }
  
  return { initializeApp }
})
```

## TypeScript Integration

**Use comprehensive type safety with proper interfaces.**  
Define proper TypeScript types for all component props, emits, and composables.  

*Why?* Provides compile-time error checking and excellent developer experience with IntelliSense.

**Example:**
```vue
<script setup lang="ts">
interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user' | 'guest'
  preferences: UserPreferences
}

interface UserPreferences {
  theme: 'light' | 'dark'
  notifications: boolean
  language: string
}

interface Props {
  users: User[]
  loading?: boolean
  pageSize?: number
}

interface Emits {
  'user-selected': [user: User]
  'page-changed': [page: number]
}

// Vue 3.5+ syntax with default values
const { 
  users, 
  loading = false, 
  pageSize = 10 
} = defineProps<Props>()

const emit = defineEmits<Emits>()

// Template refs with auto-inference
const tableRef = useTemplateRef<HTMLTableElement>('table')
</script>
```

**Use generic components for reusable typed components.**  
Create flexible components that work with different data types while maintaining type safety.  

*Why?* Reduces code duplication while maintaining full type safety across different data types.

**Example:**
```vue
<!-- GenericDataTable.vue -->
<script setup lang="ts" generic="T extends Record<string, any>">
interface Props {
  data: T[]
  columns: Column<T>[]
  loading?: boolean
}

interface Column<T> {
  key: keyof T
  label: string
  sortable?: boolean
  formatter?: (value: T[keyof T]) => string
}

defineProps<Props>()
</script>
```

## Performance Optimization

**Use strategic lazy loading with defineAsyncComponent.**  
Implement component lazy loading for route-level code splitting and heavy components.  

*Why?* Reduces initial bundle size and improves application startup performance.

**Example:**
```typescript
// Lazy load heavy components
const HeavyChart = defineAsyncComponent(() => import('./HeavyChart.vue'))
const AdminPanel = defineAsyncComponent({
  loader: () => import('./AdminPanel.vue'),
  loadingComponent: LoadingSpinner,
  errorComponent: ErrorComponent,
  delay: 200,
  timeout: 3000
})
```

**Implement Suspense for async component loading states.**  
Use Suspense boundaries to handle loading states of async components gracefully.  

*Why?* Provides better user experience with loading states and error boundaries for async components.

**Example:**
```vue
<template>
  <Suspense>
    <template #default>
      <AsyncUserProfile :user-id="userId" />
    </template>
    <template #fallback>
      <div class="loading-skeleton">
        <SkeletonLoader />
      </div>
    </template>
  </Suspense>
</template>
```

**Use v-memo for expensive re-renders with stable dependencies.**  
Apply v-memo directive to optimize performance for complex list items or expensive computations.  

*Why?* Prevents unnecessary re-renders when dependencies haven't changed, improving performance.

**Example:**
```vue
<template>
  <!-- Good: Expensive list item with stable data -->
  <div
    v-for="item in expensiveList"
    :key="item.id"
    v-memo="[item.id, item.status, item.priority]"
  >
    <ExpensiveComponent :item="item" />
  </div>
</template>
```

## Testing Integration

**Write component tests focusing on user behavior.**  
Test components from the user's perspective rather than implementation details.  

*Why?* Provides more reliable tests that don't break with refactoring and better represent actual usage.

**Example:**
```typescript
// components/__tests__/UserCard.test.ts
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import UserCard from '../UserCard.vue'

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com'
  }
  
  it('should display user information', () => {
    render(UserCard, {
      props: { user: mockUser }
    })
    
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
  })
  
  it('should emit edit event when edit button is clicked', async () => {
    const { emitted } = render(UserCard, {
      props: { user: mockUser }
    })
    
    await fireEvent.click(screen.getByText('Edit'))
    
    expect(emitted().edit).toHaveLength(1)
    expect(emitted().edit[0]).toEqual([mockUser])
  })
})
```

**Test composables independently with proper lifecycle simulation.**  
Create focused tests for composables that simulate Vue's lifecycle when needed.  

*Why?* Ensures composables work correctly in isolation and provides better debugging when issues arise.

**Example:**
```typescript
// composables/__tests__/useCounter.test.ts
import { describe, it, expect } from 'vitest'
import { useCounter } from '../useCounter'

// Helper for lifecycle-dependent composables
function withSetup<T>(composable: () => T): [T, App] {
  let result: T
  const app = createApp({
    setup() {
      result = composable()
      return () => {}
    }
  })
  app.mount(document.createElement('div'))
  return [result!, app]
}

describe('useCounter', () => {
  it('should initialize with default value', () => {
    const { count, increment } = useCounter()
    expect(count.value).toBe(0)
  })
  
  it('should increment correctly', () => {
    const { count, increment } = useCounter()
    increment()
    expect(count.value).toBe(1)
  })
})
```

## Development Workflow

**Configure ESLint with Vue 3 and TypeScript rules.**  
Use modern linting configuration that supports Vue 3 Composition API and TypeScript.  

*Why?* Maintains code quality and catches potential issues during development.

**Example:**
```javascript
// eslint.config.js
import vue from 'eslint-plugin-vue'
import typescript from '@typescript-eslint/eslint-plugin'

export default [
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: '@typescript-eslint/parser'
      }
    },
    rules: {
      'vue/multi-word-component-names': 'error',
      'vue/component-definition-name-casing': ['error', 'PascalCase'],
      'vue/component-name-in-template-casing': ['error', 'PascalCase'],
      'vue/define-props-declaration': ['error', 'type-based']
    }
  }
]
```

**Use Vue DevTools for debugging and performance analysis.**  
Leverage Vue DevTools for component inspection, state management debugging, and performance profiling.  

*Why?* Provides essential debugging capabilities and performance insights specific to Vue applications.

**Example DevTools workflow:**
1. Install Vue DevTools browser extension
2. Use component inspector for props/state debugging
3. Monitor Pinia stores with time-travel debugging
4. Profile component rendering performance
5. Analyze route transitions and lazy loading
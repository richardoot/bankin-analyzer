# Vitest Testing Standards

## Configuration & Setup

**Use optimized Vitest configuration for Vue.js projects.**  
Configure Vitest with proper Vue support, TypeScript integration, and performance optimizations.  

*Why?* Provides fast test execution with excellent Vue 3 and TypeScript support while maintaining compatibility with the Vue ecosystem.

**Example:**
```typescript
/// <reference types="vitest" />
import { defineConfig } from 'vite'
import Vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [Vue()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    deps: {
      optimizer: {
        web: {
          include: ['vue', '@vue/test-utils', 'pinia']
        }
      }
    },
    // Performance optimizations
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true
      }
    },
    // Coverage configuration
    coverage: {
      provider: 'istanbul',
      reporter: ['text', 'html', 'clover', 'json'],
      exclude: [
        'node_modules/',
        'src/test/',
        '**/*.d.ts',
        '**/*.config.{js,ts}'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        }
      }
    }
  }
})
```

**Set up comprehensive test environment.**  
Configure global test setup with proper mocks and utilities for consistent testing experience.  

*Why?* Eliminates boilerplate setup in individual tests and ensures consistent testing environment across the project.

**Example:**
```typescript
// vitest.setup.ts
import { config } from '@vue/test-utils'
import { vi } from 'vitest'

// Global test configuration
config.global.stubs = {
  'router-link': true,
  'router-view': true,
  'transition': false,
  'transition-group': false
}

// Mock window properties
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))
```

## Component Testing Strategies

**Test components from the user's perspective.**  
Focus on testing behavior and user interactions rather than implementation details.  

*Why?* Provides more reliable tests that don't break with refactoring and better represent actual usage scenarios.

**Example:**
```typescript
// components/__tests__/UserCard.test.ts
import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/vue'
import { createTestingPinia } from '@pinia/testing'
import UserCard from '../UserCard.vue'

describe('UserCard', () => {
  const mockUser = {
    id: '1',
    name: 'John Doe',
    email: 'john@example.com',
    role: 'admin'
  }

  const renderComponent = (props = {}) => {
    return render(UserCard, {
      props: { user: mockUser, ...props },
      global: {
        plugins: [createTestingPinia()]
      }
    })
  }
  
  it('displays user information correctly', () => {
    renderComponent()
    
    expect(screen.getByText('John Doe')).toBeInTheDocument()
    expect(screen.getByText('john@example.com')).toBeInTheDocument()
    expect(screen.getByText('admin')).toBeInTheDocument()
  })
  
  it('emits edit event when edit button is clicked', async () => {
    const { emitted } = renderComponent()
    
    await fireEvent.click(screen.getByText('Edit'))
    
    expect(emitted().edit).toHaveLength(1)
    expect(emitted().edit[0]).toEqual([mockUser])
  })

  it('shows loading state when user data is being updated', async () => {
    renderComponent({ loading: true })
    
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /edit/i })).toBeDisabled()
  })
})
```

**Test component slots and scoped slots appropriately.**  
Verify that components properly handle different slot configurations and pass correct data to scoped slots.  

*Why?* Ensures component composability works correctly and slot content is rendered as expected.

**Example:**
```typescript
import { render } from '@testing-library/vue'

describe('DataTable slots', () => {
  it('renders custom header slot content', () => {
    const { container } = render(DataTable, {
      props: { data: mockData },
      slots: {
        header: '<div data-testid="custom-header">Custom Header</div>'
      }
    })
    
    expect(container.querySelector('[data-testid="custom-header"]')).toBeInTheDocument()
  })

  it('passes correct data to scoped slots', () => {
    render(DataTable, {
      props: { data: mockData },
      slots: {
        default: `
          <template #default="{ item, index }">
            <div data-testid="item-{{ index }}">{{ item.name }}</div>
          </template>
        `
      }
    })
    
    expect(screen.getByTestId('item-0')).toHaveTextContent('First Item')
  })
})
```

## Composables Testing Patterns

**Test composables independently and with lifecycle simulation.**  
Create focused tests for composables that properly simulate Vue's lifecycle when needed.  

*Why?* Ensures composables work correctly in isolation and provides better debugging when issues arise.

**Example:**
```typescript
// composables/__tests__/useCounter.test.ts
import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { useCounter } from '../useCounter'

describe('useCounter', () => {
  it('initializes with default value', () => {
    const { count, increment, decrement } = useCounter()
    expect(count.value).toBe(0)
  })
  
  it('increments and decrements correctly', () => {
    const { count, increment, decrement } = useCounter()
    
    increment()
    expect(count.value).toBe(1)
    
    decrement()
    expect(count.value).toBe(0)
  })

  it('accepts initial value', () => {
    const { count } = useCounter(10)
    expect(count.value).toBe(10)
  })
})

// For composables with lifecycle hooks
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

describe('useApiData', () => {
  it('fetches data on mount', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      json: () => Promise.resolve({ data: 'test' })
    })
    global.fetch = mockFetch

    const [result, app] = withSetup(() => useApiData('/api/test'))
    
    await nextTick()
    expect(result.data.value).toEqual({ data: 'test' })
    expect(mockFetch).toHaveBeenCalledWith('/api/test')
    
    app.unmount()
  })
})
```

**Test composables with dependency injection.**  
Verify that composables work correctly with provided dependencies and handle missing dependencies gracefully.  

*Why?* Ensures composables properly handle dependency injection patterns used in Vue applications.

**Example:**
```typescript
function withProviders<T>(
  composable: () => T, 
  provides: Record<string, any> = {}
): [T, App] {
  let result: T
  const app = createApp({
    setup() {
      // Provide dependencies
      Object.keys(provides).forEach(key => {
        provide(key, provides[key])
      })
      result = composable()
      return () => {}
    }
  })
  app.mount(document.createElement('div'))
  return [result!, app]
}

describe('useAuthenticatedApi', () => {
  it('uses injected auth service', () => {
    const mockAuthService = { 
      token: 'test-token',
      isAuthenticated: true 
    }
    
    const [result] = withProviders(
      () => useAuthenticatedApi(),
      { authService: mockAuthService }
    )
    
    expect(result.headers.value.Authorization).toBe('Bearer test-token')
  })

  it('handles missing auth service gracefully', () => {
    const [result] = withProviders(() => useAuthenticatedApi())
    
    expect(result.headers.value.Authorization).toBeUndefined()
    expect(result.isAuthenticated.value).toBe(false)
  })
})
```

## Mocking Strategies

**Mock API calls effectively with proper error handling.**  
Create comprehensive mocks for API interactions including success, error, and edge cases.  

*Why?* Ensures tests are reliable, fast, and can cover various scenarios without depending on external services.

**Example:**
```typescript
import { vi, beforeEach, afterEach } from 'vitest'

// Global fetch mock
const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => {
  mockFetch.mockClear()
})

describe('API Service', () => {
  it('handles successful API response', async () => {
    const mockData = { id: 1, name: 'Test User' }
    
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => mockData,
      headers: new Headers({ 'content-type': 'application/json' })
    })

    const result = await fetchUser(1)
    
    expect(result).toEqual(mockData)
    expect(mockFetch).toHaveBeenCalledWith('/api/users/1', expect.objectContaining({
      method: 'GET',
      headers: expect.objectContaining({
        'Content-Type': 'application/json'
      })
    }))
  })

  it('handles API errors correctly', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'))
    
    await expect(fetchUser(1)).rejects.toThrow('Network error')
  })

  it('handles HTTP error responses', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: 'User not found' })
    })

    await expect(fetchUser(999)).rejects.toThrow('User not found')
  })
})
```

**Mock Pinia stores with testing utilities.**  
Use Pinia testing utilities to create isolated store instances for component testing.  

*Why?* Provides clean, isolated testing environment for components that depend on Pinia stores.

**Example:**
```typescript
import { createTestingPinia } from '@pinia/testing'
import { vi } from 'vitest'

describe('Component with Store', () => {
  it('interacts with store correctly', () => {
    const wrapper = mount(UserDashboard, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: false,
            initialState: {
              user: { 
                currentUser: { name: 'Test User', role: 'admin' },
                loading: false
              }
            }
          })
        ]
      }
    })

    const userStore = useUserStore()
    
    expect(wrapper.text()).toContain('Test User')
    expect(userStore.currentUser.name).toBe('Test User')
  })

  it('handles store actions', async () => {
    const wrapper = mount(UserProfile, {
      global: {
        plugins: [createTestingPinia({ createSpy: vi.fn })]
      }
    })

    const userStore = useUserStore()
    
    await wrapper.find('[data-testid="refresh-button"]').trigger('click')
    
    expect(userStore.fetchCurrentUser).toHaveBeenCalled()
  })
})
```

**Mock external dependencies and browser APIs.**  
Create proper mocks for external libraries and browser APIs to ensure consistent test execution.  

*Why?* Eliminates external dependencies in tests and ensures tests run consistently across different environments.

**Example:**
```typescript
// Mock Vue Router
vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    go: vi.fn()
  }),
  useRoute: () => ({
    params: { id: '1' },
    query: { tab: 'profile' },
    path: '/users/1'
  })
}))

// Mock external library
vi.mock('chart.js', () => ({
  Chart: vi.fn().mockImplementation(() => ({
    destroy: vi.fn(),
    update: vi.fn(),
    resize: vi.fn()
  }))
}))

// Mock browser APIs
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: vi.fn(),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn()
  }
})
```

## Integration Testing

**Test component interactions and data flow.**  
Verify that multiple components work together correctly and data flows properly between them.  

*Why?* Catches integration issues that unit tests might miss and ensures the application works as a cohesive whole.

**Example:**
```typescript
describe('User Management Integration', () => {
  let wrapper: any

  beforeEach(() => {
    wrapper = mount(UserManagementPage, {
      global: {
        plugins: [
          createTestingPinia({
            initialState: {
              user: { 
                users: mockUsers,
                loading: false,
                error: null
              }
            }
          }),
          createRouter({
            history: createMemoryHistory(),
            routes: mockRoutes
          })
        ]
      }
    })
  })

  it('displays user list and allows editing', async () => {
    // Verify user list is displayed
    expect(wrapper.findAll('[data-testid="user-card"]')).toHaveLength(mockUsers.length)
    
    // Click edit button on first user
    await wrapper.findAll('[data-testid="edit-button"]')[0].trigger('click')
    
    // Verify edit modal appears
    expect(wrapper.find('[data-testid="edit-user-modal"]').exists()).toBe(true)
    
    // Update user name
    await wrapper.find('[data-testid="user-name-input"]').setValue('Updated Name')
    await wrapper.find('[data-testid="save-button"]').trigger('click')
    
    // Verify user is updated in the list
    expect(wrapper.text()).toContain('Updated Name')
  })

  it('handles user deletion workflow', async () => {
    const userStore = useUserStore()
    
    // Click delete button
    await wrapper.find('[data-testid="delete-button"]').trigger('click')
    
    // Confirm deletion
    await wrapper.find('[data-testid="confirm-delete"]').trigger('click')
    
    // Verify store action was called
    expect(userStore.deleteUser).toHaveBeenCalledWith(mockUsers[0].id)
  })
})
```

## Performance Testing

**Test component rendering performance.**  
Create benchmarks for components to ensure they meet performance requirements, especially for large lists or complex components.  

*Why?* Identifies performance regressions early and ensures components can handle expected data volumes.

**Example:**
```typescript
import { bench, describe } from 'vitest'

describe('Component Performance', () => {
  bench('render large user list', () => {
    const wrapper = mount(UserList, {
      props: {
        users: Array.from({ length: 1000 }, (_, i) => ({
          id: i,
          name: `User ${i}`,
          email: `user${i}@example.com`
        }))
      }
    })
    wrapper.unmount()
  })

  bench('update reactive state with large dataset', () => {
    const state = reactive({ 
      items: Array.from({ length: 1000 }, (_, i) => ({ id: i, value: i }))
    })
    
    // Simulate updates
    for (let i = 0; i < 100; i++) {
      state.items[i].value = Math.random()
    }
  })
})
```

**Test for memory leaks in components.**  
Verify that components properly clean up resources and don't cause memory leaks.  

*Why?* Prevents memory leaks that can degrade application performance over time.

**Example:**
```typescript
describe('Memory Management', () => {
  it('cleans up event listeners on unmount', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    
    const wrapper = mount(ComponentWithEventListeners)
    
    expect(addEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
    
    wrapper.unmount()
    
    expect(removeEventListener).toHaveBeenCalledWith('resize', expect.any(Function))
  })

  it('cancels pending API requests on unmount', async () => {
    const abortController = new AbortController()
    const mockFetch = vi.fn().mockImplementation(() => 
      new Promise((resolve) => {
        abortController.signal.addEventListener('abort', () => {
          throw new Error('Request cancelled')
        })
      })
    )
    global.fetch = mockFetch

    const wrapper = mount(ComponentWithApiCall)
    
    wrapper.unmount()
    
    expect(abortController.signal.aborted).toBe(true)
  })
})
```

## Coverage & Quality Metrics

**Maintain high test coverage with meaningful tests.**  
Focus on testing critical functionality rather than achieving 100% coverage for its own sake.  

*Why?* Ensures important code paths are tested while avoiding the overhead of testing trivial code.

**Example package.json scripts:**
```json
{
  "scripts": {
    "test": "vitest",
    "test:ui": "vitest --ui",
    "test:coverage": "vitest --coverage",
    "test:run": "vitest run",
    "test:watch": "vitest --watch",
    "test:e2e": "playwright test"
  }
}
```

**Use testing utilities for consistent test quality.**  
Create shared testing utilities and helpers to maintain consistency across tests.  

*Why?* Reduces boilerplate, ensures consistent testing patterns, and makes tests easier to maintain.

**Example:**
```typescript
// test/utils.ts
export const createMockUser = (overrides = {}) => ({
  id: '1',
  name: 'Test User',
  email: 'test@example.com',
  role: 'user',
  ...overrides
})

export const renderWithProviders = (component: any, options = {}) => {
  return render(component, {
    global: {
      plugins: [
        createTestingPinia(),
        createRouter({
          history: createMemoryHistory(),
          routes: []
        })
      ],
      ...options.global
    },
    ...options
  })
}

export const waitForAsyncComponent = async () => {
  await flushPromises()
  await nextTick()
}
```

## CI/CD Integration

**Configure automated testing in CI/CD pipelines.**  
Set up comprehensive testing workflows that run on every commit and pull request.  

*Why?* Ensures code quality is maintained and prevents regressions from reaching production.

**Example GitHub Actions workflow:**
```yaml
name: Test Suite
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run unit tests
        run: npm run test:run
      
      - name: Run component tests with coverage
        run: npm run test:coverage
      
      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/clover.xml
          
      - name: Run E2E tests
        run: npm run test:e2e
        
  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build application
        run: npm run build
      
      - name: Run build tests
        run: npm run test:build
```
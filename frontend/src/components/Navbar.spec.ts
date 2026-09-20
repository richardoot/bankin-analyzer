import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import Navbar from './Navbar.vue'

const authState: {
  loading: boolean
  isAuthenticated: boolean
  user: { email: string } | null
  signOut: () => Promise<void>
} = {
  loading: false,
  isAuthenticated: false,
  user: null,
  signOut: vi.fn().mockResolvedValue(undefined),
}
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))
vi.mock('@/stores/theme', () => ({
  useThemeStore: () => ({
    isDark: false,
    toggleTheme: vi.fn(),
    toggle: vi.fn(),
  }),
}))

const Blank = { template: '<div />' }

async function mountNavbar(path = '/') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      '/',
      '/dashboard',
      '/accounts',
      '/transactions',
      '/reimbursements',
      '/budget',
      '/tags',
      '/login',
    ].map(path => ({ path, component: Blank })),
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(Navbar, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('Navbar logo', () => {
  beforeEach(() => {
    authState.isAuthenticated = false
    authState.user = null
  })

  it('takes a visitor to the public homepage', async () => {
    const wrapper = await mountNavbar()

    expect(wrapper.find('[data-testid="navbar-logo"]').attributes('href')).toBe(
      '/'
    )
  })

  it('takes a signed-in user to their dashboard, never to the pitch', async () => {
    authState.isAuthenticated = true
    authState.user = { email: 'someone@example.com' }

    const wrapper = await mountNavbar('/dashboard')

    expect(wrapper.find('[data-testid="navbar-logo"]').attributes('href')).toBe(
      '/dashboard'
    )
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import Navbar from './Navbar.vue'
import {
  resetMobileNavigation,
  useMobileMenu,
} from '@/composables/useMobileNavigation'

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

describe('Navbar mobile menu', () => {
  const pages = [
    '/dashboard',
    '/accounts',
    '/transactions',
    '/reimbursements',
    '/budget',
    '/recurrences',
    '/tags',
    '/profile',
    '/settings',
    '/oauth/consent',
  ]

  async function mountAt(path: string) {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', component: Blank },
        { path: '/privacy', component: Blank },
        ...pages.map(p => ({
          path: p,
          component: Blank,
          meta: {
            requiresAuth: true,
            ...(p === '/oauth/consent' ? { tabBar: false } : {}),
          },
        })),
      ],
    })
    await router.push(path)
    await router.isReady()
    const wrapper = mount(Navbar, {
      global: { plugins: [router] },
      attachTo: document.body,
    })
    await flushPromises()
    return { wrapper, router }
  }

  beforeEach(() => {
    resetMobileNavigation()
    authState.isAuthenticated = true
    authState.user = { email: 'someone@example.com' }
  })

  it('hands the door to « Plus » on a page with a tab bar: no hamburger', async () => {
    const { wrapper } = await mountAt('/dashboard')

    expect(
      wrapper.find('[data-testid="nav-mobile-menu-button"]').exists()
    ).toBe(false)
    wrapper.unmount()
  })

  it('keeps the hamburger where there is no tab bar', async () => {
    authState.isAuthenticated = false
    authState.user = null
    const visitor = await mountAt('/privacy')
    expect(
      visitor.wrapper.find('[data-testid="nav-mobile-menu-button"]').exists()
    ).toBe(true)
    visitor.wrapper.unmount()

    authState.isAuthenticated = true
    const consent = await mountAt('/oauth/consent')
    expect(
      consent.wrapper.find('[data-testid="nav-mobile-menu-button"]').exists()
    ).toBe(true)
    consent.wrapper.unmount()
  })

  it('lists behind « Plus » only what the four tabs do not show, as a sheet on the bar', async () => {
    const { wrapper } = await mountAt('/accounts')

    useMobileMenu().open()
    await flushPromises()

    const sheet = wrapper.get('[data-testid="mobile-menu"]')
    const labels = sheet.findAll('a').map(a => a.text())
    expect(labels).toEqual([
      'Comptes',
      'Remboursements',
      'Étiquettes',
      'Mon profil',
      'Réglages',
    ])
    expect(sheet.text()).toContain('Déconnexion')
    expect(sheet.classes()).toContain('bottom-[var(--tab-bar-space)]')
    wrapper.unmount()
  })

  it('lists every page from the hamburger, dropping under the bar', async () => {
    const { wrapper } = await mountAt('/oauth/consent')

    await wrapper.get('[data-testid="nav-mobile-menu-button"]').trigger('click')

    const menu = wrapper.get('[data-testid="mobile-menu"]')
    expect(menu.findAll('a').map(a => a.text())).toEqual(
      expect.arrayContaining([
        'Dashboard',
        'Transactions',
        'Budget',
        'Récurrences',
        'Remboursements',
      ])
    )
    expect(menu.classes()).not.toContain('fixed')
    wrapper.unmount()
  })

  it('closes on Escape and on arriving at the page picked', async () => {
    const { wrapper, router } = await mountAt('/dashboard')
    const menu = useMobileMenu()

    menu.open()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(menu.isOpen.value).toBe(false)

    menu.open()
    await router.push('/tags')
    await flushPromises()
    expect(menu.isOpen.value).toBe(false)
    wrapper.unmount()
  })
})

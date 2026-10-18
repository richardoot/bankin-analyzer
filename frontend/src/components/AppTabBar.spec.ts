import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { defineComponent, ref } from 'vue'
import AppTabBar from './AppTabBar.vue'
import {
  resetMobileNavigation,
  useMobileMenu,
  useSuppressTabBar,
} from '@/composables/useMobileNavigation'

const authState = { isAuthenticated: true }
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

const Blank = { template: '<div />' }

const APP_PAGES = [
  '/dashboard',
  '/transactions',
  '/budget',
  '/recurrences',
  '/reimbursements',
  '/accounts',
  '/tags',
]
const PUBLIC_PAGES = ['/', '/login', '/privacy', '/terms', '/bank-callback']

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      ...APP_PAGES.map(p => ({
        path: p,
        component: Blank,
        meta: { requiresAuth: true },
      })),
      ...PUBLIC_PAGES.map(p => ({ path: p, component: Blank })),
      {
        path: '/oauth/consent',
        component: Blank,
        meta: { requiresAuth: true, tabBar: false },
      },
    ],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(AppTabBar, {
    global: { plugins: [router] },
    attachTo: document.body,
  })
  await flushPromises()
  return { wrapper, router }
}

const isHidden = (el: Element): boolean =>
  (el as HTMLElement).style.display === 'none'

describe('AppTabBar', () => {
  beforeEach(() => {
    resetMobileNavigation()
    authState.isAuthenticated = true
  })

  it('draws four tabs and « Plus » below lg only, opaque, above the home indicator', async () => {
    const { wrapper } = await mountAt('/dashboard')

    const bar = wrapper.get('[data-testid="tab-bar"]')
    expect(bar.attributes()).toHaveProperty('data-tab-bar')
    expect(bar.classes()).toEqual(
      expect.arrayContaining([
        'lg:hidden',
        'fixed',
        'bottom-0',
        'bg-white',
        'dark:bg-slate-900',
        'border-t',
        'pb-[env(safe-area-inset-bottom)]',
      ])
    )
    expect(bar.findAll('a, button').map(el => el.text())).toEqual([
      'Dashboard',
      'Transactions',
      'Budget',
      'Récurrences',
      'Plus',
    ])
    expect(
      bar.findAll('a, button').map(el => el.classes('min-h-[44px]'))
    ).toEqual([true, true, true, true, true])
    wrapper.unmount()
  })

  it('marks the current tab as the page, in primary', async () => {
    const { wrapper } = await mountAt('/budget')

    const current = wrapper.findAll('[aria-current="page"]')
    expect(current.map(el => el.attributes('data-testid'))).toEqual([
      'tab-bar-budget',
    ])
    expect(current.map(el => el.classes('text-primary-700'))).toEqual([true])
    expect(
      wrapper.get('[data-testid="tab-bar-dashboard"]').classes()
    ).not.toContain('text-primary-700')
    expect(wrapper.get('[data-testid="tab-bar-more"]').classes()).not.toContain(
      'text-primary-700'
    )
    wrapper.unmount()
  })

  it('lights « Plus » on a page that lives in the menu, without calling it the page', async () => {
    const { wrapper } = await mountAt('/reimbursements')

    const more = wrapper.get('[data-testid="tab-bar-more"]')
    expect(more.classes()).toContain('text-primary-700')
    expect(more.attributes('aria-current')).toBeUndefined()
    expect(wrapper.findAll('[aria-current="page"]')).toHaveLength(0)
    wrapper.unmount()
  })

  it('opens and closes the shared menu from « Plus »', async () => {
    const { wrapper } = await mountAt('/dashboard')
    const more = wrapper.get('[data-testid="tab-bar-more"]')
    const menu = useMobileMenu()

    expect(more.attributes('aria-controls')).toBe('mobile-menu')
    expect(more.attributes('aria-expanded')).toBe('false')

    await more.trigger('click')
    expect(menu.isOpen.value).toBe(true)
    expect(more.attributes('aria-expanded')).toBe('true')
    // One tab lit at a time: « Plus » while its menu is open, the page
    // still announced as current.
    const dashboard = wrapper.get('[data-testid="tab-bar-dashboard"]')
    expect(more.classes()).toContain('text-primary-700')
    expect(dashboard.classes()).not.toContain('text-primary-700')
    expect(dashboard.attributes('aria-current')).toBe('page')

    await more.trigger('click')
    expect(menu.isOpen.value).toBe(false)
    wrapper.unmount()
  })

  it('closes the menu when a tab is tapped, even the current one', async () => {
    const { wrapper } = await mountAt('/dashboard')
    const menu = useMobileMenu()

    menu.open()
    await wrapper.get('[data-testid="tab-bar-dashboard"]').trigger('click')
    expect(menu.isOpen.value).toBe(false)
    wrapper.unmount()
  })

  it.each([...PUBLIC_PAGES, '/oauth/consent'])('stays off %s', async path => {
    const { wrapper } = await mountAt(path)
    expect(wrapper.find('[data-testid="tab-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('stays off when signed out', async () => {
    authState.isAuthenticated = false
    const { wrapper } = await mountAt('/dashboard')
    expect(wrapper.find('[data-testid="tab-bar"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('gives its place to a page mode with its own bottom bar, and comes back', async () => {
    const selecting = ref(false)
    const Page = defineComponent({
      setup() {
        useSuppressTabBar(selecting)
        return () => null
      },
    })
    const { wrapper } = await mountAt('/transactions')
    const page = mount(Page)

    expect(wrapper.find('[data-testid="tab-bar"]').exists()).toBe(true)

    selecting.value = true
    await flushPromises()
    expect(wrapper.find('[data-tab-bar]').exists()).toBe(false)

    selecting.value = false
    await flushPromises()
    expect(wrapper.find('[data-tab-bar]').exists()).toBe(true)

    // A page that leaves mid-mode does not keep the bar away.
    selecting.value = true
    await flushPromises()
    page.unmount()
    await flushPromises()
    expect(wrapper.find('[data-tab-bar]').exists()).toBe(true)
    wrapper.unmount()
  })

  describe('on a touch screen', () => {
    beforeEach(() => {
      vi.stubGlobal(
        'matchMedia',
        (query: string) =>
          ({
            matches: query === '(pointer: coarse)',
            media: query,
            addEventListener: () => {},
            removeEventListener: () => {},
          }) as unknown as MediaQueryList
      )
    })
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('steps out of the keyboard’s way while a text field has the focus, keeping its room', async () => {
      const { wrapper } = await mountAt('/transactions')
      const input = document.createElement('input')
      const checkbox = document.createElement('input')
      checkbox.type = 'checkbox'
      document.body.append(input, checkbox)
      const bar = (): Element => wrapper.get('[data-tab-bar]').element

      checkbox.focus()
      await flushPromises()
      expect(isHidden(bar())).toBe(false)

      input.focus()
      await flushPromises()
      expect(isHidden(bar())).toBe(true)

      input.blur()
      await flushPromises()
      expect(isHidden(bar())).toBe(false)

      input.remove()
      checkbox.remove()
      wrapper.unmount()
    })
  })

  it('stays put when a field is focused with a mouse and keyboard', async () => {
    const { wrapper } = await mountAt('/transactions')
    const input = document.createElement('input')
    document.body.append(input)

    input.focus()
    await flushPromises()
    expect(isHidden(wrapper.get('[data-tab-bar]').element)).toBe(false)

    input.remove()
    wrapper.unmount()
  })
})

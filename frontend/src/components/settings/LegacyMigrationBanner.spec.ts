import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import LegacyMigrationBanner from './LegacyMigrationBanner.vue'

vi.mock('@/lib/api', () => ({
  api: { getLegacyCategories: vi.fn() },
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

const stubs = { RouterLink: { template: '<a><slot /></a>' } }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('LegacyMigrationBanner', () => {
  it('renders the count it is given without asking the server', () => {
    const wrapper = mount(LegacyMigrationBanner, {
      props: { count: 3, transactionCount: 42 },
      global: { stubs },
    })

    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('42 transactions')
    expect(api.getLegacyCategories).not.toHaveBeenCalled()
  })

  it('fetches the count when none is given, and stays silent at zero', async () => {
    vi.mocked(api.getLegacyCategories).mockResolvedValue({
      categories: [],
      totalTransactions: 0,
    })
    const wrapper = mount(LegacyMigrationBanner, { global: { stubs } })
    await flushPromises()

    expect(api.getLegacyCategories).toHaveBeenCalledTimes(1)
    expect(
      wrapper.find('[data-testid="legacy-migration-banner"]').exists()
    ).toBe(false)
  })

  it('shows up once the server reports legacy categories', async () => {
    vi.mocked(api.getLegacyCategories).mockResolvedValue({
      categories: [
        {
          id: 'c1',
          name: 'Abonnements',
          type: 'EXPENSE',
          icon: null,
          transactionCount: 8,
          isHidden: false,
          budgetPlanEntryCount: 0,
          isCatalog: false,
          catalogKey: null,
          lines: [],
        },
      ],
      totalTransactions: 8,
    })
    const wrapper = mount(LegacyMigrationBanner, { global: { stubs } })
    await flushPromises()

    const banner = wrapper.find('[data-testid="legacy-migration-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('1')
    expect(banner.text()).toContain('8 transactions')
  })

  it('stays out of the way when the request fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(api.getLegacyCategories).mockRejectedValue(new Error('down'))
    const wrapper = mount(LegacyMigrationBanner, { global: { stubs } })
    await flushPromises()

    expect(
      wrapper.find('[data-testid="legacy-migration-banner"]').exists()
    ).toBe(false)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ImportRecapPage from './ImportRecapPage.vue'
import type { ImportHistoryDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { getImportHistory: vi.fn() },
}))

import { api } from '@/lib/api'

const history: ImportHistoryDto = {
  id: 'import-1',
  status: 'COMPLETED',
  transactionsImported: 45,
  categoriesCreated: 0,
  duplicatesSkipped: 5,
  totalInFile: 50,
  dateRangeStart: '2024-01-03T00:00:00.000Z',
  dateRangeEnd: '2024-01-28T00:00:00.000Z',
  accounts: ['Compte Courant'],
  fileName: 'export.csv',
  createdAt: '2024-02-01T10:30:00.000Z',
}

const stub = { template: '<div />' }
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: stub },
    { path: '/accounts', component: stub },
    { path: '/import', name: 'import', component: stub },
    { path: '/import/history', component: stub },
    { path: '/transactions', component: stub },
    {
      path: '/import/recap/:id',
      name: 'import-recap',
      component: ImportRecapPage,
    },
  ],
})

async function mountPage(id = 'import-1') {
  await router.push(`/import/recap/${id}`)
  await router.isReady()
  const wrapper = mount(ImportRecapPage, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('ImportRecapPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('reads the import back from the history and shows its figures', async () => {
    vi.mocked(api.getImportHistory).mockResolvedValue(history)
    const wrapper = await mountPage()

    expect(api.getImportHistory).toHaveBeenCalledWith('import-1')
    expect(wrapper.text()).toContain('Import terminé')
    expect(wrapper.get('[data-testid="recap-imported"]').text()).toBe('45')
    expect(wrapper.get('[data-testid="recap-duplicates"]').text()).toBe('5')
    expect(wrapper.get('[data-testid="recap-total"]').text()).toBe('50')
    expect(wrapper.get('[data-testid="recap-accounts"]').text()).toBe('1')
    expect(wrapper.text()).toContain('export.csv')
    expect(wrapper.text()).toContain('5 transactions en doublon')
    // No invented « catégories » figure any more.
    expect(wrapper.text()).not.toContain('Catégories')
  })

  it('closes the flow: transactions it imported, accounts, history, a new import', async () => {
    vi.mocked(api.getImportHistory).mockResolvedValue(history)
    const wrapper = await mountPage()

    const transactions = wrapper.get('[data-testid="recap-transactions"]')
    // Exactly the rows this import wrote, by its id — not a date window.
    expect(transactions.attributes('href')).toMatch(
      /^\/transactions\?import=import-1&label=Import\+du\+/
    )
    expect(wrapper.get('[data-testid="back-link"]').attributes('href')).toBe(
      '/accounts'
    )
    expect(
      wrapper.get('[data-testid="recap-history"]').attributes('href')
    ).toBe('/import/history')
    expect(
      wrapper.get('[data-testid="recap-new-import"]').attributes('href')
    ).toBe('/import')
  })

  it('stands in with a skeleton, then says when the import cannot be read', async () => {
    let reject: (err: Error) => void = () => {}
    vi.mocked(api.getImportHistory).mockReturnValue(
      new Promise((_, r) => {
        reject = r
      })
    )
    const wrapper = await mountPage('missing')
    expect(wrapper.find('[data-testid="recap-loading"]').exists()).toBe(true)

    reject(new Error('Cet import est introuvable'))
    await flushPromises()
    expect(wrapper.get('[data-testid="recap-error"]').text()).toContain(
      'introuvable'
    )
    expect(wrapper.find('[data-testid="recap-retry"]').exists()).toBe(true)
  })
})

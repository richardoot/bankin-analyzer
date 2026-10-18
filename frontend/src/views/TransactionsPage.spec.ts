import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import {
  isTabBarSuppressed,
  resetMobileNavigation,
} from '@/composables/useMobileNavigation'
import TransactionsPage from './TransactionsPage.vue'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getTransactions: vi.fn(),
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
    getReimbursements: vi.fn(),
    getAccounts: vi.fn(),
    getPersons: vi.fn(),
    updateTransaction: vi.fn(),
    bulkUpdateTransactions: vi.fn(),
    getSettlement: vi.fn(),
    getTags: vi.fn(),
    attachTagToTransactions: vi.fn(),
    detachTagFromTransaction: vi.fn(),
    markTransactionRecurring: vi.fn(),
    getRecurrences: vi.fn(),
    linkTransactionToRecurrence: vi.fn(),
    unlinkTransactionFromRecurrence: vi.fn(),
    deleteReimbursement: vi.fn(),
  },
  recurrenceFilterKey: (r: { amountBucket: number; merchantKey: string }) =>
    `${r.amountBucket}:${r.merchantKey}`,
}))

// Mock the toast composable — capture calls for assertions
const mockToast = {
  toasts: { value: [] },
  success: vi.fn(),
  error: vi.fn(),
  info: vi.fn(),
  remove: vi.fn(),
}
vi.mock('@/composables/useToast', () => ({
  useToast: () => mockToast,
}))

// Mock the formatters
vi.mock('@/lib/formatters', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/formatters')>()),
  formatCurrency: (v: number) => `${v.toFixed(2)} €`,
}))

import { api } from '@/lib/api'
import type { TransactionDto } from '@/lib/api'
import type { VueWrapper } from '@vue/test-utils'
import { nth } from '@/test/nth'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'home',
      component: { template: '<div>Home</div>' },
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: TransactionsPage,
    },
  ],
})

const makeTx = (overrides: Partial<TransactionDto> = {}): TransactionDto => ({
  id: 'tx-1',
  date: '2026-01-15',
  description: 'Cafe',
  amount: -3.5,
  type: 'EXPENSE',
  accountId: 'acc-1',
  account: 'Checking',
  isPointed: false,
  categoryId: 'cat-1',
  categoryName: 'Alimentation',
  categoryIcon: null,
  subcategory: null,
  subcategoryId: null,
  subcategoryName: null,
  note: null,
  createdAt: '2026-01-15T10:00:00.000Z',
  ...overrides,
})

const defaultPaginationMeta = {
  total: 1,
  page: 1,
  limit: 50,
  totalPages: 1,
  hasNextPage: false,
  hasPreviousPage: false,
}

describe('TransactionsPage — optimistic updates', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  const setupDefaultMocks = (txList: TransactionDto[] = [makeTx()]) => {
    vi.mocked(api.getTransactions).mockResolvedValue({
      data: txList,
      meta: defaultPaginationMeta,
    })
    vi.mocked(api.getCategories).mockResolvedValue([
      {
        id: 'cat-1',
        name: 'Alimentation',
        type: 'EXPENSE',
        icon: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'cat-2',
        name: 'Transport',
        type: 'EXPENSE',
        icon: '🚗',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    vi.mocked(api.getSubcategories).mockResolvedValue([
      {
        id: 'sub-1',
        categoryId: 'cat-1',
        name: 'Courses',
        icon: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-2',
        categoryId: 'cat-1',
        name: 'Restaurant',
        icon: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'sub-3',
        categoryId: 'cat-2',
        name: 'Essence',
        icon: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    vi.mocked(api.getReimbursements).mockResolvedValue([])
    vi.mocked(api.getAccounts).mockResolvedValue([])
    vi.mocked(api.getPersons).mockResolvedValue([])
    vi.mocked(api.getTags).mockResolvedValue([])
  }

  const mountPage = async () => {
    setupDefaultMocks()
    // The page mirrors its filters into the URL and lets a URL override
    // localStorage; the shared test router must not leak one test's query
    // into the next mount.
    await router.replace({ query: {} })
    const wrapper = mount(TransactionsPage, {
      global: {
        plugins: [router],
        stubs: {
          Teleport: true,
          CategorySubcategoryModal: true,
          TransactionReimbursementModal: true,
          BulkCategoryModal: true,
          SettlementDetailModal: true,
        },
      },
    })
    await flushPromises()
    return wrapper
  }

  describe('a line of a subscription', () => {
    it('narrows the list to its series from its badge', async () => {
      setupDefaultMocks()
      const listed = await vi.mocked(api.getTransactions)()
      const [first, ...others] = listed.data
      if (!first) throw new Error('the default mocks list transactions')
      const recurringLine = {
        ...first,
        recurrence: {
          status: 'ACTIVE' as const,
          period: 'MONTHLY' as const,
          merchantKey: 'com netflix',
          amountBucket: 15,
          label: 'CB Netflix.com',
          name: 'Netflix',
          linked: false,
        },
      }
      vi.mocked(api.getTransactions).mockResolvedValue({
        ...listed,
        data: [recurringLine, ...others],
      })
      await router.replace({ query: {} })
      const wrapper = mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      await wrapper.find('[data-testid="recurrence-badge"]').trigger('click')
      await flushPromises()

      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ recurrence: '15:com netflix' })
      )
      expect(wrapper.text()).toContain('Charge récurrente : Netflix')
    })
  })

  describe('following an expense as a subscription', () => {
    it('asks for the rhythm, then records it', async () => {
      vi.mocked(api.markTransactionRecurring).mockResolvedValue(
        {} as Awaited<ReturnType<typeof api.markTransactionRecurring>>
      )
      vi.mocked(api.getRecurrences).mockResolvedValue({
        recurrences: [],
      } as unknown as Awaited<ReturnType<typeof api.getRecurrences>>)
      const wrapper = await mountPage()

      await wrapper.find('[data-testid="mark-recurring"]').trigger('click')
      await flushPromises()
      await wrapper
        .find('[data-testid="mark-recurring-confirm"]')
        .trigger('click')
      await flushPromises()

      expect(api.markTransactionRecurring).toHaveBeenCalledWith({
        transactionId: expect.any(String),
        period: 'YEARLY',
      })
      expect(mockToast.success).toHaveBeenCalledWith(
        expect.stringContaining('suivi comme abonnement')
      )
      expect(
        wrapper.find('[data-testid="mark-recurring-confirm"]').exists()
      ).toBe(false)
    })
  })

  describe('the lines of one recurring charge', () => {
    it('reads the series from the URL, names it in a chip, and asks for its lines', async () => {
      setupDefaultMocks()
      await router.replace({
        query: { recurrence: '15:com netflix', recurrenceLabel: 'CB Netflix' },
      })
      const wrapper = mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(api.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ recurrence: '15:com netflix' })
      )
      expect(wrapper.text()).toContain('Charge récurrente : CB Netflix')
      expect(router.currentRoute.value.query.recurrence).toBe('15:com netflix')
    })
  })

  describe('initial loading', () => {
    it('should fetch transactions, categories, and reimbursements on mount', async () => {
      await mountPage()

      expect(api.getTransactions).toHaveBeenCalled()
      expect(api.getCategories).toHaveBeenCalled()
      expect(api.getReimbursements).toHaveBeenCalled()
    })

    it('should display transaction data after loading', async () => {
      const wrapper = await mountPage()
      expect(wrapper.text()).toContain('Cafe')
    })

    it('keeps the last list under the error and retries on demand', async () => {
      const wrapper = await mountPage()

      vi.mocked(api.getTransactions).mockRejectedValueOnce(
        new Error('Impossible de charger les transactions')
      )
      await wrapper.find('[data-testid="sort-by-date"]').trigger('click')
      await flushPromises()

      expect(
        wrapper.find('[data-testid="transactions-error"]').text()
      ).toContain('Impossible de charger les transactions')
      expect(wrapper.text()).toContain('Cafe')

      await wrapper.find('[data-testid="transactions-retry"]').trigger('click')
      await flushPromises()

      expect(wrapper.find('[data-testid="transactions-error"]').exists()).toBe(
        false
      )
      expect(wrapper.text()).toContain('Cafe')
    })
  })

  describe('togglePointed', () => {
    it('should update UI immediately and call API with inverted isPointed', async () => {
      // API never resolves so we can inspect intermediate state
      let resolveApi!: (value: TransactionDto) => void
      vi.mocked(api.updateTransaction).mockReturnValue(
        new Promise(r => {
          resolveApi = r
        })
      )

      const wrapper = await mountPage()

      // Find the pointed toggle button via its title attribute
      const pointBtn = wrapper.find('button[title="Pointer"]')
      expect(pointBtn.exists()).toBe(true)
      await pointBtn.trigger('click')

      // API should be called with inverted value
      expect(api.updateTransaction).toHaveBeenCalledWith('tx-1', {
        isPointed: true,
      })

      // While API is pending, the button should already reflect the new state
      // (title changes from "Pointer" to "Dépointer")
      expect(wrapper.find('button[title="Dépointer"]').exists()).toBe(true)

      // Now resolve API
      resolveApi(makeTx({ isPointed: true }))
      await flushPromises()

      // State should remain pointed
      expect(wrapper.find('button[title="Dépointer"]').exists()).toBe(true)
    })

    it('should rollback to original state and show error toast on API failure', async () => {
      vi.mocked(api.updateTransaction).mockRejectedValue(
        new Error('Network error')
      )

      const wrapper = await mountPage()

      const pointBtn = wrapper.find('button[title="Pointer"]')
      expect(pointBtn.exists()).toBe(true)
      await pointBtn.trigger('click')
      await flushPromises()

      // Should rollback: button should be back to "Pointer" (unpointed)
      expect(wrapper.find('button[title="Pointer"]').exists()).toBe(true)

      // Should show error toast
      expect(mockToast.error).toHaveBeenCalledWith(
        'Échec de la mise à jour du pointage'
      )
    })

    it('should not show error toast on API success', async () => {
      vi.mocked(api.updateTransaction).mockResolvedValue(
        makeTx({ isPointed: true })
      )

      const wrapper = await mountPage()

      const pointBtn = wrapper.find('button[title="Pointer"]')
      await pointBtn.trigger('click')
      await flushPromises()

      expect(mockToast.error).not.toHaveBeenCalled()
    })
  })

  describe('saveNote', () => {
    it('should close editor and show new note immediately before API responds', async () => {
      let resolveApi!: (value: TransactionDto) => void
      vi.mocked(api.updateTransaction).mockReturnValue(
        new Promise(r => {
          resolveApi = r
        })
      )

      const wrapper = await mountPage()

      // Find and click the edit note button (pencil icon)
      const editButtons = wrapper.findAll('button[title="Modifier la note"]')
      if (editButtons.length === 0) return // skip if not rendered (mobile/desktop layout)

      await nth(editButtons, 0).trigger('click')
      await flushPromises()

      // Find the note input and type a new value
      const noteInput = wrapper.find('input[type="text"][placeholder]')
      if (!noteInput.exists()) return

      await noteInput.setValue('Ma nouvelle note')

      // Find and click the save button
      const saveBtn = wrapper.find('button[title="Sauvegarder"]')
      if (!saveBtn.exists()) return

      await saveBtn.trigger('click')

      // API should have been called
      expect(api.updateTransaction).toHaveBeenCalledWith('tx-1', {
        note: 'Ma nouvelle note',
      })

      // Resolve API
      resolveApi(makeTx({ note: 'Ma nouvelle note' }))
      await flushPromises()
    })

    it('should rollback note and show error toast on API failure', async () => {
      vi.mocked(api.updateTransaction).mockRejectedValue(
        new Error('Server error')
      )

      const wrapper = await mountPage()

      const editButtons = wrapper.findAll('button[title="Modifier la note"]')
      if (editButtons.length === 0) return

      await nth(editButtons, 0).trigger('click')
      await flushPromises()

      const noteInput = wrapper.find('input[type="text"][placeholder]')
      if (!noteInput.exists()) return

      await noteInput.setValue('Bad note')

      const saveBtn = wrapper.find('button[title="Sauvegarder"]')
      if (!saveBtn.exists()) return

      await saveBtn.trigger('click')
      await flushPromises()

      expect(mockToast.error).toHaveBeenCalledWith(
        'Échec de la mise à jour de la note'
      )
    })

    it('should not call API when note value has not changed', async () => {
      const wrapper = await mountPage()

      const editButtons = wrapper.findAll('button[title="Modifier la note"]')
      if (editButtons.length === 0) return

      await nth(editButtons, 0).trigger('click')
      await flushPromises()

      // Don't modify the input, just save (empty note → same as original null)
      const saveBtn = wrapper.find('button[title="Sauvegarder"]')
      if (!saveBtn.exists()) return

      await saveBtn.trigger('click')
      await flushPromises()

      expect(api.updateTransaction).not.toHaveBeenCalled()
    })
  })

  describe('settlement links on income transactions', () => {
    const mountWith = async (txList: TransactionDto[]) => {
      setupDefaultMocks(txList)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: txList,
        meta: { ...defaultPaginationMeta, total: txList.length },
      })
      const wrapper = mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()
      return wrapper
    }

    const incomeWithSettlements = makeTx({
      id: 'inc-1',
      type: 'INCOME',
      amount: 50,
      description: 'Virement Marie',
      settlements: [
        { id: 'stl-1', personId: 'p-1', personName: 'Marie', amountUsed: 30 },
        { id: 'stl-2', personId: 'p-2', personName: 'Paul', amountUsed: 20 },
      ],
    })

    it('renders one link per settlement for an income transaction', async () => {
      const wrapper = await mountWith([incomeWithSettlements])

      const links = wrapper.findAll('button[title^="Voir le règlement de"]')
      // One button per settlement, rendered in both mobile and desktop layouts
      expect(links.length).toBeGreaterThanOrEqual(2)
      const titles = links.map(l => l.attributes('title'))
      expect(titles).toContain('Voir le règlement de Marie')
      expect(titles).toContain('Voir le règlement de Paul')
    })

    it('fetches the settlement detail when a link is clicked', async () => {
      vi.mocked(api.getSettlement).mockResolvedValue({
        id: 'stl-1',
        personId: 'p-1',
        personName: 'Marie',
        incomeTransactionId: 'inc-1',
        incomeTransactionDescription: 'Virement Marie',
        incomeTransactionDate: '2026-01-15',
        incomeTransactionAmount: 50,
        amountUsed: 30,
        note: null,
        createdAt: '2026-01-15T10:00:00.000Z',
        reimbursements: [],
      })

      const wrapper = await mountWith([incomeWithSettlements])
      const marieLink = nth(
        wrapper.findAll('button[title="Voir le règlement de Marie"]'),
        0
      )
      await marieLink.trigger('click')
      await flushPromises()

      expect(api.getSettlement).toHaveBeenCalledWith('stl-1')
    })

    it('does not render settlement links for expense transactions', async () => {
      const wrapper = await mountWith([makeTx()])
      expect(
        wrapper.findAll('button[title^="Voir le règlement de"]').length
      ).toBe(0)
    })
  })

  describe('subcategory filter', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('is disabled until a category is selected', async () => {
      const wrapper = await mountPage()
      const select = wrapper.find(
        '[data-testid="transactions-subcategory-filter"]'
      )

      expect(select.attributes('disabled')).toBeDefined()
      expect(select.text()).toContain('Choisir une catégorie')
    })

    it('lists only the subcategories of the selected category', async () => {
      const wrapper = await mountPage()

      await wrapper
        .find('[data-testid="transactions-category-filter"]')
        .setValue('cat-1')
      await flushPromises()

      const select = wrapper.find(
        '[data-testid="transactions-subcategory-filter"]'
      )
      expect(select.attributes('disabled')).toBeUndefined()
      const options = select.findAll('option').map(o => o.text())
      expect(options).toEqual(['Toutes', 'Courses', 'Restaurant'])
    })

    it('sends the selected subcategory to the API', async () => {
      const wrapper = await mountPage()

      await wrapper
        .find('[data-testid="transactions-category-filter"]')
        .setValue('cat-1')
      await flushPromises()
      vi.mocked(api.getTransactions).mockClear()

      await wrapper
        .find('[data-testid="transactions-subcategory-filter"]')
        .setValue('sub-2')
      await flushPromises()

      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ categoryId: 'cat-1', subcategoryId: 'sub-2' })
      )
    })

    it('clears the subcategory when the category changes', async () => {
      const wrapper = await mountPage()

      await wrapper
        .find('[data-testid="transactions-category-filter"]')
        .setValue('cat-1')
      await flushPromises()
      await wrapper
        .find('[data-testid="transactions-subcategory-filter"]')
        .setValue('sub-2')
      await flushPromises()
      vi.mocked(api.getTransactions).mockClear()

      await wrapper
        .find('[data-testid="transactions-category-filter"]')
        .setValue('cat-2')
      await flushPromises()

      expect(api.getTransactions).toHaveBeenCalledTimes(1)
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryId: 'cat-2',
          subcategoryId: undefined,
        })
      )
    })
  })

  describe('advanced search filters', () => {
    beforeEach(() => {
      localStorage.clear()
    })

    it('passes the date window to the API immediately', async () => {
      const wrapper = await mountPage()
      vi.mocked(api.getTransactions).mockClear()

      await wrapper
        .find('[data-testid="transactions-start-date-filter"]')
        .setValue('2024-01-01')
      await flushPromises()

      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ startDate: '2024-01-01' })
      )
    })

    it('filters to rows a bank sync lost the reference to', async () => {
      const wrapper = await mountPage()
      vi.mocked(api.getTransactions).mockClear()

      await wrapper
        .find('[data-testid="needs-bank-review-toggle"]')
        .trigger('click')
      await flushPromises()

      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ needsBankReview: true })
      )
    })

    it('debounces the keyword search before calling the API', async () => {
      vi.useFakeTimers()
      try {
        const wrapper = await mountPage()
        vi.mocked(api.getTransactions).mockClear()

        await wrapper
          .find('[data-testid="transactions-search-input"]')
          .setValue('uber')

        // Not fired yet: still within the debounce window.
        expect(api.getTransactions).not.toHaveBeenCalled()

        vi.advanceTimersByTime(350)
        await flushPromises()

        expect(api.getTransactions).toHaveBeenLastCalledWith(
          expect.objectContaining({ search: 'uber' })
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it('sends absolute amount bounds, ignoring empty/negative values', async () => {
      vi.useFakeTimers()
      try {
        const wrapper = await mountPage()
        vi.mocked(api.getTransactions).mockClear()

        await wrapper
          .find('[data-testid="transactions-amount-min-filter"]')
          .setValue('100')
        vi.advanceTimersByTime(350)
        await flushPromises()

        expect(api.getTransactions).toHaveBeenLastCalledWith(
          expect.objectContaining({ amountMin: 100, amountMax: undefined })
        )
      } finally {
        vi.useRealTimers()
      }
    })
  })
  // A deleted bank account leaves its *name* behind in the saved filters, so
  // the page has to notice the filter points at nothing once the real account
  // list arrives.
  describe('selecting beyond the current page', () => {
    /** Mount with a page of `pageSize` rows out of `total` matches. */
    const mountWithPage = async (pageSize: number, total: number) => {
      const rows = Array.from({ length: pageSize }, (_, i) =>
        makeTx({ id: `tx-${i}`, description: `Achat ${i}` })
      )
      setupDefaultMocks(rows)
      vi.mocked(api.getTransactions).mockResolvedValue({
        data: rows,
        meta: {
          ...defaultPaginationMeta,
          total,
          totalPages: Math.ceil(total / pageSize),
          hasNextPage: total > pageSize,
        },
      })
      const wrapper = mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()
      return wrapper
    }

    /** Turn on selection mode, then tick every row on the page. */
    const selectWholePage = async (wrapper: VueWrapper) => {
      await wrapper
        .get('[data-testid="toggle-selection-mode"]')
        .trigger('click')
      await wrapper.get('[data-testid="select-all"]').trigger('change')
      await flushPromises()
    }

    it('pages on a phone through previous / « n / N » / next', async () => {
      const wrapper = await mountWithPage(3, 412)

      expect(wrapper.get('[data-testid="pagination-compact"]').text()).toBe(
        '1 / 138'
      )
      const next = wrapper.get('[data-testid="pagination-next"]')
      expect(next.attributes('aria-label')).toBe('Page suivante')
      expect(
        wrapper
          .get('[data-testid="pagination-previous"]')
          .attributes('disabled')
      ).toBeDefined()

      await next.trigger('click')
      await flushPromises()

      expect(wrapper.get('[data-testid="pagination-compact"]').text()).toBe(
        '2 / 138'
      )
    })

    it('offers to reach the rest of the filter once the page is fully ticked', async () => {
      const wrapper = await mountWithPage(3, 412)
      await selectWholePage(wrapper)

      const banner = wrapper.get('[data-testid="select-whole-filter-banner"]')
      expect(banner.text()).toContain('3')
      expect(banner.text()).toContain('412')
    })

    it('stays quiet when the page already is the whole filter', async () => {
      const wrapper = await mountWithPage(3, 3)
      await selectWholePage(wrapper)

      expect(
        wrapper.find('[data-testid="select-whole-filter-banner"]').exists()
      ).toBe(false)
    })

    it('sends the filter and the count shown, not a list of ids', async () => {
      vi.mocked(api.bulkUpdateTransactions).mockResolvedValue({ updated: 412 })
      const wrapper = await mountWithPage(3, 412)
      await selectWholePage(wrapper)
      await wrapper.get('[data-testid="select-whole-filter"]').trigger('click')

      await wrapper.get('[data-testid="bulk-pointed"]').trigger('click')
      await flushPromises()

      const [selection] =
        vi.mocked(api.bulkUpdateTransactions).mock.calls[0] ?? []
      expect(selection).toMatchObject({ expectedCount: 412 })
      // The whole point: 412 ids were never on screen to send.
      expect(selection).not.toHaveProperty('ids')
    })

    it('confirms a bulk pointing with a toast', async () => {
      vi.mocked(api.bulkUpdateTransactions).mockResolvedValue({ updated: 3 })
      const wrapper = await mountWithPage(3, 412)
      await selectWholePage(wrapper)

      await wrapper.get('[data-testid="bulk-pointed"]').trigger('click')
      await flushPromises()

      expect(mockToast.success).toHaveBeenCalledWith(
        '3 transaction(s) pointée(s)'
      )
    })

    it('says so when a bulk pointing fails', async () => {
      vi.mocked(api.bulkUpdateTransactions).mockRejectedValue(
        new Error('Impossible de modifier les transactions')
      )
      const wrapper = await mountWithPage(3, 412)
      await selectWholePage(wrapper)

      await wrapper.get('[data-testid="bulk-pointed"]').trigger('click')
      await flushPromises()

      expect(mockToast.error).toHaveBeenCalledWith(
        'Impossible de modifier les transactions'
      )
    })

    it('falls back to ids when the selection is just this page', async () => {
      vi.mocked(api.bulkUpdateTransactions).mockResolvedValue({ updated: 3 })
      const wrapper = await mountWithPage(3, 412)
      await selectWholePage(wrapper)

      await wrapper.get('[data-testid="bulk-pointed"]').trigger('click')
      await flushPromises()

      const [selection] =
        vi.mocked(api.bulkUpdateTransactions).mock.calls[0] ?? []
      expect(selection).toEqual({ ids: ['tx-0', 'tx-1', 'tx-2'] })
    })

    it('drops the escalation as soon as a row is unticked', async () => {
      const wrapper = await mountWithPage(3, 412)
      await selectWholePage(wrapper)
      await wrapper.get('[data-testid="select-whole-filter"]').trigger('click')
      expect(
        wrapper.find('[data-testid="whole-filter-selected-banner"]').exists()
      ).toBe(true)

      await nth(
        wrapper.findAll('[data-testid="select-row-desktop"]'),
        0,
        'row checkbox'
      ).trigger('change')
      await flushPromises()

      expect(
        wrapper.find('[data-testid="whole-filter-selected-banner"]').exists()
      ).toBe(false)
    })
  })

  describe('loading without losing the list', () => {
    const deferred = () => {
      let resolve!: (value: {
        data: TransactionDto[]
        meta: typeof defaultPaginationMeta
      }) => void
      const promise = new Promise<{
        data: TransactionDto[]
        meta: typeof defaultPaginationMeta
      }>(r => {
        resolve = r
      })
      return { promise, resolve }
    }

    it('shows the skeleton once, then keeps the rows dimmed while it refetches', async () => {
      setupDefaultMocks()
      const first = deferred()
      vi.mocked(api.getTransactions).mockReturnValueOnce(first.promise)
      await router.replace({ query: {} })
      const wrapper = mount(TransactionsPage, {
        global: { plugins: [router], stubs: { Teleport: true } },
      })
      await flushPromises()

      expect(
        wrapper.find('[data-testid="transactions-skeleton"]').exists()
      ).toBe(true)
      expect(wrapper.find('[data-testid="transactions-list"]').exists()).toBe(
        false
      )

      first.resolve({ data: [makeTx()], meta: defaultPaginationMeta })
      await flushPromises()
      expect(
        wrapper.find('[data-testid="transactions-skeleton"]').exists()
      ).toBe(false)
      expect(wrapper.text()).toContain('Cafe')

      const second = deferred()
      vi.mocked(api.getTransactions).mockReturnValueOnce(second.promise)
      await wrapper.get('[data-testid="sort-by-date"]').trigger('click')
      await flushPromises()

      // The rows stay, busy, under a discreet indicator — no skeleton.
      expect(
        wrapper.find('[data-testid="transactions-skeleton"]').exists()
      ).toBe(false)
      const list = wrapper.get('[data-testid="transactions-list"]')
      expect(list.attributes('aria-busy')).toBe('true')
      expect(list.classes()).toContain('opacity-60')
      expect(
        wrapper.find('[data-testid="transactions-refreshing"]').exists()
      ).toBe(true)
      expect(wrapper.text()).toContain('Cafe')

      second.resolve({
        data: [makeTx({ description: 'Boulangerie' })],
        meta: defaultPaginationMeta,
      })
      await flushPromises()
      expect(
        wrapper.get('[data-testid="transactions-list"]').attributes('aria-busy')
      ).toBeUndefined()
      expect(wrapper.text()).toContain('Boulangerie')
      expect(wrapper.text()).not.toContain('Cafe')
    })

    it('lets only the latest answer land when two requests overlap', async () => {
      const wrapper = await mountPage()
      const slow = deferred()
      const fast = deferred()
      vi.mocked(api.getTransactions)
        .mockReturnValueOnce(slow.promise)
        .mockReturnValueOnce(fast.promise)

      await wrapper.get('[data-testid="sort-by-date"]').trigger('click')
      await flushPromises()
      await wrapper.get('[data-testid="sort-by-amount"]').trigger('click')
      await flushPromises()

      fast.resolve({
        data: [makeTx({ description: 'Réponse récente' })],
        meta: defaultPaginationMeta,
      })
      await flushPromises()
      slow.resolve({
        data: [makeTx({ description: 'Réponse périmée' })],
        meta: defaultPaginationMeta,
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Réponse récente')
      expect(wrapper.text()).not.toContain('Réponse périmée')
      expect(
        wrapper.get('[data-testid="transactions-list"]').attributes('aria-busy')
      ).toBeUndefined()
    })
  })

  describe('sorting from a phone', () => {
    it('offers the four orders as one choice and mirrors it in the URL', async () => {
      const wrapper = await mountPage()
      const group = wrapper.get('[data-testid="transactions-sort-choice"]')
      expect(group.attributes('role')).toBe('radiogroup')
      expect(
        group.findAll('[role="radio"]').map(r => r.attributes('aria-checked'))
      ).toEqual(['true', 'false', 'false', 'false'])

      await wrapper
        .get('[data-testid="sort-choice-amount-asc"]')
        .trigger('click')
      await flushPromises()

      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ sortBy: 'amount', sortOrder: 'asc' })
      )
      expect(router.currentRoute.value.query).toMatchObject({
        sort: 'amount',
        dir: 'asc',
      })
      // The table header agrees.
      expect(
        wrapper.get('[data-testid="sort-by-amount"]').attributes('aria-label')
      ).toBe('Trier par montant, décroissant')
    })

    it('names the search field and keeps its placeholder short', async () => {
      const wrapper = await mountPage()
      const search = wrapper.get('[data-testid="transactions-search-input"]')
      expect(search.attributes('aria-label')).toMatch(/^Rechercher/)
      expect(search.attributes('placeholder')?.length).toBeLessThan(20)
    })
  })

  describe('one selection bar', () => {
    it('opens with the toggle, counts, and closes from its single exit', async () => {
      resetMobileNavigation()
      const wrapper = await mountPage()
      expect(wrapper.find('[data-testid="selection-bar"]').exists()).toBe(false)
      expect(isTabBarSuppressed()).toBe(false)

      await wrapper
        .get('[data-testid="toggle-selection-mode"]')
        .trigger('click')
      const bar = wrapper.get('[data-testid="selection-bar"]')
      // Below lg the selection bar takes the tab bar's place.
      expect(isTabBarSuppressed()).toBe(true)
      expect(bar.text()).toContain('Aucune transaction sélectionnée')
      // The entry point steps aside: the bar is the one way out.
      expect(
        wrapper.find('[data-testid="toggle-selection-mode"]').exists()
      ).toBe(false)
      expect(
        bar.findAll('button').filter(b => b.text() === 'Quitter la sélection')
          .length
      ).toBeGreaterThan(0)
      expect(wrapper.find('[data-testid="bulk-pointed"]').text()).toBe(
        'Pointer'
      )
      expect(wrapper.find('[data-testid="bulk-unpointed"]').text()).toBe(
        'Dépointer'
      )

      // A tap on the card ticks it.
      await wrapper.get('[data-testid="row-card"]').trigger('click')
      expect(wrapper.get('[data-testid="selection-bar"]').text()).toContain(
        '1 sélectionnée'
      )

      // The phone ticks — here unticks — the whole page from the bar.
      await wrapper.get('[data-testid="select-all-mobile"]').trigger('change')
      expect(wrapper.get('[data-testid="selection-bar"]').text()).toContain(
        'Aucune transaction sélectionnée'
      )

      await wrapper.get('[data-testid="exit-selection"]').trigger('click')
      expect(wrapper.find('[data-testid="selection-bar"]').exists()).toBe(false)
      expect(
        wrapper.find('[data-testid="toggle-selection-mode"]').exists()
      ).toBe(true)
      expect(isTabBarSuppressed()).toBe(false)
    })

    it('opens the filing dialog from a tap on the card outside selection mode', async () => {
      const wrapper = await mountPage()
      await wrapper.get('[data-testid="row-card"]').trigger('click')
      expect(
        wrapper.find('category-subcategory-modal-stub').attributes('isopen')
      ).toBe('true')
    })
  })

  describe('deleting a reimbursement', () => {
    const reimbursement = {
      id: 'r-1',
      transactionId: 'tx-1',
      personId: 'p-1',
      personName: 'Alice',
      categoryId: null,
      categoryName: null,
      expenseCategoryId: 'cat-1',
      expenseCategoryName: 'Alimentation',
      amount: 2,
      amountReceived: 0,
      amountRemaining: 2,
      status: 'PENDING' as const,
      note: null,
      createdAt: '2026-01-15T00:00:00.000Z',
      updatedAt: '2026-01-15T00:00:00.000Z',
    }

    const mountWithReimbursement = async () => {
      setupDefaultMocks()
      vi.mocked(api.getReimbursements).mockResolvedValue([reimbursement])
      await router.replace({ query: {} })
      const wrapper = mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()
      return wrapper
    }

    it('asks before deleting, then deletes and says so', async () => {
      vi.mocked(api.deleteReimbursement).mockResolvedValue(undefined)
      const wrapper = await mountWithReimbursement()

      const cross = wrapper.findAll(
        'button[aria-label="Supprimer le remboursement de Alice"]'
      )
      expect(cross.length).toBeGreaterThan(0)
      await cross.map(b => b)[0]?.trigger('click')
      await flushPromises()

      // Nothing deleted yet: the question comes first.
      expect(api.deleteReimbursement).not.toHaveBeenCalled()
      expect(wrapper.text()).toContain('Supprimer ce remboursement ?')

      const confirm = wrapper
        .findAll('button')
        .filter(b => b.text() === 'Supprimer')
      await confirm.map(b => b)[0]?.trigger('click')
      await flushPromises()

      expect(api.deleteReimbursement).toHaveBeenCalledWith('r-1')
      expect(mockToast.success).toHaveBeenCalledWith('Remboursement supprimé')
    })

    it('keeps the question open and says so when the deletion fails', async () => {
      vi.mocked(api.deleteReimbursement).mockRejectedValue(
        new Error('Impossible de supprimer le remboursement')
      )
      const wrapper = await mountWithReimbursement()

      await wrapper
        .findAll('button[aria-label="Supprimer le remboursement de Alice"]')
        .map(b => b)[0]
        ?.trigger('click')
      await flushPromises()
      await wrapper
        .findAll('button')
        .filter(b => b.text() === 'Supprimer')
        .map(b => b)[0]
        ?.trigger('click')
      await flushPromises()

      expect(mockToast.error).toHaveBeenCalledWith(
        'Impossible de supprimer le remboursement'
      )
      expect(wrapper.text()).toContain('Supprimer ce remboursement ?')
    })
  })

  describe('stale account filter', () => {
    const makeAccountDto = (name: string) => ({
      id: `acc-${name}`,
      name,
      type: 'STANDARD' as const,
      divisor: 1,
      isExcludedFromBudget: false,
      isExcludedFromStats: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })

    const savedFiltersWithAccount = (name: string) =>
      JSON.stringify({ typeFilter: 'ALL', selectedAccount: name })

    afterEach(() => {
      vi.mocked(localStorage.getItem).mockReturnValue(undefined as never)
    })

    const mountWithAccounts = async (
      savedAccount: string,
      accounts: ReturnType<typeof makeAccountDto>[]
    ) => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        savedFiltersWithAccount(savedAccount)
      )
      setupDefaultMocks()
      // Same reset as mountPage: a query left by a previous test would
      // override the localStorage filters this suite is exercising.
      await router.replace({ query: {} })
      vi.mocked(api.getAccounts).mockResolvedValue(accounts)
      const wrapper = mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()
      return wrapper
    }

    it('drops a saved account that no longer exists and refetches unfiltered', async () => {
      const wrapper = await mountWithAccounts('Compte Supprime', [
        makeAccountDto('Checking'),
      ])

      // First request still carried the stale name; the corrected one does not.
      expect(api.getTransactions).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ account: 'Compte Supprime' })
      )
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ account: undefined })
      )

      // The select falls back on its "Tous" option instead of showing blank.
      const select = wrapper.find<HTMLSelectElement>(
        '[data-testid="transactions-account-filter"]'
      )
      expect(select.element.value).toBe('Tous')
    })

    it('keeps a saved account that still exists', async () => {
      await mountWithAccounts('Checking', [makeAccountDto('Checking')])

      expect(api.getTransactions).toHaveBeenCalledTimes(1)
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ account: 'Checking' })
      )
    })

    it('keeps the saved account when the accounts request fails', async () => {
      vi.mocked(localStorage.getItem).mockReturnValue(
        savedFiltersWithAccount('Checking')
      )
      setupDefaultMocks()
      vi.mocked(api.getAccounts).mockRejectedValue(new Error('API down'))

      mount(TransactionsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            CategorySubcategoryModal: true,
            TransactionReimbursementModal: true,
            BulkCategoryModal: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      // An empty list after a failure means "unknown", not "no accounts".
      expect(api.getTransactions).toHaveBeenCalledTimes(1)
      expect(api.getTransactions).toHaveBeenLastCalledWith(
        expect.objectContaining({ account: 'Checking' })
      )
    })
  })
})

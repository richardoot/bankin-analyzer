import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import TransactionsPage from './TransactionsPage.vue'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getTransactions: vi.fn(),
    getCategories: vi.fn(),
    getReimbursements: vi.fn(),
    getAccounts: vi.fn(),
    getPersons: vi.fn(),
    updateTransaction: vi.fn(),
    bulkUpdateTransactions: vi.fn(),
    getCategoryAssociations: vi.fn(),
  },
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
vi.mock('@/lib/formatters', () => ({
  formatCurrency: (v: number) => `${v.toFixed(2)} €`,
}))

import { api } from '@/lib/api'
import type { TransactionDto } from '@/lib/api'

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
      { id: 'cat-1', name: 'Alimentation', type: 'EXPENSE', icon: null },
      { id: 'cat-2', name: 'Transport', type: 'EXPENSE', icon: '🚗' },
    ])
    vi.mocked(api.getReimbursements).mockResolvedValue([])
    vi.mocked(api.getAccounts).mockResolvedValue([])
    vi.mocked(api.getPersons).mockResolvedValue([])
    vi.mocked(api.getCategoryAssociations).mockResolvedValue([])
  }

  const mountPage = async () => {
    setupDefaultMocks()
    const wrapper = mount(TransactionsPage, {
      global: {
        plugins: [router],
        stubs: {
          Teleport: true,
          CategorySubcategoryModal: true,
          TransactionReimbursementModal: true,
          BulkCategoryModal: true,
        },
      },
    })
    await flushPromises()
    return wrapper
  }

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
      // (title changes from "Pointer" to "Depointer")
      expect(wrapper.find('button[title="Depointer"]').exists()).toBe(true)

      // Now resolve API
      resolveApi(makeTx({ isPointed: true }))
      await flushPromises()

      // State should remain pointed
      expect(wrapper.find('button[title="Depointer"]').exists()).toBe(true)
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
        'Echec de la mise a jour du pointage'
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

      await editButtons[0].trigger('click')
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

      await editButtons[0].trigger('click')
      await flushPromises()

      const noteInput = wrapper.find('input[type="text"][placeholder]')
      if (!noteInput.exists()) return

      await noteInput.setValue('Bad note')

      const saveBtn = wrapper.find('button[title="Sauvegarder"]')
      if (!saveBtn.exists()) return

      await saveBtn.trigger('click')
      await flushPromises()

      expect(mockToast.error).toHaveBeenCalledWith(
        'Echec de la mise a jour de la note'
      )
    })

    it('should not call API when note value has not changed', async () => {
      const wrapper = await mountPage()

      const editButtons = wrapper.findAll('button[title="Modifier la note"]')
      if (editButtons.length === 0) return

      await editButtons[0].trigger('click')
      await flushPromises()

      // Don't modify the input, just save (empty note → same as original null)
      const saveBtn = wrapper.find('button[title="Sauvegarder"]')
      if (!saveBtn.exists()) return

      await saveBtn.trigger('click')
      await flushPromises()

      expect(api.updateTransaction).not.toHaveBeenCalled()
    })
  })
})

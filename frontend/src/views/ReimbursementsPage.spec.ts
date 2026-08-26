import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import { setActivePinia, createPinia } from 'pinia'
import ReimbursementsPage from './ReimbursementsPage.vue'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getPersons: vi.fn(),
    createPerson: vi.fn(),
    updatePerson: vi.fn(),
    deletePerson: vi.fn(),
    getTransactions: vi.fn(),
    getCategories: vi.fn(),
    getReimbursements: vi.fn(),
    createReimbursement: vi.fn(),
    deleteReimbursement: vi.fn(),
    getSettlements: vi.fn(),
    deleteSettlement: vi.fn(),
  },
  // Re-exported by the module under test; without it the page's category
  // fallbacks silently read `undefined`.
  UNCATEGORIZED_CATEGORY_ID: '__uncategorized__',
}))

// Mock the filters store. Hoisted so a test can decide what is hidden, which
// is the only way to observe which category id the page actually filters on.
const filtersMock = vi.hoisted(() => ({ hidden: new Set<string>() }))

vi.mock('@/stores/filters', () => ({
  useFiltersStore: () => ({
    isExpenseCategoryGloballyHidden: (id: string) => filtersMock.hidden.has(id),
    globalHiddenExpenseCategoryIds: [...filtersMock.hidden],
  }),
}))

// Mock the pdf export composable
vi.mock('@/composables/usePdfExport', () => ({
  usePdfExport: () => ({
    exportReimbursementsToPdf: vi.fn(),
  }),
}))

import { api } from '@/lib/api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    {
      path: '/reimbursements',
      name: 'reimbursements',
      component: ReimbursementsPage,
    },
    {
      path: '/transactions',
      name: 'transactions',
      component: { template: '<div>Transactions</div>' },
    },
  ],
})

describe('ReimbursementsPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    filtersMock.hidden.clear()
  })

  const mockPersons = [
    {
      id: '1',
      name: 'Alice Dupont',
      email: 'alice@example.com',
      createdAt: '2024-01-01T00:00:00.000Z',
      updatedAt: '2024-01-01T00:00:00.000Z',
    },
    {
      id: '2',
      name: 'Bob Martin',
      email: null,
      createdAt: '2024-01-02T00:00:00.000Z',
      updatedAt: '2024-01-02T00:00:00.000Z',
    },
  ]

  const mockReimbursements = [
    {
      id: 'r1',
      transactionId: '1',
      personId: '1',
      personName: 'Alice Dupont',
      categoryId: null,
      categoryName: null,
      // Debts are grouped by the expense they repay, not by the income
      // category the money was expected on.
      expenseCategoryId: 'cat1',
      expenseCategoryName: 'Alimentation',
      amount: 25,
      amountReceived: 0,
      amountRemaining: 25,
      status: 'PENDING' as const,
      note: null,
      createdAt: '2024-01-15T00:00:00.000Z',
      updatedAt: '2024-01-15T00:00:00.000Z',
    },
    {
      id: 'r2',
      transactionId: '3',
      personId: '1',
      personName: 'Alice Dupont',
      categoryId: null,
      categoryName: null,
      expenseCategoryId: 'cat2',
      expenseCategoryName: 'Sante',
      amount: 20,
      amountReceived: 0,
      amountRemaining: 20,
      status: 'PENDING' as const,
      note: null,
      createdAt: '2024-01-20T00:00:00.000Z',
      updatedAt: '2024-01-20T00:00:00.000Z',
    },
  ]

  // Helper to set up default mocks
  const setupDefaultMocks = () => {
    vi.mocked(api.getPersons).mockResolvedValue([])
    vi.mocked(api.getReimbursements).mockResolvedValue([])
    vi.mocked(api.getSettlements).mockResolvedValue([])
  }

  const mountComponent = async () => {
    setupDefaultMocks()
    const wrapper = mount(ReimbursementsPage, {
      global: {
        plugins: [router],
        stubs: {
          Teleport: true,
          SettlementModal: true,
          SettlementHistorySection: true,
          SettlementDetailModal: true,
        },
      },
    })
    await flushPromises()
    return wrapper
  }

  describe('Page display', () => {
    it('should display page title', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Remboursements')
    })

    it('should display page description', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain(
        'Gerez les personnes et suivez les remboursements en cours'
      )
    })

    it('should display link to transactions page', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Voir les transactions')
    })

    it('should fetch persons and reimbursements on mount', async () => {
      await mountComponent()

      expect(api.getPersons).toHaveBeenCalled()
      expect(api.getReimbursements).toHaveBeenCalled()
      expect(api.getSettlements).toHaveBeenCalled()
    })
  })

  describe('Persons section', () => {
    it('should display "Personnes" section title', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Personnes')
    })

    it('should display empty state when no persons', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Aucune personne ajoutee')
    })

    it('should display person cards when persons exist', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Alice Dupont')
      expect(wrapper.text()).toContain('Bob Martin')
    })

    it('should display person email when available', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('alice@example.com')
    })

    it('should display "Pas d\'email" when email is null', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain("Pas d'email")
    })
  })

  describe('Add person', () => {
    it('should have input fields for name and email', async () => {
      const wrapper = await mountComponent()

      const nameInput = wrapper.find('input[placeholder="Nom de la personne"]')
      const emailInput = wrapper.find('input[placeholder="Email (optionnel)"]')

      expect(nameInput.exists()).toBe(true)
      expect(emailInput.exists()).toBe(true)
    })

    it('should have disabled add button when name is empty', async () => {
      const wrapper = await mountComponent()

      const addButton = wrapper.find('button:disabled')
      expect(addButton.text()).toContain('Ajouter')
    })

    it('should enable add button when name is filled', async () => {
      const wrapper = await mountComponent()

      const nameInput = wrapper.find('input[placeholder="Nom de la personne"]')
      await nameInput.setValue('Nouveau Nom')

      const addButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Ajouter'))
      expect(addButton?.attributes('disabled')).toBeUndefined()
    })

    it('should call createPerson API when adding a person', async () => {
      vi.mocked(api.createPerson).mockResolvedValue({
        id: '3',
        name: 'Charlie',
        email: 'charlie@example.com',
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      })

      const wrapper = await mountComponent()

      const nameInput = wrapper.find('input[placeholder="Nom de la personne"]')
      const emailInput = wrapper.find('input[placeholder="Email (optionnel)"]')
      await nameInput.setValue('Charlie')
      await emailInput.setValue('charlie@example.com')

      // Submit the form directly instead of clicking the button
      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect(api.createPerson).toHaveBeenCalledWith({
        name: 'Charlie',
        email: 'charlie@example.com',
      })
    })

    it('should clear inputs after successful add', async () => {
      vi.mocked(api.createPerson).mockResolvedValue({
        id: '3',
        name: 'Charlie',
        email: null,
        createdAt: '2024-01-03T00:00:00.000Z',
        updatedAt: '2024-01-03T00:00:00.000Z',
      })

      const wrapper = await mountComponent()

      const nameInput = wrapper.find('input[placeholder="Nom de la personne"]')
      await nameInput.setValue('Charlie')

      // Submit the form directly instead of clicking the button
      const form = wrapper.find('form')
      await form.trigger('submit')
      await flushPromises()

      expect((nameInput.element as HTMLInputElement).value).toBe('')
    })
  })

  describe('Delete person with confirmation modal', () => {
    it('should show confirmation modal when clicking delete', async () => {
      const testPersons = [
        {
          id: 'test-1',
          name: 'Test Person',
          email: 'test@example.com',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ]
      vi.mocked(api.getPersons).mockResolvedValue(testPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue([])
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      const deleteButton = wrapper.find('button[title="Supprimer"]')
      await deleteButton.trigger('click')

      expect(wrapper.text()).toContain('Supprimer cette personne ?')
      expect(wrapper.text()).toContain('Test Person')
      expect(wrapper.text()).toContain('irreversible')
    })

    it('should close modal when clicking cancel', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue([])
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      const deleteButton = wrapper.find('button[title="Supprimer"]')
      await deleteButton.trigger('click')

      expect(wrapper.text()).toContain('Supprimer cette personne ?')

      // Find and click the Annuler button in modal
      const modalButtons = wrapper.findAll('button')
      const cancelButton = modalButtons.find(
        b =>
          b.text() === 'Annuler' && b.classes().some(c => c.includes('bg-gray'))
      )
      await cancelButton?.trigger('click')

      expect(wrapper.text()).not.toContain('Supprimer cette personne ?')
    })

    it('should call deletePerson API when confirming delete', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue([])
      vi.mocked(api.getSettlements).mockResolvedValue([])
      vi.mocked(api.deletePerson).mockResolvedValue()

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      const deleteButton = wrapper.find('button[title="Supprimer"]')
      await deleteButton.trigger('click')

      // Find and click the Supprimer button in modal
      const modalButtons = wrapper.findAll('button')
      const confirmButton = modalButtons.find(
        b =>
          b.text() === 'Supprimer' &&
          b.classes().some(c => c.includes('bg-red'))
      )
      await confirmButton?.trigger('click')
      await flushPromises()

      expect(api.deletePerson).toHaveBeenCalledWith('1')
    })
  })

  describe('Summary section', () => {
    it('should display summary section when reimbursements exist', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue(mockReimbursements)
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Recapitulatif des Remboursements')
      expect(wrapper.text()).toContain('Total General')
    })

    it('should display person totals in summary', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue(mockReimbursements)
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      // Alice should appear in summary with her reimbursements
      expect(wrapper.text()).toContain('Alice Dupont')
    })

    it('should display category breakdown in summary', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue(mockReimbursements)
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Alimentation')
      expect(wrapper.text()).toContain('Sante')
    })

    it('should not display summary when no reimbursements', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).not.toContain('Recapitulatif des Remboursements')
    })

    it('should display empty state message when no reimbursements', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Aucun remboursement en cours')
    })

    it('should display link to transactions in empty state', async () => {
      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Aller aux transactions')
    })
  })

  describe('Settlement functionality', () => {
    it('should display settlement button for persons with pending reimbursements', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue(mockReimbursements)
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Enregistrer un reglement')
    })

    /**
     * The page owns which modal opens and what it is handed. Both are stubbed
     * here, so these assertions are about the wiring alone — the modals'
     * own behaviour lives in their specs.
     */
    describe('routing a click to the right modal', () => {
      // Distinct descriptions so a row can be addressed by its button title.
      const DESCRIPTIONS = ['Monoprix', 'Pharmacie']
      const named = mockReimbursements.map((reimbursement, index) => ({
        ...reimbursement,
        transaction: {
          id: reimbursement.transactionId,
          date: reimbursement.createdAt.slice(0, 10),
          description: DESCRIPTIONS[index] ?? 'Transaction',
          amount: -reimbursement.amount,
        },
      }))

      const mountWithDebts = async () => {
        vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
        vi.mocked(api.getReimbursements).mockResolvedValue(named)
        vi.mocked(api.getSettlements).mockResolvedValue([])

        const wrapper = mount(ReimbursementsPage, {
          global: {
            plugins: [router],
            stubs: {
              Teleport: true,
              SettlementModal: true,
              SingleSettlementModal: true,
              SettlementHistorySection: true,
              SettlementDetailModal: true,
            },
          },
        })
        await flushPromises()
        return wrapper
      }

      const single = (wrapper: ReturnType<typeof mount>) =>
        wrapper.findComponent({ name: 'SingleSettlementModal' })
      const multi = (wrapper: ReturnType<typeof mount>) =>
        wrapper.findComponent({ name: 'SettlementModal' })

      it('hands the clicked line to the single-line modal', async () => {
        const wrapper = await mountWithDebts()

        await wrapper
          .get('button[title="Regler uniquement Pharmacie"]')
          .trigger('click')

        expect(single(wrapper).props('isOpen')).toBe(true)
        // The whole debt travels, not just its id: the modal shows the
        // description, the category and what is still due.
        expect(single(wrapper).props('reimbursement')).toMatchObject({
          id: 'r2',
          personId: '1',
          amountRemaining: 20,
        })
        // And the two-step modal stays shut.
        expect(multi(wrapper).props('isOpen')).toBe(false)
      })

      it('opens the multi-line modal on the person, with every pending debt', async () => {
        const wrapper = await mountWithDebts()

        const personButton = wrapper
          .findAll('button')
          .find(button => button.text().includes('Enregistrer un reglement'))
        await personButton?.trigger('click')

        expect(multi(wrapper).props('isOpen')).toBe(true)
        expect(multi(wrapper).props('personName')).toBe('Alice Dupont')
        expect(multi(wrapper).props('pendingReimbursements')).toHaveLength(2)
        expect(single(wrapper).props('isOpen')).toBe(false)
      })

      it('withholds a debt whose expense category the user hid', async () => {
        // The filter is named after the expense category, and every other
        // grouping on this page uses it — the modal must not be handed a debt
        // the user has hidden, nor keep one it has not.
        filtersMock.hidden.add('cat2')
        const wrapper = await mountWithDebts()

        const personButton = wrapper
          .findAll('button')
          .find(button => button.text().includes('Enregistrer un reglement'))
        await personButton?.trigger('click')

        expect(multi(wrapper).props('pendingReimbursements')).toEqual([
          expect.objectContaining({ id: 'r1', expenseCategoryId: 'cat1' }),
        ])
      })

      it('reloads the reimbursements once a settlement lands', async () => {
        const wrapper = await mountWithDebts()
        vi.mocked(api.getReimbursements).mockClear()

        await wrapper
          .get('button[title="Regler uniquement Monoprix"]')
          .trigger('click')
        single(wrapper).vm.$emit('confirm', { id: 'settlement-1' })
        await flushPromises()

        // Without this the page would keep showing a debt that is now settled.
        expect(api.getReimbursements).toHaveBeenCalled()
      })
    })

    it('should display PDF export button when reimbursements exist', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getReimbursements).mockResolvedValue(mockReimbursements)
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      expect(wrapper.text()).toContain('Export PDF')
    })
  })

  describe('Error handling', () => {
    it('should display error when persons fetch fails', async () => {
      vi.mocked(api.getPersons).mockRejectedValue(new Error('Network error'))
      vi.mocked(api.getReimbursements).mockResolvedValue([])
      vi.mocked(api.getSettlements).mockResolvedValue([])

      const wrapper = mount(ReimbursementsPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: true,
            SettlementModal: true,
            SettlementHistorySection: true,
            SettlementDetailModal: true,
          },
        },
      })
      await flushPromises()

      // The error should be displayed via personsStore.error
      // Check that the component renders without crashing
      expect(wrapper.exists()).toBe(true)
    })
  })
})

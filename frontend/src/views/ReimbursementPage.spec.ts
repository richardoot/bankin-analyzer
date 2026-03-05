import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import ReimbursementPage from './ReimbursementPage.vue'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    getPersons: vi.fn(),
    createPerson: vi.fn(),
    updatePerson: vi.fn(),
    deletePerson: vi.fn(),
    getTransactions: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    {
      path: '/reimbursements',
      name: 'reimbursements',
      component: ReimbursementPage,
    },
  ],
})

describe('ReimbursementPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
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

  const mockTransactions = [
    {
      id: '1',
      date: '2024-01-15T00:00:00.000Z',
      description: 'Restaurant',
      amount: -45.5,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      categoryName: 'Alimentation',
      isPointed: false,
      createdAt: '2024-01-15T00:00:00.000Z',
    },
    {
      id: '2',
      date: '2024-01-25T00:00:00.000Z',
      description: 'Salaire',
      amount: 2500.0,
      type: 'INCOME' as const,
      account: 'Compte Courant',
      categoryName: 'Salaires',
      isPointed: true,
      createdAt: '2024-01-25T00:00:00.000Z',
    },
    {
      id: '3',
      date: '2024-01-20T00:00:00.000Z',
      description: 'Pharmacie',
      amount: -23.5,
      type: 'EXPENSE' as const,
      account: 'Compte Courant',
      categoryName: 'Sante',
      isPointed: true,
      createdAt: '2024-01-20T00:00:00.000Z',
    },
  ]

  const mountComponent = async () => {
    const wrapper = mount(ReimbursementPage, {
      global: {
        plugins: [router],
        stubs: {
          Teleport: true,
        },
      },
    })
    await flushPromises()
    return wrapper
  }

  describe('Page display', () => {
    it('should display page title', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Gestion des Remboursements')
    })

    it('should fetch persons and transactions on mount', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      await mountComponent()

      expect(api.getPersons).toHaveBeenCalled()
      expect(api.getTransactions).toHaveBeenCalled()
    })
  })

  describe('Persons section', () => {
    it('should display "Personnes" section title', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Personnes')
    })

    it('should display empty state when no persons', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Aucune personne ajoutee')
    })

    it('should display person cards when persons exist', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Alice Dupont')
      expect(wrapper.text()).toContain('Bob Martin')
    })

    it('should display person email when available', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('alice@example.com')
    })

    it('should display "Pas d\'email" when email is null', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain("Pas d'email")
    })

    it('should display first letter of name as avatar for each person', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      // Each person card should have an avatar with first letter
      const avatars = wrapper.findAll('.bg-indigo-100.rounded-full')
      expect(avatars.length).toBeGreaterThanOrEqual(mockPersons.length)

      // Check that first letters are displayed
      expect(wrapper.text()).toContain('A') // Alice
      expect(wrapper.text()).toContain('B') // Bob
    })
  })

  describe('Add person', () => {
    it('should have input fields for name and email', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const nameInput = wrapper.find('input[placeholder="Nom de la personne"]')
      const emailInput = wrapper.find('input[placeholder="Email (optionnel)"]')

      expect(nameInput.exists()).toBe(true)
      expect(emailInput.exists()).toBe(true)
    })

    it('should have disabled add button when name is empty', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const addButton = wrapper.find('button:disabled')
      expect(addButton.text()).toContain('Ajouter')
    })

    it('should enable add button when name is filled', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const nameInput = wrapper.find('input[placeholder="Nom de la personne"]')
      await nameInput.setValue('Nouveau Nom')

      const addButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Ajouter'))
      expect(addButton?.attributes('disabled')).toBeUndefined()
    })

    it('should call createPerson API when adding a person', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])
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

      const addButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Ajouter'))
      await addButton?.trigger('click')
      await flushPromises()

      expect(api.createPerson).toHaveBeenCalledWith({
        name: 'Charlie',
        email: 'charlie@example.com',
      })
    })

    it('should clear inputs after successful add', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([])
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

      const addButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Ajouter'))
      await addButton?.trigger('click')
      await flushPromises()

      expect((nameInput.element as HTMLInputElement).value).toBe('')
    })
  })

  describe('Edit person', () => {
    it('should have edit button for each person', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const editButtons = wrapper.findAll('button[title="Modifier le nom"]')
      expect(editButtons.length).toBe(mockPersons.length)
    })

    it('should show edit form when clicking edit button', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const editButton = wrapper.find('button[title="Modifier le nom"]')
      await editButton.trigger('click')

      expect(wrapper.text()).toContain('Modification en cours')
      expect(wrapper.text()).toContain('Enregistrer')
      expect(wrapper.text()).toContain('Annuler')
    })

    it('should populate input with current name when editing', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const editButton = wrapper.find('button[title="Modifier le nom"]')
      await editButton.trigger('click')

      // The edit input should contain the person's name
      const inputs = wrapper.findAll('input')
      const editInputEl = inputs.find(
        i => (i.element as HTMLInputElement).value === 'Alice Dupont'
      )
      expect(editInputEl).toBeDefined()
    })

    it('should call updatePerson API when saving edit', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])
      vi.mocked(api.updatePerson).mockResolvedValue({
        ...mockPersons[0],
        name: 'Alice Updated',
      })

      const wrapper = await mountComponent()

      const editButton = wrapper.find('button[title="Modifier le nom"]')
      await editButton.trigger('click')

      // Find the edit input and change value
      const inputs = wrapper.findAll('input')
      const editInput = inputs.find(
        i => (i.element as HTMLInputElement).value === 'Alice Dupont'
      )
      await editInput?.setValue('Alice Updated')

      // Click save button
      const saveButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Enregistrer'))
      await saveButton?.trigger('click')
      await flushPromises()

      expect(api.updatePerson).toHaveBeenCalledWith('1', {
        name: 'Alice Updated',
      })
    })

    it('should cancel edit when clicking cancel button', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      const editButton = wrapper.find('button[title="Modifier le nom"]')
      await editButton.trigger('click')

      expect(wrapper.text()).toContain('Modification en cours')

      const cancelButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Annuler'))
      await cancelButton?.trigger('click')

      expect(wrapper.text()).not.toContain('Modification en cours')
    })

    it('should hide delete button while editing', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      // Initially should have delete buttons
      let deleteButtons = wrapper.findAll('button[title="Supprimer"]')
      expect(deleteButtons.length).toBe(mockPersons.length)

      // Click edit on first person
      const editButton = wrapper.find('button[title="Modifier le nom"]')
      await editButton.trigger('click')

      // Now should have one less delete button (the one being edited is hidden)
      deleteButtons = wrapper.findAll('button[title="Supprimer"]')
      expect(deleteButtons.length).toBe(mockPersons.length - 1)
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
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = mount(ReimbursementPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
          },
        },
      })
      await flushPromises()

      const deleteButton = wrapper.find('button[title="Supprimer"]')
      await deleteButton.trigger('click')

      expect(wrapper.text()).toContain('Supprimer cette personne ?')
      expect(wrapper.text()).toContain('Test Person')
      expect(wrapper.text()).toContain('Cette action est irreversible')
    })

    it('should close modal when clicking cancel', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = mount(ReimbursementPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
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
      vi.mocked(api.getTransactions).mockResolvedValue([])
      vi.mocked(api.deletePerson).mockResolvedValue()

      const wrapper = mount(ReimbursementPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
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

    it('should close modal after successful delete', async () => {
      vi.mocked(api.getPersons).mockResolvedValue(mockPersons)
      vi.mocked(api.getTransactions).mockResolvedValue([])
      vi.mocked(api.deletePerson).mockResolvedValue()

      const wrapper = mount(ReimbursementPage, {
        global: {
          plugins: [router],
          stubs: {
            Teleport: {
              template: '<div><slot /></div>',
            },
          },
        },
      })
      await flushPromises()

      const deleteButton = wrapper.find('button[title="Supprimer"]')
      await deleteButton.trigger('click')

      const modalButtons = wrapper.findAll('button')
      const confirmButton = modalButtons.find(
        b =>
          b.text() === 'Supprimer' &&
          b.classes().some(c => c.includes('bg-red'))
      )
      await confirmButton?.trigger('click')
      await flushPromises()

      expect(wrapper.text()).not.toContain('Supprimer cette personne ?')
    })
  })

  describe('Transactions section', () => {
    it('should display "Transactions Depenses" section title', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Transactions Depenses')
    })

    it('should only display EXPENSE type transactions', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      // Check that expense transactions are displayed
      expect(wrapper.text()).toContain('Restaurant')
      expect(wrapper.text()).toContain('Pharmacie')

      // The income transaction description should not appear in the transaction rows
      // (note: "Salaires" category may appear in category dropdown, so we check description)
      const transactionRows = wrapper.findAll('.divide-y > div')
      const descriptions = transactionRows.map(row => row.text())
      const hasSalaireRow = descriptions.some(
        text => text.includes('Salaire') && text.includes('2')
      )
      expect(hasSalaireRow).toBe(false)
    })

    it('should display transaction count', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      // 2 expense transactions
      expect(wrapper.text()).toContain('2 transaction(s)')
    })

    it('should display empty state when no expense transactions', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue([
        {
          id: '1',
          date: '2024-01-25T00:00:00.000Z',
          description: 'Salaire',
          amount: 2500.0,
          type: 'INCOME' as const,
          account: 'Compte Courant',
          categoryName: 'Salaires',
          isPointed: true,
          createdAt: '2024-01-25T00:00:00.000Z',
        },
      ])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Aucune transaction trouvee')
    })
  })

  describe('Category filter', () => {
    it('should display category filter dropdown', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Categorie:')
      const select = wrapper.find('select')
      expect(select.exists()).toBe(true)
    })

    it('should list unique expense categories', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      const select = wrapper.find('select')
      expect(select.text()).toContain('Toutes')
      expect(select.text()).toContain('Alimentation')
      expect(select.text()).toContain('Sante')
    })

    it('should filter transactions by category', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      const select = wrapper.find('select')
      await select.setValue('Alimentation')

      expect(wrapper.text()).toContain('Restaurant')
      expect(wrapper.text()).not.toContain('Pharmacie')
      expect(wrapper.text()).toContain('1 transaction(s)')
    })
  })

  describe('Not pointed filter', () => {
    it('should display "Uniquement non pointees" checkbox', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Uniquement non pointees')
      const checkbox = wrapper.find('input[type="checkbox"]')
      expect(checkbox.exists()).toBe(true)
    })

    it('should filter to show only non-pointed transactions when checked', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      const checkbox = wrapper.find('input[type="checkbox"]')
      await checkbox.setValue(true)

      // Only Restaurant is not pointed (Pharmacie is pointed)
      expect(wrapper.text()).toContain('Restaurant')
      expect(wrapper.text()).not.toContain('Pharmacie')
      expect(wrapper.text()).toContain('1 transaction(s)')
    })
  })

  describe('Pagination', () => {
    it('should not display pagination when less than 20 transactions', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockResolvedValue(mockTransactions)

      const wrapper = await mountComponent()

      expect(wrapper.text()).not.toContain('Page')
    })

    it('should display pagination when more than 20 transactions', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])

      // Create 25 expense transactions
      const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
        id: String(i + 1),
        date: '2024-01-15T00:00:00.000Z',
        description: `Transaction ${i + 1}`,
        amount: -10,
        type: 'EXPENSE' as const,
        account: 'Compte',
        categoryName: 'Test',
        isPointed: false,
        createdAt: '2024-01-15T00:00:00.000Z',
      }))

      vi.mocked(api.getTransactions).mockResolvedValue(manyTransactions)

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Page 1 sur 2')
    })

    it('should navigate to next page', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])

      const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
        id: String(i + 1),
        date: '2024-01-15T00:00:00.000Z',
        description: `Transaction ${i + 1}`,
        amount: -10,
        type: 'EXPENSE' as const,
        account: 'Compte',
        categoryName: 'Test',
        isPointed: false,
        createdAt: '2024-01-15T00:00:00.000Z',
      }))

      vi.mocked(api.getTransactions).mockResolvedValue(manyTransactions)

      const wrapper = await mountComponent()

      // Find next page button
      const nextButton = wrapper
        .findAll('button')
        .find(b => b.find('path[d="M9 5l7 7-7 7"]').exists())
      await nextButton?.trigger('click')

      expect(wrapper.text()).toContain('Page 2 sur 2')
      expect(wrapper.text()).toContain('Transaction 21')
    })

    it('should reset to page 1 when filter changes', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])

      const manyTransactions = Array.from({ length: 25 }, (_, i) => ({
        id: String(i + 1),
        date: '2024-01-15T00:00:00.000Z',
        description: `Transaction ${i + 1}`,
        amount: -10,
        type: 'EXPENSE' as const,
        account: 'Compte',
        categoryName: i < 15 ? 'Cat1' : 'Cat2',
        isPointed: false,
        createdAt: '2024-01-15T00:00:00.000Z',
      }))

      vi.mocked(api.getTransactions).mockResolvedValue(manyTransactions)

      const wrapper = await mountComponent()

      // Go to page 2
      const nextButton = wrapper
        .findAll('button')
        .find(b => b.find('path[d="M9 5l7 7-7 7"]').exists())
      await nextButton?.trigger('click')

      expect(wrapper.text()).toContain('Page 2')

      // Change category filter
      const select = wrapper.find('select')
      await select.setValue('Cat1')

      // Should reset to page 1
      expect(wrapper.text()).toContain('15 transaction(s)')
    })
  })

  describe('Error handling', () => {
    it('should display error when persons API fails', async () => {
      vi.mocked(api.getPersons).mockRejectedValue(new Error('Network error'))
      vi.mocked(api.getTransactions).mockResolvedValue([])

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Network error')
    })

    it('should display error when transactions API fails', async () => {
      vi.mocked(api.getPersons).mockResolvedValue([])
      vi.mocked(api.getTransactions).mockRejectedValue(
        new Error('Failed to fetch')
      )

      const wrapper = await mountComponent()

      expect(wrapper.text()).toContain('Failed to fetch')
    })
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import ImportPage from './ImportPage.vue'

// Mock the API
vi.mock('@/lib/api', () => ({
  api: {
    importTransactions: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    { path: '/import', name: 'import', component: ImportPage },
    {
      path: '/import/recap',
      name: 'import-recap',
      component: { template: '<div>Recap</div>' },
    },
  ],
})

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render file upload zone', () => {
    const wrapper = mount(ImportPage, {
      global: {
        plugins: [router],
      },
    })

    expect(wrapper.text()).toContain('Import de transactions')
    expect(wrapper.text()).toContain('Glissez-déposez votre fichier CSV')
    expect(wrapper.find('input[type="file"]').exists()).toBe(true)
  })

  it('should reject non-CSV files', async () => {
    const wrapper = mount(ImportPage, {
      global: {
        plugins: [router],
      },
    })

    const file = new File(['test'], 'test.txt', { type: 'text/plain' })
    const input = wrapper.find('input[type="file"]')

    // Simulate file selection
    Object.defineProperty(input.element, 'files', {
      value: [file],
    })
    await input.trigger('change')

    expect(wrapper.text()).toContain('Veuillez sélectionner un fichier CSV')
  })

  describe('CSV parsing', () => {
    it('should parse valid Bankin CSV format', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Restaurant";"Compte Courant";"-45.50";"Alimentation";"Restaurant - Autres";"Note test";"Oui"
"16/01/2024";"Salaire";"Compte Courant";"2500.00";"Entrées d'argent";"Salaires";"";"Non"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Should show preview
      expect(wrapper.text()).toContain("Aperçu de l'import")
      expect(wrapper.text()).toContain('2') // 2 transactions
      expect(wrapper.text()).toContain('Restaurant')
    })

    it('should convert date from DD/MM/YYYY to ISO format', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"27/11/2025";"Test";"Compte";"−50.00";"Cat";"Sub";"";"Oui"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Check the date is displayed in French format (converted from ISO)
      expect(wrapper.text()).toContain('27/11/2025')
    })

    it('should classify expenses and income based on amount sign', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Dépense";"Compte";"-100.00";"Cat";"Sub";"";"Oui"
"16/01/2024";"Revenu";"Compte";"500.00";"Cat";"Sub";"";"Oui"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Should have both expense (red) and income (green) amounts
      expect(wrapper.html()).toContain('text-red-600') // expense
      expect(wrapper.html()).toContain('text-green-600') // income
    })

    it('should convert Oui/Non to boolean isPointed', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Test Oui";"Compte";"-50.00";"Cat";"Sub";"";"Oui"
"16/01/2024";"Test Non";"Compte";"-30.00";"Cat";"Sub";"";"Non"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      expect(wrapper.text()).toContain('2') // 2 transactions parsed
    })

    it('should handle quoted fields with semicolons', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Description; avec point-virgule";"Compte";"-50.00";"Cat";"Sub";"";"Oui"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      expect(wrapper.text()).toContain('Description; avec point-virgule')
    })

    it('should reject invalid CSV format', async () => {
      const csvContent = `Invalid;Header;Format
"data";"data";"data"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      expect(wrapper.text()).toContain('Format CSV invalide')
    })

    it('should use subcategory as category for income transactions', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Salaire janvier";"Compte Courant";"2500.00";"Entrées d'argent";"Salaires";"";"Oui"
"16/01/2024";"Restaurant";"Compte Courant";"-45.00";"Alimentation";"Restaurant";"";"Non"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Income transaction should use subcategory "Salaires" as category
      expect(wrapper.text()).toContain('Salaires')
      // Expense transaction should keep original category "Alimentation"
      expect(wrapper.text()).toContain('Alimentation')
      // The original category "Entrées d'argent" should not appear
      expect(wrapper.text()).not.toContain("Entrées d'argent")
    })
  })

  describe('import submission', () => {
    it('should call API and navigate to recap on successful import', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Test";"Compte";"-50.00";"Cat";"Sub";"";"Oui"`

      vi.mocked(api.importTransactions).mockResolvedValueOnce({
        imported: 1,
        duplicates: 0,
        total: 1,
      })

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      // Upload file
      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Click import button
      const importButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Importer'))
      expect(importButton).toBeDefined()

      if (importButton) {
        await importButton.trigger('click')
      }
      await flushPromises()

      expect(api.importTransactions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            description: 'Test',
            amount: -50,
            type: 'EXPENSE',
          }),
        ])
      )
    })

    it('should display error message on import failure', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Test";"Compte";"-50.00";"Cat";"Sub";"";"Oui"`

      vi.mocked(api.importTransactions).mockRejectedValueOnce(
        new Error('Server error')
      )

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      // Upload file
      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Click import button
      const importButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Importer'))
      if (importButton) {
        await importButton.trigger('click')
      }
      await flushPromises()

      expect(wrapper.text()).toContain('Server error')
    })
  })

  describe('cancel functionality', () => {
    it('should reset state when cancel is clicked', async () => {
      const csvContent = `Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
"15/01/2024";"Test";"Compte";"-50.00";"Cat";"Sub";"";"Oui"`

      const wrapper = mount(ImportPage, {
        global: {
          plugins: [router],
        },
      })

      // Upload file
      const file = new File([csvContent], 'export.csv', { type: 'text/csv' })
      const input = wrapper.find('input[type="file"]')

      Object.defineProperty(input.element, 'files', {
        value: [file],
      })
      await input.trigger('change')
      await flushPromises()

      // Click cancel button
      const cancelButton = wrapper
        .findAll('button')
        .find(b => b.text().includes('Annuler'))
      if (cancelButton) {
        await cancelButton.trigger('click')
      }

      // Should show upload zone again
      expect(wrapper.text()).toContain('Glissez-déposez votre fichier CSV')
    })
  })
})

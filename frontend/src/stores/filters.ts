import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'bankin-analyzer-filters'

export interface CategoryAssociation {
  expenseCategory: string
  incomeCategory: string
}

export const useFiltersStore = defineStore('filters', () => {
  // État
  const jointAccounts = ref<string[]>([])
  const hiddenExpenseCategories = ref<string[]>([])
  const hiddenIncomeCategories = ref<string[]>([])
  const categoryAssociations = ref<CategoryAssociation[]>([])
  const isPanelExpanded = ref(true)

  // Initialiser depuis localStorage
  function initFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        jointAccounts.value = data.jointAccounts || []
        hiddenExpenseCategories.value = data.hiddenExpenseCategories || []
        hiddenIncomeCategories.value = data.hiddenIncomeCategories || []
        categoryAssociations.value = data.categoryAssociations || []
        isPanelExpanded.value = data.isPanelExpanded ?? true
      } catch {
        // Ignore parsing errors
      }
    }
  }

  // Sauvegarder dans localStorage
  function saveToStorage() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        jointAccounts: jointAccounts.value,
        hiddenExpenseCategories: hiddenExpenseCategories.value,
        hiddenIncomeCategories: hiddenIncomeCategories.value,
        categoryAssociations: categoryAssociations.value,
        isPanelExpanded: isPanelExpanded.value,
      })
    )
  }

  // Toggle panel expansion
  function togglePanelExpanded() {
    isPanelExpanded.value = !isPanelExpanded.value
    saveToStorage()
  }

  // Actions
  function toggleJointAccount(account: string) {
    const index = jointAccounts.value.indexOf(account)
    if (index === -1) {
      jointAccounts.value.push(account)
    } else {
      jointAccounts.value.splice(index, 1)
    }
    saveToStorage()
  }

  function isJointAccount(account: string): boolean {
    return jointAccounts.value.includes(account)
  }

  // Actions pour catégories masquées
  function toggleHiddenExpenseCategory(category: string) {
    const index = hiddenExpenseCategories.value.indexOf(category)
    if (index === -1) {
      hiddenExpenseCategories.value.push(category)
    } else {
      hiddenExpenseCategories.value.splice(index, 1)
    }
    saveToStorage()
  }

  function toggleHiddenIncomeCategory(category: string) {
    const index = hiddenIncomeCategories.value.indexOf(category)
    if (index === -1) {
      hiddenIncomeCategories.value.push(category)
    } else {
      hiddenIncomeCategories.value.splice(index, 1)
    }
    saveToStorage()
  }

  function isExpenseCategoryHidden(category: string): boolean {
    return hiddenExpenseCategories.value.includes(category)
  }

  function isIncomeCategoryHidden(category: string): boolean {
    return hiddenIncomeCategories.value.includes(category)
  }

  // Actions pour associations catégories dépenses/remboursements
  function setCategoryAssociation(
    expenseCategory: string,
    incomeCategory: string | null
  ) {
    // Supprimer l'ancienne association de cette catégorie de dépenses
    const existingExpenseIdx = categoryAssociations.value.findIndex(
      a => a.expenseCategory === expenseCategory
    )
    if (existingExpenseIdx !== -1) {
      categoryAssociations.value.splice(existingExpenseIdx, 1)
    }

    // Supprimer l'ancienne association de cette catégorie de revenus (si fournie)
    if (incomeCategory) {
      const existingIncomeIdx = categoryAssociations.value.findIndex(
        a => a.incomeCategory === incomeCategory
      )
      if (existingIncomeIdx !== -1) {
        categoryAssociations.value.splice(existingIncomeIdx, 1)
      }

      // Ajouter la nouvelle association
      categoryAssociations.value.push({ expenseCategory, incomeCategory })
    }

    saveToStorage()
  }

  function getReimbursementCategory(expenseCategory: string): string | null {
    const assoc = categoryAssociations.value.find(
      a => a.expenseCategory === expenseCategory
    )
    return assoc?.incomeCategory ?? null
  }

  function isIncomeUsedAsReimbursement(incomeCategory: string): boolean {
    return categoryAssociations.value.some(
      a => a.incomeCategory === incomeCategory
    )
  }

  function removeCategoryAssociation(expenseCategory: string) {
    const idx = categoryAssociations.value.findIndex(
      a => a.expenseCategory === expenseCategory
    )
    if (idx !== -1) {
      categoryAssociations.value.splice(idx, 1)
      saveToStorage()
    }
  }

  // Computed
  const jointAccountsSet = computed(() => new Set(jointAccounts.value))
  const hiddenExpenseCategoriesSet = computed(
    () => new Set(hiddenExpenseCategories.value)
  )
  const hiddenIncomeCategoriesSet = computed(
    () => new Set(hiddenIncomeCategories.value)
  )

  // Init
  initFromStorage()

  // Computed pour le nombre de filtres actifs
  const activeFiltersCount = computed(
    () =>
      jointAccounts.value.length +
      hiddenExpenseCategories.value.length +
      hiddenIncomeCategories.value.length +
      categoryAssociations.value.length
  )

  return {
    jointAccounts,
    jointAccountsSet,
    toggleJointAccount,
    isJointAccount,
    hiddenExpenseCategories,
    hiddenExpenseCategoriesSet,
    toggleHiddenExpenseCategory,
    isExpenseCategoryHidden,
    hiddenIncomeCategories,
    hiddenIncomeCategoriesSet,
    toggleHiddenIncomeCategory,
    isIncomeCategoryHidden,
    categoryAssociations,
    setCategoryAssociation,
    removeCategoryAssociation,
    getReimbursementCategory,
    isIncomeUsedAsReimbursement,
    isPanelExpanded,
    togglePanelExpanded,
    activeFiltersCount,
  }
})

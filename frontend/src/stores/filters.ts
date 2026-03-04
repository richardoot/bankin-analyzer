import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'bankin-analyzer-filters'

export const useFiltersStore = defineStore('filters', () => {
  // État
  const jointAccounts = ref<string[]>([])
  const hiddenExpenseCategories = ref<string[]>([])
  const hiddenIncomeCategories = ref<string[]>([])
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
      hiddenIncomeCategories.value.length
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
    isPanelExpanded,
    togglePanelExpanded,
    activeFiltersCount,
  }
})

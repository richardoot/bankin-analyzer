import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

const STORAGE_KEY = 'bankin-analyzer-filters'

export const useFiltersStore = defineStore('filters', () => {
  // État
  const jointAccounts = ref<string[]>([])
  const isPanelExpanded = ref(true)

  // Initialiser depuis localStorage
  function initFromStorage() {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const data = JSON.parse(stored)
        jointAccounts.value = data.jointAccounts || []
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

  // Computed
  const jointAccountsSet = computed(() => new Set(jointAccounts.value))

  // Init
  initFromStorage()

  // Computed pour le nombre de filtres actifs
  const activeFiltersCount = computed(() => jointAccounts.value.length)

  return {
    jointAccounts,
    jointAccountsSet,
    toggleJointAccount,
    isJointAccount,
    isPanelExpanded,
    togglePanelExpanded,
    activeFiltersCount,
  }
})

import { ref, watch, type Ref } from 'vue'
import type { CompensationRule } from '@/components/filters/ReimbursementCompensationFilter.vue'

// Interface pour les filtres persistés
interface PersistedFilters {
  selectedExpenseCategories: string[]
  selectedIncomeCategories: string[]
  selectedJointAccounts: string[]
  compensationRules: CompensationRule[]
  selectedExpenseMonth: string
  selectedIncomeMonth: string
  showAdvancedFilters: boolean
  showExpenseFilter: boolean
  showIncomeFilter: boolean
}

// Filtres par défaut
const defaultFilters: PersistedFilters = {
  selectedExpenseCategories: [],
  selectedIncomeCategories: [],
  selectedJointAccounts: [],
  compensationRules: [],
  selectedExpenseMonth: '',
  selectedIncomeMonth: '',
  showAdvancedFilters: false,
  showExpenseFilter: false,
  showIncomeFilter: false,
}

export function useFilterPersistence(sessionId: Ref<string | null>) {
  // Clé unique pour le localStorage basée sur l'ID de session
  const getStorageKey = (id: string) => `bankin-analyzer-filters-${id}`

  // États réactifs pour tous les filtres
  const selectedExpenseCategories = ref<string[]>([])
  const selectedIncomeCategories = ref<string[]>([])
  const selectedJointAccounts = ref<string[]>([])
  const compensationRules = ref<CompensationRule[]>([])
  const selectedExpenseMonth = ref<string>('')
  const selectedIncomeMonth = ref<string>('')
  const showAdvancedFilters = ref(false)
  const showExpenseFilter = ref(false)
  const showIncomeFilter = ref(false)

  // Fonction pour charger les filtres depuis le localStorage
  const loadFilters = (id: string) => {
    try {
      const stored = localStorage.getItem(getStorageKey(id))
      if (stored) {
        const filters: PersistedFilters = JSON.parse(stored)
        
        // Appliquer les filtres chargés
        selectedExpenseCategories.value = filters.selectedExpenseCategories || []
        selectedIncomeCategories.value = filters.selectedIncomeCategories || []
        selectedJointAccounts.value = filters.selectedJointAccounts || []
        compensationRules.value = filters.compensationRules || []
        selectedExpenseMonth.value = filters.selectedExpenseMonth || ''
        selectedIncomeMonth.value = filters.selectedIncomeMonth || ''
        showAdvancedFilters.value = filters.showAdvancedFilters || false
        showExpenseFilter.value = filters.showExpenseFilter || false
        showIncomeFilter.value = filters.showIncomeFilter || false
        
        console.log('🔄 Filtres chargés pour la session:', id)
        return true
      }
    } catch (error) {
      console.warn('Erreur lors du chargement des filtres:', error)
    }
    return false
  }

  // Fonction pour sauvegarder les filtres dans le localStorage
  const saveFilters = (id: string) => {
    try {
      const filters: PersistedFilters = {
        selectedExpenseCategories: selectedExpenseCategories.value,
        selectedIncomeCategories: selectedIncomeCategories.value,
        selectedJointAccounts: selectedJointAccounts.value,
        compensationRules: compensationRules.value,
        selectedExpenseMonth: selectedExpenseMonth.value,
        selectedIncomeMonth: selectedIncomeMonth.value,
        showAdvancedFilters: showAdvancedFilters.value,
        showExpenseFilter: showExpenseFilter.value,
        showIncomeFilter: showIncomeFilter.value,
      }
      
      localStorage.setItem(getStorageKey(id), JSON.stringify(filters))
      console.log('💾 Filtres sauvegardés pour la session:', id)
    } catch (error) {
      console.warn('Erreur lors de la sauvegarde des filtres:', error)
    }
  }

  // Fonction pour réinitialiser les filtres aux valeurs par défaut
  const resetFilters = () => {
    selectedExpenseCategories.value = [...defaultFilters.selectedExpenseCategories]
    selectedIncomeCategories.value = [...defaultFilters.selectedIncomeCategories]
    selectedJointAccounts.value = [...defaultFilters.selectedJointAccounts]
    compensationRules.value = [...defaultFilters.compensationRules]
    selectedExpenseMonth.value = defaultFilters.selectedExpenseMonth
    selectedIncomeMonth.value = defaultFilters.selectedIncomeMonth
    showAdvancedFilters.value = defaultFilters.showAdvancedFilters
    showExpenseFilter.value = defaultFilters.showExpenseFilter
    showIncomeFilter.value = defaultFilters.showIncomeFilter
    console.log('🔄 Filtres réinitialisés')
  }

  // Fonction pour supprimer les filtres d'une session
  const deleteFilters = (id: string) => {
    try {
      localStorage.removeItem(getStorageKey(id))
      console.log('🗑️ Filtres supprimés pour la session:', id)
    } catch (error) {
      console.warn('Erreur lors de la suppression des filtres:', error)
    }
  }

  // Watcher pour détecter les changements de session
  watch(
    sessionId,
    (newSessionId, oldSessionId) => {
      if (oldSessionId && newSessionId !== oldSessionId) {
        // Sauvegarder les filtres de l'ancienne session
        saveFilters(oldSessionId)
      }

      if (newSessionId) {
        // Charger les filtres de la nouvelle session ou réinitialiser
        const loaded = loadFilters(newSessionId)
        if (!loaded) {
          resetFilters()
        }
      } else {
        // Pas de session active, réinitialiser
        resetFilters()
      }
    },
    { immediate: true }
  )

  // Watchers pour sauvegarder automatiquement lors des changements
  const setupAutoSave = () => {
    const watchers = [
      selectedExpenseCategories,
      selectedIncomeCategories,
      selectedJointAccounts,
      compensationRules,
      selectedExpenseMonth,
      selectedIncomeMonth,
      showAdvancedFilters,
      showExpenseFilter,
      showIncomeFilter,
    ]

    watchers.forEach(ref => {
      watch(
        ref,
        () => {
          if (sessionId.value) {
            // Débounce pour éviter trop de sauvegardes
            setTimeout(() => {
              if (sessionId.value) {
                saveFilters(sessionId.value)
              }
            }, 300)
          }
        },
        { deep: true }
      )
    })
  }

  // Initialiser la sauvegarde automatique
  setupAutoSave()

  return {
    // États réactifs
    selectedExpenseCategories,
    selectedIncomeCategories,
    selectedJointAccounts,
    compensationRules,
    selectedExpenseMonth,
    selectedIncomeMonth,
    showAdvancedFilters,
    showExpenseFilter,
    showIncomeFilter,

    // Fonctions utilitaires
    loadFilters,
    saveFilters,
    resetFilters,
    deleteFilters,
  }
}
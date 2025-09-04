<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'
  import { computed, ref } from 'vue'
  import AccountFilter from '../filters/AccountFilter.vue'
  import ExpensesReimbursementManager from './ExpensesReimbursementManager.vue'
  import PersonsManager from '../shared/PersonsManager.vue'
  import ReimbursementCategoriesManager from './ReimbursementCategoriesManager.vue'
  import ReimbursementStats from './ReimbursementStats.vue'
  import ReimbursementSummary from './ReimbursementSummary.vue'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  const props = defineProps<Props>()

  // État pour contrôler la visibilité du panneau de filtrage
  const showAdvancedFilters = ref(false)

  // États pour les filtres de comptes
  const selectedAccounts = ref<string[]>([])

  // Référence au composant ExpensesReimbursementManager
  const expensesManagerRef = ref<InstanceType<
    typeof ExpensesReimbursementManager
  > | null>(null)

  // Calculer la liste des comptes uniques
  const availableAccounts = computed(() => {
    if (!props.analysisResult.isValid) return []
    const accounts = new Set<string>()
    props.analysisResult.transactions.forEach(transaction => {
      if (transaction.account) {
        accounts.add(transaction.account)
      }
    })
    return Array.from(accounts).sort()
  })

  // Initialiser les comptes sélectionnés avec tous les comptes disponibles
  const initializeSelectedAccounts = () => {
    if (props.analysisResult.isValid) {
      selectedAccounts.value = [...availableAccounts.value]
    }
  }

  // Initialiser au montage
  initializeSelectedAccounts()

  // Calcul des dépenses filtrées par compte
  const filteredExpenses = computed(() => {
    if (!props.analysisResult?.isValid) return []

    return props.analysisResult.transactions.filter(transaction => {
      // Filtrer par type de transaction
      if (transaction.type !== 'expense') return false

      // Filtrer par compte sélectionné
      if (selectedAccounts.value.length > 0 && transaction.account) {
        return selectedAccounts.value.includes(transaction.account)
      }

      return true
    })
  })

  // Résultat d'analyse filtré pour passer aux composants enfants
  const filteredAnalysisResult = computed(() => {
    if (!props.analysisResult?.isValid) return props.analysisResult

    return {
      ...props.analysisResult,
      transactions: props.analysisResult.transactions.filter(transaction => {
        // Filtrer par compte sélectionné
        if (selectedAccounts.value.length > 0 && transaction.account) {
          return selectedAccounts.value.includes(transaction.account)
        }

        return true
      }),
    }
  })

  const toggleAdvancedFilters = () => {
    showAdvancedFilters.value = !showAdvancedFilters.value
  }
</script>

<template>
  <div class="reimbursement-manager">
    <!-- En-tête avec titre -->
    <div class="manager-header">
      <div class="header-content">
        <h2 class="manager-title">
          <svg
            class="title-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
          Gestionnaire de remboursements
        </h2>
        <p class="manager-description">
          Gérez vos demandes de remboursement et identifiez les dépenses
          professionnelles.
        </p>
      </div>
    </div>

    <!-- Contenu principal avec composants modulaires -->
    <div class="manager-content">
      <!-- Bouton de filtrage avancé -->
      <div class="advanced-filters-toggle">
        <button
          class="advanced-filters-btn"
          :class="{ active: showAdvancedFilters }"
          @click="toggleAdvancedFilters"
        >
          <svg
            class="filter-toggle-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
          </svg>
          Filtres avancés
          <svg
            class="chevron-icon"
            :class="{ rotated: showAdvancedFilters }"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <polyline points="6,9 12,15 18,9" />
          </svg>
        </button>
      </div>

      <!-- Panneau de filtres avancés -->
      <div v-show="showAdvancedFilters" class="advanced-filters-panel">
        <div class="filters-container">
          <!-- En-tête principal du panneau -->
          <div class="filters-main-header">
            <div class="filters-main-title">
              <div class="filters-main-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <polygon points="22,3 2,3 10,12.46 10,19 14,21 14,12.46" />
                </svg>
              </div>
              <h3>Filtres avancés des remboursements</h3>
            </div>
            <p class="filters-main-description">
              Personnalisez l'analyse en filtrant par comptes bancaires
            </p>
          </div>

          <!-- Grille compacte des filtres -->
          <div class="filters-compact-grid">
            <!-- Filtre Comptes Bancaires -->
            <div class="compact-filter-card">
              <div class="compact-filter-header">
                <div class="compact-filter-icon accounts-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <rect x="1" y="3" width="15" height="13" />
                    <path d="M16 8h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4" />
                    <circle cx="9" cy="9" r="2" />
                  </svg>
                </div>
                <div class="compact-filter-title">
                  <h4>Comptes bancaires</h4>
                  <span class="compact-filter-subtitle"
                    >Filtrer par compte</span
                  >
                </div>
              </div>
              <div class="compact-filter-content">
                <AccountFilter
                  :accounts="availableAccounts"
                  :selected-accounts="selectedAccounts"
                  @update:selected-accounts="selectedAccounts = $event"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Statistiques des remboursements -->
      <ReimbursementStats
        :analysis-result="filteredAnalysisResult"
        :filtered-expenses="filteredExpenses"
      />

      <!-- Gestionnaire des personnes -->
      <PersonsManager />

      <!-- Gestionnaire des catégories de remboursement -->
      <ReimbursementCategoriesManager />

      <!-- Gestionnaire des dépenses et remboursements -->
      <ExpensesReimbursementManager
        ref="expensesManagerRef"
        :analysis-result="filteredAnalysisResult"
      />

      <!-- Résumé des remboursements -->
      <ReimbursementSummary :expenses-manager-ref="expensesManagerRef" />
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-manager {
    background: white;
    border-radius: 1rem;
    overflow: hidden;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
  }

  /* En-tête du gestionnaire */
  .manager-header {
    padding: 2rem;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
    border-bottom: 1px solid #e5e7eb;
  }

  .header-content {
    text-align: center;
  }

  .manager-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 1.75rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 0.75rem;
    line-height: 1.2;
  }

  .title-icon {
    width: 2rem;
    height: 2rem;
    color: #3b82f6;
  }

  .manager-description {
    font-size: 1rem;
    color: #6b7280;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  /* Contenu principal */
  .manager-content {
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* Bouton de filtres avancés */
  .advanced-filters-toggle {
    margin-bottom: 1rem;
  }

  .advanced-filters-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: #ffffff;
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }

  .advanced-filters-btn:hover {
    background: #f9fafb;
    border-color: #9ca3af;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .advanced-filters-btn.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1e40af;
  }

  .filter-toggle-icon {
    width: 1rem;
    height: 1rem;
  }

  .chevron-icon {
    width: 1rem;
    height: 1rem;
    transition: transform 0.2s ease;
  }

  .chevron-icon.rotated {
    transform: rotate(180deg);
  }

  /* Panneau de filtres avancés */
  .advanced-filters-panel {
    margin-bottom: 1.5rem;
    animation: slideDown 0.3s ease-out;
  }

  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .filters-container {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(229, 231, 235, 0.3);
    border-radius: 0.75rem;
    padding: 1.5rem;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  /* En-tête principal du panneau */
  .filters-main-header {
    margin-bottom: 1.5rem;
    text-align: center;
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
    padding-bottom: 1rem;
  }

  .filters-main-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .filters-main-icon {
    width: 2rem;
    height: 2rem;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .filters-main-icon svg {
    width: 1rem;
    height: 1rem;
    color: white;
  }

  .filters-main-title h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .filters-main-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  /* Grille compacte des filtres */
  .filters-compact-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 1rem;
  }

  .compact-filter-card {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(229, 231, 235, 0.3);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .compact-filter-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  .compact-filter-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.25rem 0.75rem;
    background: linear-gradient(
      135deg,
      rgba(248, 250, 252, 0.8) 0%,
      rgba(255, 255, 255, 0.9) 100%
    );
    backdrop-filter: blur(5px);
    border-bottom: 1px solid rgba(241, 245, 249, 0.3);
  }

  .compact-filter-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .accounts-icon {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .compact-filter-icon svg {
    width: 1.25rem;
    height: 1.25rem;
    color: white;
  }

  .compact-filter-title h4 {
    font-size: 1rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.125rem;
  }

  .compact-filter-subtitle {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .compact-filter-content {
    height: 100%;
    padding: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .manager-header {
      padding: 1.5rem;
    }

    .manager-content {
      padding: 1.5rem;
    }

    .filters-container {
      padding: 1rem;
    }

    .compact-filter-header {
      padding: 0.75rem 1rem 0.5rem;
    }

    .filters-main-title {
      flex-direction: column;
      gap: 0.5rem;
    }

    .filters-main-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .filters-main-icon svg {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
</style>

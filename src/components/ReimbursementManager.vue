<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'
  import { computed } from 'vue'
  import ExpensesList from './ExpensesList.vue'
  import PersonsManager from './PersonsManager.vue'
  import ReimbursementStats from './ReimbursementStats.vue'
  import ReimbursementSummary from './ReimbursementSummary.vue'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  const props = defineProps<Props>()

  // Calcul des dépenses pour les statistiques
  const filteredExpenses = computed(() => {
    if (!props.analysisResult?.isValid) return []
    return props.analysisResult.transactions.filter(t => t.type === 'expense')
  })
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
      <!-- Statistiques des remboursements -->
      <ReimbursementStats
        :analysis-result="analysisResult"
        :filtered-expenses="filteredExpenses"
      />

      <!-- Gestionnaire des personnes -->
      <PersonsManager />

      <!-- Liste des dépenses -->
      <ExpensesList :analysis-result="analysisResult" />

      <!-- Résumé des remboursements -->
      <ReimbursementSummary :filtered-expenses="filteredExpenses" />
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

  /* Responsive */
  @media (max-width: 768px) {
    .manager-header {
      padding: 1.5rem;
    }

    .manager-content {
      padding: 1.5rem;
    }
  }
</style>

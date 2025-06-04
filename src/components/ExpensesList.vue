<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'
  import { computed, ref } from 'vue'
  import TransactionsList from './TransactionsList.vue'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  const props = defineProps<Props>()

  // États pour les filtres
  const selectedCategories = ref<string[]>([])
  const showOnlyReimbursableExpenses = ref(false)

  // Catégories disponibles pour filtrage
  const availableCategories = computed(() => {
    if (!props.analysisResult?.isValid) return []
    const categories = new Set<string>()
    props.analysisResult.transactions
      .filter(t => t.type === 'expense')
      .forEach(t => categories.add(t.category))
    return Array.from(categories).sort()
  })

  // Transactions de dépenses filtrées
  const filteredExpenses = computed(() => {
    if (!props.analysisResult?.isValid) return []

    return props.analysisResult.transactions.filter(transaction => {
      // Uniquement les dépenses
      if (transaction.type !== 'expense') return false

      // Filtre par catégorie si sélectionnée
      if (
        selectedCategories.value.length > 0 &&
        !selectedCategories.value.includes(transaction.category)
      ) {
        return false
      }

      // Option pour afficher uniquement les dépenses remboursables
      if (showOnlyReimbursableExpenses.value) {
        const searchText =
          `${transaction.description} ${transaction.category}`.toLowerCase()
        const reimbursableKeywords = [
          'restaurant',
          'transport',
          'taxi',
          'uber',
          'essence',
          'parking',
          'hotel',
          'hébergement',
          'formation',
          'matériel',
          'bureau',
          'professionnel',
          'mission',
          'déplacement',
          'repas',
          'client',
        ]
        return reimbursableKeywords.some(keyword =>
          searchText.includes(keyword)
        )
      }

      return true
    })
  })

  // Exposition des données filtrées pour le composant parent
  defineExpose({
    filteredExpenses,
  })
</script>

<template>
  <div class="reimbursement-section expenses-section">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M9 9h6v6H9z" />
      </svg>
      Liste des dépenses
      <span class="transaction-count"
        >({{ filteredExpenses.length }} transactions)</span
      >
    </h3>
    <div class="section-content">
      <!-- Filtres -->
      <div class="filter-bar">
        <div class="filter-group">
          <label for="category-filter" class="filter-label">
            Filtrer par catégorie :
          </label>
          <select
            id="category-filter"
            v-model="selectedCategories"
            multiple
            class="filter-select"
          >
            <option
              v-for="category in availableCategories"
              :key="category"
              :value="category"
            >
              {{ category }}
            </option>
          </select>
          <div v-if="selectedCategories.length > 0" class="selected-categories">
            <span
              v-for="category in selectedCategories"
              :key="category"
              class="category-tag"
            >
              {{ category }}
              <button
                class="remove-category"
                @click="
                  selectedCategories = selectedCategories.filter(
                    c => c !== category
                  )
                "
              >
                ×
              </button>
            </span>
          </div>
        </div>

        <div class="filter-group">
          <label class="checkbox-label">
            <input
              v-model="showOnlyReimbursableExpenses"
              type="checkbox"
              class="filter-checkbox"
            />
            <span class="checkbox-text">
              Afficher uniquement les dépenses potentiellement remboursables
            </span>
          </label>
        </div>
      </div>

      <!-- Liste des transactions -->
      <div class="expenses-list">
        <div v-if="filteredExpenses.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <path d="M8 12l2 2 4-4" />
          </svg>
          <h4>Aucune dépense trouvée</h4>
          <p>
            Modifiez vos filtres pour afficher plus de transactions ou vérifiez
            que vos données contiennent des dépenses.
          </p>
        </div>
        <TransactionsList
          v-else
          :analysis-result="analysisResult"
          :transactions="filteredExpenses"
          active-tab="expenses"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-section {
    background: white;
    border-radius: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid #f3f4f6;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    padding: 1.5rem 1.5rem 0;
    margin-bottom: 1rem;
  }

  .section-title svg {
    width: 1.5rem;
    height: 1.5rem;
    color: #3b82f6;
  }

  .transaction-count {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    background: #f3f4f6;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    margin-left: auto;
  }

  .section-content {
    padding: 0 1.5rem 1.5rem;
  }

  /* Barre de filtres */
  .filter-bar {
    background: #f9fafb;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    border: 1px solid #e5e7eb;
  }

  .filter-group {
    margin-bottom: 1rem;
  }

  .filter-group:last-child {
    margin-bottom: 0;
  }

  .filter-label {
    display: block;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.5rem;
    font-size: 0.875rem;
  }

  .filter-select {
    width: 100%;
    max-width: 400px;
    padding: 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: white;
    font-size: 0.875rem;
    color: #374151;
    transition: all 0.2s ease;
  }

  .filter-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .selected-categories {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }

  .category-tag {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #dbeafe;
    color: #1e40af;
    padding: 0.375rem 0.75rem;
    border-radius: 16px;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .remove-category {
    background: none;
    border: none;
    color: #1e40af;
    cursor: pointer;
    font-size: 1rem;
    font-weight: bold;
    padding: 0;
    width: 1rem;
    height: 1rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-category:hover {
    color: #dc2626;
  }

  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    cursor: pointer;
    font-weight: 500;
    color: #374151;
  }

  .filter-checkbox {
    width: 1.25rem;
    height: 1.25rem;
    border: 2px solid #d1d5db;
    border-radius: 4px;
    cursor: pointer;
    accent-color: #3b82f6;
  }

  .checkbox-text {
    font-size: 0.9rem;
    line-height: 1.4;
  }

  /* Liste des dépenses */
  .expenses-list {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    overflow: hidden;
  }

  /* État vide */
  .empty-state {
    text-align: center;
    padding: 3rem 2rem;
    color: #6b7280;
  }

  .empty-state svg {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1.5rem;
    color: #d1d5db;
  }

  .empty-state h4 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 0.75rem;
  }

  .empty-state p {
    line-height: 1.6;
    max-width: 400px;
    margin: 0 auto;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .reimbursement-section {
      background: #1f2937;
      border: 1px solid #374151;
    }

    .section-title {
      color: #f9fafb;
    }

    .transaction-count {
      background: #374151;
      color: #d1d5db;
    }

    .filter-bar {
      background: #374151;
      border-color: #4b5563;
    }

    .filter-label {
      color: #f3f4f6;
    }

    .filter-select {
      background: #1f2937;
      border-color: #4b5563;
      color: #f9fafb;
    }

    .filter-select:focus {
      border-color: #3b82f6;
    }

    .checkbox-label {
      color: #f3f4f6;
    }

    .expenses-list {
      background: #1f2937;
      border-color: #374151;
    }

    .empty-state h4 {
      color: #f9fafb;
    }

    .empty-state {
      color: #d1d5db;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .section-title {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .transaction-count {
      align-self: flex-start;
      margin-left: 0;
    }

    .filter-bar {
      padding: 1rem;
    }

    .filter-select {
      max-width: none;
    }

    .selected-categories {
      margin-top: 0.5rem;
    }

    .category-tag {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
    }

    .checkbox-label {
      gap: 0.5rem;
    }

    .checkbox-text {
      font-size: 0.85rem;
    }

    .empty-state {
      padding: 2rem 1rem;
    }

    .empty-state svg {
      width: 3rem;
      height: 3rem;
    }
  }
</style>

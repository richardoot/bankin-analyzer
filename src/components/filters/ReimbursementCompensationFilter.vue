<template>
  <div class="reimbursement-compensation-filter">
    <div class="filter-header">
      <h3 class="filter-title">
        <svg
          class="filter-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M12 1v6l4-4" />
          <path d="M12 23v-6l4 4M12 17l-4 4" />
          <path d="M20 12h-6l4-4M14 12l4 4" />
          <path d="M4 12h6l-4-4M10 12l-4 4" />
        </svg>
        Compensation des remboursements
      </h3>
      <p class="filter-description">
        Associez les catégories de remboursement aux dépenses correspondantes
        pour les déduire automatiquement
      </p>
    </div>

    <!-- Formulaire d'association directe -->
    <div class="add-rule-form">
      <div class="form-row">
        <div class="form-group">
          <label class="form-label">Catégorie de dépense</label>
          <select v-model="newRule.expenseCategory" class="form-select">
            <option value="">Sélectionner une dépense...</option>
            <option
              v-for="category in availableExpenseCategories"
              :key="category"
              :value="category"
            >
              {{ category }}
            </option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">Catégorie de remboursement</label>
          <select v-model="newRule.incomeCategory" class="form-select">
            <option value="">Sélectionner un remboursement...</option>
            <option
              v-for="category in availableIncomeCategories"
              :key="category"
              :value="category"
            >
              {{ category }}
            </option>
          </select>
        </div>

        <div class="form-group-button">
          <button
            class="form-btn save"
            :disabled="!canSaveRule"
            @click="saveRule"
          >
            <svg
              class="btn-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Associer
          </button>
        </div>
      </div>
    </div>

    <!-- Liste des règles de compensation - Format tableau -->
    <div v-if="compensationRules.length > 0" class="compensation-table">
      <div class="table-header">
        <div class="header-cell expense-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
            <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
          </svg>
          Dépense
        </div>
        <div class="header-cell income-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M7 13l3 3 7-7" />
            <path
              d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4"
            />
          </svg>
          Remboursement
        </div>
        <div class="header-cell amount-header">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="12" y1="1" x2="12" y2="23" />
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
          </svg>
          Montant compensé
        </div>
      </div>

      <div class="table-body">
        <div
          v-for="(rule, index) in compensationRules"
          :key="`rule-${index}`"
          class="table-row"
        >
          <div class="table-cell expense-cell">
            <div class="cell-content">
              <div class="cell-icon expense-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
                  <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
                </svg>
              </div>
              <span class="cell-text">{{ rule.expenseCategory }}</span>
            </div>
          </div>

          <div class="table-cell income-cell">
            <div class="cell-content">
              <div class="cell-icon income-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M7 13l3 3 7-7" />
                  <path
                    d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4"
                  />
                </svg>
              </div>
              <span class="cell-text">{{ rule.incomeCategory }}</span>
            </div>
          </div>

          <div class="table-cell amount-cell">
            <div class="amount-display">
              {{ formatAmount(rule.affectedAmount) }}
            </div>
            <BaseButton
              variant="danger"
              size="sm"
              icon
              title="Supprimer cette règle"
              @click="removeRule(index)"
            >
              <template #icon>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </template>
            </BaseButton>
          </div>
        </div>
      </div>
    </div>

    <!-- Actions de gestion -->
    <div v-if="compensationRules.length > 0" class="filter-actions">
      <button class="filter-action-btn clear-all" @click="clearAllRules">
        <svg
          class="btn-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
        Tout effacer
      </button>
    </div>

    <!-- Message quand aucune règle -->
    <div v-if="compensationRules.length === 0" class="empty-state">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <p class="empty-message">Aucune règle de compensation configurée</p>
      <p class="empty-description">
        Sélectionnez une dépense et son remboursement correspondant pour créer
        une association
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'
  import { computed, nextTick, ref, watch } from 'vue'
  import BaseButton from '@/components/shared/BaseButton.vue'

  export interface CompensationRule {
    expenseCategory: string
    incomeCategory: string
    affectedAmount: number
  }

  interface Props {
    analysisResult: CsvAnalysisResult
    selectedRules?: CompensationRule[]
    selectedExpenseCategories?: string[]
    selectedIncomeCategories?: string[]
  }

  const props = defineProps<Props>()

  const emit = defineEmits<{
    'update:selectedRules': [rules: CompensationRule[]]
  }>()

  // État local
  const compensationRules = ref<CompensationRule[]>(props.selectedRules || [])
  const newRule = ref({
    expenseCategory: '',
    incomeCategory: '',
  })

  // Catégories disponibles (filtrées pour exclure celles déjà associées ET celles désélectionnées dans CategoryFilter)
  const availableExpenseCategories = computed(() => {
    if (!props.analysisResult.isValid) return []

    // Récupérer les catégories de dépenses déjà utilisées dans les règles actives
    const usedExpenseCategories = new Set(
      compensationRules.value.map(rule => rule.expenseCategory)
    )

    // Récupérer les catégories sélectionnées dans CategoryFilter (par défaut toutes si non spécifiées)
    const selectedCategories =
      props.selectedExpenseCategories ||
      props.analysisResult.expenses.categories

    // Filtrer les catégories pour exclure celles déjà utilisées ET garder seulement celles sélectionnées
    return [...props.analysisResult.expenses.categories]
      .filter(
        category =>
          !usedExpenseCategories.has(category) &&
          selectedCategories.includes(category)
      )
      .sort()
  })

  const availableIncomeCategories = computed(() => {
    if (!props.analysisResult.isValid) return []

    // Récupérer les catégories de remboursements déjà utilisées dans les règles actives
    const usedIncomeCategories = new Set(
      compensationRules.value.map(rule => rule.incomeCategory)
    )

    // Récupérer les catégories sélectionnées dans CategoryFilter (par défaut toutes si non spécifiées)
    const selectedCategories =
      props.selectedIncomeCategories || props.analysisResult.income.categories

    // Filtrer les catégories pour exclure celles déjà utilisées ET garder seulement celles sélectionnées
    return [...props.analysisResult.income.categories]
      .filter(
        category =>
          !usedIncomeCategories.has(category) &&
          selectedCategories.includes(category)
      )
      .sort()
  })

  // Vérifications pour les boutons
  const canSaveRule = computed(() => {
    return newRule.value.expenseCategory && newRule.value.incomeCategory
  })

  // Calcul des montants affectés
  const calculateAffectedAmount = (incomeCategory: string): number => {
    if (!props.analysisResult.isValid || !props.analysisResult.transactions)
      return 0

    // Utiliser les transactions originales pour calculer le montant,
    // sans tenir compte des associations existantes
    const reimbursementAmount = props.analysisResult.transactions
      .filter(t => t.category === incomeCategory && t.type === 'income')
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    return reimbursementAmount
  }

  // Actions
  const saveRule = () => {
    if (!canSaveRule.value) return

    const affectedAmount = calculateAffectedAmount(newRule.value.incomeCategory)

    const rule: CompensationRule = {
      expenseCategory: newRule.value.expenseCategory,
      incomeCategory: newRule.value.incomeCategory,
      affectedAmount,
    }

    // Créer un nouveau tableau pour forcer la réactivité
    compensationRules.value = [...compensationRules.value, rule]

    // Émettre l'événement immédiatement pour notifier le parent
    emit('update:selectedRules', [...compensationRules.value])

    // Reset form
    newRule.value = { expenseCategory: '', incomeCategory: '' }
  }

  const removeRule = (index: number) => {
    // Créer une copie et modifier pour garantir la réactivité
    compensationRules.value = compensationRules.value.filter(
      (_, i) => i !== index
    )

    // Émettre directement vers le parent pour assurer la mise à jour immédiate
    emit('update:selectedRules', [...compensationRules.value])

    // Réinitialiser le formulaire pour s'assurer que les sélecteurs se mettent à jour
    newRule.value = { expenseCategory: '', incomeCategory: '' }
  }

  const clearAllRules = () => {
    compensationRules.value = []
    // Émettre directement vers le parent pour assurer la mise à jour immédiate
    emit('update:selectedRules', [])
  }

  // Formatage
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  // Optimisation: Synchronisation avec debouncing pour éviter les recalculs excessifs
  let updateTimeout: number | null = null

  watch(
    compensationRules,
    newRules => {
      // Debounce pour éviter les émissions multiples lors de modifications rapides
      if (updateTimeout) {
        clearTimeout(updateTimeout)
      }
      updateTimeout = setTimeout(() => {
        emit('update:selectedRules', newRules)
      }, 50) // 50ms de délai pour grouper les modifications
    },
    { deep: true, flush: 'post' }
  )

  // Synchronisation depuis le parent avec protection contre les boucles infinies
  let isUpdatingFromParent = false
  watch(
    () => props.selectedRules,
    newRules => {
      if (newRules && !isUpdatingFromParent) {
        isUpdatingFromParent = true
        compensationRules.value = [...newRules]
        nextTick(() => {
          isUpdatingFromParent = false
        })
      }
    },
    { deep: true, flush: 'pre' }
  )
</script>

<style scoped>
  .reimbursement-compensation-filter {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  /* En-tête */
  .filter-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
  }

  .filter-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem;
  }

  .filter-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #8b5cf6;
  }

  .filter-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
  }

  /* Formulaire d'ajout */
  .add-rule-form {
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1rem;
  }

  .form-row {
    display: flex;
    gap: 1rem;
    align-items: end;
  }

  .form-group {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .form-group-button {
    flex: 0 0 auto;
  }

  .form-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .form-select {
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    color: #374151;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .form-select:focus {
    outline: none;
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
  }

  .form-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 1px solid transparent;
  }

  .form-btn.save {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
    color: #15803d;
  }

  .form-btn.save:hover:not(:disabled) {
    background: rgba(34, 197, 94, 0.15);
    transform: translateY(-1px);
  }

  .form-btn.save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-icon {
    width: 1rem;
    height: 1rem;
  }

  /* Tableau de compensation - Design moderne et compact */
  .compensation-table {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.75rem;
    overflow: hidden;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    margin-bottom: 0.75rem;
  }

  .table-header {
    display: grid;
    grid-template-columns: 2fr 2fr 1.5fr;
    background: linear-gradient(
      135deg,
      rgba(99, 102, 241, 0.05) 0%,
      rgba(139, 92, 246, 0.08) 100%
    );
    border-bottom: 1px solid rgba(99, 102, 241, 0.1);
  }

  .header-cell {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    font-size: 0.875rem;
    font-weight: 600;
    color: #374151;
    border-right: 1px solid rgba(99, 102, 241, 0.1);
  }

  .header-cell:last-child {
    border-right: none;
  }

  .header-cell svg {
    width: 1rem;
    height: 1rem;
    flex-shrink: 0;
  }

  .expense-header svg {
    color: #ef4444;
  }

  .income-header svg {
    color: #22c55e;
  }

  .amount-header svg {
    color: #6366f1;
  }

  .table-body {
    display: flex;
    flex-direction: column;
  }

  .table-row {
    display: grid;
    grid-template-columns: 2fr 2fr 1.5fr;
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
    transition: background-color 0.2s ease;
  }

  .table-row:hover {
    background: rgba(99, 102, 241, 0.02);
  }

  .table-row:last-child {
    border-bottom: none;
  }

  .table-cell {
    display: flex;
    align-items: center;
    padding: 0.75rem 1rem;
    border-right: 1px solid rgba(229, 231, 235, 0.2);
    min-height: 3rem;
  }

  .table-cell:last-child {
    border-right: none;
  }

  .cell-content {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;
    flex: 1;
  }

  .cell-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.375rem;
    flex-shrink: 0;
  }

  .expense-icon {
    background: linear-gradient(135deg, #ef4444, #f87171);
    color: white;
    box-shadow: 0 2px 4px rgba(239, 68, 68, 0.2);
  }

  .income-icon {
    background: linear-gradient(135deg, #22c55e, #4ade80);
    color: white;
    box-shadow: 0 2px 4px rgba(34, 197, 94, 0.2);
  }

  .cell-icon svg {
    width: 0.75rem;
    height: 0.75rem;
    stroke-width: 2;
  }

  .cell-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .amount-display {
    font-size: 0.875rem;
    font-weight: 700;
    color: #6366f1;
    font-feature-settings: 'tnum';
    padding: 0.375rem 0.75rem;
    background: rgba(99, 102, 241, 0.08);
    border-radius: 0.375rem;
    border: 1px solid rgba(99, 102, 241, 0.15);
  }

  /* Cellule montant avec bouton aligné à droite */
  .amount-cell {
    justify-content: space-between;
    gap: 0.5rem;
  }

  /* Actions */
  .filter-actions {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1rem;
    justify-content: flex-end;
  }

  .filter-action-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 1rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.5rem;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-action-btn:hover {
    background: rgba(243, 244, 246, 0.9);
    border-color: rgba(255, 255, 255, 0.4);
    transform: translateY(-1px);
  }

  .clear-all {
    background: rgba(239, 68, 68, 0.1);
    border-color: rgba(239, 68, 68, 0.3);
    color: #dc2626;
  }

  .clear-all:hover {
    background: rgba(239, 68, 68, 0.15);
  }

  /* État vide */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem 1rem;
    text-align: center;
  }

  .empty-icon {
    width: 3rem;
    height: 3rem;
    color: #9ca3af;
    margin-bottom: 1rem;
  }

  .empty-message {
    font-size: 1rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
  }

  .empty-description {
    font-size: 0.875rem;
    color: #9ca3af;
    margin: 0;
    line-height: 1.5;
  }

  /* Responsive Design - Optimisé pour tableau */
  @media (max-width: 1024px) {
    .table-header,
    .table-row {
      grid-template-columns: 1.8fr 1.8fr 1.2fr;
    }

    .header-cell,
    .table-cell {
      padding: 0.625rem 0.75rem;
    }

    .header-cell {
      font-size: 0.8125rem;
    }

    .cell-text {
      font-size: 0.8125rem;
    }

    .amount-display {
      font-size: 0.8125rem;
      padding: 0.25rem 0.5rem;
    }
  }

  @media (max-width: 768px) {
    .compensation-table {
      border-radius: 0.5rem;
    }

    .table-header,
    .table-row {
      grid-template-columns: 2fr 2fr 1fr;
    }

    .header-cell,
    .table-cell {
      padding: 0.5rem 0.625rem;
    }

    .table-cell {
      min-height: 2.5rem;
    }

    .cell-icon {
      width: 1.25rem;
      height: 1.25rem;
    }

    .cell-icon svg {
      width: 0.625rem;
      height: 0.625rem;
    }

    .header-cell {
      font-size: 0.75rem;
      gap: 0.375rem;
    }

    .header-cell svg {
      width: 0.875rem;
      height: 0.875rem;
    }

    .cell-text {
      font-size: 0.75rem;
    }

    .amount-display {
      font-size: 0.75rem;
      padding: 0.25rem 0.5rem;
    }

    .form-row {
      flex-direction: column;
      gap: 1rem;
    }

    .form-group-button {
      align-self: stretch;
    }
  }

  @media (max-width: 480px) {
    .header-cell,
    .table-cell {
      padding: 0.5rem;
    }

    .header-cell {
      font-size: 0.6875rem;
    }

    .cell-text {
      font-size: 0.6875rem;
    }

    .amount-display {
      font-size: 0.6875rem;
      padding: 0.25rem 0.375rem;
    }

    .cell-icon {
      width: 1rem;
      height: 1rem;
    }

    .cell-icon svg {
      width: 0.5rem;
      height: 0.5rem;
    }
  }

  /* Theme sombre */
  @media (prefers-color-scheme: dark) {
    .reimbursement-compensation-filter {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .filter-header {
      border-bottom-color: rgba(71, 85, 105, 0.3);
    }

    .filter-title {
      color: #e2e8f0;
    }

    .filter-icon {
      color: #a78bfa;
    }

    .filter-description {
      color: #94a3b8;
    }

    .add-rule-form {
      background: rgba(15, 23, 42, 0.6);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .form-label {
      color: #cbd5e1;
    }

    .form-select {
      background: rgba(30, 41, 59, 0.9);
      border-color: rgba(71, 85, 105, 0.3);
      color: #e2e8f0;
    }

    .form-select:focus {
      border-color: rgba(99, 102, 241, 0.6);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1);
    }

    /* Tableau en mode sombre */
    .compensation-table {
      background: rgba(30, 41, 59, 0.9);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .table-header {
      background: linear-gradient(
        135deg,
        rgba(51, 65, 85, 0.8) 0%,
        rgba(71, 85, 105, 0.6) 100%
      );
      border-bottom-color: rgba(71, 85, 105, 0.3);
    }

    .header-cell {
      color: #cbd5e1;
      border-right-color: rgba(71, 85, 105, 0.2);
    }

    .table-row {
      border-bottom-color: rgba(71, 85, 105, 0.2);
    }

    .table-row:hover {
      background: rgba(51, 65, 85, 0.3);
    }

    .table-cell {
      border-right-color: rgba(71, 85, 105, 0.15);
    }

    .cell-text {
      color: #cbd5e1;
    }

    .amount-display {
      background: rgba(51, 65, 85, 0.6);
      border-color: rgba(99, 102, 241, 0.3);
      color: #a5b4fc;
    }

    /* Actions en mode sombre */
    .filter-actions .clear-all {
      background: rgba(239, 68, 68, 0.15);
      border-color: rgba(239, 68, 68, 0.4);
      color: #fca5a5;
    }

    .filter-actions .clear-all:hover {
      background: rgba(239, 68, 68, 0.25);
      color: #f87171;
    }

    /* État vide en mode sombre */
    .empty-state {
      color: #94a3b8;
    }

    .empty-icon {
      color: #64748b;
    }

    .empty-message {
      color: #94a3b8;
    }

    .empty-description {
      color: #64748b;
    }
  }
</style>

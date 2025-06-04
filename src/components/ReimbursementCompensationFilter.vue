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

    <!-- Liste des règles de compensation -->
    <div v-if="compensationRules.length > 0" class="compensation-rules">
      <div
        v-for="(rule, index) in compensationRules"
        :key="`rule-${index}`"
        class="compensation-card"
      >
        <!-- Bouton de suppression -->
        <button
          class="delete-btn"
          title="Supprimer cette règle"
          @click="removeRule(index)"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <!-- Contenu principal de la carte -->
        <div class="card-content">
          <!-- Section dépense -->
          <div class="category-section expense-section">
            <div class="category-badge expense-badge">
              <div class="badge-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                  />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              </div>
              <div class="badge-content">
                <span class="badge-label">Dépense</span>
                <span class="badge-value">{{ rule.expenseCategory }}</span>
              </div>
            </div>
          </div>

          <!-- Connecteur -->
          <div class="connector">
            <div class="connector-line"></div>
            <div class="connector-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12,5 19,12 12,19" />
              </svg>
            </div>
          </div>

          <!-- Section remboursement -->
          <div class="category-section income-section">
            <div class="category-badge income-badge">
              <div class="badge-icon">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                >
                  <path
                    d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                  />
                </svg>
              </div>
              <div class="badge-content">
                <span class="badge-label">Remboursement</span>
                <span class="badge-value">{{ rule.incomeCategory }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Footer avec montant -->
        <div v-if="rule.affectedAmount > 0" class="card-footer">
          <div class="amount-chip">
            <span class="amount-label">Compensé</span>
            <span class="amount-value">{{
              formatAmount(rule.affectedAmount)
            }}</span>
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
  import { usePerformanceMonitor } from '@/composables/usePerformanceMonitor'
  import type { CsvAnalysisResult } from '@/types'
  import { computed, nextTick, ref, watch } from 'vue'

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

  // Monitoring de performance (en développement)
  const {
    startMeasure: _startMeasure,
    endMeasure: _endMeasure,
    watchWithPerformance: _watchWithPerformance,
  } = usePerformanceMonitor('ReimbursementCompensationFilter')

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
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(10px);
    padding: 1.5rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  }

  /* En-tête */
  .filter-header {
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
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
    background: rgba(243, 244, 246, 0.5);
    border: 1px solid rgba(209, 213, 219, 0.5);
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
    border: 1px solid rgba(209, 213, 219, 0.7);
    border-radius: 0.5rem;
    background: rgba(255, 255, 255, 0.9);
    color: #374151;
    font-size: 0.875rem;
    transition: all 0.2s ease;
  }

  .form-select:focus {
    outline: none;
    border-color: #6366f1;
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

  /* Règles de compensation - Design ultra-compact */
  .compensation-rules {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .compensation-card {
    position: relative;
    background: rgba(255, 255, 255, 0.75);
    backdrop-filter: blur(16px);
    border: 1px solid rgba(255, 255, 255, 0.25);
    border-radius: 0.875rem;
    padding: 0;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    box-shadow:
      0 4px 16px rgba(0, 0, 0, 0.05),
      0 1px 2px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.5);
  }

  .compensation-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, #6366f1, #8b5cf6, #ec4899);
    opacity: 0;
    transition: opacity 0.3s ease;
  }

  .compensation-card:hover {
    transform: translateY(-1px) scale(1.002);
    box-shadow:
      0 8px 20px rgba(0, 0, 0, 0.08),
      0 2px 8px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.6);
    border-color: rgba(255, 255, 255, 0.35);
  }

  .compensation-card:hover::before {
    opacity: 1;
  }

  .delete-btn {
    position: absolute;
    top: 0.625rem;
    right: 0.625rem;
    width: 1.375rem;
    height: 1.375rem;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border: none;
    border-radius: 0.375rem;
    color: #64748b;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.3s ease;
    z-index: 10;
    opacity: 0;
    transform: scale(0.85);
  }

  .delete-btn svg {
    width: 0.75rem;
    height: 0.75rem;
    stroke-width: 2.5;
  }

  .compensation-card:hover .delete-btn {
    opacity: 1;
    transform: scale(1);
  }

  .delete-btn:hover {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
    transform: scale(1.1);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.2);
  }

  .card-content {
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
  }

  .category-section {
    display: flex;
    justify-content: center;
  }

  .category-badge {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    padding: 0.625rem 0.875rem;
    border-radius: 0.75rem;
    min-width: 0;
    flex: 1;
    max-width: 240px;
    transition: all 0.3s ease;
  }

  .expense-badge {
    background: linear-gradient(
      135deg,
      rgba(239, 68, 68, 0.05) 0%,
      rgba(248, 113, 113, 0.08) 100%
    );
    border: 1px solid rgba(239, 68, 68, 0.15);
  }

  .income-badge {
    background: linear-gradient(
      135deg,
      rgba(34, 197, 94, 0.05) 0%,
      rgba(74, 222, 128, 0.08) 100%
    );
    border: 1px solid rgba(34, 197, 94, 0.15);
  }

  .badge-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 0.625rem;
    flex-shrink: 0;
    transition: all 0.3s ease;
  }

  .expense-badge .badge-icon {
    background: linear-gradient(135deg, #ef4444, #f87171);
    color: white;
    box-shadow: 0 3px 8px rgba(239, 68, 68, 0.25);
  }

  .income-badge .badge-icon {
    background: linear-gradient(135deg, #22c55e, #4ade80);
    color: white;
    box-shadow: 0 3px 8px rgba(34, 197, 94, 0.25);
  }

  .badge-icon svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 2;
  }

  .badge-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .badge-label {
    font-size: 0.6875rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.7;
  }

  .expense-badge .badge-label {
    color: #dc2626;
  }

  .income-badge .badge-label {
    color: #15803d;
  }

  .badge-value {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #1f2937;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .connector {
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    margin: 0.25rem 0;
  }

  .connector-line {
    position: absolute;
    width: 100%;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      rgba(148, 163, 184, 0.3) 20%,
      rgba(148, 163, 184, 0.6) 50%,
      rgba(148, 163, 184, 0.3) 80%,
      transparent 100%
    );
  }

  .connector-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.5rem;
    color: #64748b;
    z-index: 1;
    transition: all 0.3s ease;
  }

  .connector-icon svg {
    width: 0.75rem;
    height: 0.75rem;
  }

  .compensation-card:hover .connector-icon {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.3);
    color: #6366f1;
    transform: scale(1.05);
  }

  .card-footer {
    background: linear-gradient(
      135deg,
      rgba(99, 102, 241, 0.04) 0%,
      rgba(139, 92, 246, 0.06) 100%
    );
    border-top: 1px solid rgba(99, 102, 241, 0.1);
    padding: 0.75rem 1rem;
    margin-top: auto;
  }

  .amount-chip {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.6);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(99, 102, 241, 0.15);
    border-radius: 0.625rem;
    transition: all 0.3s ease;
  }

  .compensation-card:hover .amount-chip {
    background: rgba(255, 255, 255, 0.8);
    border-color: rgba(99, 102, 241, 0.25);
    transform: translateY(-1px);
  }

  .amount-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .amount-value {
    font-size: 0.875rem;
    font-weight: 700;
    color: #4f46e5;
    font-feature-settings: 'tnum';
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
    background: rgba(249, 250, 251, 0.8);
    border: 1px solid rgba(209, 213, 219, 0.5);
    border-radius: 0.5rem;
    color: #374151;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-action-btn:hover {
    background: rgba(243, 244, 246, 0.9);
    border-color: rgba(156, 163, 175, 0.7);
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

  /* Responsive Design - Ajusté pour format compact */
  @media (max-width: 1200px) {
    .compensation-rules {
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: 0.75rem;
    }
  }

  @media (max-width: 768px) {
    .compensation-rules {
      grid-template-columns: 1fr;
      gap: 0.75rem;
    }

    .card-content {
      padding: 0.875rem;
      gap: 0.75rem;
    }

    .category-badge {
      padding: 0.5rem 0.75rem;
      gap: 0.5rem;
    }

    .badge-icon {
      width: 1.75rem;
      height: 1.75rem;
    }

    .badge-icon svg {
      width: 0.875rem;
      height: 0.875rem;
    }

    .badge-value {
      font-size: 0.75rem;
    }

    .delete-btn {
      width: 1.25rem;
      height: 1.25rem;
      opacity: 1;
      transform: scale(1);
    }

    .delete-btn svg {
      width: 0.75rem;
      height: 0.75rem;
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
    .card-content {
      padding: 0.75rem;
    }

    .category-badge {
      padding: 0.5rem 0.625rem;
      gap: 0.5rem;
    }

    .badge-icon {
      width: 1.5rem;
      height: 1.5rem;
    }

    .badge-value {
      font-size: 0.7rem;
    }

    .amount-chip {
      padding: 0.375rem 0.5rem;
    }

    .delete-btn {
      top: 0.5rem;
      right: 0.5rem;
      width: 1.125rem;
      height: 1.125rem;
    }

    .delete-btn svg {
      width: 0.625rem;
      height: 0.625rem;
    }
  }
</style>

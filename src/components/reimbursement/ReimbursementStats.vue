<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'
  import { computed } from 'vue'

  interface Props {
    analysisResult: CsvAnalysisResult
    filteredExpenses: any[] // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const props = defineProps<Props>()

  // Calcul des statistiques de remboursement
  const reimbursementStats = computed(() => {
    if (!props.analysisResult?.isValid) return null

    const expenses = props.filteredExpenses
    const potentialReimbursements = expenses.filter(t => {
      const searchText = `${t.description} ${t.category}`.toLowerCase()
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
      return reimbursableKeywords.some(keyword => searchText.includes(keyword))
    })

    const totalExpenses = expenses.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0
    )
    const totalReimbursable = potentialReimbursements.reduce(
      (sum, t) => sum + Math.abs(t.amount),
      0
    )

    return {
      totalExpenses,
      totalReimbursable,
      reimbursableCount: potentialReimbursements.length,
      expenseCount: expenses.length,
      reimbursablePercentage:
        totalExpenses > 0 ? (totalReimbursable / totalExpenses) * 100 : 0,
    }
  })

  // Formatage des montants
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  // Données mockées pour les personnes
  const availablePersonsCount = 3
</script>

<template>
  <div v-if="reimbursementStats" class="quick-stats">
    <div class="stat-card">
      <div class="stat-icon expenses">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      </div>
      <div class="stat-content">
        <h3>Total dépenses</h3>
        <p class="stat-value">
          {{ formatAmount(reimbursementStats.totalExpenses) }}
        </p>
        <span class="stat-description"
          >{{ reimbursementStats.expenseCount }} transactions</span
        >
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon reimbursable">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
      </div>
      <div class="stat-content">
        <h3>Potentiellement remboursable</h3>
        <p class="stat-value">
          {{ formatAmount(reimbursementStats.totalReimbursable) }}
        </p>
        <span class="stat-description"
          >{{ reimbursementStats.reimbursableCount }} transactions ({{
            Math.round(reimbursementStats.reimbursablePercentage)
          }}%)</span
        >
      </div>
    </div>

    <div class="stat-card">
      <div class="stat-icon persons">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      </div>
      <div class="stat-content">
        <h3>Personnes</h3>
        <p class="stat-value">{{ availablePersonsCount }}</p>
        <span class="stat-description">contacts configurés</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
  /* Statistiques rapides */
  .quick-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .stat-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    width: 1.5rem;
    height: 1.5rem;
    stroke-width: 2;
  }

  .stat-icon.expenses {
    background: linear-gradient(135deg, #fef3c7 0%, #fcd34d 100%);
    color: #92400e;
  }

  .stat-icon.reimbursable {
    background: linear-gradient(135deg, #d1fae5 0%, #34d399 100%);
    color: #065f46;
  }

  .stat-icon.persons {
    background: linear-gradient(135deg, #ddd6fe 0%, #8b5cf6 100%);
    color: #581c87;
  }

  .stat-content {
    flex: 1;
  }

  .stat-content h3 {
    font-size: 0.875rem;
    font-weight: 600;
    color: #6b7280;
    margin-bottom: 0.25rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    line-height: 1.2;
  }

  .stat-description {
    font-size: 0.75rem;
    color: #9ca3af;
    font-weight: 500;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .quick-stats {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .stat-card {
      padding: 1.25rem;
    }

    .stat-icon {
      width: 2.5rem;
      height: 2.5rem;
    }

    .stat-icon svg {
      width: 1.25rem;
      height: 1.25rem;
    }

    .stat-value {
      font-size: 1.25rem;
    }
  }
</style>

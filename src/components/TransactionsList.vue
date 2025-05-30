<template>
  <div class="transactions-list-container">
    <div class="transactions-header">
      <div class="header-title">
        <h3>
          <i class="fas fa-list-ul"></i>
          {{
            props.activeTab === 'expenses'
              ? '50 dernières dépenses'
              : '50 derniers revenus'
          }}
        </h3>
        <span class="transactions-count">
          {{ displayedTransactions.length }} transactions
        </span>
      </div>
      <div class="filter-section">
        <select v-model="selectedCategory" class="category-filter">
          <option value="">Toutes les catégories</option>
          <option
            v-for="category in availableCategories"
            :key="category"
            :value="category"
          >
            {{ category }}
          </option>
        </select>
      </div>
    </div>

    <div class="transactions-table-wrapper">
      <table class="transactions-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Catégorie</th>
            <th>Description</th>
            <th>Note</th>
            <th>Compte</th>
            <th class="amount-column">Montant</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="transaction in displayedTransactions"
            :key="`${transaction.date}-${transaction.description}-${transaction.amount}`"
            :class="transaction.type"
          >
            <td class="date-cell">{{ formatDate(transaction.date) }}</td>
            <td class="category-cell">
              <span class="category-badge" :class="transaction.type">
                {{ transaction.category }}
              </span>
            </td>
            <td class="description-cell" :title="transaction.description">
              {{ transaction.description }}
            </td>
            <td class="note-cell" :title="transaction.note || ''">
              {{ transaction.note }}
            </td>
            <td class="account-cell" :title="transaction.account">
              {{ transaction.account }}
            </td>
            <td class="amount-cell" :class="transaction.type">
              {{ formatAmount(transaction.amount) }}
            </td>
          </tr>
        </tbody>
      </table>

      <div v-if="displayedTransactions.length === 0" class="no-transactions">
        <i class="fas fa-inbox"></i>
        <p>Aucune transaction trouvée</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { Transaction } from '@/types'
  import { computed, ref } from 'vue'

  interface Props {
    transactions: Transaction[]
    activeTab?: 'expenses' | 'income'
  }

  const props = withDefaults(defineProps<Props>(), {
    activeTab: 'expenses',
  })

  // État pour le filtre de catégorie
  const selectedCategory = ref<string>('')

  // Calculer les catégories disponibles selon le type de transaction
  const availableCategories = computed(() => {
    const categories = new Set<string>()
    props.transactions.forEach(transaction => {
      // Filtrer par type selon l'onglet actif
      const matchesType =
        props.activeTab === 'expenses'
          ? transaction.type === 'expense'
          : transaction.type === 'income'

      if (matchesType && transaction.category) {
        categories.add(transaction.category)
      }
    })
    return Array.from(categories).sort()
  })

  // Trier les transactions par date (plus récente en premier) et prendre les 50 premières
  const displayedTransactions = computed(() => {
    let filteredTransactions = [...props.transactions]

    // Filtrer par type selon l'onglet actif
    filteredTransactions = filteredTransactions.filter(transaction => {
      if (props.activeTab === 'expenses') {
        return transaction.type === 'expense'
      } else {
        return transaction.type === 'income'
      }
    })

    // Filtrer par catégorie si une catégorie est sélectionnée
    if (selectedCategory.value) {
      filteredTransactions = filteredTransactions.filter(
        transaction => transaction.category === selectedCategory.value
      )
    }

    return filteredTransactions
      .sort((a, b) => {
        // Parser les dates au format DD/MM/YYYY
        const parseDate = (dateStr: string): Date => {
          const parts = dateStr.split('/')
          if (parts.length !== 3) return new Date(0)
          const [day, month, year] = parts
          if (!day || !month || !year) return new Date(0)
          return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
        }

        const dateA = parseDate(a.date)
        const dateB = parseDate(b.date)

        // Trier par ordre décroissant (plus récent en premier)
        return dateB.getTime() - dateA.getTime()
      })
      .slice(0, 50)
  })

  // Formater la date pour l'affichage
  const formatDate = (dateStr: string): string => {
    try {
      const parts = dateStr.split('/')
      if (parts.length !== 3) return dateStr
      const [day, month, year] = parts
      if (!day || !month || !year) return dateStr
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))

      return date.toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch (_error) {
      return dateStr // Retourner la date originale en cas d'erreur
    }
  }

  // Formater le montant avec le signe et la devise
  const formatAmount = (amount: number): string => {
    const formattedAmount = Math.abs(amount).toLocaleString('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    })

    return amount < 0 ? `-${formattedAmount}` : `+${formattedAmount}`
  }
</script>

<style scoped>
  .transactions-list-container {
    background: white;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  .transactions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    min-width: 0;
  }

  .transactions-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .transactions-count {
    font-size: 0.875rem;
    opacity: 0.9;
    white-space: nowrap;
  }

  .filter-section {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .category-filter {
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    color: white;
    font-size: 0.875rem;
    min-width: 200px;
    backdrop-filter: blur(10px);
    transition: all 0.2s ease;
  }

  .category-filter:focus {
    outline: none;
    background: rgba(255, 255, 255, 0.2);
    border-color: rgba(255, 255, 255, 0.4);
    box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.1);
  }

  .category-filter option {
    background: #374151;
    color: white;
    padding: 0.5rem;
  }

  .transactions-table-wrapper {
    max-height: 600px;
    overflow-y: auto;
  }

  .transactions-table {
    width: 100%;
    border-collapse: collapse;
  }

  .transactions-table thead th {
    background-color: #f8fafc;
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid #e5e7eb;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  /* Largeurs de colonnes pour éviter le défilement horizontal */
  .transactions-table thead th:nth-child(1) {
    width: 120px;
  } /* Date */
  .transactions-table thead th:nth-child(2) {
    width: 140px;
  } /* Catégorie */
  .transactions-table thead th:nth-child(3) {
    width: 200px;
  } /* Description */
  .transactions-table thead th:nth-child(4) {
    width: 150px;
  } /* Note */
  .transactions-table thead th:nth-child(5) {
    width: 120px;
  } /* Compte */
  .transactions-table thead th:nth-child(6) {
    width: 120px;
    text-align: right;
  } /* Montant */

  .transactions-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
    transition: background-color 0.2s ease;
  }

  .transactions-table tbody tr:hover {
    background-color: #f8fafc;
  }

  .transactions-table tbody tr.expense {
    border-left: 3px solid #ef4444;
  }

  .transactions-table tbody tr.income {
    border-left: 3px solid #10b981;
  }

  .transactions-table td {
    padding: 1rem;
    vertical-align: top;
  }

  .date-cell {
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 0.875rem;
    color: #6b7280;
    white-space: nowrap;
  }

  .category-cell {
    white-space: nowrap;
  }

  .category-badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .category-badge.expense {
    background-color: #fef2f2;
    color: #dc2626;
  }

  .category-badge.income {
    background-color: #f0fdf4;
    color: #059669;
  }

  .description-cell {
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #374151;
  }

  .note-cell {
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #6b7280;
    font-size: 0.875rem;
    font-style: italic;
  }

  .account-cell {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #6b7280;
    font-size: 0.875rem;
  }

  .amount-column {
    text-align: right;
  }

  .amount-cell {
    text-align: right;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-weight: 600;
    white-space: nowrap;
  }

  .amount-cell.expense {
    color: #dc2626;
  }

  .amount-cell.income {
    color: #059669;
  }

  .no-transactions {
    text-align: center;
    padding: 3rem;
    color: #9ca3af;
  }

  .no-transactions i {
    font-size: 3rem;
    margin-bottom: 1rem;
    display: block;
  }

  .no-transactions p {
    margin: 0;
    font-size: 1.125rem;
  }

  /* Responsive design */
  @media (max-width: 768px) {
    .transactions-header {
      padding: 1rem;
      flex-direction: column;
      gap: 1rem;
      align-items: stretch;
    }

    .header-title {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }

    .filter-section {
      width: 100%;
    }

    .category-filter {
      width: 100%;
      min-width: unset;
    }

    .transactions-table-wrapper {
      overflow-x: auto;
    }

    .transactions-table {
      min-width: 600px;
    }

    .transactions-table td {
      padding: 0.75rem 0.5rem;
    }

    .description-cell {
      max-width: 200px;
    }
  }
</style>

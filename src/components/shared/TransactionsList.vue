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
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
    overflow: hidden;
    width: 100%;
    max-width: 100%;
  }

  .transactions-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(5px);
    color: #1f2937;
    flex-wrap: wrap;
    gap: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.3);
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
    color: #1f2937;
  }

  .transactions-header h3 i {
    color: #3b82f6;
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
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 0.5rem;
    padding: 0.5rem 1rem;
    color: #374151;
    font-size: 0.875rem;
    min-width: 200px;
    transition: all 0.2s ease;
  }

  .category-filter:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .category-filter option {
    background: rgba(255, 255, 255, 0.95);
    color: #374151;
    padding: 0.5rem;
  }

  .transactions-table-wrapper {
    max-height: 600px;
    overflow-y: auto;
  }

  .transactions-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  .transactions-table thead th {
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(8px);
    padding: 1rem;
    text-align: left;
    font-weight: 600;
    color: #374151;
    border-bottom: 2px solid rgba(255, 255, 255, 0.3);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .transactions-table thead th:nth-child(1) {
    width: 10%;
  } /* Date */
  .transactions-table thead th:nth-child(2) {
    width: 15%;
  } /* Catégorie */
  .transactions-table thead th:nth-child(3) {
    width: 25%;
  } /* Description */
  .transactions-table thead th:nth-child(4) {
    width: 25%;
  } /* Note */
  .transactions-table thead th:nth-child(5) {
    width: 15%;
  } /* Compte */
  .transactions-table thead th:nth-child(6) {
    width: 10%;
  } /* Montant */

  .transactions-table tbody tr {
    border-bottom: 1px solid #f1f5f9;
    transition: background-color 0.2s ease;
  }

  .transactions-table tbody tr:hover {
    background: rgba(255, 255, 255, 0.4);
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
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #374151;
  }

  .note-cell {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: #6b7280;
    font-size: 0.875rem;
    font-style: italic;
  }

  .account-cell {
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

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .transactions-list-container {
      background: rgba(31, 41, 55, 0.8);
      border: 1px solid rgba(75, 85, 99, 0.3);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }

    .transactions-header {
      background: rgba(55, 65, 81, 0.6);
      color: #f9fafb;
      border-bottom: 1px solid rgba(75, 85, 99, 0.3);
    }

    .transactions-header h3 {
      color: #f9fafb;
    }

    .transactions-header h3 i {
      color: #60a5fa;
    }

    .transactions-count {
      color: #d1d5db;
    }

    .category-filter {
      background: rgba(31, 41, 55, 0.9);
      border: 1px solid rgba(75, 85, 99, 0.5);
      color: #f3f4f6;
    }

    .category-filter:focus {
      border-color: #60a5fa;
      box-shadow: 0 0 0 2px rgba(96, 165, 250, 0.2);
    }

    .category-filter option {
      background: #1f2937;
      color: #f3f4f6;
    }

    .transactions-table thead th {
      background: rgba(55, 65, 81, 0.8);
      color: #f3f4f6;
      border-bottom: 2px solid rgba(75, 85, 99, 0.4);
    }

    .transactions-table tbody tr {
      border-bottom: 1px solid #374151;
    }

    .transactions-table tbody tr:hover {
      background: rgba(55, 65, 81, 0.4);
    }

    .date-cell {
      color: #9ca3af;
    }

    .category-badge.expense {
      background-color: rgba(185, 28, 28, 0.2);
      color: #fca5a5;
    }

    .category-badge.income {
      background-color: rgba(5, 150, 105, 0.2);
      color: #6ee7b7;
    }

    .description-cell {
      color: #e5e7eb;
    }

    .note-cell {
      color: #9ca3af;
    }

    .account-cell {
      color: #9ca3af;
    }

    .amount-cell.expense {
      color: #fca5a5;
    }

    .amount-cell.income {
      color: #6ee7b7;
    }

    .no-transactions {
      color: #6b7280;
    }

    .no-transactions i {
      color: #4b5563;
    }

    .no-transactions p {
      color: #9ca3af;
    }
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
      min-width: 100%;
    }

    .transactions-table td {
      padding: 0.75rem 0.5rem;
    }

    .transactions-table thead th:nth-child(1) {
      width: 12%;
    } /* Date */
    .transactions-table thead th:nth-child(2) {
      width: 18%;
    } /* Catégorie */
    .transactions-table thead th:nth-child(3) {
      width: 20%;
    } /* Description */
    .transactions-table thead th:nth-child(4) {
      width: 25%;
    } /* Note */
    .transactions-table thead th:nth-child(5) {
      width: 15%;
    } /* Compte */
    .transactions-table thead th:nth-child(6) {
      width: 10%;
    } /* Montant */
  }
</style>

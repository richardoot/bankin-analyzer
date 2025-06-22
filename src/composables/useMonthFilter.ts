import type { Transaction } from '@/types'

export interface MonthOption {
  value: string
  label: string
}

/**
 * Composable pour gérer le filtrage par mois des transactions
 */
export function useMonthFilter() {
  const generateAvailableMonths = (
    transactions: Transaction[]
  ): MonthOption[] => {
    console.log(
      '🔧 generateAvailableMonths appelé avec',
      transactions.length,
      'transactions'
    )

    if (!transactions || transactions.length === 0) {
      console.log('🔧 Aucune transaction, retour vide')
      return []
    }

    // Extraire tous les mois uniques des transactions
    const monthsSet = new Set<string>()

    transactions.forEach((transaction, index) => {
      if (transaction.date) {
        // Créer une date à partir de la transaction
        const date = new Date(transaction.date)
        if (!isNaN(date.getTime())) {
          // Format YYYY-MM pour la valeur
          const monthValue = date.toISOString().substring(0, 7)
          monthsSet.add(monthValue)

          if (index < 3) {
            // Log des 3 premières transactions
            console.log(
              `🔧 Transaction ${index}: ${transaction.date} → ${monthValue}`
            )
          }
        }
      }
    })

    console.log('🔧 Mois uniques trouvés:', Array.from(monthsSet))

    // Convertir en array et trier par date (plus récent en premier)
    const sortedMonths = Array.from(monthsSet).sort((a, b) =>
      b.localeCompare(a)
    )

    // Convertir en format d'options avec labels français
    const result = sortedMonths.map(monthValue => {
      const parts = monthValue.split('-')
      if (parts.length !== 2) return { value: monthValue, label: monthValue }

      const year = parts[0]
      const month = parts[1]

      if (!year || !month) return { value: monthValue, label: monthValue }

      const date = new Date(parseInt(year), parseInt(month) - 1, 1)

      const label = date.toLocaleDateString('fr-FR', {
        year: 'numeric',
        month: 'long',
      })

      return {
        value: monthValue,
        label: label.charAt(0).toUpperCase() + label.slice(1), // Première lettre en majuscule
      }
    })

    console.log('🔧 Résultat final:', result)
    return result
  }

  /**
   * Filtre les transactions pour un mois donné
   */
  const filterTransactionsByMonth = (
    transactions: Transaction[],
    selectedMonth: string
  ): Transaction[] => {
    console.log(
      '🔧 filterTransactionsByMonth appelé avec',
      selectedMonth,
      'et',
      transactions.length,
      'transactions'
    )

    if (!selectedMonth || selectedMonth === 'all') {
      console.log('🔧 Pas de filtrage (mois vide ou "all")')
      return transactions
    }

    const filtered = transactions.filter(transaction => {
      if (!transaction.date) return false

      const date = new Date(transaction.date)
      if (isNaN(date.getTime())) return false

      const transactionMonth = date.toISOString().substring(0, 7)
      return transactionMonth === selectedMonth
    })

    console.log('🔧 Résultat du filtrage:', filtered.length, 'transactions')
    return filtered
  }

  /**
   * Obtient le mois courant au format YYYY-MM
   */
  const getCurrentMonth = (): string => {
    const now = new Date()
    return now.toISOString().substring(0, 7)
  }

  /**
   * Obtient le label français d'un mois
   */
  const getMonthLabel = (monthValue: string): string => {
    if (!monthValue || monthValue === 'all') {
      return 'Tous les mois'
    }

    const parts = monthValue.split('-')
    if (parts.length !== 2) return monthValue

    const year = parts[0]
    const month = parts[1]

    if (!year || !month) return monthValue

    const date = new Date(parseInt(year), parseInt(month) - 1, 1)

    const label = date.toLocaleDateString('fr-FR', {
      year: 'numeric',
      month: 'long',
    })

    return label.charAt(0).toUpperCase() + label.slice(1)
  }

  return {
    generateAvailableMonths,
    filterTransactionsByMonth,
    getCurrentMonth,
    getMonthLabel,
  }
}

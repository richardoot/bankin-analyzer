import type { Transaction } from '@/types'

export interface MonthOption {
  value: string
  label: string
}

/**
 * Composable pour gérer le filtrage par mois des transactions
 */
export function useMonthFilter() {
  /**
   * Parse une date selon différents formats possibles
   */
  const parseDate = (dateString: string): Date => {
    let date: Date

    // Vérifier si c'est au format français DD/MM/YYYY
    if (dateString.includes('/')) {
      const parts = dateString.split('/')
      if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
        const day = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10) - 1 // Les mois en JS commencent à 0
        const year = parseInt(parts[2], 10)

        // Vérifier que les valeurs sont valides
        if (
          !isNaN(day) &&
          !isNaN(month) &&
          !isNaN(year) &&
          day >= 1 &&
          day <= 31 &&
          month >= 0 &&
          month <= 11 &&
          year > 1900
        ) {
          date = new Date(year, month, day)
        } else {
          date = new Date(dateString)
        }
      } else {
        date = new Date(dateString)
      }
    } else {
      // Pour les autres formats (ISO, etc.)
      date = new Date(dateString)
    }

    return date
  }

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
        const date = parseDate(transaction.date)

        if (!isNaN(date.getTime())) {
          // Format YYYY-MM pour la valeur
          const monthValue = date.toISOString().substring(0, 7)
          monthsSet.add(monthValue)

          if (index < 5) {
            // Log des 5 premières transactions pour debug
            console.log(
              `🔧 Transaction ${index}: date="${transaction.date}" → Date object: ${date.toISOString()} → monthValue="${monthValue}"`
            )
          }
        } else {
          console.log(
            `🔧 Date invalide pour transaction ${index}: "${transaction.date}"`
          )
        }
      } else {
        if (index < 5) {
          console.log(`🔧 Pas de date pour transaction ${index}`)
        }
      }
    })

    const monthsArray = Array.from(monthsSet).sort()
    console.log('🔧 Mois uniques trouvés (triés):', monthsArray)

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
    if (!selectedMonth || selectedMonth === 'all') {
      return transactions
    }

    const filtered = transactions.filter(transaction => {
      if (!transaction.date) return false

      // Parser la date selon différents formats possibles (même logique que generateAvailableMonths)
      let date: Date

      if (transaction.date.includes('/')) {
        const parts = transaction.date.split('/')
        if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
          const day = parseInt(parts[0], 10)
          const month = parseInt(parts[1], 10) - 1
          const year = parseInt(parts[2], 10)

          if (
            !isNaN(day) &&
            !isNaN(month) &&
            !isNaN(year) &&
            day >= 1 &&
            day <= 31 &&
            month >= 0 &&
            month <= 11 &&
            year > 1900
          ) {
            date = new Date(year, month, day)
          } else {
            date = new Date(transaction.date)
          }
        } else {
          date = new Date(transaction.date)
        }
      } else {
        date = new Date(transaction.date)
      }

      if (isNaN(date.getTime())) return false

      const transactionMonth = date.toISOString().substring(0, 7)
      return transactionMonth === selectedMonth
    })

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
    parseDate,
  }
}

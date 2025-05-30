import type {
  Person,
  PersonDebt,
  ReimbursementSummary,
  ReimbursementTransaction,
  Transaction,
} from '@/types'
import { computed, ref } from 'vue'

/**
 * Composable pour gérer le module de remboursement
 * Permet de créer des personnes, associer des transactions et suivre les montants dus
 */
export function useReimbursement() {
  // États réactifs
  const people = ref<Person[]>([])
  const reimbursementTransactions = ref<ReimbursementTransaction[]>([])

  // Sauvegarde dans localStorage
  const STORAGE_KEYS = {
    PEOPLE: 'bankin-analyzer-people',
    REIMBURSEMENT_TRANSACTIONS: 'bankin-analyzer-reimbursement-transactions',
  }

  /**
   * Charge les données depuis localStorage
   */
  const loadFromStorage = () => {
    try {
      const savedPeople = localStorage.getItem(STORAGE_KEYS.PEOPLE)
      const savedTransactions = localStorage.getItem(
        STORAGE_KEYS.REIMBURSEMENT_TRANSACTIONS
      )

      if (savedPeople) {
        people.value = JSON.parse(savedPeople)
      }

      if (savedTransactions) {
        reimbursementTransactions.value = JSON.parse(savedTransactions)
      }
    } catch (error) {
      console.warn(
        'Erreur lors du chargement des données de remboursement:',
        error
      )
    }
  }

  /**
   * Sauvegarde les données dans localStorage
   */
  const saveToStorage = () => {
    try {
      localStorage.setItem(STORAGE_KEYS.PEOPLE, JSON.stringify(people.value))
      localStorage.setItem(
        STORAGE_KEYS.REIMBURSEMENT_TRANSACTIONS,
        JSON.stringify(reimbursementTransactions.value)
      )
    } catch (error) {
      console.warn(
        'Erreur lors de la sauvegarde des données de remboursement:',
        error
      )
    }
  }

  /**
   * Génère un ID unique
   */
  const generateId = (): string => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  /**
   * Ajoute une nouvelle personne
   */
  const addPerson = (name: string, email?: string): Person => {
    const now = new Date().toISOString()
    const person: Person = {
      id: generateId(),
      name: name.trim(),
      createdAt: now,
      updatedAt: now,
    }

    if (email?.trim()) {
      person.email = email.trim()
    }

    people.value.push(person)
    saveToStorage()
    return person
  }

  /**
   * Met à jour une personne existante
   */
  const updatePerson = (
    id: string,
    updates: Partial<Pick<Person, 'name' | 'email' | 'avatar'>>
  ): boolean => {
    const personIndex = people.value.findIndex(p => p.id === id)
    if (personIndex === -1) return false

    const currentPerson = people.value[personIndex]
    if (!currentPerson) return false

    // Mise à jour des propriétés
    if (updates.name !== undefined) {
      currentPerson.name = updates.name
    }
    if (updates.email !== undefined) {
      currentPerson.email = updates.email
    }
    if (updates.avatar !== undefined) {
      currentPerson.avatar = updates.avatar
    }

    currentPerson.updatedAt = new Date().toISOString()

    saveToStorage()
    return true
  }

  /**
   * Supprime une personne et toutes ses transactions associées
   */
  const deletePerson = (id: string): boolean => {
    const initialPeopleCount = people.value.length
    const initialTransactionsCount = reimbursementTransactions.value.length

    // Supprimer la personne
    people.value = people.value.filter(p => p.id !== id)

    // Supprimer toutes les transactions associées
    reimbursementTransactions.value = reimbursementTransactions.value.filter(
      t => t.personId !== id
    )

    const personDeleted = people.value.length < initialPeopleCount
    const transactionsDeleted =
      reimbursementTransactions.value.length < initialTransactionsCount

    if (personDeleted || transactionsDeleted) {
      saveToStorage()
    }

    return personDeleted
  }

  /**
   * Associe une transaction à une personne pour remboursement
   */
  const associateTransaction = (
    transaction: Transaction,
    personId: string,
    customAmount?: number,
    note?: string
  ): ReimbursementTransaction => {
    const person = people.value.find(p => p.id === personId)
    if (!person) {
      throw new Error('Personne introuvable')
    }

    // Vérifier si la transaction n'est pas déjà associée
    const existingAssociation = reimbursementTransactions.value.find(
      rt =>
        rt.transactionId ===
        transaction.date + transaction.description + transaction.amount
    )

    if (existingAssociation) {
      throw new Error('Cette transaction est déjà associée à une personne')
    }

    const reimbursementTransaction: ReimbursementTransaction = {
      id: generateId(),
      transactionId:
        transaction.date + transaction.description + transaction.amount, // ID composite
      personId,
      amount: customAmount || Math.abs(transaction.amount),
      description: transaction.description,
      date: transaction.date,
      category: transaction.category,
      isReimbursed: false,
      createdAt: new Date().toISOString(),
    }

    if (note) {
      reimbursementTransaction.note = note
    }

    reimbursementTransactions.value.push(reimbursementTransaction)
    saveToStorage()
    return reimbursementTransaction
  }

  /**
   * Marque une transaction comme remboursée
   */
  const markAsReimbursed = (
    transactionId: string,
    isReimbursed: boolean = true
  ): boolean => {
    const transaction = reimbursementTransactions.value.find(
      t => t.id === transactionId
    )
    if (!transaction) return false

    transaction.isReimbursed = isReimbursed
    if (isReimbursed) {
      transaction.reimbursedAt = new Date().toISOString()
    } else {
      delete transaction.reimbursedAt
    }

    saveToStorage()
    return true
  }

  /**
   * Supprime une association de transaction
   */
  const removeAssociation = (transactionId: string): boolean => {
    const initialLength = reimbursementTransactions.value.length
    reimbursementTransactions.value = reimbursementTransactions.value.filter(
      t => t.id !== transactionId
    )

    const removed = reimbursementTransactions.value.length < initialLength
    if (removed) {
      saveToStorage()
    }

    return removed
  }

  /**
   * Calcule les dettes par personne
   */
  const personDebts = computed((): PersonDebt[] => {
    const debtMap = new Map<string, PersonDebt>()

    reimbursementTransactions.value.forEach(transaction => {
      const person = people.value.find(p => p.id === transaction.personId)
      if (!person) return

      let debt = debtMap.get(transaction.personId)
      if (!debt) {
        debt = {
          personId: transaction.personId,
          personName: person.name,
          totalAmount: 0,
          transactionCount: 0,
          lastTransactionDate: transaction.date,
          transactions: [],
        }
        debtMap.set(transaction.personId, debt)
      }

      // Ajouter seulement si pas encore remboursé
      if (!transaction.isReimbursed) {
        debt.totalAmount += transaction.amount
      }

      debt.transactionCount++
      debt.transactions.push(transaction)

      // Mettre à jour la date de dernière transaction
      if (new Date(transaction.date) > new Date(debt.lastTransactionDate)) {
        debt.lastTransactionDate = transaction.date
      }
    })

    return Array.from(debtMap.values())
      .filter(debt => debt.totalAmount > 0) // Masquer les dettes à 0
      .sort((a, b) => b.totalAmount - a.totalAmount) // Trier par montant décroissant
  })

  /**
   * Calcule le résumé général des remboursements
   */
  const reimbursementSummary = computed((): ReimbursementSummary => {
    const totalTransactions = reimbursementTransactions.value
    const reimbursedTransactions = totalTransactions.filter(t => t.isReimbursed)
    const pendingTransactions = totalTransactions.filter(t => !t.isReimbursed)

    return {
      totalDebt: totalTransactions.reduce((sum, t) => sum + t.amount, 0),
      totalReimbursed: reimbursedTransactions.reduce(
        (sum, t) => sum + t.amount,
        0
      ),
      pendingAmount: pendingTransactions.reduce((sum, t) => sum + t.amount, 0),
      peopleCount: people.value.length,
      transactionCount: totalTransactions.length,
      debts: personDebts.value,
    }
  })

  /**
   * Obtient les personnes triées par nom
   */
  const sortedPeople = computed(() => {
    return [...people.value].sort((a, b) => a.name.localeCompare(b.name))
  })

  /**
   * Vérifie si une transaction est déjà associée
   */
  const isTransactionAssociated = (transaction: Transaction): boolean => {
    const transactionId =
      transaction.date + transaction.description + transaction.amount
    return reimbursementTransactions.value.some(
      rt => rt.transactionId === transactionId
    )
  }

  /**
   * Obtient l'association d'une transaction si elle existe
   */
  const getTransactionAssociation = (
    transaction: Transaction
  ): ReimbursementTransaction | undefined => {
    const transactionId =
      transaction.date + transaction.description + transaction.amount
    return reimbursementTransactions.value.find(
      rt => rt.transactionId === transactionId
    )
  }

  /**
   * Formate un montant en euros
   */
  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  // Charger les données au démarrage
  loadFromStorage()

  return {
    // État
    people: sortedPeople,
    reimbursementTransactions,
    personDebts,
    reimbursementSummary,

    // Actions
    addPerson,
    updatePerson,
    deletePerson,
    associateTransaction,
    markAsReimbursed,
    removeAssociation,
    isTransactionAssociated,
    getTransactionAssociation,

    // Utilitaires
    formatAmount,
    loadFromStorage,
    saveToStorage,
  }
}

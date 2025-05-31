import type {
  Person,
  PersonDebt,
  ReimbursementSummary,
  ReimbursementTransaction,
  SharedTransactionAssociation,
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
  const sharedAssociations = ref<SharedTransactionAssociation[]>([])

  // Sauvegarde dans localStorage
  const STORAGE_KEYS = {
    PEOPLE: 'bankin-analyzer-people',
    REIMBURSEMENT_TRANSACTIONS: 'bankin-analyzer-reimbursement-transactions',
    SHARED_ASSOCIATIONS: 'bankin-analyzer-shared-associations',
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
      const savedSharedAssociations = localStorage.getItem(
        STORAGE_KEYS.SHARED_ASSOCIATIONS
      )

      if (savedPeople) {
        people.value = JSON.parse(savedPeople)
      }

      if (savedTransactions) {
        reimbursementTransactions.value = JSON.parse(savedTransactions)
      }

      if (savedSharedAssociations) {
        sharedAssociations.value = JSON.parse(savedSharedAssociations)
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
      localStorage.setItem(
        STORAGE_KEYS.SHARED_ASSOCIATIONS,
        JSON.stringify(sharedAssociations.value)
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

    // Supprimer toutes les transactions associées (associations simples)
    reimbursementTransactions.value = reimbursementTransactions.value.filter(
      t => t.personId !== id
    )

    // Nettoyer les associations partagées
    sharedAssociations.value.forEach(association => {
      association.people = association.people.filter(
        person => person.personId !== id
      )
    })

    // Supprimer les associations partagées vides
    sharedAssociations.value = sharedAssociations.value.filter(
      association => association.people.length > 0
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
   * Associe une transaction à plusieurs personnes pour partage
   */
  const associateSharedTransaction = (
    transaction: Transaction,
    peopleAssociations: Array<{
      personId: string
      amount: number
      note?: string
    }>
  ): SharedTransactionAssociation => {
    // Validation
    if (peopleAssociations.length === 0) {
      throw new Error('Au moins une personne doit être associée')
    }

    const totalAmount = Math.abs(transaction.amount)
    const associatedAmount = peopleAssociations.reduce(
      (sum, p) => sum + p.amount,
      0
    )

    if (associatedAmount > totalAmount) {
      throw new Error(
        `Le total des montants (${associatedAmount}€) dépasse le montant de la transaction (${totalAmount}€)`
      )
    }

    // Vérifier que toutes les personnes existent
    const invalidPeople = peopleAssociations.filter(
      p => !people.value.find(person => person.id === p.personId)
    )
    if (invalidPeople.length > 0) {
      throw new Error('Certaines personnes sont introuvables')
    }

    // Vérifier si la transaction n'est pas déjà associée
    const transactionId =
      transaction.date + transaction.description + transaction.amount
    const existingAssociation = sharedAssociations.value.find(
      sa => sa.transactionId === transactionId
    )
    const existingSimpleAssociation = reimbursementTransactions.value.find(
      rt => rt.transactionId === transactionId
    )

    if (existingAssociation || existingSimpleAssociation) {
      throw new Error('Cette transaction est déjà associée')
    }

    const now = new Date().toISOString()
    const sharedAssociation: SharedTransactionAssociation = {
      id: generateId(),
      transactionId,
      people: peopleAssociations.map(p => ({
        personId: p.personId,
        amount: p.amount,
        isReimbursed: false,
        ...(p.note ? { note: p.note } : {}),
      })),
      description: transaction.description,
      date: transaction.date,
      category: transaction.category,
      totalAmount,
      createdAt: now,
      updatedAt: now,
    }

    sharedAssociations.value.push(sharedAssociation)
    saveToStorage()
    return sharedAssociation
  }

  /**
   * Met à jour une association partagée
   */
  const updateSharedAssociation = (
    associationId: string,
    updates: {
      peopleAssociations?: Array<{
        personId: string
        amount: number
        note?: string
      }>
    }
  ): boolean => {
    const association = sharedAssociations.value.find(
      sa => sa.id === associationId
    )
    if (!association) return false

    if (updates.peopleAssociations) {
      const totalAmount = Math.abs(association.totalAmount)
      const associatedAmount = updates.peopleAssociations.reduce(
        (sum, p) => sum + p.amount,
        0
      )

      if (associatedAmount > totalAmount) {
        throw new Error(
          `Le total des montants (${associatedAmount}€) dépasse le montant de la transaction (${totalAmount}€)`
        )
      }

      association.people = updates.peopleAssociations.map(p => {
        const existing = association.people.find(
          existing => existing.personId === p.personId
        )
        return {
          personId: p.personId,
          amount: p.amount,
          isReimbursed: existing?.isReimbursed || false,
          ...(existing?.reimbursedAt
            ? { reimbursedAt: existing.reimbursedAt }
            : {}),
          ...(p.note ? { note: p.note } : {}),
        }
      })
    }

    association.updatedAt = new Date().toISOString()
    saveToStorage()
    return true
  }

  /**
   * Marque le remboursement d'une personne dans une association partagée
   */
  const markSharedAssociationAsReimbursed = (
    associationId: string,
    personId: string,
    isReimbursed: boolean = true
  ): boolean => {
    const association = sharedAssociations.value.find(
      sa => sa.id === associationId
    )
    if (!association) return false

    const personAssociation = association.people.find(
      p => p.personId === personId
    )
    if (!personAssociation) return false

    personAssociation.isReimbursed = isReimbursed
    if (isReimbursed) {
      personAssociation.reimbursedAt = new Date().toISOString()
    } else {
      delete personAssociation.reimbursedAt
    }

    association.updatedAt = new Date().toISOString()
    saveToStorage()
    return true
  }

  /**
   * Supprime une association partagée
   */
  const removeSharedAssociation = (associationId: string): boolean => {
    const initialLength = sharedAssociations.value.length
    sharedAssociations.value = sharedAssociations.value.filter(
      sa => sa.id !== associationId
    )

    const removed = sharedAssociations.value.length < initialLength
    if (removed) {
      saveToStorage()
    }

    return removed
  }

  /**
   * Divise une transaction équitablement entre plusieurs personnes
   */
  const createEqualSplit = (
    transaction: Transaction,
    peopleIds: string[]
  ): Array<{ personId: string; amount: number }> => {
    if (peopleIds.length === 0) {
      throw new Error('Au moins une personne doit être sélectionnée')
    }

    const totalAmount = Math.abs(transaction.amount)
    const amountPerPerson =
      Math.round((totalAmount / peopleIds.length) * 100) / 100

    return peopleIds.map(personId => ({
      personId,
      amount: amountPerPerson,
    }))
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
   * Calcule les dettes par personne (incluant les associations partagées)
   */
  const personDebts = computed((): PersonDebt[] => {
    const debtMap = new Map<string, PersonDebt>()

    // Traiter les associations simples
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

    // Traiter les associations partagées
    sharedAssociations.value.forEach(sharedAssociation => {
      sharedAssociation.people.forEach(personAssociation => {
        const person = people.value.find(
          p => p.id === personAssociation.personId
        )
        if (!person) return

        let debt = debtMap.get(personAssociation.personId)
        if (!debt) {
          debt = {
            personId: personAssociation.personId,
            personName: person.name,
            totalAmount: 0,
            transactionCount: 0,
            lastTransactionDate: sharedAssociation.date,
            transactions: [],
          }
          debtMap.set(personAssociation.personId, debt)
        }

        // Créer une transaction virtuelle pour l'association partagée
        const virtualTransaction: ReimbursementTransaction = {
          id: `${sharedAssociation.id}-${personAssociation.personId}`,
          transactionId: sharedAssociation.transactionId,
          personId: personAssociation.personId,
          amount: personAssociation.amount,
          description: `${sharedAssociation.description} (partagé)`,
          date: sharedAssociation.date,
          category: sharedAssociation.category,
          isReimbursed: personAssociation.isReimbursed,
          createdAt: sharedAssociation.createdAt,
          ...(personAssociation.reimbursedAt
            ? { reimbursedAt: personAssociation.reimbursedAt }
            : {}),
          ...(personAssociation.note ? { note: personAssociation.note } : {}),
        }

        // Ajouter seulement si pas encore remboursé
        if (!personAssociation.isReimbursed) {
          debt.totalAmount += personAssociation.amount
        }

        debt.transactionCount++
        debt.transactions.push(virtualTransaction)

        // Mettre à jour la date de dernière transaction
        if (
          new Date(sharedAssociation.date) > new Date(debt.lastTransactionDate)
        ) {
          debt.lastTransactionDate = sharedAssociation.date
        }
      })
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
   * Vérifie si une transaction est déjà associée (simple ou partagée)
   */
  const isTransactionAssociated = (transaction: Transaction): boolean => {
    const transactionId =
      transaction.date + transaction.description + transaction.amount

    // Vérifier les associations simples
    const hasSimpleAssociation = reimbursementTransactions.value.some(
      rt => rt.transactionId === transactionId
    )

    // Vérifier les associations partagées
    const hasSharedAssociation = sharedAssociations.value.some(
      sa => sa.transactionId === transactionId
    )

    return hasSimpleAssociation || hasSharedAssociation
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
   * Obtient l'association partagée d'une transaction si elle existe
   */
  const getSharedTransactionAssociation = (
    transaction: Transaction
  ): SharedTransactionAssociation | undefined => {
    const transactionId =
      transaction.date + transaction.description + transaction.amount
    return sharedAssociations.value.find(
      sa => sa.transactionId === transactionId
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
    sharedAssociations,
    personDebts,
    reimbursementSummary,

    // Actions
    addPerson,
    updatePerson,
    deletePerson,
    associateTransaction,
    associateSharedTransaction,
    updateSharedAssociation,
    markAsReimbursed,
    markSharedAssociationAsReimbursed,
    removeAssociation,
    removeSharedAssociation,
    isTransactionAssociated,
    getTransactionAssociation,
    getSharedTransactionAssociation,
    createEqualSplit,

    // Utilitaires
    formatAmount,
    loadFromStorage,
    saveToStorage,
  }
}

<script setup lang="ts">
  import type {
    CsvAnalysisResult,
    Transaction,
    PersonAssignment,
    ReimbursementCategory,
  } from '@/types'
  import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  interface ExpenseAssignment {
    transactionId: string
    assignedPersons: PersonAssignment[]
  }

  const props = defineProps<Props>()

  // États locaux
  const selectedCategory = ref<string>('')
  const expenseAssignments = ref<ExpenseAssignment[]>([])
  const currentPage = ref<number>(1)
  const itemsPerPage = ref<number>(10)

  // États pour la modal d'assignation
  const showAssignModal = ref(false)
  const currentExpense = ref<{
    transaction: Transaction
    index: number
  } | null>(null)
  const modalPersonId = ref<string>('')
  const modalAmount = ref<number>(0)
  const modalCategoryId = ref<string>('')
  const customDivider = ref<number>(2)

  // Calculer le montant maximal disponible pour l'assignation
  const maxAvailableAmount = computed(() => {
    if (!currentExpense.value) return 0

    const transactionId = getTransactionId(
      currentExpense.value.transaction,
      currentExpense.value.index
    )
    const expenseAmount = Math.abs(currentExpense.value.transaction.amount)
    const assignment = getAssignment(transactionId)

    // Calculer le total actuel des assignations (en excluant celle qu'on modifie)
    let currentTotal = 0
    if (assignment?.assignedPersons) {
      currentTotal = assignment.assignedPersons
        .filter(ap => ap.personId !== modalPersonId.value) // Exclure la personne actuelle
        .reduce((sum, ap) => sum + ap.amount, 0)
    }

    return Math.max(0, expenseAmount - currentTotal)
  })

  // Validation du montant dans la modal
  const isModalAmountValid = computed(() => {
    return (
      modalAmount.value > 0 && modalAmount.value <= maxAvailableAmount.value
    )
  })

  // Personnes disponibles (chargées depuis localStorage)
  const availablePersons = ref<
    Array<{ id: string; name: string; email?: string }>
  >([])

  // Catégories de remboursement disponibles (chargées depuis localStorage)
  const reimbursementCategories = ref<ReimbursementCategory[]>([])

  // Charger les personnes depuis localStorage
  const loadPersons = () => {
    try {
      const stored = localStorage.getItem('bankin-analyzer-persons')
      if (stored) {
        availablePersons.value = JSON.parse(stored)
        // Nettoyer les assignations fantômes après rechargement des personnes
        cleanOrphanedAssignments()
      }
    } catch (error) {
      console.warn('Erreur lors du chargement des personnes:', error)
      availablePersons.value = []
    }
  }

  // Charger les catégories depuis localStorage
  const loadReimbursementCategories = () => {
    try {
      const stored = localStorage.getItem(
        'bankin-analyzer-reimbursement-categories'
      )
      if (stored) {
        const parsed = JSON.parse(stored)
        reimbursementCategories.value = parsed.map(
          (
            cat: Omit<ReimbursementCategory, 'createdAt'> & {
              createdAt: string
            }
          ) => ({
            ...cat,
            createdAt: new Date(cat.createdAt),
          })
        )
      }
    } catch (error) {
      console.warn('Erreur lors du chargement des catégories:', error)
      reimbursementCategories.value = []
    }
  }

  // Nettoyer les assignations qui référencent des personnes supprimées
  const cleanOrphanedAssignments = () => {
    try {
      let hasChanges = false
      const validPersonIds = new Set(availablePersons.value.map(p => p.id))

      expenseAssignments.value = expenseAssignments.value
        .map(assignment => {
          const originalLength = assignment.assignedPersons.length
          // Filtrer uniquement les personnes qui existent encore
          assignment.assignedPersons = assignment.assignedPersons.filter(ap =>
            validPersonIds.has(ap.personId)
          )

          if (assignment.assignedPersons.length !== originalLength) {
            hasChanges = true
          }

          return assignment
        })
        .filter(assignment => assignment.assignedPersons.length > 0) // Supprimer les assignations vides

      // Sauvegarder uniquement s'il y a eu des changements
      if (hasChanges) {
        saveAssignments()
        console.log('Assignations fantômes nettoyées')
      }
    } catch (error) {
      console.warn('Erreur lors du nettoyage des assignations fantômes:', error)
    }
  }

  // Sauvegarder les assignations dans localStorage
  const saveAssignments = () => {
    try {
      localStorage.setItem(
        'bankin-analyzer-expense-assignments',
        JSON.stringify(expenseAssignments.value)
      )
    } catch (error) {
      console.warn('Erreur lors de la sauvegarde des assignations:', error)
    }
  }

  // Charger les assignations depuis localStorage
  const loadAssignments = () => {
    try {
      const stored = localStorage.getItem('bankin-analyzer-expense-assignments')
      if (stored) {
        expenseAssignments.value = JSON.parse(stored)
      }
    } catch (error) {
      console.warn('Erreur lors du chargement des assignations:', error)
      expenseAssignments.value = []
    }
  }

  // Catégories disponibles
  const availableCategories = computed(() => {
    if (!props.analysisResult?.isValid) return []
    const categories = new Set<string>()
    props.analysisResult.transactions
      .filter(t => t.type === 'expense' && t.isPointed !== true)
      .forEach(t => categories.add(t.category))
    return ['Toutes les catégories', ...Array.from(categories).sort()]
  })

  // Transactions de dépenses filtrées
  const filteredExpenses = computed(() => {
    if (!props.analysisResult?.isValid) return []

    const filtered = props.analysisResult.transactions.filter(transaction => {
      // Uniquement les dépenses
      if (transaction.type !== 'expense') return false

      // Exclure les dépenses pointées (validées)
      if (transaction.isPointed === true) return false

      // Filtre par catégorie si sélectionnée
      if (
        selectedCategory.value &&
        selectedCategory.value !== 'Toutes les catégories'
      ) {
        return transaction.category === selectedCategory.value
      }

      return true
    })

    // Trier par date décroissante (plus récentes d'abord)
    return filtered.sort((a, b) => {
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
  })

  // Statistiques de pagination
  const paginationStats = computed(() => {
    const totalItems = filteredExpenses.value.length
    const totalPages = Math.ceil(totalItems / itemsPerPage.value)
    const startIndex = (currentPage.value - 1) * itemsPerPage.value
    const endIndex = Math.min(startIndex + itemsPerPage.value, totalItems)

    return {
      totalItems,
      totalPages,
      startIndex,
      endIndex,
      currentPage: currentPage.value,
      itemsPerPage: itemsPerPage.value,
    }
  })

  // Transactions paginées
  const paginatedExpenses = computed(() => {
    const { startIndex, endIndex } = paginationStats.value
    return filteredExpenses.value.slice(startIndex, endIndex)
  })

  // Fonctions de navigation
  const goToPage = (page: number) => {
    if (page >= 1 && page <= paginationStats.value.totalPages) {
      currentPage.value = page
    }
  }

  const previousPage = () => {
    if (currentPage.value > 1) {
      currentPage.value--
    }
  }

  const nextPage = () => {
    if (currentPage.value < paginationStats.value.totalPages) {
      currentPage.value++
    }
  }

  // Génération des numéros de page pour la pagination
  const getPaginationNumbers = () => {
    const { currentPage: current, totalPages } = paginationStats.value
    const delta = 2 // Nombre de pages à afficher de chaque côté de la page courante
    const pages: number[] = []

    // Toujours inclure la première page
    if (totalPages > 1) {
      pages.push(1)
    }

    // Calculer la plage autour de la page courante
    const start = Math.max(2, current - delta)
    const end = Math.min(totalPages - 1, current + delta)

    // Ajouter "..." si nécessaire
    if (start > 2) {
      pages.push(-1) // -1 représente "..."
    }

    // Ajouter les pages autour de la page courante
    for (let i = start; i <= end; i++) {
      if (i !== 1 && i !== totalPages) {
        pages.push(i)
      }
    }

    // Ajouter "..." si nécessaire
    if (end < totalPages - 1) {
      pages.push(-1) // -1 représente "..."
    }

    // Toujours inclure la dernière page
    if (totalPages > 1) {
      pages.push(totalPages)
    }

    return pages
  }

  // Réinitialiser la page quand le filtre change
  watch(selectedCategory, () => {
    currentPage.value = 1
  })

  // Obtenir l'assignation d'une transaction
  const getAssignment = (transactionId: string) => {
    return expenseAssignments.value.find(a => a.transactionId === transactionId)
  }

  // Obtenir les personnes assignées à une transaction
  const getAssignedPersons = (transactionId: string) => {
    const assignment = getAssignment(transactionId)
    if (!assignment?.assignedPersons || assignment.assignedPersons.length === 0)
      return []

    return assignment.assignedPersons
      .map(ap => {
        const person = availablePersons.value.find(p => p.id === ap.personId)
        const category = ap.categoryId
          ? reimbursementCategories.value.find(c => c.id === ap.categoryId)
          : null
        return person
          ? {
              ...person,
              assignedAmount: ap.amount,
              assignedCategory: category || null,
            }
          : null
      })
      .filter((person): person is NonNullable<typeof person> => person !== null)
  }

  // Ajouter une personne à une transaction avec un montant
  const addPersonToTransaction = (
    transactionId: string,
    personId: string,
    amount: number,
    categoryId?: string
  ) => {
    const existingIndex = expenseAssignments.value.findIndex(
      a => a.transactionId === transactionId
    )

    if (existingIndex >= 0) {
      const assignment = expenseAssignments.value[existingIndex]
      if (assignment) {
        // Vérifier si la personne est déjà assignée
        const personIndex = assignment.assignedPersons.findIndex(
          ap => ap.personId === personId
        )
        if (personIndex >= 0) {
          // Mettre à jour le montant et la catégorie
          const existingAssignment = assignment.assignedPersons[personIndex]
          if (existingAssignment) {
            existingAssignment.amount = amount
            if (categoryId) {
              existingAssignment.categoryId = categoryId
            }
          }
        } else {
          // Ajouter la nouvelle personne
          const newAssignment: PersonAssignment = { personId, amount }
          if (categoryId) {
            newAssignment.categoryId = categoryId
          }
          assignment.assignedPersons.push(newAssignment)
        }
      }
    } else {
      // Créer une nouvelle assignation
      const newPersonAssignment: PersonAssignment = { personId, amount }
      if (categoryId) {
        newPersonAssignment.categoryId = categoryId
      }
      expenseAssignments.value.push({
        transactionId,
        assignedPersons: [newPersonAssignment],
      })
    }

    saveAssignments()
  }

  // Supprimer une personne d'une transaction
  const removePersonFromTransaction = (
    transactionId: string,
    personId: string
  ) => {
    const existingIndex = expenseAssignments.value.findIndex(
      a => a.transactionId === transactionId
    )

    if (existingIndex >= 0) {
      const assignment = expenseAssignments.value[existingIndex]
      if (assignment) {
        assignment.assignedPersons = assignment.assignedPersons.filter(
          ap => ap.personId !== personId
        )

        // Si plus personne n'est assignée, supprimer l'assignation complète
        if (assignment.assignedPersons.length === 0) {
          expenseAssignments.value.splice(existingIndex, 1)
        }

        saveAssignments()
      }
    }
  }

  // Fonctions pour la modal d'assignation
  const openAssignModal = (expense: Transaction, index: number) => {
    // Nettoyer les assignations fantômes avant d'ouvrir la modal
    // pour garantir un calcul correct du montant disponible
    cleanOrphanedAssignments()

    currentExpense.value = { transaction: expense, index }
    modalPersonId.value = ''
    modalAmount.value = 0
    showAssignModal.value = true
  }

  const closeAssignModal = () => {
    showAssignModal.value = false
    currentExpense.value = null
    modalPersonId.value = ''
    modalAmount.value = 0
    modalCategoryId.value = ''
    customDivider.value = 2
  }

  // Valider qu'un montant d'assignation ne dépasse pas la limite
  const isValidAssignmentAmount = (
    transactionId: string,
    newAmount: number,
    personId: string
  ): boolean => {
    if (!currentExpense.value) return false

    const expenseAmount = Math.abs(currentExpense.value.transaction.amount)
    const assignment = getAssignment(transactionId)

    // Calculer le total actuel des assignations (en excluant celle qu'on modifie)
    let currentTotal = 0
    if (assignment?.assignedPersons) {
      currentTotal = assignment.assignedPersons
        .filter(ap => ap.personId !== personId) // Exclure la personne actuelle si elle existe déjà
        .reduce((sum, ap) => sum + ap.amount, 0)
    }

    // Vérifier que le nouveau total ne dépasse pas le montant de la dépense
    return currentTotal + newAmount <= expenseAmount
  }

  const addPersonFromModal = () => {
    if (currentExpense.value && modalPersonId.value && modalAmount.value > 0) {
      const transactionId = getTransactionId(
        currentExpense.value.transaction,
        currentExpense.value.index
      )

      // Validation : vérifier que le montant total ne dépasse pas la dépense
      if (
        isValidAssignmentAmount(
          transactionId,
          modalAmount.value,
          modalPersonId.value
        )
      ) {
        addPersonToTransaction(
          transactionId,
          modalPersonId.value,
          modalAmount.value,
          modalCategoryId.value || undefined
        )
        modalPersonId.value = ''
        modalAmount.value = 0
        modalCategoryId.value = ''
      } else {
        alert(
          'Le montant total des remboursements ne peut pas dépasser le montant de la dépense.'
        )
      }
    }
  }

  // Fonction d'aide pour calculer les montants
  const setAmountHelper = (type: string) => {
    if (!currentExpense.value) return

    const availableAmount = maxAvailableAmount.value
    const totalExpenseAmount = Math.abs(currentExpense.value.transaction.amount)

    switch (type) {
      case 'full': {
        modalAmount.value = Math.round(availableAmount * 100) / 100
        break
      }
      case 'half': {
        const halfTotal = Math.round((totalExpenseAmount / 2) * 100) / 100
        modalAmount.value = Math.min(halfTotal, availableAmount)
        break
      }
      case 'custom': {
        if (customDivider.value && customDivider.value > 1) {
          const dividedAmount =
            Math.round((totalExpenseAmount / customDivider.value) * 100) / 100
          modalAmount.value = Math.min(dividedAmount, availableAmount)
        }
        break
      }
    }
  }

  // Formater le montant
  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(Math.abs(amount))
  }

  // Formater la date
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
      return dateStr
    }
  }

  // Générer un ID unique pour une transaction basé sur ses propriétés intrinsèques
  const getTransactionId = (transaction: Transaction, _index: number) => {
    // Utiliser les propriétés de la transaction pour créer un ID stable
    // qui ne change pas selon le filtrage ou la pagination
    const description = transaction.description
      .substring(0, 20)
      .replace(/[^a-zA-Z0-9]/g, '')
    return `${transaction.date}-${transaction.amount}-${description}-${transaction.account}`
  }

  // Statistiques
  const stats = computed(() => {
    const total = filteredExpenses.value.length
    const assignedExpenses = filteredExpenses.value.filter((expense, index) => {
      const id = getTransactionId(expense, index)
      const assignedPersons = getAssignedPersons(id)
      return assignedPersons.length > 0
    })
    const assigned = assignedExpenses.length

    const totalAmount = filteredExpenses.value.reduce(
      (sum, expense) => sum + Math.abs(expense.amount),
      0
    )

    const totalReimbursementAmount = assignedExpenses.reduce(
      (sum, expense, index) => {
        const id = getTransactionId(expense, index)
        const assignedPersons = getAssignedPersons(id)
        const reimbursementAmount = assignedPersons.reduce(
          (personSum, person) => personSum + (person.assignedAmount || 0),
          0
        )
        return sum + reimbursementAmount
      },
      0
    )

    const assignedWithReimbursement = assignedExpenses.filter(
      (expense, index) => {
        const id = getTransactionId(expense, index)
        const assignedPersons = getAssignedPersons(id)
        return assignedPersons.some(
          person => person.assignedAmount && person.assignedAmount > 0
        )
      }
    ).length

    return {
      total,
      assigned,
      unassigned: total - assigned,
      totalAmount,
      totalReimbursementAmount,
      assignedWithReimbursement,
      reimbursementCoverage:
        totalAmount > 0 ? (totalReimbursementAmount / totalAmount) * 100 : 0,
    }
  })

  // Charger les données au montage
  loadPersons()
  loadAssignments()
  loadReimbursementCategories()

  // Écouter les changements de localStorage pour synchroniser les personnes et catégories entre composants
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'bankin-analyzer-persons' && event.newValue) {
      loadPersons()
    }
    if (
      event.key === 'bankin-analyzer-reimbursement-categories' &&
      event.newValue
    ) {
      loadReimbursementCategories()
    }
  }

  // Ajouter l'écouteur d'événement au montage et le retirer au démontage
  onMounted(() => {
    window.addEventListener('storage', handleStorageChange)
  })

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange)
  })

  // Watcher pour recharger périodiquement (fallback pour la même fenêtre)
  const checkForPersonsUpdates = () => {
    const stored = localStorage.getItem('bankin-analyzer-persons')
    if (stored) {
      const storedPersons = JSON.parse(stored)
      if (
        JSON.stringify(storedPersons) !== JSON.stringify(availablePersons.value)
      ) {
        loadPersons()
      }
    }
  }

  const checkForCategoriesUpdates = () => {
    const stored = localStorage.getItem(
      'bankin-analyzer-reimbursement-categories'
    )
    if (stored) {
      const storedCategories = JSON.parse(stored)
      if (
        JSON.stringify(storedCategories) !==
        JSON.stringify(
          reimbursementCategories.value.map(cat => ({
            ...cat,
            createdAt: cat.createdAt.toISOString(),
          }))
        )
      ) {
        loadReimbursementCategories()
      }
    }
  }

  // Vérifier les mises à jour toutes les 500ms
  setInterval(checkForPersonsUpdates, 500)
  setInterval(checkForCategoriesUpdates, 500)

  // Exposition des données pour le composant parent
  defineExpose({
    filteredExpenses,
    expenseAssignments,
    stats,
  })
</script>

<template>
  <div class="reimbursement-section expenses-manager">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="7,10 12,15 17,10" />
        <line x1="12" y1="15" x2="12" y2="3" />
      </svg>
      Gestion des dépenses et remboursements
    </h3>

    <div class="section-content">
      <!-- Statistiques rapides -->
      <div class="stats-bar">
        <div class="stat-item">
          <span class="stat-label">Total dépenses :</span>
          <span class="stat-value">{{ stats.total }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Assignées :</span>
          <span class="stat-value assigned">{{ stats.assigned }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Non assignées :</span>
          <span class="stat-value unassigned">{{ stats.unassigned }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Montant total :</span>
          <span class="stat-value amount">{{
            formatAmount(stats.totalAmount)
          }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Avec remboursement :</span>
          <span class="stat-value reimbursement">
            {{ stats.assignedWithReimbursement }}
          </span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Total à rembourser :</span>
          <span class="stat-value reimbursement-amount">{{
            formatAmount(stats.totalReimbursementAmount)
          }}</span>
        </div>
        <div class="stat-item">
          <span class="stat-label">Couverture :</span>
          <span class="stat-value coverage"
            >{{ stats.reimbursementCoverage.toFixed(1) }}%</span
          >
        </div>
      </div>

      <!-- Filtre par catégorie -->
      <div class="filter-section">
        <div class="filter-group">
          <label for="category-select" class="filter-label">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M6 3h12l-4 4v8l-4 2V7L6 3z" />
            </svg>
            Filtrer par catégorie :
          </label>
          <select
            id="category-select"
            v-model="selectedCategory"
            class="category-select"
          >
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

      <!-- Liste des dépenses -->
      <div class="expenses-list">
        <div v-if="filteredExpenses.length === 0" class="empty-state">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="15" y1="9" x2="9" y2="15" />
            <line x1="9" y1="9" x2="15" y2="15" />
          </svg>
          <h4>Aucune dépense trouvée</h4>
          <p>
            {{
              selectedCategory && selectedCategory !== 'Toutes les catégories'
                ? `Aucune dépense dans la catégorie "${selectedCategory}"`
                : 'Aucune dépense disponible dans vos données'
            }}
          </p>
        </div>

        <div v-else class="expenses-table">
          <div class="table-header">
            <div class="header-cell date">Date</div>
            <div class="header-cell description">Description</div>
            <div class="header-cell category">Catégorie</div>
            <div class="header-cell amount">Montant</div>
            <div class="header-cell note">Note</div>
            <div class="header-cell assignments">Personnes assignées</div>
            <div class="header-cell actions">Actions</div>
          </div>

          <div
            v-for="(expense, index) in paginatedExpenses"
            :key="getTransactionId(expense, paginationStats.startIndex + index)"
            class="expense-row"
          >
            <div class="cell date">
              {{ formatDate(expense.date) }}
            </div>

            <div class="cell description">
              <div class="description-content">
                <span class="description-text">{{ expense.description }}</span>
              </div>
            </div>

            <div class="cell category">
              <span class="category-badge">{{ expense.category }}</span>
            </div>

            <div class="cell amount">
              <span class="amount-value">{{
                formatAmount(expense.amount)
              }}</span>
            </div>

            <div class="cell note">
              <span class="note-text">{{ expense.note || '-' }}</span>
            </div>

            <div class="cell assignments">
              <div
                v-if="
                  getAssignedPersons(
                    getTransactionId(
                      expense,
                      paginationStats.startIndex + index
                    )
                  ).length > 0
                "
                class="assigned-persons-compact"
              >
                <div
                  v-for="person in getAssignedPersons(
                    getTransactionId(
                      expense,
                      paginationStats.startIndex + index
                    )
                  )"
                  :key="person.id"
                  class="person-avatar-compact"
                  :title="`${person.name}${person.email ? ' (' + person.email + ')' : ''}\nMontant: ${formatAmount(person.assignedAmount || 0)}${person.assignedCategory ? '\nCatégorie: ' + person.assignedCategory.icon + ' ' + person.assignedCategory.name : ''}`"
                  @click="
                    removePersonFromTransaction(
                      getTransactionId(
                        expense,
                        paginationStats.startIndex + index
                      ),
                      person.id
                    )
                  "
                >
                  {{ person.name.charAt(0).toUpperCase() }}
                  <div class="remove-indicator">×</div>
                </div>
              </div>
              <div v-else class="no-assignments">
                <span class="no-assignment-text">Aucune assignation</span>
              </div>
            </div>

            <div class="cell actions">
              <button
                class="associate-btn"
                title="Associer une personne"
                @click="
                  openAssignModal(expense, paginationStats.startIndex + index)
                "
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M12 5v14m-7-7h14" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Contrôles de pagination -->
      <div v-if="paginationStats.totalPages > 1" class="pagination-controls">
        <div class="pagination-info">
          <span class="pagination-text">
            Affichage de {{ paginationStats.startIndex + 1 }} à
            {{ Math.min(paginationStats.endIndex, paginationStats.totalItems) }}
            sur {{ paginationStats.totalItems }} dépenses
          </span>
          <span class="pagination-pages">
            Page {{ paginationStats.currentPage }} sur
            {{ paginationStats.totalPages }}
          </span>
        </div>

        <div class="pagination-buttons">
          <button
            :disabled="paginationStats.currentPage === 1"
            class="pagination-btn"
            title="Première page"
            @click="goToPage(1)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M11 17L6 12L11 7" />
              <path d="M18 17L13 12L18 7" />
            </svg>
          </button>

          <button
            :disabled="paginationStats.currentPage === 1"
            class="pagination-btn"
            title="Page précédente"
            @click="previousPage"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M15 18L9 12L15 6" />
            </svg>
          </button>

          <div class="pagination-numbers">
            <button
              v-for="page in getPaginationNumbers()"
              :key="page"
              class="pagination-number"
              :class="{ active: page === paginationStats.currentPage }"
              :disabled="page === -1"
              @click="page > 0 ? goToPage(page) : null"
            >
              {{ page === -1 ? '...' : page }}
            </button>
          </div>

          <button
            :disabled="
              paginationStats.currentPage === paginationStats.totalPages
            "
            class="pagination-btn"
            title="Page suivante"
            @click="nextPage"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M9 18L15 12L9 6" />
            </svg>
          </button>

          <button
            :disabled="
              paginationStats.currentPage === paginationStats.totalPages
            "
            class="pagination-btn"
            title="Dernière page"
            @click="goToPage(paginationStats.totalPages)"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M13 17L18 12L13 7" />
              <path d="M6 17L11 12L6 7" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Message d'aide si aucune personne n'est configurée -->
      <div v-if="availablePersons.length === 0" class="help-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p>
          <strong>Aucune personne configurée</strong><br />
          Ajoutez des personnes dans le gestionnaire ci-dessus pour pouvoir les
          assigner aux dépenses.
        </p>
      </div>
    </div>

    <!-- Modal d'assignation -->
    <div v-if="showAssignModal" class="modal-overlay" @click="closeAssignModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Associer une personne à la dépense</h3>
          <button class="modal-close" @click="closeAssignModal">×</button>
        </div>

        <div v-if="currentExpense" class="modal-body">
          <div class="expense-info">
            <div class="expense-detail">
              <strong>Dépense :</strong>
              {{ currentExpense.transaction.description }}
            </div>
            <div class="expense-detail">
              <strong>Montant :</strong>
              {{ formatAmount(currentExpense.transaction.amount) }}
            </div>
            <div class="expense-detail">
              <strong>Date :</strong>
              {{ formatDate(currentExpense.transaction.date) }}
            </div>
          </div>

          <div class="form-group">
            <label for="modal-person-select">Personne :</label>
            <select
              id="modal-person-select"
              v-model="modalPersonId"
              class="form-control"
            >
              <option value="">Sélectionner une personne</option>
              <option
                v-for="person in availablePersons"
                :key="person.id"
                :value="person.id"
              >
                {{ person.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="modal-category-select">
              Catégorie de remboursement (optionnel) :
            </label>
            <select
              id="modal-category-select"
              v-model="modalCategoryId"
              class="form-control"
            >
              <option value="">Aucune catégorie spécifique</option>
              <option
                v-for="category in reimbursementCategories"
                :key="category.id"
                :value="category.id"
              >
                {{ category.icon }} {{ category.name }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label for="modal-amount-input">Montant de remboursement :</label>

            <!-- Boutons d'aide pour calculer les montants -->
            <div class="amount-helper-buttons">
              <button
                type="button"
                class="helper-btn"
                title="Attribuer le montant total disponible"
                @click="setAmountHelper('full')"
              >
                💰 Total ({{ formatAmount(maxAvailableAmount) }})
              </button>
              <button
                type="button"
                class="helper-btn"
                title="Diviser le montant total de la dépense par 2"
                @click="setAmountHelper('half')"
              >
                ➗ Diviser par 2
              </button>
              <div class="helper-custom-division">
                <button
                  type="button"
                  class="helper-btn"
                  title="Diviser le montant total de la dépense par un nombre personnalisé"
                  @click="setAmountHelper('custom')"
                >
                  🔢 Diviser par
                </button>
                <input
                  v-model.number="customDivider"
                  type="number"
                  min="2"
                  max="10"
                  placeholder="N"
                  class="custom-divider-input"
                  @keyup.enter="setAmountHelper('custom')"
                />
              </div>
            </div>

            <div class="amount-input-group">
              <input
                id="modal-amount-input"
                v-model.number="modalAmount"
                type="number"
                step="0.01"
                min="0"
                :max="maxAvailableAmount"
                :placeholder="`Max disponible: ${formatAmount(maxAvailableAmount)}`"
                class="form-control"
                :class="{
                  invalid: modalAmount > maxAvailableAmount && modalAmount > 0,
                }"
              />
              <span class="currency-symbol">€</span>
            </div>
            <div
              v-if="
                maxAvailableAmount < Math.abs(currentExpense.transaction.amount)
              "
              class="help-text"
            >
              Montant disponible : {{ formatAmount(maxAvailableAmount) }} sur
              {{ formatAmount(currentExpense.transaction.amount) }}
            </div>
            <div
              v-if="modalAmount > maxAvailableAmount && modalAmount > 0"
              class="error-text"
            >
              Le montant ne peut pas dépasser
              {{ formatAmount(maxAvailableAmount) }}
            </div>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="closeAssignModal">
            Annuler
          </button>
          <button
            class="btn btn-primary"
            :disabled="!modalPersonId || !isModalAmountValid"
            @click="addPersonFromModal"
          >
            Ajouter
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-section {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border-radius: 1rem;
    margin-bottom: 1.5rem;
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

  .section-content {
    padding: 0 1.5rem 1.5rem;
  }

  /* Barre de statistiques */
  .stats-bar {
    display: flex;
    gap: 1.5rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .stat-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.8rem;
    color: #6b7280;
    font-weight: 500;
  }

  .stat-value {
    font-size: 1.1rem;
    font-weight: 600;
    color: #1f2937;
  }

  .stat-value.assigned {
    color: #059669;
  }

  .stat-value.unassigned {
    color: #dc2626;
  }

  .stat-value.amount {
    color: #3b82f6;
  }

  .stat-value.reimbursement {
    color: #8b5cf6;
  }

  .stat-value.reimbursement-amount {
    color: #059669;
  }

  .stat-value.coverage {
    color: #ea580c;
  }

  /* Section de filtrage */
  .filter-section {
    margin-bottom: 1.5rem;
  }

  .filter-group {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .filter-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
    color: #374151;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .filter-label svg {
    width: 1rem;
    height: 1rem;
    color: #3b82f6;
  }

  .category-select {
    padding: 0.75rem 1rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    font-size: 0.875rem;
    color: #374151;
    min-width: 200px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .category-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  /* Liste des dépenses */
  .expenses-list {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    overflow: hidden;
  }

  .expenses-table {
    display: flex;
    flex-direction: column;
  }

  .table-header {
    display: grid;
    grid-template-columns: 80px 1fr 170px 90px 180px 150px 60px;
    gap: 0.75rem;
    padding: 1rem;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.6) 0%,
      rgba(249, 250, 251, 0.6) 100%
    );
    backdrop-filter: blur(5px);
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    font-weight: 600;
    color: #374151;
    font-size: 0.875rem;
  }

  .header-cell {
    display: flex;
    align-items: center;
  }

  .expense-row {
    display: grid;
    grid-template-columns: 80px 1fr 170px 90px 180px 150px 60px;
    gap: 0.75rem;
    padding: 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    transition: all 0.2s ease;
  }

  .expense-row:hover {
    background: rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(5px);
  }

  .expense-row:last-child {
    border-bottom: none;
  }

  .cell {
    display: flex;
    align-items: center;
    font-size: 0.875rem;
  }

  .cell.date {
    color: #6b7280;
    font-weight: 500;
  }

  .description-content {
    max-width: 100%;
    overflow: hidden;
  }

  .description-text {
    display: block;
    color: #1f2937;
    line-height: 1.4;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .note-text {
    color: #6b7280;
    font-size: 0.8rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 100%;
  }

  .category-badge {
    background: rgba(219, 234, 254, 0.8);
    backdrop-filter: blur(5px);
    color: #1e40af;
    padding: 0.375rem 0.75rem;
    border-radius: 16px;
    font-size: 0.8rem;
    font-weight: 500;
    white-space: nowrap;
  }

  .amount-value {
    font-weight: 600;
    color: #dc2626;
  }

  .person-assignment {
    width: 100%;
  }

  /* Styles pour la colonne de remboursement */
  .reimbursement-input {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
  }

  .amount-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 6px;
    font-size: 0.8rem;
    text-align: right;
    transition: all 0.2s ease;
  }

  .amount-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .amount-input:invalid {
    border-color: #dc2626;
    box-shadow: 0 0 0 2px rgba(220, 38, 38, 0.1);
  }

  .currency-symbol {
    color: #6b7280;
    font-size: 0.8rem;
    font-weight: 500;
  }

  .no-assignment {
    color: #d1d5db;
    font-size: 1rem;
    text-align: center;
    width: 100%;
    display: block;
  }

  .person-select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 6px;
    font-size: 0.8rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .person-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.1);
  }

  .assigned-person {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.5rem;
    padding: 0.5rem;
    background: rgba(240, 249, 255, 0.8);
    backdrop-filter: blur(5px);
    border-radius: 6px;
    border: 1px solid rgba(224, 242, 254, 0.5);
  }

  .person-avatar {
    width: 1.75rem;
    height: 1.75rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .person-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .person-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 0.8rem;
  }

  .person-email {
    font-size: 0.7rem;
    color: #6b7280;
    text-overflow: ellipsis;
    overflow: hidden;
    white-space: nowrap;
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

  /* Message d'aide */
  .help-message {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 251, 235, 0.8);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(252, 211, 77, 0.5);
    border-radius: 8px;
    margin-top: 1.5rem;
    color: #92400e;
  }

  .help-message svg {
    width: 1.5rem;
    height: 1.5rem;
    color: #f59e0b;
    flex-shrink: 0;
  }

  .help-message p {
    margin: 0;
    font-size: 0.875rem;
    line-height: 1.5;
  }

  /* Contrôles de pagination */
  .pagination-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
    margin-top: 1.5rem;
  }

  .pagination-info {
    font-size: 0.875rem;
    color: #374151;
  }

  .pagination-text {
    margin-right: 0.5rem;
  }

  .pagination-pages {
    font-weight: 600;
    color: #1f2937;
  }

  .pagination-buttons {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pagination-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pagination-btn:disabled {
    background: #d1d5db;
    cursor: not-allowed;
  }

  .pagination-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    background: #e0f2fe;
    color: #1e40af;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pagination-number.active {
    background: #3b82f6;
    color: white;
  }

  /* Contrôles de pagination */
  .pagination-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    background: rgba(249, 250, 251, 0.8);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    margin-top: 1.5rem;
  }

  .pagination-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.875rem;
    color: #374151;
  }

  .pagination-text {
    color: #6b7280;
  }

  .pagination-pages {
    font-weight: 600;
    color: #1f2937;
  }

  .pagination-buttons {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .pagination-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    color: #374151;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .pagination-btn:hover:not(:disabled) {
    background: rgba(243, 244, 246, 0.9);
    border-color: rgba(156, 163, 175, 0.5);
  }

  .pagination-btn:disabled {
    background: rgba(249, 250, 251, 0.7);
    color: #d1d5db;
    cursor: not-allowed;
  }

  .pagination-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .pagination-numbers {
    display: flex;
    gap: 0.25rem;
    margin: 0 0.5rem;
  }

  .pagination-number {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    color: #374151;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
    font-weight: 500;
  }

  .pagination-number:hover:not(:disabled) {
    background: rgba(243, 244, 246, 0.9);
    border-color: rgba(156, 163, 175, 0.5);
  }

  .pagination-number.active {
    background: #3b82f6;
    color: white;
    border-color: #3b82f6;
  }

  .pagination-number:disabled {
    background: rgba(249, 250, 251, 0.7);
    color: #d1d5db;
    cursor: not-allowed;
  }

  /* Responsive - Contrôles de pagination */
  @media (max-width: 768px) {
    .pagination-controls {
      flex-direction: column;
      gap: 1rem;
    }

    .pagination-info {
      text-align: center;
    }

    .pagination-buttons {
      justify-content: center;
      flex-wrap: wrap;
    }

    .pagination-numbers {
      margin: 0;
    }
  }

  /* Styles pour les assignations compactes */
  .assigned-persons-compact {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .person-avatar-compact {
    position: relative;
    width: 2rem;
    height: 2rem;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    border: 2px solid transparent;
    user-select: none;
  }

  .person-avatar-compact:hover {
    transform: scale(1.1);
    border-color: #dc2626;
    box-shadow: 0 4px 12px rgba(220, 38, 38, 0.3);
  }

  .person-avatar-compact:hover .remove-indicator {
    opacity: 1;
    transform: scale(1);
  }

  .remove-indicator {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 14px;
    height: 14px;
    background: #dc2626;
    color: white;
    border-radius: 50%;
    font-size: 10px;
    font-weight: bold;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transform: scale(0.5);
    transition: all 0.2s ease;
  }

  .no-assignments {
    color: #6b7280;
    font-size: 0.85rem;
    font-style: italic;
  }

  .associate-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2.5rem;
    height: 2.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
  }

  .associate-btn:hover {
    background: #2563eb;
    transform: translateY(-1px);
  }

  .associate-btn svg {
    width: 18px;
    height: 18px;
  }

  /* Styles pour la modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.6) 0%,
      rgba(249, 250, 251, 0.6) 100%
    );
    backdrop-filter: blur(5px);
  }

  .modal-header h3 {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
  }

  .modal-close {
    background: none;
    border: none;
    font-size: 1.5rem;
    color: #6b7280;
    cursor: pointer;
    padding: 0.25rem;
    line-height: 1;
  }

  .modal-close:hover {
    color: #374151;
  }

  .modal-body {
    padding: 1.5rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .expense-info {
    background: rgba(249, 250, 251, 0.8);
    backdrop-filter: blur(5px);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1.5rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .expense-detail {
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
    color: #374151;
  }

  .expense-detail:last-child {
    margin-bottom: 0;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.5rem;
    font-size: 0.9rem;
  }

  .form-control {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 6px;
    font-size: 0.9rem;
    transition: border-color 0.2s;
  }

  .form-control:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .form-control.invalid {
    border-color: #dc2626;
    box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
  }

  .help-text {
    font-size: 0.8rem;
    color: #6b7280;
    margin-top: 0.5rem;
    font-style: italic;
  }

  .error-text {
    font-size: 0.8rem;
    color: #dc2626;
    margin-top: 0.5rem;
    font-weight: 500;
  }

  .amount-input-group {
    position: relative;
    display: flex;
    align-items: center;
  }

  .amount-input-group .currency-symbol {
    position: absolute;
    right: 0.75rem;
    color: #6b7280;
    font-weight: 500;
    pointer-events: none;
  }

  /* Styles pour les boutons d'aide */
  .amount-helper-buttons {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
    align-items: center;
  }

  .helper-btn {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.5rem 0.75rem;
    background: rgba(243, 244, 246, 0.8);
    backdrop-filter: blur(5px);
    color: #374151;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
  }

  .helper-btn:hover {
    background: rgba(229, 231, 235, 0.9);
    border-color: rgba(156, 163, 175, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .helper-btn:active {
    transform: translateY(0);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
  }

  .helper-custom-division {
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .custom-divider-input {
    width: 60px;
    padding: 0.375rem 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 4px;
    font-size: 0.8rem;
    text-align: center;
    transition: border-color 0.2s ease;
  }

  .custom-divider-input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .modal-footer {
    display: flex;
    justify-content: flex-end;
    gap: 0.75rem;
    padding: 1.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(249, 250, 251, 0.8);
    backdrop-filter: blur(5px);
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border-radius: 6px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    border: none;
  }

  .btn-secondary {
    background: rgba(243, 244, 246, 0.8);
    backdrop-filter: blur(5px);
    color: #374151;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .btn-secondary:hover {
    background: rgba(229, 231, 235, 0.9);
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  /* Responsive */
  @media (max-width: 1200px) {
    .table-header,
    .expense-row {
      grid-template-columns: 70px 0.8fr 140px 80px 150px 130px 50px;
      gap: 0.5rem;
    }

    .description-text {
      max-width: 150px;
    }
  }

  @media (max-width: 768px) {
    .stats-bar {
      flex-direction: column;
      gap: 1rem;
    }

    .stat-item {
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
    }

    .filter-group {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.75rem;
    }

    .category-select {
      width: 100%;
      min-width: auto;
    }

    .table-header {
      display: none;
    }

    .expense-row {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      padding: 1rem;
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      margin-bottom: 0.5rem;
    }

    .cell {
      justify-content: space-between;
      padding: 0.5rem 0;
      border-bottom: 1px solid #f3f4f6;
    }

    .cell:last-child {
      border-bottom: none;
    }

    .cell::before {
      content: attr(data-label);
      font-weight: 600;
      color: #6b7280;
      font-size: 0.8rem;
      margin-right: 1rem;
      min-width: 100px;
    }

    .cell.date::before {
      content: 'Date: ';
    }

    .cell.description::before {
      content: 'Description: ';
    }

    .cell.category::before {
      content: 'Catégorie: ';
    }

    .cell.amount::before {
      content: 'Montant: ';
    }

    .cell.note::before {
      content: 'Note: ';
    }

    .cell.assignments::before {
      content: 'Personnes: ';
    }

    .cell.actions::before {
      content: 'Actions: ';
    }

    .person-assignment {
      flex: 1;
    }
  }
</style>

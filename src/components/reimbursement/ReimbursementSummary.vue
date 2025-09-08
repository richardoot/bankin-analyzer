<script setup lang="ts">
  import BaseCard from '@/components/shared/BaseCard.vue'
  import BaseButton from '@/components/shared/BaseButton.vue'
  import { useLocalStorage } from '@/composables/useLocalStorage'
  import { useFormatting } from '@/composables/useFormatting'
  import {
    usePdfExport,
    type DetailedReimbursementData,
    type ReimbursementData,
  } from '@/composables/usePdfExport'
  import type { PersonAssignment, Transaction } from '@/types'
  import { computed, ref } from 'vue'

  interface Props {
    expensesManagerRef?: {
      expenseAssignments: Array<{
        transactionId: string
        assignedPersons: PersonAssignment[]
      }>
      filteredExpenses: Transaction[]
      stats: {
        total: number
        assigned: number
        unassigned: number
        totalAmount: number
        totalReimbursementAmount: number
        assignedWithReimbursement: number
        reimbursementCoverage: number
      }
    } | null
  }

  const props = defineProps<Props>()

  // Composables modernes
  const localStorage = useLocalStorage()
  const { formatAmount, formatDateShort } = useFormatting()
  const { exportToPdf } = usePdfExport()

  // État pour gérer les catégories expansées
  const expandedCategories = ref(new Set<string>())

  // État pour gérer les détails de transactions expansés par personne et catégorie
  const expandedTransactionDetails = ref(new Set<string>())

  // État pour gérer le chargement de l'export
  const isExporting = ref(false)

  // Storage réactif via composables
  const personsStorage = localStorage.usePersonsStorage()
  const categoriesStorage = localStorage.useReimbursementCategoriesStorage()

  // Données réactives depuis le storage
  const availablePersons = computed(() => personsStorage.data.value || [])
  const reimbursementCategories = computed(
    () => categoriesStorage.data.value || []
  )

  // Fonction pour basculer l'état d'une catégorie
  const toggleCategory = (category: string) => {
    if (expandedCategories.value.has(category)) {
      expandedCategories.value.delete(category)
    } else {
      expandedCategories.value.add(category)
    }
  }

  // Fonction pour basculer l'état des détails de transactions pour une personne et catégorie
  const toggleTransactionDetails = (personId: string, categoryName: string) => {
    const key = `${personId}-${categoryName}`
    if (expandedTransactionDetails.value.has(key)) {
      expandedTransactionDetails.value.delete(key)
    } else {
      expandedTransactionDetails.value.add(key)
    }
  }

  // Calcul des remboursements réels par personne
  const reimbursementData = computed<ReimbursementData[]>(() => {
    // Vérifier que la ref existe et contient des données
    const managerRef = props.expensesManagerRef
    if (!managerRef) {
      return []
    }

    // Accéder aux données exposées par le composant
    const assignments = managerRef.expenseAssignments
    if (!assignments || assignments.length === 0) {
      return []
    }

    // Forcer la réactivité en accédant aux personnes depuis le storage global
    const persons = availablePersons.value

    // Calculer les totaux par personne
    const personTotals = new Map<string, number>()

    assignments.forEach(assignment => {
      assignment.assignedPersons.forEach(
        (personAssignment: PersonAssignment) => {
          const currentTotal = personTotals.get(personAssignment.personId) || 0
          personTotals.set(
            personAssignment.personId,
            currentTotal + personAssignment.amount
          )
        }
      )
    })

    // Créer les données de remboursement
    return Array.from(personTotals.entries())
      .map(([personId, amount]) => {
        const person = persons.find(p => p.id === personId)
        return {
          person: person?.name || `Personne inconnue (${personId})`,
          amount: amount,
          status: (amount > 0 ? 'en_attente' : 'valide') as
            | 'en_attente'
            | 'valide',
          personId,
        }
      })
      .filter(item => item.amount > 0) // Ne montrer que les montants positifs
      .sort((a, b) => b.amount - a.amount) // Trier par montant décroissant
  })

  // Calcul des remboursements par catégorie assignée et par personne
  const reimbursementDataByCategory = computed(() => {
    const managerRef = props.expensesManagerRef
    if (!managerRef) {
      return new Map()
    }

    const assignments = managerRef.expenseAssignments
    if (!assignments || assignments.length === 0) {
      return new Map()
    }
    const persons = availablePersons.value
    const categories = reimbursementCategories.value

    // Structure: Map<categoryName, Map<personId, amount>>
    const categoryPersonTotals = new Map<string, Map<string, number>>()

    assignments.forEach(assignment => {
      assignment.assignedPersons.forEach(personAssignment => {
        let categoryName = 'Sans catégorie spécifique'

        // Si une catégorie est assignée, utiliser son nom
        if (personAssignment.categoryId) {
          const category = categories.find(
            c => c.id === personAssignment.categoryId
          )
          if (category) {
            categoryName = `${category.icon} ${category.name}`
          }
        }

        if (!categoryPersonTotals.has(categoryName)) {
          categoryPersonTotals.set(categoryName, new Map())
        }

        const personTotals = categoryPersonTotals.get(categoryName)
        if (personTotals) {
          const currentTotal = personTotals.get(personAssignment.personId) || 0
          personTotals.set(
            personAssignment.personId,
            currentTotal + personAssignment.amount
          )
        }
      })
    })

    // Transformer en structure plus pratique pour l'affichage
    const result = new Map<
      string,
      Array<{
        person: string
        amount: number
        personId: string
      }>
    >()

    categoryPersonTotals.forEach((personTotals, category) => {
      const categoryData = Array.from(personTotals.entries())
        .map(([personId, amount]) => {
          const person = persons.find(p => p.id === personId)
          return {
            person: person?.name || `Personne inconnue (${personId})`,
            amount: amount,
            personId,
          }
        })
        .filter(item => item.amount > 0)
        .sort((a, b) => b.amount - a.amount)

      if (categoryData.length > 0) {
        result.set(category, categoryData)
      }
    })

    return result
  })

  // Calcul détaillé des remboursements par personne avec catégories
  const detailedReimbursementData = computed<DetailedReimbursementData[]>(
    () => {
      const managerRef = props.expensesManagerRef
      if (!managerRef) {
        return []
      }

      const assignments = managerRef.expenseAssignments
      if (!assignments || assignments.length === 0) {
        return []
      }
      const persons = availablePersons.value
      const categories = reimbursementCategories.value

      // Structure: Map<personId, Map<categoryName, amount>>
      const personCategoryTotals = new Map<string, Map<string, number>>()

      assignments.forEach(assignment => {
        assignment.assignedPersons.forEach(personAssignment => {
          let categoryName = 'Sans catégorie spécifique'

          if (personAssignment.categoryId) {
            const category = categories.find(
              c => c.id === personAssignment.categoryId
            )
            if (category) {
              categoryName = `${category.icon} ${category.name}`
            }
          }

          if (!personCategoryTotals.has(personAssignment.personId)) {
            personCategoryTotals.set(personAssignment.personId, new Map())
          }

          const categoryTotals = personCategoryTotals.get(
            personAssignment.personId
          )
          if (categoryTotals) {
            const currentTotal = categoryTotals.get(categoryName) || 0
            categoryTotals.set(
              categoryName,
              currentTotal + personAssignment.amount
            )
          }
        })
      })

      // Transformer en structure pour l'affichage
      return Array.from(personCategoryTotals.entries())
        .map(([personId, categoryTotals]) => {
          const person = persons.find(p => p.id === personId)
          const categories = Array.from(categoryTotals.entries())
            .map(([categoryName, amount]) => ({
              categoryName,
              amount,
              transactions: getTransactionDetails(personId, categoryName),
            }))
            .filter(item => item.amount > 0)
            .sort((a, b) => b.amount - a.amount)

          const totalAmount = categories.reduce(
            (sum, cat) => sum + cat.amount,
            0
          )

          return {
            personId,
            personName: person?.name || `Personne inconnue (${personId})`,
            categories,
            totalAmount,
            status: (totalAmount > 0 ? 'en_attente' : 'valide') as
              | 'en_attente'
              | 'valide',
          }
        })
        .filter(item => item.totalAmount > 0)
        .sort((a, b) => b.totalAmount - a.totalAmount)
    }
  )

  // Totaux par catégorie
  const categoryTotals = computed(() => {
    const totals = new Map<string, number>()

    reimbursementDataByCategory.value.forEach((personData, category) => {
      const categoryTotal = personData.reduce(
        (sum: number, item: { amount: number }) => sum + item.amount,
        0
      )
      totals.set(category, categoryTotal)
    })

    return Array.from(totals.entries())
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  })

  // Fonction utilitaire pour générer les IDs de transaction (identique à ExpensesReimbursementManager)
  const generateTransactionId = (transaction: Transaction) => {
    const description = transaction.description
      .substring(0, 20)
      .replace(/[^a-zA-Z0-9]/g, '')
    return `${transaction.date}-${transaction.amount}-${description}-${transaction.account}`
  }

  // Détails des transactions par personne et catégorie
  const expenseDetailsByPersonAndCategory = computed(() => {
    const managerRef = props.expensesManagerRef
    if (!managerRef) {
      return new Map<
        string,
        Array<{
          date: string
          description: string
          note: string
          baseAmount: number
          reimbursementAmount: number
        }>
      >()
    }

    const assignments = managerRef.expenseAssignments
    const expenses = managerRef.filteredExpenses
    if (!assignments || assignments.length === 0 || !expenses) {
      return new Map<
        string,
        Array<{
          date: string
          description: string
          note: string
          baseAmount: number
          reimbursementAmount: number
        }>
      >()
    }
    const categories = reimbursementCategories.value

    const result = new Map<
      string,
      Array<{
        date: string
        description: string
        note: string
        baseAmount: number
        reimbursementAmount: number
      }>
    >()

    assignments.forEach(assignment => {
      const expense = expenses.find(e => {
        // Utiliser la même logique de génération d'ID que dans ExpensesReimbursementManager
        return generateTransactionId(e) === assignment.transactionId
      })

      if (expense) {
        assignment.assignedPersons.forEach(personAssignment => {
          let categoryName = 'Sans catégorie spécifique'

          if (personAssignment.categoryId) {
            const category = categories.find(
              c => c.id === personAssignment.categoryId
            )
            if (category) {
              categoryName = `${category.icon} ${category.name}`
            }
          }

          const key = `${personAssignment.personId}-${categoryName}`

          if (!result.has(key)) {
            result.set(key, [])
          }

          result.get(key)?.push({
            date: expense.date,
            description: expense.description,
            note: expense.note,
            baseAmount: Math.abs(expense.amount),
            reimbursementAmount: personAssignment.amount,
          })
        })
      }
    })

    return result
  })

  // Fonction pour obtenir les détails de transactions pour une personne et catégorie
  const getTransactionDetails = (personId: string, categoryName: string) => {
    const key = `${personId}-${categoryName}`
    return expenseDetailsByPersonAndCategory.value.get(key) || []
  }

  // Fonction pour formater les dates de transaction
  const formatTransactionDate = (dateStr: string): string => {
    return formatDateShort(dateStr)
  }

  // Fonctions d'export PDF
  const handlePdfExport = async (): Promise<void> => {
    if (reimbursementData.value.length === 0) {
      alert('Aucune donnée à exporter.')
      return
    }

    isExporting.value = true

    try {
      // Préparer les données pour l'export
      const reimbursementDataForExport = reimbursementData.value
      const detailedDataForExport = detailedReimbursementData.value

      // Convertir les données de catégorie pour l'export
      const categoryDataForExport = new Map()
      reimbursementDataByCategory.value.forEach((personData, category) => {
        categoryDataForExport.set(category, {
          category,
          total: personData.reduce(
            (sum: number, item: { amount: number }) => sum + item.amount,
            0
          ),
          persons: personData,
        })
      })

      await exportToPdf(
        reimbursementDataForExport,
        detailedDataForExport,
        categoryDataForExport,
        'remboursements-detailles'
      )
    } catch (error) {
      console.error("Erreur lors de l'export PDF:", error)
      alert('Erreur lors de la génération du PDF. Veuillez réessayer.')
    } finally {
      isExporting.value = false
    }
  }

  // Fonction d'export CSV (placeholder pour future implémentation)
  const handleCsvExport = (): void => {
    alert('Export CSV - Fonctionnalité à implémenter')
  }

  // Fonction d'export Excel (placeholder pour future implémentation)
  const handleExcelExport = (): void => {
    alert('Export Excel - Fonctionnalité à implémenter')
  }
</script>

<template>
  <div class="reimbursement-section">
    <!-- Aperçu des remboursements par personne -->
    <BaseCard variant="glass" padding="lg" rounded="lg" class="section-card">
      <template #header>
        <h4 class="preview-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          Aperçu des remboursements par personne
          <span v-if="reimbursementData.length === 0" class="preview-badge">
            Aucune assignation
          </span>
          <span v-else class="preview-badge">
            {{ reimbursementData.length }} personne(s)
          </span>
        </h4>
      </template>

      <div v-if="reimbursementData.length === 0" class="no-data-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M8 14s1.5 2 4 2 4-2 4-2" />
          <line x1="9" y1="9" x2="9.01" y2="9" />
          <line x1="15" y1="9" x2="15.01" y2="9" />
        </svg>
        <p>Aucune assignation de dépense trouvée.</p>
        <small>
          Utilisez le gestionnaire des dépenses ci-dessus pour assigner des
          montants aux personnes.
        </small>
      </div>

      <div v-else class="reimbursement-list">
        <div
          v-for="item in reimbursementData"
          :key="item.personId"
          class="reimbursement-item"
        >
          <div class="person-info">
            <div class="person-avatar">
              {{ item.person.charAt(0).toUpperCase() }}
            </div>
            <div class="person-details">
              <span class="person-name">{{ item.person }}</span>
              <span class="person-status" :class="item.status">
                {{ item.status === 'valide' ? 'Validé' : 'En attente' }}
              </span>
            </div>
          </div>
          <div class="amount-info">
            <span class="amount">{{ formatAmount(item.amount) }}</span>
            <BaseButton
              :variant="item.status === 'valide' ? 'success' : 'primary'"
              size="sm"
            >
              {{ item.status === 'valide' ? 'Traité' : 'Valider' }}
            </BaseButton>
          </div>
        </div>
      </div>
    </BaseCard>

    <!-- Détail des remboursements par personne avec catégories -->
    <BaseCard variant="glass" padding="lg" rounded="lg" class="section-card">
      <template #header>
        <h4 class="preview-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <path d="M20 8v6M23 11h-6" />
          </svg>
          Détail par personne avec catégories
          <span
            v-if="detailedReimbursementData.length === 0"
            class="preview-badge"
          >
            Aucune donnée
          </span>
          <span v-else class="preview-badge">
            {{ detailedReimbursementData.length }} personne(s)
          </span>
        </h4>
      </template>

      <div
        v-if="detailedReimbursementData.length === 0"
        class="no-data-message"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="8.5" cy="7" r="4" />
          <path d="M20 8v6M23 11h-6" />
        </svg>
        <p>Aucune assignation avec catégorie trouvée.</p>
        <small>
          Assignez des catégories spécifiques lors de l'association des
          personnes aux dépenses.
        </small>
      </div>

      <div v-else class="detailed-person-list">
        <div
          v-for="personData in detailedReimbursementData"
          :key="personData.personId"
          class="detailed-person-section"
        >
          <div class="person-header">
            <div class="person-info">
              <div class="person-avatar">
                {{ personData.personName.charAt(0).toUpperCase() }}
              </div>
              <div class="person-details">
                <span class="person-name">{{ personData.personName }}</span>
                <span class="person-summary">
                  {{ personData.categories.length }} catégorie(s) •
                  {{ formatAmount(personData.totalAmount) }}
                </span>
              </div>
            </div>
            <div class="person-total">
              <span class="total-amount">
                {{ formatAmount(personData.totalAmount) }}
              </span>
              <BaseButton
                :variant="
                  personData.status === 'valide' ? 'success' : 'primary'
                "
                size="sm"
              >
                {{ personData.status === 'valide' ? 'Traité' : 'Valider' }}
              </BaseButton>
            </div>
          </div>

          <div class="person-categories">
            <div
              v-for="category in personData.categories"
              :key="`${personData.personId}-${category.categoryName}`"
              class="category-detail-item"
            >
              <div
                class="category-header-clickable"
                @click="
                  toggleTransactionDetails(
                    personData.personId,
                    category.categoryName
                  )
                "
              >
                <div class="category-info">
                  <span class="category-label">{{
                    category.categoryName
                  }}</span>
                  <button class="expand-details-btn">
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      :class="{
                        rotated: expandedTransactionDetails.has(
                          `${personData.personId}-${category.categoryName}`
                        ),
                      }"
                    >
                      <polyline points="6,9 12,15 18,9" />
                    </svg>
                  </button>
                </div>
                <span class="category-amount">
                  {{ formatAmount(category.amount) }}
                </span>
              </div>

              <!-- Détails des transactions -->
              <div
                v-show="
                  expandedTransactionDetails.has(
                    `${personData.personId}-${category.categoryName}`
                  )
                "
                class="transaction-details"
              >
                <div
                  v-for="(transaction, index) in getTransactionDetails(
                    personData.personId,
                    category.categoryName
                  )"
                  :key="`${personData.personId}-${category.categoryName}-${index}`"
                  class="transaction-detail-item"
                >
                  <div class="transaction-info">
                    <div class="transaction-date">
                      {{ formatTransactionDate(transaction.date) }}
                    </div>
                    <div class="transaction-description">
                      {{ transaction.description }}
                    </div>
                    <div v-if="transaction.note" class="transaction-note">
                      {{ transaction.note }}
                    </div>
                  </div>
                  <div class="transaction-amounts">
                    <div class="base-amount">
                      Montant: {{ formatAmount(transaction.baseAmount) }}
                    </div>
                    <div class="reimbursement-amount">
                      À rembourser:
                      {{ formatAmount(transaction.reimbursementAmount) }}
                    </div>
                  </div>
                </div>

                <div
                  v-if="
                    getTransactionDetails(
                      personData.personId,
                      category.categoryName
                    ).length === 0
                  "
                  class="no-transactions"
                >
                  Aucune transaction trouvée
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </BaseCard>

    <!-- Aperçu des remboursements par catégorie -->
    <BaseCard variant="glass" padding="lg" rounded="lg" class="section-card">
      <template #header>
        <h4 class="preview-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          Remboursements par catégorie
          <span v-if="categoryTotals.length === 0" class="preview-badge">
            Aucune catégorie
          </span>
          <span v-else class="preview-badge">
            {{ categoryTotals.length }} catégorie(s)
          </span>
        </h4>
      </template>

      <div v-if="categoryTotals.length === 0" class="no-data-message">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
        <p>Aucune donnée de catégorie trouvée.</p>
        <small>
          Les données de catégorie s'afficheront une fois les assignations
          effectuées.
        </small>
      </div>

      <div v-else class="category-list">
        <div
          v-for="categoryData in categoryTotals"
          :key="categoryData.category"
          class="category-section"
        >
          <div class="category-header">
            <div class="category-info">
              <span class="category-name">
                {{ categoryData.category }}
              </span>
              <span class="category-total">
                {{ formatAmount(categoryData.total) }}
              </span>
            </div>
            <button
              class="category-toggle"
              @click="toggleCategory(categoryData.category)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="6,9 12,15 18,9" />
              </svg>
            </button>
          </div>

          <div
            v-show="expandedCategories.has(categoryData.category)"
            class="category-persons"
          >
            <div
              v-for="person in reimbursementDataByCategory.get(
                categoryData.category
              ) || []"
              :key="`${categoryData.category}-${person.personId}`"
              class="category-person-item"
            >
              <div class="person-info">
                <div class="person-avatar small">
                  {{ person.person.charAt(0).toUpperCase() }}
                </div>
                <span class="person-name">{{ person.person }}</span>
              </div>
              <span class="person-amount">
                {{ formatAmount(person.amount) }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </BaseCard>

    <!-- Actions d'export -->
    <BaseCard variant="glass" padding="lg" rounded="lg" class="section-card">
      <template #header>
        <h4 class="actions-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exporter les données
        </h4>
      </template>
      <div class="export-buttons">
        <BaseButton variant="secondary" @click="handleCsvExport">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14,2 14,8 20,8" />
          </svg>
          Exporter en CSV
        </BaseButton>
        <BaseButton
          variant="primary"
          :loading="isExporting"
          @click="handlePdfExport"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14,2 14,8 20,8" />
            <line x1="16" y1="13" x2="8" y2="13" />
            <line x1="16" y1="17" x2="8" y2="17" />
            <polyline points="10,9 9,9 8,9" />
          </svg>
          Exporter en PDF
        </BaseButton>
        <BaseButton variant="secondary" @click="handleExcelExport">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <path d="M9 9h6v6H9z" />
          </svg>
          Exporter en Excel
        </BaseButton>
      </div>
    </BaseCard>
  </div>
</template>

<style scoped>
  .reimbursement-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-card {
    margin-bottom: 0;
  }

  .preview-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .preview-title svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .actions-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0;
  }

  .actions-title svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .preview-badge {
    background: rgba(251, 191, 36, 0.2);
    color: #92400e;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: auto;
  }

  .no-data-message {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
  }

  .no-data-message svg {
    width: 3rem;
    height: 3rem;
    margin: 0 auto 1rem;
    color: #d1d5db;
  }

  .no-data-message p {
    font-weight: 600;
    margin-bottom: 0.5rem;
    color: #374151;
  }

  .no-data-message small {
    font-size: 0.875rem;
    line-height: 1.5;
  }

  .reimbursement-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .reimbursement-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.75rem;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .reimbursement-item:hover {
    background: #f9fafb;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }

  .person-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .person-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 1rem;
  }

  .person-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .person-name {
    font-weight: 600;
    color: #1f2937;
  }

  .person-status {
    font-size: 0.8rem;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .person-status.valide {
    background: rgba(209, 250, 229, 0.8);
    color: #047857;
  }

  .person-status.en_attente {
    background: rgba(254, 243, 199, 0.8);
    color: #92400e;
  }

  .amount-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .amount {
    font-size: 1.125rem;
    font-weight: 700;
    color: #1f2937;
  }

  /* Export buttons */
  .export-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .export-buttons svg {
    width: 1rem;
    height: 1rem;
    margin-right: 0.5rem;
  }

  .detailed-person-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .detailed-person-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    overflow: hidden;
  }

  .person-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem;
    background: #f8fafc;
    border-bottom: 1px solid #e2e8f0;
  }

  .person-summary {
    font-size: 0.875rem;
    color: #64748b;
    font-weight: 500;
  }

  .person-total {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .total-amount {
    font-size: 1.25rem;
    font-weight: 700;
    color: #0f172a;
    background: rgba(236, 253, 245, 0.8);
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid rgba(187, 247, 208, 0.5);
  }

  .person-categories {
    padding: 0;
    background: #fafafa;
  }

  .category-detail-item {
    display: flex;
    flex-direction: column;
    border-bottom: 1px solid #f3f4f6;
    transition: all 0.2s ease;
  }

  .category-detail-item:last-child {
    border-bottom: none;
  }

  .category-header-clickable {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .category-header-clickable:hover {
    background: #f9fafb;
  }

  .category-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .expand-details-btn {
    background: none;
    border: none;
    padding: 0.25rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: #6b7280;
    display: flex;
    align-items: center;
  }

  .expand-details-btn:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .expand-details-btn svg {
    width: 16px;
    height: 16px;
    transition: transform 0.2s ease;
  }

  .expand-details-btn svg.rotated {
    transform: rotate(180deg);
  }

  .transaction-details {
    background: #f8fafc;
    border-top: 1px solid #e2e8f0;
    padding: 0;
  }

  .transaction-detail-item {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #e2e8f0;
    gap: 1rem;
  }

  .transaction-detail-item:last-child {
    border-bottom: none;
  }

  .transaction-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .transaction-date {
    font-size: 0.875rem;
    font-weight: 600;
    color: #4f46e5;
    background: rgba(224, 231, 255, 0.8);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    width: fit-content;
  }

  .transaction-description {
    font-weight: 500;
    color: #1f2937;
    font-size: 0.95rem;
  }

  .transaction-note {
    font-size: 0.875rem;
    color: #6b7280;
    font-style: italic;
    margin-top: 0.25rem;
  }

  .transaction-amounts {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    align-items: flex-end;
  }

  .base-amount {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .reimbursement-amount {
    font-size: 0.95rem;
    font-weight: 600;
    color: #059669;
    background: rgba(209, 250, 229, 0.8);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
  }

  .no-transactions {
    padding: 1rem 1.25rem;
    text-align: center;
    color: #6b7280;
    font-style: italic;
    font-size: 0.875rem;
  }

  .category-label {
    font-weight: 600;
    color: #374151;
    font-size: 0.95rem;
  }

  .category-amount {
    font-weight: 600;
    color: #059669;
    font-size: 1rem;
    background: rgba(209, 250, 229, 0.8);
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
  }

  .category-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .category-section {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    transition: all 0.2s ease;
  }

  .category-section:hover {
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
  }

  .category-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    cursor: pointer;
  }

  .category-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 1rem;
  }

  .category-total {
    font-weight: 700;
    color: #059669;
    font-size: 1.125rem;
    background: rgba(209, 250, 229, 0.8);
    padding: 0.25rem 0.75rem;
    border-radius: 6px;
    margin-left: auto;
  }

  .category-toggle {
    background: none;
    border: none;
    padding: 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.2s ease;
    color: #6b7280;
    margin-left: 1rem;
  }

  .category-toggle:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .category-toggle svg {
    width: 1rem;
    height: 1rem;
    transition: transform 0.2s ease;
  }

  .category-persons {
    padding: 0;
  }

  .category-person-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid #f3f4f6;
    transition: all 0.2s ease;
  }

  .category-person-item:last-child {
    border-bottom: none;
  }

  .category-person-item:hover {
    background: #f9fafb;
  }

  .person-avatar.small {
    width: 2rem;
    height: 2rem;
    font-size: 0.875rem;
  }

  .person-amount {
    font-weight: 600;
    color: #1f2937;
    font-size: 1rem;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .reimbursement-item {
      flex-direction: column;
      align-items: stretch;
      gap: 1rem;
    }

    .amount-info {
      justify-content: space-between;
    }

    .export-buttons {
      flex-direction: column;
    }
  }
</style>

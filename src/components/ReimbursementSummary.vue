<script setup lang="ts">
  import {
    usePdfExport,
    type DetailedReimbursementData,
    type ReimbursementData,
  } from '@/composables/usePdfExport'
  import type { Person, PersonAssignment, ReimbursementCategory } from '@/types'
  import { computed, onMounted, onUnmounted, ref } from 'vue'

  interface Props {
    expensesManagerRef?: {
      expenseAssignments?: Array<{
        transactionId: string
        assignedPersons: PersonAssignment[]
      }>
    } | null
  }

  const props = defineProps<Props>()

  // État pour gérer les catégories expansées
  const expandedCategories = ref(new Set<string>())

  // États réactifs pour les données localStorage
  const availablePersons = ref<Person[]>([])
  const reimbursementCategories = ref<ReimbursementCategory[]>([])

  // Hook pour l'export PDF
  const { exportToPdf } = usePdfExport()

  // État pour gérer le chargement de l'export
  const isExporting = ref(false)

  // Fonction pour basculer l'état d'une catégorie
  const toggleCategory = (category: string) => {
    if (expandedCategories.value.has(category)) {
      expandedCategories.value.delete(category)
    } else {
      expandedCategories.value.add(category)
    }
  }

  // Charger les personnes depuis localStorage
  const loadPersons = () => {
    try {
      const stored = localStorage.getItem('bankin-analyzer-persons')
      if (stored) {
        availablePersons.value = JSON.parse(stored)
      }
    } catch (error) {
      console.error('Erreur lors de la récupération des personnes:', error)
      availablePersons.value = []
    }
  }

  // Charger les catégories depuis localStorage
  const loadCategories = () => {
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
    } catch (_error) {
      console.error('Erreur lors de la récupération des catégories:', _error)
      reimbursementCategories.value = []
    }
  }

  // Gestionnaire pour les changements de localStorage
  const handleStorageChange = (event: StorageEvent) => {
    if (event.key === 'bankin-analyzer-persons' && event.newValue) {
      loadPersons()
    }
    if (
      event.key === 'bankin-analyzer-reimbursement-categories' &&
      event.newValue
    ) {
      loadCategories()
    }
  }

  // Vérification périodique pour synchronisation (fallback)
  const checkForUpdates = () => {
    // Vérifier les personnes
    try {
      const storedPersons = localStorage.getItem('bankin-analyzer-persons')
      if (storedPersons) {
        const parsed = JSON.parse(storedPersons)
        if (JSON.stringify(parsed) !== JSON.stringify(availablePersons.value)) {
          loadPersons()
        }
      }
    } catch (_error) {
      // Ignorer les erreurs de parsing
    }

    // Vérifier les catégories
    try {
      const storedCategories = localStorage.getItem(
        'bankin-analyzer-reimbursement-categories'
      )
      if (storedCategories) {
        const parsed = JSON.parse(storedCategories)
        const currentSerialized = JSON.stringify(
          reimbursementCategories.value.map(cat => ({
            ...cat,
            createdAt: cat.createdAt.toISOString(),
          }))
        )
        if (JSON.stringify(parsed) !== currentSerialized) {
          loadCategories()
        }
      }
    } catch (_error) {
      // Ignorer les erreurs de parsing
    }
  }

  // Initialisation et lifecycle
  onMounted(() => {
    loadPersons()
    loadCategories()
    window.addEventListener('storage', handleStorageChange)

    // Vérification périodique toutes les 500ms
    setInterval(checkForUpdates, 500)
  })

  onUnmounted(() => {
    window.removeEventListener('storage', handleStorageChange)
  })

  // Calcul des remboursements réels par personne
  const reimbursementData = computed<ReimbursementData[]>(() => {
    if (!props.expensesManagerRef?.expenseAssignments) {
      return []
    }

    const assignments = props.expensesManagerRef.expenseAssignments
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
    if (!props.expensesManagerRef?.expenseAssignments) {
      return new Map()
    }

    const assignments = props.expensesManagerRef.expenseAssignments
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
      if (!props.expensesManagerRef?.expenseAssignments) {
        return []
      }

      const assignments = props.expensesManagerRef.expenseAssignments
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
  <div class="reimbursement-section summary-section">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
      Résumé des remboursements
    </h3>
    <div class="section-content">
      <!-- Aperçu des remboursements par personne -->
      <div class="reimbursement-preview">
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
              <span class="amount">{{ item.amount.toFixed(2) }} €</span>
              <button class="action-button" :class="item.status">
                {{ item.status === 'valide' ? 'Traité' : 'Valider' }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Détail des remboursements par personne avec catégories -->
      <div class="detailed-reimbursement">
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
                    {{ personData.totalAmount.toFixed(2) }} €
                  </span>
                </div>
              </div>
              <div class="person-total">
                <span class="total-amount">
                  {{ personData.totalAmount.toFixed(2) }} €
                </span>
                <button class="action-button" :class="personData.status">
                  {{ personData.status === 'valide' ? 'Traité' : 'Valider' }}
                </button>
              </div>
            </div>

            <div class="person-categories">
              <div
                v-for="category in personData.categories"
                :key="`${personData.personId}-${category.categoryName}`"
                class="category-detail-item"
              >
                <div class="category-info">
                  <span class="category-label">{{
                    category.categoryName
                  }}</span>
                </div>
                <span class="category-amount">
                  {{ category.amount.toFixed(2) }} €
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Aperçu des remboursements par catégorie -->
      <div class="reimbursement-by-category">
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
                  {{ categoryData.total.toFixed(2) }} €
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
                  {{ person.amount.toFixed(2) }} €
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Actions d'export -->
      <div class="export-actions">
        <h4 class="actions-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7,10 12,15 17,10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          Exporter les données
        </h4>
        <div class="export-buttons">
          <button class="export-btn csv" @click="handleCsvExport">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              />
              <polyline points="14,2 14,8 20,8" />
            </svg>
            Exporter en CSV
          </button>
          <button class="export-btn pdf" @click="handlePdfExport">
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
          </button>
          <button class="export-btn excel" @click="handleExcelExport">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <path d="M9 9h6v6H9z" />
            </svg>
            Exporter en Excel
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-section {
    background: white;
    border-radius: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid #f3f4f6;
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

  /* Résumé principal */
  .summary-main {
    margin-bottom: 2rem;
  }

  .summary-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
  }

  .summary-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1.5rem;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    background: #f9fafb;
    transition: all 0.3s ease;
  }

  .summary-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .summary-card.total {
    background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
    border-color: #3b82f6;
  }

  .summary-card.reimbursable {
    background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
    border-color: #10b981;
  }

  .summary-card.rate {
    background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
    border-color: #f59e0b;
  }

  .card-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(255, 255, 255, 0.8);
    color: #1f2937;
  }

  .card-icon svg {
    width: 1.5rem;
    height: 1.5rem;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .card-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
  }

  .card-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
  }

  /* Aperçu des remboursements */
  .reimbursement-preview {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .preview-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1.5rem;
  }

  .preview-title svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .preview-badge {
    background: #fbbf24;
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
    padding: 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .reimbursement-item:hover {
    background: #f3f4f6;
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
    background: #d1fae5;
    color: #047857;
  }

  .person-status.en_attente {
    background: #fef3c7;
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

  .action-button {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-button.valide {
    background: #d1fae5;
    color: #047857;
  }

  .action-button.en_attente {
    background: #3b82f6;
    color: white;
  }

  .action-button.en_attente:hover {
    background: #1d4ed8;
  }

  /* Remboursements par catégorie */
  .reimbursement-by-category {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  /* Détail des remboursements par personne avec catégories */
  .detailed-reimbursement {
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
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
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .person-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1.25rem;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
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
    background: #ecfdf5;
    padding: 0.5rem 1rem;
    border-radius: 8px;
    border: 1px solid #bbf7d0;
  }

  .person-categories {
    padding: 0;
    background: #fafafa;
  }

  .category-detail-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 1rem 1.25rem;
    border-bottom: 1px solid #f3f4f6;
    transition: all 0.2s ease;
  }

  .category-detail-item:last-child {
    border-bottom: none;
  }

  .category-detail-item:hover {
    background: #f9fafb;
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
    background: #d1fae5;
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
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
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

  .category-info {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
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
    background: #d1fae5;
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

  /* Actions d'export */
  .export-actions {
    background: #f3f4f6;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .actions-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .actions-title svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .export-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .export-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    background: white;
    color: #374151;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .export-btn:hover {
    background: #f9fafb;
    border-color: #3b82f6;
    color: #3b82f6;
  }

  .export-btn svg {
    width: 1rem;
    height: 1rem;
  }

  /* Fonctionnalités futures */
  .future-features {
    background: #eff6ff;
    border: 2px dashed #3b82f6;
    border-radius: 12px;
    padding: 1.5rem;
  }

  .feature-card {
    text-align: center;
  }

  .feature-icon {
    width: 3rem;
    height: 3rem;
    margin: 0 auto 1rem;
    background: #dbeafe;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #3b82f6;
  }

  .feature-icon svg {
    width: 1.5rem;
    height: 1.5rem;
  }

  .feature-card h5 {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1rem;
  }

  .feature-list {
    list-style: none;
    padding: 0;
    text-align: left;
    max-width: 400px;
    margin: 0 auto;
  }

  .feature-list li {
    padding: 0.5rem 0;
    color: #374151;
    font-size: 0.9rem;
    position: relative;
    padding-left: 1.5rem;
  }

  .feature-list li::before {
    content: '•';
    color: #3b82f6;
    font-weight: bold;
    position: absolute;
    left: 0;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .reimbursement-section {
      background: #1f2937;
      border: 1px solid #374151;
    }

    .section-title {
      color: #f9fafb;
    }

    .summary-card {
      background: #374151;
      border-color: #4b5563;
    }

    .card-label {
      color: #d1d5db;
    }

    .card-value {
      color: #f9fafb;
    }

    .reimbursement-preview {
      background: #374151;
      border-color: #4b5563;
    }

    .preview-title {
      color: #f9fafb;
    }

    .reimbursement-item {
      background: #1f2937;
      border-color: #4b5563;
    }

    .reimbursement-item:hover {
      background: #4b5563;
    }

    .person-name {
      color: #f9fafb;
    }

    .amount {
      color: #f9fafb;
    }

    .export-actions {
      background: #374151;
    }

    .actions-title {
      color: #f9fafb;
    }

    .export-btn {
      background: #1f2937;
      border-color: #4b5563;
      color: #d1d5db;
    }

    .export-btn:hover {
      background: #4b5563;
      border-color: #3b82f6;
      color: #60a5fa;
    }

    .future-features {
      background: #1e3a8a;
      border-color: #3b82f6;
    }

    .feature-card h5 {
      color: #f9fafb;
    }

    .feature-list li {
      color: #d1d5db;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .summary-cards {
      grid-template-columns: 1fr;
    }

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

    .export-btn {
      justify-content: center;
    }

    .feature-list {
      text-align: center;
    }
  }
</style>

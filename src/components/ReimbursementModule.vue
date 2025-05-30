<template>
  <div class="reimbursement-module">
    <!-- En-tête avec statistiques -->
    <div class="module-header">
      <div class="header-content">
        <div class="header-title">
          <h2>
            <i class="fas fa-hand-holding-dollar"></i>
            Module de Remboursement
          </h2>
          <p class="subtitle">
            Gérez vos remboursements et suivez les montants dus
          </p>
        </div>

        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon pending">
              <i class="fas fa-clock"></i>
            </div>
            <div class="stat-content">
              <span class="stat-value">{{
                formatAmount(reimbursementSummary.pendingAmount)
              }}</span>
              <span class="stat-label">En attente</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon reimbursed">
              <i class="fas fa-check-circle"></i>
            </div>
            <div class="stat-content">
              <span class="stat-value">{{
                formatAmount(reimbursementSummary.totalReimbursed)
              }}</span>
              <span class="stat-label">Remboursé</span>
            </div>
          </div>

          <div class="stat-card">
            <div class="stat-icon people">
              <i class="fas fa-users"></i>
            </div>
            <div class="stat-content">
              <span class="stat-value">{{
                reimbursementSummary.peopleCount
              }}</span>
              <span class="stat-label">{{
                reimbursementSummary.peopleCount > 1 ? 'Personnes' : 'Personne'
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Navigation par onglets -->
    <div class="tab-navigation">
      <button
        class="tab-button"
        :class="[{ active: activeTab === 'overview' }]"
        @click="activeTab = 'overview'"
      >
        <i class="fas fa-chart-pie"></i>
        Aperçu
      </button>
      <button
        class="tab-button"
        :class="[{ active: activeTab === 'people' }]"
        @click="activeTab = 'people'"
      >
        <i class="fas fa-users"></i>
        Personnes ({{ people.length }})
      </button>
      <button
        class="tab-button"
        :class="[{ active: activeTab === 'associate' }]"
        @click="activeTab = 'associate'"
      >
        <i class="fas fa-link"></i>
        Associer
      </button>
    </div>

    <!-- Contenu des onglets -->
    <div class="tab-content">
      <!-- Onglet Aperçu -->
      <div v-if="activeTab === 'overview'" class="overview-tab">
        <div v-if="personDebts.length === 0" class="empty-state">
          <i class="fas fa-hand-holding-dollar"></i>
          <h3>Aucun remboursement en cours</h3>
          <p>
            Commencez par ajouter des personnes et associer des transactions
            pour suivre les remboursements.
          </p>
          <button class="cta-button" @click="activeTab = 'people'">
            <i class="fas fa-user-plus"></i>
            Ajouter une personne
          </button>
        </div>

        <div v-else class="debts-overview">
          <h3>
            <i class="fas fa-balance-scale"></i>
            Résumé des remboursements
          </h3>

          <div class="debt-cards">
            <div
              v-for="debt in personDebts"
              :key="debt.personId"
              class="debt-card"
            >
              <div class="debt-header">
                <div class="person-info">
                  <div class="person-avatar">
                    {{ debt.personName.charAt(0).toUpperCase() }}
                  </div>
                  <div class="person-details">
                    <h4>{{ debt.personName }}</h4>
                    <span class="transaction-count">
                      {{ debt.transactionCount }} transaction{{
                        debt.transactionCount > 1 ? 's' : ''
                      }}
                    </span>
                  </div>
                </div>
                <div class="debt-amount">
                  {{ formatAmount(debt.totalAmount) }}
                </div>
              </div>

              <div class="debt-transactions">
                <div
                  v-for="transaction in debt.transactions.slice(0, 3)"
                  :key="transaction.id"
                  class="transaction-preview"
                  :class="{ reimbursed: transaction.isReimbursed }"
                >
                  <div class="transaction-info">
                    <span class="transaction-description">{{
                      transaction.description
                    }}</span>
                    <span class="transaction-date">{{
                      formatDate(transaction.date)
                    }}</span>
                  </div>
                  <div class="transaction-amount">
                    {{ formatAmount(transaction.amount) }}
                    <i
                      v-if="transaction.isReimbursed"
                      class="fas fa-check-circle reimbursed-icon"
                    ></i>
                  </div>
                </div>

                <div
                  v-if="debt.transactions.length > 3"
                  class="more-transactions"
                >
                  +{{ debt.transactions.length - 3 }} autre{{
                    debt.transactions.length - 3 > 1 ? 's' : ''
                  }}
                </div>
              </div>

              <div class="debt-actions">
                <button
                  class="action-button reimbursed"
                  @click="markAllAsReimbursed(debt.personId)"
                >
                  <i class="fas fa-check"></i>
                  Tout marquer comme remboursé
                </button>
                <button
                  class="action-button details"
                  @click="viewPersonDetails(debt.personId)"
                >
                  <i class="fas fa-eye"></i>
                  Détails
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Onglet Gestion des personnes -->
      <div v-if="activeTab === 'people'" class="people-tab">
        <div class="people-header">
          <h3>
            <i class="fas fa-users"></i>
            Gestion des personnes
          </h3>
          <button class="add-button" @click="showAddPersonModal = true">
            <i class="fas fa-user-plus"></i>
            Ajouter une personne
          </button>
        </div>

        <div v-if="people.length === 0" class="empty-state">
          <i class="fas fa-users"></i>
          <h3>Aucune personne ajoutée</h3>
          <p>
            Ajoutez des personnes pour commencer à suivre les remboursements.
          </p>
        </div>

        <div v-else class="people-grid">
          <div v-for="person in people" :key="person.id" class="person-card">
            <div class="person-header">
              <div class="person-avatar large">
                {{ person.name.charAt(0).toUpperCase() }}
              </div>
              <div class="person-info">
                <h4>{{ person.name }}</h4>
                <span v-if="person.email" class="person-email">{{
                  person.email
                }}</span>
                <span class="person-created"
                  >Ajouté le {{ formatDate(person.createdAt) }}</span
                >
              </div>
            </div>

            <div class="person-stats">
              <div class="stat">
                <span class="stat-value">{{ getPersonDebt(person.id) }}</span>
                <span class="stat-label">Dettes</span>
              </div>
              <div class="stat">
                <span class="stat-value">{{
                  getPersonTransactionCount(person.id)
                }}</span>
                <span class="stat-label">Transactions</span>
              </div>
            </div>

            <div class="person-actions">
              <button class="action-button edit" @click="editPerson(person)">
                <i class="fas fa-edit"></i>
                Modifier
              </button>
              <button
                class="action-button delete"
                @click="deletePerson(person.id)"
              >
                <i class="fas fa-trash"></i>
                Supprimer
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Onglet Association de transactions -->
      <div v-if="activeTab === 'associate'" class="associate-tab">
        <div class="associate-header">
          <h3>
            <i class="fas fa-link"></i>
            Associer des transactions
          </h3>
          <p>
            Sélectionnez des dépenses à associer à des personnes pour le
            remboursement.
          </p>
          <div class="association-stats">
            <span class="stat-item">
              <i class="fas fa-link"></i>
              {{ associatedTransactionsCount }} associée(s)
            </span>
            <span class="stat-item">
              <i class="fas fa-unlink"></i>
              {{ availableTransactions.length - associatedTransactionsCount }}
              non associée(s)
            </span>
          </div>
        </div>

        <div v-if="people.length === 0" class="empty-state">
          <i class="fas fa-user-plus"></i>
          <h3>Aucune personne disponible</h3>
          <p>
            Vous devez d'abord ajouter des personnes avant de pouvoir associer
            des transactions.
          </p>
          <button class="cta-button" @click="activeTab = 'people'">
            <i class="fas fa-user-plus"></i>
            Ajouter une personne
          </button>
        </div>

        <div v-else-if="!availableTransactions.length" class="empty-state">
          <i class="fas fa-receipt"></i>
          <h3>Aucune transaction disponible</h3>
          <p>
            Toutes les transactions de dépenses sont déjà associées ou aucune
            donnée n'est chargée.
          </p>
        </div>

        <div v-else class="association-content">
          <div class="filters">
            <div class="filter-group">
              <label>Filtrer par catégorie :</label>
              <select v-model="selectedCategoryFilter">
                <option value="">Toutes les catégories</option>
                <option
                  v-for="category in expenseCategories"
                  :key="category"
                  :value="category"
                >
                  {{ category }}
                </option>
              </select>
            </div>
            <div class="filter-group">
              <label>Statut d'association :</label>
              <select v-model="selectedAssociationFilter">
                <option value="">Toutes les transactions</option>
                <option value="associated">Déjà associées</option>
                <option value="not-associated">Non associées</option>
              </select>
            </div>
            <div class="filter-group">
              <label>Personne :</label>
              <select v-model="selectedPersonForAssociation">
                <option value="">Sélectionner une personne</option>
                <option
                  v-for="person in people"
                  :key="person.id"
                  :value="person.id"
                >
                  {{ person.name }}
                </option>
              </select>
            </div>
          </div>

          <div class="transactions-list">
            <div
              v-for="transaction in filteredAvailableTransactions"
              :key="
                transaction.date + transaction.description + transaction.amount
              "
              class="transaction-item"
              :class="{
                'transaction-associated': isTransactionAssociated(transaction),
              }"
            >
              <div class="transaction-details">
                <div class="transaction-main">
                  <span class="transaction-description">{{
                    transaction.description
                  }}</span>
                  <span class="transaction-category">{{
                    transaction.category
                  }}</span>
                </div>
                <div class="transaction-meta">
                  <span class="transaction-date">{{
                    formatDate(transaction.date)
                  }}</span>
                  <span class="transaction-account">{{
                    transaction.account
                  }}</span>
                </div>
                <div v-if="transaction.note" class="transaction-note">
                  <i class="fas fa-sticky-note"></i>
                  {{ transaction.note }}
                </div>
              </div>

              <div class="transaction-amount">
                {{ formatAmount(Math.abs(transaction.amount)) }}
              </div>

              <div class="transaction-actions">
                <!-- Si la transaction est déjà associée -->
                <div
                  v-if="isTransactionAssociated(transaction)"
                  class="associated-info"
                >
                  <div class="associated-person">
                    <i class="fas fa-link"></i>
                    <span>Associé à :</span>
                    <strong>{{
                      getAssociatedPerson(transaction)?.name ||
                      'Personne inconnue'
                    }}</strong>
                  </div>
                  <button
                    title="Dissocier cette transaction"
                    class="dissociate-button"
                    @click="dissociateTransaction(transaction)"
                  >
                    <i class="fas fa-unlink"></i>
                    Dissocier
                  </button>
                </div>

                <!-- Si la transaction n'est pas associée -->
                <div v-else class="association-controls">
                  <select
                    v-model="
                      transactionAssociations[getTransactionKey(transaction)]
                    "
                    class="person-select"
                  >
                    <option value="">Sélectionner une personne</option>
                    <option
                      v-for="person in people"
                      :key="person.id"
                      :value="person.id"
                    >
                      {{ person.name }}
                    </option>
                  </select>

                  <button
                    :disabled="
                      !transactionAssociations[getTransactionKey(transaction)]
                    "
                    class="associate-button"
                    @click="associateTransactionToPerson(transaction)"
                  >
                    <i class="fas fa-link"></i>
                    Associer
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal d'ajout/modification de personne -->
    <div
      v-if="showAddPersonModal || editingPerson"
      class="modal-overlay"
      @click="closePersonModal"
    >
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>
            <i class="fas fa-user"></i>
            {{
              editingPerson ? 'Modifier la personne' : 'Ajouter une personne'
            }}
          </h3>
          <button class="close-button" @click="closePersonModal">
            <i class="fas fa-times"></i>
          </button>
        </div>

        <form class="person-form" @submit.prevent="savePerson">
          <div class="form-group">
            <label for="personName">Nom complet *</label>
            <input
              id="personName"
              v-model="personForm.name"
              type="text"
              required
              placeholder="Ex: Jean Dupont"
              class="form-input"
            />
          </div>

          <div class="form-group">
            <label for="personEmail">Email (optionnel)</label>
            <input
              id="personEmail"
              v-model="personForm.email"
              type="email"
              placeholder="Ex: jean.dupont@email.com"
              class="form-input"
            />
          </div>

          <div class="form-actions">
            <button
              type="button"
              class="cancel-button"
              @click="closePersonModal"
            >
              Annuler
            </button>
            <button type="submit" class="save-button">
              <i class="fas fa-save"></i>
              {{ editingPerson ? 'Mettre à jour' : 'Ajouter' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { useReimbursement } from '@/composables/useReimbursement'
  import type { Person, Transaction } from '@/types'
  import { computed, ref, watch } from 'vue'

  interface Props {
    transactions?: Transaction[]
  }

  const props = withDefaults(defineProps<Props>(), {
    transactions: () => [],
  })

  // Composable de remboursement
  const {
    people,
    reimbursementSummary,
    personDebts,
    addPerson,
    updatePerson,
    deletePerson: deletePersonAction,
    associateTransaction,
    markAsReimbursed,
    formatAmount,
    isTransactionAssociated,
    getTransactionAssociation,
    removeAssociation,
  } = useReimbursement()

  // État de l'interface
  const activeTab = ref<'overview' | 'people' | 'associate'>('overview')
  const showAddPersonModal = ref(false)
  const editingPerson = ref<Person | null>(null)
  const selectedCategoryFilter = ref('')
  const selectedAssociationFilter = ref('')
  const selectedPersonForAssociation = ref('')

  // Formulaire de personne
  const personForm = ref({
    name: '',
    email: '',
  })

  // État des associations de transactions
  const transactionAssociations = ref<Record<string, string>>({})

  /**
   * Transactions disponibles pour association (toutes les dépenses)
   */
  const availableTransactions = computed(() => {
    return props.transactions.filter(
      t => t.type === 'expense' && t.amount < 0 // Toutes les dépenses négatives
    )
  })

  /**
   * Catégories de dépenses pour le filtre
   */
  const expenseCategories = computed(() => {
    const categories = new Set(availableTransactions.value.map(t => t.category))
    return Array.from(categories).sort()
  })

  /**
   * Nombre de transactions associées
   */
  const associatedTransactionsCount = computed(() => {
    return availableTransactions.value.filter(t => isTransactionAssociated(t))
      .length
  })

  /**
   * Transactions filtrées pour l'association
   */
  const filteredAvailableTransactions = computed(() => {
    let filtered = availableTransactions.value

    // Filtre par catégorie
    if (selectedCategoryFilter.value) {
      filtered = filtered.filter(
        t => t.category === selectedCategoryFilter.value
      )
    }

    // Filtre par statut d'association
    if (selectedAssociationFilter.value === 'associated') {
      filtered = filtered.filter(t => isTransactionAssociated(t))
    } else if (selectedAssociationFilter.value === 'not-associated') {
      filtered = filtered.filter(t => !isTransactionAssociated(t))
    }

    return filtered.slice(0, 50) // Limiter à 50 pour les performances
  })

  /**
   * Génère une clé unique pour une transaction
   */
  const getTransactionKey = (transaction: Transaction): string => {
    return transaction.date + transaction.description + transaction.amount
  }

  /**
   * Obtient la personne associée à une transaction
   */
  const getAssociatedPerson = (transaction: Transaction): Person | null => {
    const association = getTransactionAssociation(transaction)
    if (!association) return null

    return people.value.find(p => p.id === association.personId) || null
  }

  /**
   * Obtient le montant de dette d'une personne
   */
  const getPersonDebt = (personId: string): string => {
    const debt = personDebts.value.find(d => d.personId === personId)
    return debt ? formatAmount(debt.totalAmount) : formatAmount(0)
  }

  /**
   * Obtient le nombre de transactions d'une personne
   */
  const getPersonTransactionCount = (personId: string): number => {
    const debt = personDebts.value.find(d => d.personId === personId)
    return debt ? debt.transactionCount : 0
  }

  /**
   * Formate une date
   */
  const formatDate = (dateString: string): string => {
    try {
      return new Date(dateString).toLocaleDateString('fr-FR')
    } catch {
      return dateString
    }
  }

  /**
   * Ouvre le modal d'édition de personne
   */
  const editPerson = (person: Person) => {
    editingPerson.value = person
    personForm.value = {
      name: person.name,
      email: person.email || '',
    }
  }

  /**
   * Ferme le modal de personne
   */
  const closePersonModal = () => {
    showAddPersonModal.value = false
    editingPerson.value = null
    personForm.value = {
      name: '',
      email: '',
    }
  }

  /**
   * Sauvegarde une personne (ajout ou modification)
   */
  const savePerson = () => {
    if (!personForm.value.name.trim()) return

    if (editingPerson.value) {
      // Modification
      const updateData: Partial<Pick<Person, 'name' | 'email' | 'avatar'>> = {
        name: personForm.value.name,
      }

      if (personForm.value.email) {
        updateData.email = personForm.value.email
      }

      updatePerson(editingPerson.value.id, updateData)
    } else {
      // Ajout
      addPerson(personForm.value.name, personForm.value.email || undefined)
    }

    closePersonModal()
  }

  /**
   * Supprime une personne
   */
  const deletePerson = (personId: string) => {
    if (
      confirm(
        'Êtes-vous sûr de vouloir supprimer cette personne ? Toutes ses transactions associées seront également supprimées.'
      )
    ) {
      deletePersonAction(personId)
    }
  }

  /**
   * Associe une transaction à une personne
   */
  const associateTransactionToPerson = (transaction: Transaction) => {
    const transactionKey = getTransactionKey(transaction)
    const personId = transactionAssociations.value[transactionKey]

    if (!personId) return

    try {
      associateTransaction(transaction, personId)

      // Réinitialiser l'association
      delete transactionAssociations.value[transactionKey]

      // Message de succès (optionnel - pourrait être remplacé par une notification)
      console.log('Transaction associée avec succès')
    } catch (error) {
      console.error("Erreur lors de l'association:", error)
      alert("Erreur lors de l'association de la transaction")
    }
  }

  /**
   * Dissocie une transaction d'une personne
   */
  const dissociateTransaction = (transaction: Transaction) => {
    const association = getTransactionAssociation(transaction)
    if (!association) return

    const person = people.value.find(p => p.id === association.personId)
    const personName = person?.name || 'Personne inconnue'

    if (
      confirm(
        `Êtes-vous sûr de vouloir dissocier cette transaction de "${personName}" ?`
      )
    ) {
      try {
        removeAssociation(association.id)
        console.log('Transaction dissociée avec succès')
      } catch (error) {
        console.error('Erreur lors de la dissociation:', error)
        alert('Erreur lors de la dissociation de la transaction')
      }
    }
  }

  /**
   * Marque toutes les transactions d'une personne comme remboursées
   */
  const markAllAsReimbursed = (personId: string) => {
    const debt = personDebts.value.find(d => d.personId === personId)
    if (!debt) return

    const pendingTransactions = debt.transactions.filter(t => !t.isReimbursed)

    if (pendingTransactions.length === 0) {
      alert('Toutes les transactions sont déjà marquées comme remboursées.')
      return
    }

    if (
      confirm(
        `Marquer ${pendingTransactions.length} transaction(s) comme remboursée(s) ?`
      )
    ) {
      pendingTransactions.forEach(transaction => {
        markAsReimbursed(transaction.id, true)
      })
    }
  }

  /**
   * Affiche les détails d'une personne (à implémenter)
   */
  const viewPersonDetails = (personId: string) => {
    // TODO: Implémenter la vue détaillée d'une personne
    console.log('Voir détails de la personne:', personId)
  }

  // Pré-sélectionner la personne dans les filtres si une seule personne
  watch(
    [people],
    () => {
      if (
        people.value.length === 1 &&
        !selectedPersonForAssociation.value &&
        people.value[0]
      ) {
        selectedPersonForAssociation.value = people.value[0].id
      }
    },
    { immediate: true }
  )

  // Pré-remplir les associations si une personne est sélectionnée
  watch([selectedPersonForAssociation], () => {
    if (selectedPersonForAssociation.value) {
      filteredAvailableTransactions.value.forEach(transaction => {
        const key = getTransactionKey(transaction)
        if (!transactionAssociations.value[key]) {
          transactionAssociations.value[key] =
            selectedPersonForAssociation.value
        }
      })
    }
  })
</script>

<style scoped>
  .reimbursement-module {
    padding: 2rem;
    max-width: 1400px;
    margin: 0 auto;
  }

  /* En-tête */
  .module-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 16px;
    padding: 2rem;
    color: white;
    margin-bottom: 2rem;
  }

  .header-content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .header-title h2 {
    margin: 0;
    font-size: 2rem;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .subtitle {
    margin: 0.5rem 0 0 0;
    opacity: 0.9;
    font-size: 1.1rem;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.15);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .stat-icon {
    width: 50px;
    height: 50px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
  }

  .stat-icon.pending {
    background: #ff6b6b;
  }
  .stat-icon.reimbursed {
    background: #51cf66;
  }
  .stat-icon.people {
    background: #4c6ef5;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
  }

  .stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1;
  }

  .stat-label {
    font-size: 0.9rem;
    opacity: 0.8;
    margin-top: 0.25rem;
  }

  /* Navigation par onglets */
  .tab-navigation {
    display: flex;
    background: #f8f9fa;
    border-radius: 12px;
    padding: 0.5rem;
    margin-bottom: 2rem;
    gap: 0.5rem;
  }

  .tab-button {
    flex: 1;
    padding: 1rem 1.5rem;
    border: none;
    border-radius: 8px;
    background: transparent;
    cursor: pointer;
    transition: all 0.3s ease;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .tab-button:hover {
    background: rgba(102, 126, 234, 0.1);
  }

  .tab-button.active {
    background: #667eea;
    color: white;
  }

  /* Contenu des onglets */
  .tab-content {
    min-height: 400px;
  }

  /* État vide */
  .empty-state {
    text-align: center;
    padding: 4rem 2rem;
    color: #6c757d;
  }

  .empty-state i {
    font-size: 4rem;
    margin-bottom: 1rem;
    opacity: 0.5;
  }

  .empty-state h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
  }

  .empty-state p {
    margin: 0 0 2rem 0;
    font-size: 1.1rem;
  }

  .cta-button {
    background: #667eea;
    color: white;
    border: none;
    padding: 1rem 2rem;
    border-radius: 12px;
    font-size: 1rem;
    cursor: pointer;
    transition: transform 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .cta-button:hover {
    transform: translateY(-2px);
  }

  /* Aperçu des dettes */
  .debts-overview h3 {
    margin-bottom: 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #495057;
  }

  .debt-cards {
    display: grid;
    gap: 1.5rem;
  }

  .debt-card {
    background: white;
    border-radius: 16px;
    border: 1px solid #e9ecef;
    overflow: hidden;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .debt-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  }

  .debt-header {
    padding: 1.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: #f8f9fa;
  }

  .person-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .person-avatar {
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: #667eea;
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 1.2rem;
  }

  .person-avatar.large {
    width: 60px;
    height: 60px;
    font-size: 1.5rem;
  }

  .person-details h4 {
    margin: 0;
    font-size: 1.2rem;
    color: #495057;
  }

  .transaction-count {
    color: #6c757d;
    font-size: 0.9rem;
  }

  .debt-amount {
    font-size: 1.5rem;
    font-weight: 700;
    color: #dc3545;
  }

  .debt-transactions {
    padding: 1rem 1.5rem;
  }

  .transaction-preview {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f1f3f4;
  }

  .transaction-preview:last-child {
    border-bottom: none;
  }

  .transaction-preview.reimbursed {
    opacity: 0.6;
  }

  .transaction-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .transaction-description {
    font-weight: 500;
    color: #495057;
  }

  .transaction-date {
    font-size: 0.85rem;
    color: #6c757d;
  }

  .transaction-amount {
    font-weight: 600;
    color: #dc3545;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .reimbursed-icon {
    color: #28a745;
  }

  .more-transactions {
    padding: 0.5rem 0;
    text-align: center;
    color: #6c757d;
    font-style: italic;
    font-size: 0.9rem;
  }

  .debt-actions {
    padding: 1rem 1.5rem;
    background: #f8f9fa;
    display: flex;
    gap: 1rem;
  }

  .action-button {
    flex: 1;
    padding: 0.75rem 1rem;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    font-weight: 500;
  }

  .action-button.reimbursed {
    background: #d4edda;
    color: #155724;
  }

  .action-button.reimbursed:hover {
    background: #c3e6cb;
  }

  .action-button.details {
    background: #d1ecf1;
    color: #0c5460;
  }

  .action-button.details:hover {
    background: #bee5eb;
  }

  .action-button.edit {
    background: #fff3cd;
    color: #856404;
  }

  .action-button.edit:hover {
    background: #ffeaa7;
  }

  .action-button.delete {
    background: #f8d7da;
    color: #721c24;
  }

  .action-button.delete:hover {
    background: #f5c6cb;
  }

  /* Gestion des personnes */
  .people-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 2rem;
  }

  .people-header h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #495057;
  }

  .add-button {
    background: #28a745;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 12px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 500;
  }

  .add-button:hover {
    background: #218838;
  }

  .people-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
  }

  .person-card {
    background: white;
    border-radius: 16px;
    border: 1px solid #e9ecef;
    padding: 1.5rem;
    transition:
      transform 0.2s ease,
      box-shadow 0.2s ease;
  }

  .person-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.1);
  }

  .person-header {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-bottom: 1rem;
  }

  .person-info h4 {
    margin: 0;
    color: #495057;
  }

  .person-email {
    color: #6c757d;
    font-size: 0.9rem;
    display: block;
    margin-top: 0.25rem;
  }

  .person-created {
    color: #adb5bd;
    font-size: 0.8rem;
    display: block;
    margin-top: 0.25rem;
  }

  .person-stats {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .stat {
    flex: 1;
    text-align: center;
  }

  .stat .stat-value {
    display: block;
    font-weight: 700;
    color: #495057;
  }

  .stat .stat-label {
    font-size: 0.8rem;
    color: #6c757d;
    margin-top: 0.25rem;
  }

  .person-actions {
    display: flex;
    gap: 1rem;
  }

  /* Association de transactions */
  .associate-header {
    margin-bottom: 2rem;
  }

  .associate-header h3 {
    margin: 0 0 0.5rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #495057;
  }

  .associate-header p {
    margin: 0;
    color: #6c757d;
  }

  .association-stats {
    display: flex;
    gap: 1.5rem;
    margin-top: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #495057;
  }

  .stat-item i {
    color: #667eea;
  }

  .association-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .filters {
    display: flex;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .filter-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 200px;
  }

  .filter-group label {
    font-weight: 500;
    color: #495057;
  }

  .filter-group select,
  .form-input {
    padding: 0.75rem;
    border: 1px solid #ced4da;
    border-radius: 8px;
    font-size: 1rem;
    transition: border-color 0.2s ease;
  }

  .filter-group select:focus,
  .form-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .transactions-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .transaction-item {
    background: white;
    border: 1px solid #e9ecef;
    border-radius: 12px;
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    transition: all 0.2s ease;
  }

  .transaction-item:hover {
    border-color: #667eea;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.1);
  }

  .transaction-associated {
    border-color: #28a745 !important;
    background: #f8fff9 !important;
  }

  .transaction-associated:hover {
    border-color: #1e7e34 !important;
    box-shadow: 0 2px 8px rgba(40, 167, 69, 0.15) !important;
  }

  .transaction-details {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .transaction-main {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .transaction-description {
    font-weight: 500;
    color: #495057;
  }

  .transaction-category {
    font-size: 0.9rem;
    color: #667eea;
    background: rgba(102, 126, 234, 0.1);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    width: fit-content;
  }

  .transaction-meta {
    display: flex;
    gap: 1rem;
    font-size: 0.85rem;
    color: #6c757d;
  }

  .transaction-note {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.9rem;
    color: #6c757d;
    background: #f8f9fa;
    padding: 0.5rem;
    border-radius: 6px;
  }

  .transaction-amount {
    font-size: 1.25rem;
    font-weight: 700;
    color: #dc3545;
    min-width: 120px;
    text-align: right;
  }

  .transaction-actions {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .person-select {
    min-width: 150px;
    padding: 0.5rem;
    border: 1px solid #ced4da;
    border-radius: 6px;
  }

  .associate-button {
    background: #667eea;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .associate-button:hover:not(:disabled) {
    background: #5a6fd8;
  }

  .associate-button:disabled {
    background: #6c757d;
    cursor: not-allowed;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    width: 90%;
    max-width: 500px;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    padding: 1.5rem;
    border-bottom: 1px solid #e9ecef;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .modal-header h3 {
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #495057;
  }

  .close-button {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #6c757d;
    transition: color 0.2s ease;
  }

  .close-button:hover {
    color: #495057;
  }

  .person-form {
    padding: 1.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    margin-bottom: 0.5rem;
    font-weight: 500;
    color: #495057;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 2rem;
  }

  .cancel-button {
    background: #6c757d;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s ease;
  }

  .cancel-button:hover {
    background: #5a6268;
  }

  .save-button {
    background: #28a745;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .save-button:hover {
    background: #218838;
  }

  /* Styles pour les transactions associées */
  .transaction-associated {
    background: #f8f9fa;
    border-left: 4px solid #28a745;
  }

  .associated-info {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .associated-person {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #d4edda;
    border-radius: 6px;
    font-size: 0.9rem;
  }

  .associated-person i {
    color: #28a745;
  }

  .associated-person strong {
    color: #155724;
  }

  .dissociate-button {
    background: #dc3545;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.85rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dissociate-button:hover {
    background: #c82333;
  }

  .association-controls {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .reimbursement-module {
      padding: 1rem;
    }

    .header-content {
      flex-direction: column;
    }

    .stats-grid {
      grid-template-columns: 1fr;
    }

    .tab-navigation {
      flex-direction: column;
    }

    .debt-header {
      flex-direction: column;
      gap: 1rem;
      align-items: flex-start;
    }

    .debt-actions {
      flex-direction: column;
    }

    .people-grid {
      grid-template-columns: 1fr;
    }

    .filters {
      flex-direction: column;
    }

    .transaction-item {
      flex-direction: column;
      align-items: flex-start;
    }

    .transaction-actions {
      width: 100%;
      justify-content: space-between;
    }

    .person-select {
      flex: 1;
    }
  }
</style>

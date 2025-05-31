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
      <button
        class="tab-button"
        :class="[{ active: activeTab === 'shared' }]"
        @click="activeTab = 'shared'"
      >
        <i class="fas fa-users"></i>
        Partage ({{ sharedAssociations.length }})
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
                    <span
                      v-if="isCustomAmountTransaction(transaction)"
                      class="custom-amount-indicator"
                      title="Montant personnalisé"
                    >
                      <i class="fas fa-edit"></i>
                    </span>
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
                    <span
                      v-if="hasCustomAmount(transaction)"
                      class="custom-amount-badge"
                      title="Montant personnalisé"
                    >
                      <i class="fas fa-edit"></i>
                      Montant personnalisé
                    </span>
                  </div>
                  <div class="associated-actions">
                    <button
                      title="Modifier le montant de remboursement"
                      class="edit-amount-button"
                      @click="editTransactionAmount(transaction)"
                    >
                      <i class="fas fa-edit"></i>
                      Modifier montant
                    </button>
                    <button
                      title="Dissocier cette transaction"
                      class="dissociate-button"
                      @click="dissociateTransaction(transaction)"
                    >
                      <i class="fas fa-unlink"></i>
                      Dissocier
                    </button>
                  </div>
                </div>

                <!-- Si la transaction n'est pas associée -->
                <div v-else class="association-controls">
                  <div class="association-inputs">
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

                    <div class="amount-input-group">
                      <label class="amount-label">Montant à rembourser :</label>
                      <input
                        v-model.number="
                          customAmounts[getTransactionKey(transaction)]
                        "
                        type="number"
                        step="0.01"
                        min="0"
                        :max="Math.abs(transaction.amount)"
                        :placeholder="`${Math.abs(transaction.amount).toFixed(2)} €`"
                        class="amount-input"
                        @focus="initializeCustomAmount(transaction)"
                      />
                      <span class="original-amount">
                        sur {{ formatAmount(Math.abs(transaction.amount)) }}
                      </span>

                      <!-- Boutons de division rapide -->
                      <div class="division-controls">
                        <button
                          type="button"
                          class="division-button"
                          title="Diviser par 2"
                          @click="divideAmount(transaction, 2)"
                        >
                          ÷ 2
                        </button>
                        <button
                          type="button"
                          class="division-button"
                          title="Division personnalisée"
                          @click="showCustomDivision(transaction)"
                        >
                          ÷ N
                        </button>
                        <button
                          type="button"
                          class="division-button reset"
                          title="Remettre le montant original"
                          @click="resetToOriginalAmount(transaction)"
                        >
                          ↺
                        </button>
                      </div>
                    </div>
                  </div>

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

      <!-- Onglet Partage -->
      <div v-if="activeTab === 'shared'" class="shared-tab">
        <div class="shared-header">
          <h3>
            <i class="fas fa-users"></i>
            Associations partagées
          </h3>
          <p>Gérez les transactions partagées entre plusieurs personnes.</p>
          <div class="shared-stats">
            <span class="stat-item">
              <i class="fas fa-users"></i>
              {{ sharedAssociations.length }} association(s) partagée(s)
            </span>
          </div>
        </div>

        <div v-if="people.length === 0" class="empty-state">
          <i class="fas fa-user-plus"></i>
          <h3>Aucune personne disponible</h3>
          <p>
            Vous devez d'abord ajouter des personnes avant de pouvoir créer des
            associations partagées.
          </p>
          <button class="cta-button" @click="activeTab = 'people'">
            <i class="fas fa-user-plus"></i>
            Ajouter une personne
          </button>
        </div>

        <div v-else class="shared-content">
          <!-- Création d'une nouvelle association partagée -->
          <div class="create-shared-section">
            <h4>
              <i class="fas fa-plus"></i>
              Créer une association partagée
            </h4>

            <div
              v-if="!selectedTransactionForSharing"
              class="transaction-selector"
            >
              <p>Sélectionnez une transaction à partager :</p>
              <div class="available-transactions">
                <div
                  v-for="transaction in availableTransactions.filter(
                    t => !isTransactionAssociated(t)
                  )"
                  :key="getTransactionKey(transaction)"
                  class="transaction-item selectable"
                  @click="selectTransactionForSharing(transaction)"
                >
                  <div class="transaction-info">
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
                  </div>
                  <div class="transaction-amount">
                    {{ formatAmount(Math.abs(transaction.amount)) }}
                  </div>
                </div>
              </div>
            </div>

            <div v-else class="sharing-form">
              <div class="selected-transaction">
                <h5>Transaction sélectionnée :</h5>
                <div class="transaction-item">
                  <div class="transaction-info">
                    <span class="transaction-description">{{
                      selectedTransactionForSharing.description
                    }}</span>
                    <span class="transaction-category">{{
                      selectedTransactionForSharing.category
                    }}</span>
                  </div>
                  <div class="transaction-amount">
                    {{
                      formatAmount(
                        Math.abs(selectedTransactionForSharing.amount)
                      )
                    }}
                  </div>
                </div>
              </div>

              <div class="people-sharing">
                <h5>Répartition entre les personnes :</h5>
                <div class="people-list">
                  <div
                    v-for="person in people"
                    :key="person.id"
                    class="person-sharing-item"
                  >
                    <div class="person-info">
                      <input
                        :id="`person-${person.id}`"
                        v-model="selectedPeopleForSharing[person.id]"
                        type="checkbox"
                        @change="updatePersonSharing(person.id)"
                      />
                      <label :for="`person-${person.id}`" class="person-name">
                        {{ person.name }}
                      </label>
                    </div>
                    <div
                      v-if="selectedPeopleForSharing[person.id]"
                      class="person-amount"
                    >
                      <input
                        v-model.number="peopleAmounts[person.id]"
                        type="number"
                        step="0.01"
                        min="0"
                        :max="Math.abs(selectedTransactionForSharing.amount)"
                        class="amount-input"
                        placeholder="Montant"
                      />
                      <span class="currency">€</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="sharing-controls">
                <div class="quick-split">
                  <button
                    type="button"
                    class="quick-split-button"
                    @click="createEqualSplitForSelected"
                  >
                    <i class="fas fa-equals"></i>
                    Répartition égale
                  </button>
                </div>

                <div class="total-validation">
                  <span class="total-label">Total réparti :</span>
                  <span
                    class="total-amount"
                    :class="{ invalid: !isValidSharing }"
                  >
                    {{ formatAmount(getTotalSharedAmount()) }}
                  </span>
                  <span class="total-max"
                    >/
                    {{
                      formatAmount(
                        Math.abs(selectedTransactionForSharing.amount)
                      )
                    }}</span
                  >
                </div>
              </div>

              <div class="form-actions">
                <button
                  type="button"
                  class="cancel-button"
                  @click="cancelSharing"
                >
                  Annuler
                </button>
                <button
                  type="button"
                  class="create-button"
                  :disabled="!isValidSharing || getSelectedPeopleCount() === 0"
                  @click="createSharedAssociation"
                >
                  <i class="fas fa-users"></i>
                  Créer l'association
                </button>
              </div>
            </div>
          </div>

          <!-- Liste des associations partagées existantes -->
          <div
            v-if="sharedAssociations.length > 0"
            class="existing-shared-section"
          >
            <h4>
              <i class="fas fa-list"></i>
              Associations partagées existantes
            </h4>

            <div class="shared-associations-list">
              <div
                v-for="association in sharedAssociations"
                :key="association.id"
                class="shared-association-card"
              >
                <div class="association-header">
                  <div class="association-info">
                    <h5>{{ association.description }}</h5>
                    <span class="association-category">{{
                      association.category
                    }}</span>
                    <span class="association-date">{{
                      formatDate(association.date)
                    }}</span>
                  </div>
                  <div class="association-total">
                    {{ formatAmount(association.totalAmount) }}
                  </div>
                </div>

                <div class="association-people">
                  <div
                    v-for="personAssoc in association.people"
                    :key="personAssoc.personId"
                    class="person-association"
                    :class="{ reimbursed: personAssoc.isReimbursed }"
                  >
                    <div class="person-details">
                      <span class="person-name">
                        {{
                          people.find(p => p.id === personAssoc.personId)
                            ?.name || 'Personne inconnue'
                        }}
                      </span>
                      <span v-if="personAssoc.note" class="person-note">
                        {{ personAssoc.note }}
                      </span>
                    </div>
                    <div class="person-amount">
                      {{ formatAmount(personAssoc.amount) }}
                    </div>
                    <div class="person-actions">
                      <button
                        v-if="!personAssoc.isReimbursed"
                        class="reimburse-button"
                        @click="
                          markPersonAsReimbursed(
                            association.id,
                            personAssoc.personId
                          )
                        "
                      >
                        <i class="fas fa-check"></i>
                        Remboursé
                      </button>
                      <span v-else class="reimbursed-badge">
                        <i class="fas fa-check-circle"></i>
                        Remboursé
                      </span>
                    </div>
                  </div>
                </div>

                <div class="association-actions">
                  <button
                    class="delete-association-button"
                    @click="deleteSharedAssociation(association.id)"
                  >
                    <i class="fas fa-trash"></i>
                    Supprimer l'association
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
  import type { Person, ReimbursementTransaction, Transaction } from '@/types'
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
    sharedAssociations,
    addPerson,
    updatePerson,
    deletePerson: deletePersonAction,
    associateTransaction,
    associateSharedTransaction,
    markAsReimbursed,
    markSharedAssociationAsReimbursed,
    removeAssociation,
    removeSharedAssociation,
    formatAmount,
    isTransactionAssociated,
    getTransactionAssociation,
  } = useReimbursement()

  // État de l'interface
  const activeTab = ref<'overview' | 'people' | 'associate' | 'shared'>(
    'overview'
  )
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

  // État des montants personnalisés pour chaque transaction
  const customAmounts = ref<Record<string, number>>({})

  // État pour les associations partagées
  const selectedTransactionForSharing = ref<Transaction | null>(null)
  const selectedPeopleForSharing = ref<Record<string, boolean>>({})
  const peopleAmounts = ref<Record<string, number>>({})

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

    // Récupérer le montant personnalisé ou utiliser le montant original
    const customAmount = customAmounts.value[transactionKey]
    const amountToAssociate =
      customAmount && customAmount > 0
        ? customAmount
        : Math.abs(transaction.amount)

    // Validation du montant
    const maxAmount = Math.abs(transaction.amount)

    if (amountToAssociate <= 0) {
      alert('Le montant doit être supérieur à 0 €')
      return
    }

    if (amountToAssociate > maxAmount) {
      alert(`Le montant ne peut pas dépasser ${formatAmount(maxAmount)}`)
      return
    }

    // Vérification de montant raisonnable (au moins 1 centime)
    if (amountToAssociate < 0.01) {
      alert('Le montant minimum est de 0,01 €')
      return
    }

    try {
      associateTransaction(transaction, personId, amountToAssociate)

      // Réinitialiser les associations et montants
      delete transactionAssociations.value[transactionKey]
      delete customAmounts.value[transactionKey]

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

  /**
   * Initialise le montant personnalisé avec le montant original de la transaction
   */
  const initializeCustomAmount = (transaction: Transaction) => {
    const transactionKey = getTransactionKey(transaction)
    if (!customAmounts.value[transactionKey]) {
      customAmounts.value[transactionKey] = Math.abs(transaction.amount)
    }
  }

  /**
   * Vérifie si une transaction a un montant personnalisé
   */
  const hasCustomAmount = (transaction: Transaction): boolean => {
    const association = getTransactionAssociation(transaction)
    if (!association) return false

    const originalAmount = Math.abs(transaction.amount)
    return association.amount !== originalAmount
  }

  /**
   * Obtient la transaction originale à partir d'une transaction de remboursement
   */
  const getOriginalTransaction = (
    reimbursementTransaction: ReimbursementTransaction
  ): Transaction | null => {
    return (
      props.transactions.find(t => {
        const transactionId = t.date + t.description + t.amount
        return transactionId === reimbursementTransaction.transactionId
      }) || null
    )
  }

  /**
   * Vérifie si une transaction de remboursement a un montant personnalisé
   */
  const isCustomAmountTransaction = (
    reimbursementTransaction: ReimbursementTransaction
  ): boolean => {
    const originalTransaction = getOriginalTransaction(reimbursementTransaction)
    if (!originalTransaction) return false

    const originalAmount = Math.abs(originalTransaction.amount)
    return reimbursementTransaction.amount !== originalAmount
  }

  /**
   * Permet de modifier le montant d'une transaction déjà associée
   */
  const editTransactionAmount = (transaction: Transaction) => {
    const association = getTransactionAssociation(transaction)
    if (!association) return

    const originalAmount = Math.abs(transaction.amount)
    const currentAmount = association.amount

    const newAmountStr = prompt(
      `Modifier le montant de remboursement :\n\nMontant original : ${formatAmount(originalAmount)}\nMontant actuel : ${formatAmount(currentAmount)}\n\nNouveau montant (en euros) :`,
      currentAmount.toString()
    )

    if (newAmountStr === null) return // Annulé

    const newAmount = parseFloat(newAmountStr)

    if (isNaN(newAmount) || newAmount <= 0) {
      alert('Veuillez saisir un montant valide supérieur à 0')
      return
    }

    if (newAmount > originalAmount) {
      alert(`Le montant ne peut pas dépasser ${formatAmount(originalAmount)}`)
      return
    }

    if (newAmount < 0.01) {
      alert('Le montant minimum est de 0,01 €')
      return
    }

    // Mettre à jour le montant dans la transaction de remboursement
    association.amount = newAmount

    // Sauvegarder les modifications
    const { saveToStorage } = useReimbursement()
    saveToStorage()

    console.log('Montant modifié avec succès')
  }

  /**
   * Divise le montant personnalisé par un nombre donné
   */
  const divideAmount = (transaction: Transaction, divisor: number) => {
    const transactionKey = getTransactionKey(transaction)
    const originalAmount = Math.abs(transaction.amount)

    // Initialiser le montant personnalisé s'il n'existe pas
    if (!customAmounts.value[transactionKey]) {
      customAmounts.value[transactionKey] = originalAmount
    }

    const dividedAmount = originalAmount / divisor

    // Arrondir à 2 décimales et s'assurer que c'est au moins 0.01€
    customAmounts.value[transactionKey] = Math.max(
      0.01,
      Math.round(dividedAmount * 100) / 100
    )
  }

  /**
   * Affiche une popup pour diviser par un nombre personnalisé
   */
  const showCustomDivision = (transaction: Transaction) => {
    const divisorStr = prompt(
      'Par combien voulez-vous diviser le montant ?\n\nExemples :\n- 2 pour diviser par 2\n- 3 pour diviser par 3\n- 4 pour diviser par 4, etc.',
      '2'
    )

    if (divisorStr === null) return // Annulé

    const divisor = parseFloat(divisorStr)

    if (isNaN(divisor) || divisor <= 0) {
      alert('Veuillez saisir un nombre valide supérieur à 0')
      return
    }

    if (divisor === 1) {
      alert('La division par 1 ne change pas le montant')
      return
    }

    divideAmount(transaction, divisor)
  }

  /**
   * Remet le montant personnalisé au montant original
   */
  const resetToOriginalAmount = (transaction: Transaction) => {
    const transactionKey = getTransactionKey(transaction)
    const originalAmount = Math.abs(transaction.amount)
    customAmounts.value[transactionKey] = originalAmount
  }

  // === Fonctions pour les associations partagées ===

  /**
   * Sélectionne une transaction pour le partage
   */
  const selectTransactionForSharing = (transaction: Transaction) => {
    selectedTransactionForSharing.value = transaction
    // Réinitialiser les sélections
    selectedPeopleForSharing.value = {}
    peopleAmounts.value = {}
  }

  /**
   * Met à jour la sélection d'une personne pour le partage
   */
  const updatePersonSharing = (personId: string) => {
    if (!selectedPeopleForSharing.value[personId]) {
      // Si la personne est désélectionnée, supprimer son montant
      delete peopleAmounts.value[personId]
    } else {
      // Si la personne est sélectionnée, initialiser avec un montant par défaut
      const remainingPeople = Object.keys(
        selectedPeopleForSharing.value
      ).filter(id => selectedPeopleForSharing.value[id]).length
      if (selectedTransactionForSharing.value && remainingPeople > 0) {
        const defaultAmount =
          Math.round(
            (Math.abs(selectedTransactionForSharing.value.amount) /
              remainingPeople) *
              100
          ) / 100
        peopleAmounts.value[personId] = defaultAmount
      }
    }
  }

  /**
   * Crée une répartition égale pour les personnes sélectionnées
   */
  const createEqualSplitForSelected = () => {
    if (!selectedTransactionForSharing.value) return

    const selectedPeople = Object.keys(selectedPeopleForSharing.value).filter(
      id => selectedPeopleForSharing.value[id]
    )

    if (selectedPeople.length === 0) {
      alert('Veuillez sélectionner au moins une personne')
      return
    }

    const totalAmount = Math.abs(selectedTransactionForSharing.value.amount)
    const amountPerPerson =
      Math.round((totalAmount / selectedPeople.length) * 100) / 100

    selectedPeople.forEach(personId => {
      peopleAmounts.value[personId] = amountPerPerson
    })
  }

  /**
   * Calcule le montant total partagé
   */
  const getTotalSharedAmount = (): number => {
    return Object.values(peopleAmounts.value).reduce(
      (sum, amount) => sum + (amount || 0),
      0
    )
  }

  /**
   * Vérifie si la répartition est valide
   */
  const isValidSharing = computed(() => {
    if (!selectedTransactionForSharing.value) return false

    const totalShared = getTotalSharedAmount()
    const maxAmount = Math.abs(selectedTransactionForSharing.value.amount)

    return totalShared > 0 && totalShared <= maxAmount
  })

  /**
   * Compte le nombre de personnes sélectionnées
   */
  const getSelectedPeopleCount = (): number => {
    return Object.values(selectedPeopleForSharing.value).filter(Boolean).length
  }

  /**
   * Annule la création d'une association partagée
   */
  const cancelSharing = () => {
    selectedTransactionForSharing.value = null
    selectedPeopleForSharing.value = {}
    peopleAmounts.value = {}
  }

  /**
   * Crée une association partagée
   */
  const createSharedAssociation = () => {
    if (!selectedTransactionForSharing.value || !isValidSharing.value) return

    const selectedPeople = Object.keys(selectedPeopleForSharing.value).filter(
      id => selectedPeopleForSharing.value[id]
    )

    if (selectedPeople.length === 0) {
      alert('Veuillez sélectionner au moins une personne')
      return
    }

    const peopleAssociations = selectedPeople.map(personId => ({
      personId,
      amount: peopleAmounts.value[personId] || 0,
    }))

    try {
      associateSharedTransaction(
        selectedTransactionForSharing.value,
        peopleAssociations
      )
      cancelSharing()
      console.log('Association partagée créée avec succès')
    } catch (error) {
      console.error(
        "Erreur lors de la création de l'association partagée:",
        error
      )
      alert(
        `Erreur: ${error instanceof Error ? error.message : 'Erreur inconnue'}`
      )
    }
  }

  /**
   * Marque une personne comme remboursée dans une association partagée
   */
  const markPersonAsReimbursed = (associationId: string, personId: string) => {
    try {
      markSharedAssociationAsReimbursed(associationId, personId, true)
      console.log('Personne marquée comme remboursée')
    } catch (error) {
      console.error('Erreur lors du marquage comme remboursé:', error)
      alert('Erreur lors du marquage comme remboursé')
    }
  }

  /**
   * Supprime une association partagée
   */
  const deleteSharedAssociation = (associationId: string) => {
    if (
      confirm('Êtes-vous sûr de vouloir supprimer cette association partagée ?')
    ) {
      try {
        removeSharedAssociation(associationId)
        console.log('Association partagée supprimée')
      } catch (error) {
        console.error('Erreur lors de la suppression:', error)
        alert("Erreur lors de la suppression de l'association")
      }
    }
  }

  // === Fin des fonctions pour les associations partagées ===

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

  .custom-amount-indicator {
    color: #f59e0b;
    font-size: 0.8rem;
    margin-left: 0.25rem;
  }

  .custom-amount-indicator i {
    font-size: 0.7rem;
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

  .associated-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .edit-amount-button {
    background: #667eea;
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

  .edit-amount-button:hover {
    background: #5a67d8;
  }

  .custom-amount-badge {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: #fef3c7;
    color: #92400e;
    border: 1px solid #f59e0b;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-left: 0.5rem;
  }

  .custom-amount-badge i {
    font-size: 0.7rem;
  }

  .association-controls {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .association-inputs {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1;
    min-width: 250px;
  }

  .amount-input-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .amount-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin: 0;
  }

  .amount-input {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .amount-input:focus {
    outline: none;
    border-color: #667eea;
    box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
  }

  .amount-input:invalid {
    border-color: #ef4444;
  }

  .original-amount {
    font-size: 0.75rem;
    color: #6b7280;
    font-style: italic;
  }

  .division-controls {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
    align-items: center;
  }

  .division-button {
    padding: 0.375rem 0.75rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    background: #f9fafb;
    color: #374151;
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 2.5rem;
  }

  .division-button:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
    transform: translateY(-1px);
  }

  .division-button:active {
    transform: translateY(0);
  }

  .division-button.reset {
    background: #fef3f2;
    border-color: #fecaca;
    color: #dc2626;
  }

  .division-button.reset:hover {
    background: #fee2e2;
    border-color: #fca5a5;
  }

  /* Styles pour le partage de transactions */
  .shared-header {
    margin-bottom: 2rem;
  }

  .shared-header h3 {
    margin: 0 0 0.5rem 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: #495057;
  }

  .shared-header p {
    margin: 0;
    color: #6c757d;
  }

  .shared-stats {
    display: flex;
    gap: 1.5rem;
    margin-top: 1rem;
    padding: 1rem;
    background: #f8f9fa;
    border-radius: 8px;
  }

  .create-shared-section {
    background: #f8fffe;
    border: 1px solid #d1fae5;
    border-radius: 12px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }

  .create-shared-section h4 {
    color: #065f46;
    margin: 0 0 1.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .available-transactions {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    max-height: 300px;
    overflow-y: auto;
  }

  .transaction-item.selectable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .transaction-item.selectable:hover {
    background: #f0f9ff;
    border-color: #0ea5e9;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.1);
  }

  .sharing-form {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .selected-transaction {
    background: #f0f9ff;
    border: 1px solid #0ea5e9;
    border-radius: 8px;
    padding: 1rem;
  }

  .selected-transaction h5 {
    margin: 0 0 0.75rem 0;
    color: #0c4a6e;
    font-size: 0.875rem;
    font-weight: 600;
  }

  .people-sharing h5 {
    margin: 0 0 1rem 0;
    color: #374151;
    font-size: 1rem;
    font-weight: 600;
  }

  .people-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1rem;
  }

  .person-sharing-item {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .person-sharing-item:has(input:checked) {
    border-color: #10b981;
    background: #f0fdf4;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
  }

  .person-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .person-info input[type='checkbox'] {
    width: 1.125rem;
    height: 1.125rem;
    accent-color: #10b981;
  }

  .person-name {
    font-weight: 500;
    color: #374151;
    cursor: pointer;
  }

  .person-amount {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .person-amount input {
    width: 100px;
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    text-align: right;
  }

  .person-amount input:focus {
    outline: none;
    border-color: #10b981;
    box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.1);
  }

  .currency {
    color: #6b7280;
    font-weight: 500;
  }

  .sharing-controls {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    padding: 1rem;
    background: #f9fafb;
    border-radius: 8px;
  }

  .quick-split-button {
    background: #0ea5e9;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .quick-split-button:hover {
    background: #0284c7;
  }

  .total-validation {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1rem;
  }

  .total-label {
    color: #374151;
    font-weight: 500;
  }

  .total-amount {
    font-weight: 700;
    color: #10b981;
    transition: color 0.2s ease;
  }

  .total-amount.invalid {
    color: #ef4444;
  }

  .total-max {
    color: #6b7280;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 1rem;
    margin-top: 1rem;
  }

  .create-button {
    background: #10b981;
    color: white;
    border: none;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .create-button:hover:not(:disabled) {
    background: #059669;
  }

  .create-button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .existing-shared-section {
    margin-top: 2rem;
  }

  .existing-shared-section h4 {
    color: #374151;
    margin: 0 0 1.5rem 0;
    font-size: 1.125rem;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .shared-associations-list {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .shared-association-card {
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    transition: box-shadow 0.2s ease;
  }

  .shared-association-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .association-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #f3f4f6;
  }

  .association-info h5 {
    margin: 0 0 0.25rem 0;
    color: #1f2937;
    font-size: 1rem;
    font-weight: 600;
  }

  .association-category {
    display: inline-block;
    background: rgba(102, 126, 234, 0.1);
    color: #667eea;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.75rem;
    font-weight: 500;
    margin-right: 0.5rem;
  }

  .association-date {
    color: #6b7280;
    font-size: 0.875rem;
  }

  .association-total {
    font-size: 1.25rem;
    font-weight: 700;
    color: #dc3545;
  }

  .association-people {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .person-association {
    background: #f8f9fa;
    border-radius: 8px;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    transition: all 0.2s ease;
  }

  .person-association.reimbursed {
    background: #d1fae5;
    border: 1px solid #a7f3d0;
  }

  .person-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .person-details .person-name {
    font-weight: 600;
    color: #374151;
  }

  .person-note {
    font-size: 0.75rem;
    color: #6b7280;
    font-style: italic;
  }

  .person-association .person-amount {
    font-weight: 600;
    color: #dc3545;
  }

  .person-association.reimbursed .person-amount {
    color: #10b981;
  }

  .person-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .reimburse-button {
    background: #10b981;
    color: white;
    border: none;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .reimburse-button:hover {
    background: #059669;
  }

  .reimbursed-badge {
    background: #10b981;
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .association-actions {
    display: flex;
    justify-content: flex-end;
    padding-top: 1rem;
    border-top: 1px solid #f3f4f6;
  }

  .delete-association-button {
    background: #ef4444;
    color: white;
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background-color 0.2s ease;
    display: flex;
    align-items: center;
    gap: 0.375rem;
  }

  .delete-association-button:hover {
    background: #dc2626;
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

    .association-controls {
      flex-direction: column;
      align-items: stretch;
    }

    .association-inputs {
      min-width: unset;
    }

    .person-select {
      flex: 1;
    }
  }
</style>

<template>
  <div v-if="expenses.length">
    <h3>Analyse des dépenses</h3>
    
    <!-- Onglets pour choisir entre dépenses et revenus -->
    <div class="tabs">
      <button 
        :class="['tab-btn', { active: transactionType === 'all' }]" 
        @click="transactionType = 'all'">
        Toutes les transactions
      </button>
      <button 
        :class="['tab-btn', { active: transactionType === 'expenses' }]" 
        @click="transactionType = 'expenses'">
        Dépenses
      </button>
      <button 
        :class="['tab-btn', { active: transactionType === 'income' }]" 
        @click="transactionType = 'income'">
        Revenus
      </button>
    </div>
    
    <!-- Information sur les remboursements associés -->
    <div v-if="Object.keys(reimbursementAssociations).length > 0 && transactionType === 'expenses'" class="reimbursement-info">
      <i class="info-icon">ℹ️</i> Les montants des dépenses affichés sont nets des remboursements associés
    </div>
    
    <!-- Résumé chiffré -->
    <div class="summary-cards">
      <div class="card">
        <div class="card-value">{{ filteredExpensesByType.length }}</div>
        <div class="card-label">Transactions</div>
      </div>
      <div class="card">
        <div class="card-value" :class="{
          'negative': transactionType === 'expenses' || (transactionType === 'all' && totalAmount < 0), 
          'positive': transactionType === 'income' || (transactionType === 'all' && totalAmount > 0)
        }">
          {{ Math.abs(totalAmount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
          <span class="card-sign">{{ totalAmount < 0 ? '-' : '+' }}</span>
          <span v-if="jointAccounts.length > 0" class="card-adjusted-indicator" title="Ce montant tient compte de la division par 2 pour les comptes joints">*</span>
        </div>
        <div class="card-label">
          {{ transactionType === 'income' ? 'Total revenus' : transactionType === 'expenses' ? 'Total dépenses' : 'Solde' }}
        </div>
      </div>
      <div class="card">
        <div class="card-value">
          {{ Math.abs(averageAmount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
          <span v-if="jointAccounts.length > 0" class="card-adjusted-indicator" title="Ce montant tient compte de la division par 2 pour les comptes joints">*</span>
        </div>
        <div class="card-label">Moyenne par transaction</div>
      </div>
      <div class="card">
        <div class="card-value">
          {{ uniqueAccounts.length }}
          <span v-if="jointAccounts.length > 0" class="joint-accounts-count">({{ jointAccounts.length }} joint<span v-if="jointAccounts.length > 1">s</span>)</span>
        </div>
        <div class="card-label">Comptes</div>
      </div>
    </div>

    <!-- Filtres principaux -->
    <div class="filter-section">
      <div class="filter-group">
        <label for="account-filter">Filtrer par compte:</label>
        <select id="account-filter" v-model="selectedAccount" class="filter-select">
          <option value="all">Tous les comptes</option>
          <option v-for="account in uniqueAccounts" :key="account" :value="account">
            {{ account }}
          </option>
        </select>
      </div>
      <button @click="showAdvancedFilters = !showAdvancedFilters" class="advanced-filter-btn">
        {{ showAdvancedFilters ? 'Masquer filtres avancés' : 'Filtres avancés' }}
      </button>
    </div>
    
    <!-- Panneau de filtrage avancé -->
    <div v-if="showAdvancedFilters" class="advanced-filters">
      <h4>Filtrage avancé</h4>
      
      <!-- Sélecteur de compte pour l'exclusion -->
      <div class="filter-section">
        <div class="filter-group">
          <label>Filtrer pour le compte:</label>
          <select v-model="filterAccountForExclusion" class="filter-select">
            <option value="all">Tous les comptes</option>
            <option v-for="account in uniqueAccounts" :key="account" :value="account">
              {{ account }}
            </option>
          </select>
        </div>
      </div>
      
      <div class="filter-section">
        <div class="filter-group exclude-categories">
          <label>
            Masquer des catégories 
            {{ filterAccountForExclusion !== 'all' ? `pour ${filterAccountForExclusion}` : '' }}:
          </label>
          <div class="checkbox-container">
            <div v-for="category in filteredCategoriesToExclude" :key="category" class="checkbox-item">
              <input 
                type="checkbox" 
                :id="'exclude-' + filterAccountForExclusion + '-' + category" 
                v-model="currentAccountExclusions" 
                :value="category"
                @change="updateExcludedCategories"
              />
              <label :for="'exclude-' + filterAccountForExclusion + '-' + category">{{ category }}</label>
            </div>
          </div>
        </div>
      </div>
      
      <div class="filter-info" v-if="hasAnyExclusions">
        <p v-for="(exclusions, account) in categoryExclusionsByAccount" :key="account" v-show="exclusions.length > 0">
          <strong>{{ exclusions.length }} catégorie(s) masquée(s) pour {{ account }}:</strong>
          {{ exclusions.join(', ') }}
        </p>
        <p v-if="excludedCategories.length > 0">
          <strong>{{ excludedCategories.length }} catégorie(s) masquée(s) pour tous les comptes:</strong>
          {{ excludedCategories.join(', ') }}
        </p>
      </div>
      
      <!-- Section pour les comptes joints -->
      <div class="filter-section">
        <div class="filter-group exclude-categories">
          <div class="section-header">
            <label>Comptes joints (montants divisés par 2):</label>
            <div class="tooltip-icon" title="Les montants des comptes joints sont divisés par 2 pour refléter votre part réelle des dépenses et revenus partagés">?</div>
          </div>
          <div class="checkbox-container">
            <div v-for="account in uniqueAccounts" :key="account" class="checkbox-item">
              <input 
                type="checkbox" 
                :id="'joint-account-' + account" 
                v-model="jointAccounts" 
                :value="account"
              />
              <label :for="'joint-account-' + account">{{ account }}</label>
            </div>
          </div>
        </div>
      </div>
      
      <div class="filter-info" v-if="jointAccounts.length > 0">
        <p>
          <strong>{{ jointAccounts.length }} compte(s) joint(s):</strong>
          {{ jointAccounts.join(', ') }}
        </p>
      </div>
      
      <!-- Section pour les associations de remboursements -->
      <div class="filter-section">
        <div class="filter-group exclude-categories">
          <div class="section-header">
            <label>Associations remboursements/dépenses:</label>
            <div class="tooltip-icon" title="Associer des catégories de remboursements à des catégories de dépenses pour déduire automatiquement les remboursements des dépenses">?</div>
          </div>
          
          <div v-if="Object.keys(reimbursementAssociations).length > 0" class="existing-associations">
            <h5>Associations existantes:</h5>
            <div v-for="(expenseCategory, incomeCategory) in reimbursementAssociations" :key="incomeCategory" class="association-item">
              <div class="association-details">
                <span class="income-category">{{ incomeCategory }}</span>
                <span class="association-arrow">➔</span>
                <span class="expense-category">{{ expenseCategory }}</span>
                <div class="association-amounts">
                  <span class="income-amount">{{ getCategoryTotal(incomeCategory, true).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}</span>
                  <span class="association-separator">/</span>
                  <span class="expense-amount">{{ getCategoryTotal(expenseCategory, false).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}</span>
                </div>
              </div>
              <button class="remove-association-btn" @click="removeReimbursementAssociation(incomeCategory)">
                <span class="remove-icon">×</span>
              </button>
            </div>
          </div>
          
          <div class="new-association">
            <h5>Nouvelle association:</h5>
            <div v-if="availableIncomeCategories.length && availableExpenseCategories.length" class="association-form">
              <div class="association-selects">
                <select class="filter-select" v-model="newAssociationIncome">
                  <option value="" disabled selected>Choisir un remboursement</option>
                  <option v-for="category in availableIncomeCategories" :key="category" :value="category">
                    {{ category }} ({{ getCategoryTotal(category, true).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }})
                  </option>
                </select>
                <span class="association-arrow">➔</span>
                <select class="filter-select" v-model="newAssociationExpense">
                  <option value="" disabled selected>Choisir une dépense</option>
                  <option v-for="category in availableExpenseCategories" :key="category" :value="category">
                    {{ category }} ({{ getCategoryTotal(category, false).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }})
                  </option>
                </select>
              </div>
              <button 
                class="add-association-btn" 
                @click="addReimbursementAssociation(newAssociationIncome, newAssociationExpense)"
                :disabled="!newAssociationIncome || !newAssociationExpense"
              >
                Associer
              </button>
            </div>
            <p v-else class="no-categories-message">
              Aucune catégorie disponible pour créer de nouvelles associations
            </p>
            <p v-if="showAssociationError" class="association-error">
              {{ showAssociationError }}
            </p>
          </div>
        </div>
      </div>
    </div>

    <!-- Graphiques -->
    <div class="charts-container">
      <!-- Graphique par catégorie -->
      <div class="chart-box">
        <h4>{{ transactionType === 'income' ? 'Revenus' : 'Dépenses' }} par catégorie</h4>
        <Doughnut 
          :data="categoryChartData" 
          :options="chartOptions"
        />
      </div>
      
      <!-- Graphique par mois -->
      <div class="chart-box">
        <h4>Évolution temporelle</h4>
        <Bar 
          :data="monthlyChartData" 
          :options="chartOptions"
        />
      </div>

      <!-- Graphique répartition par compte -->
      <div class="chart-box" v-if="selectedAccount === 'all'">
        <h4>Répartition par compte</h4>
        <Pie
          :data="accountChartData"
          :options="chartOptions"
        />
      </div>

      <!-- Balance dépenses/revenus -->
      <div class="chart-box" v-if="transactionType === 'all'">
        <h4>Balance dépenses/revenus</h4>
        <Bar
          :data="balanceChartData"
          :options="balanceChartOptions"
        />
      </div>

      <!-- Tableau des transactions -->
      <div class="chart-box transactions-table">
        <div class="transactions-header">
          <h4>
            Transactions 
            {{ selectedAccount !== 'all' ? `(${selectedAccount})` : '' }}
            {{ transactionType === 'expenses' ? '(Dépenses)' : transactionType === 'income' ? '(Revenus)' : '' }}
            {{ selectedCategory !== 'all' ? `- ${selectedCategory}` : '' }}
          </h4>
          
          <!-- Filtre par catégorie -->
          <div class="category-filter">
            <label for="category-filter">Filtrer par catégorie:</label>
            <select id="category-filter" v-model="selectedCategory" class="filter-select">
              <option value="all">Toutes les catégories</option>
              <option v-for="category in uniqueCategories" :key="category" :value="category">
                {{ category }}
              </option>
            </select>
          </div>
        </div>
        
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Description</th>
                <th>Catégorie</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(expense, index) in finalFilteredTransactions.slice(0, MAX_TRANSACTIONS)" :key="index">
                <td>{{ formatDate(expense.Date) }}</td>
                <td class="description">{{ expense.Description }}</td>
                <td>
                  {{ parseFloat(expense.Montant) > 0 
                      ? (expense['Sous-Catégorie'] || 'Non catégorisé') 
                      : (expense.Catégorie || 'Non catégorisé') }}
                </td>
                <td :class="{'negative': parseFloat(expense.Montant) < 0, 'positive': parseFloat(expense.Montant) > 0}">
                  <template v-if="expense.Compte && jointAccounts.includes(expense.Compte)">
                    <span class="adjusted-amount">
                      {{ Math.abs(getAdjustedAmount(expense)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
                      <span class="sign">{{ parseFloat(expense.Montant) < 0 ? '-' : '+' }}</span>
                    </span>
                    <span class="joint-indicator" title="Montant divisé par 2 (compte joint)">½</span>
                  </template>
                  <template v-else>
                    {{ Math.abs(parseFloat(expense.Montant)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
                    <span class="sign">{{ parseFloat(expense.Montant) < 0 ? '-' : '+' }}</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="table-footer" v-if="finalFilteredTransactions.length > MAX_TRANSACTIONS">
            <span>Affichage des {{ MAX_TRANSACTIONS }} premières transactions sur {{ finalFilteredTransactions.length }}</span>
          </div>
          <div v-else class="table-footer">
            <span>Il y a {{ finalFilteredTransactions.length }} transactions</span>
          </div>
          
          <!-- Légende pour les comptes joints -->
          <div class="table-legend" v-if="jointAccounts.length > 0">
            <div class="legend-item">
              <span class="joint-indicator">½</span>
              <span>Montant divisé par 2 (compte joint)</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <button @click="goBack" class="back-btn">Retour à l'importation</button>
  </div>
  <div v-else>
    <em>Importez un fichier pour voir l'analyse.</em>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { CsvRow } from '../types'
import { Chart, registerables } from 'chart.js'
import { Doughnut, Bar, Pie } from 'vue-chartjs'

const MAX_TRANSACTIONS = 50

// Enregistrer tous les composants Chart.js nécessaires
Chart.register(...registerables)

const props = defineProps<{
  expenses: CsvRow[]
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

// États pour le filtrage
const selectedAccount = ref('all')
const selectedCategory = ref('all')
const transactionType = ref('all') // 'all', 'expenses', 'income'
const showAdvancedFilters = ref(false)
const excludedCategories = ref<string[]>([])
const filterAccountForExclusion = ref('all')
const categoryExclusionsByAccount = ref<Record<string, string[]>>({})
// Comptes joints (dont les montants sont divisés par 2)
const jointAccounts = ref<string[]>([])
// Association entre catégories de remboursements (revenus) et catégories de dépenses
const reimbursementAssociations = ref<Record<string, string>>({}) // clé: catégorie de remboursement, valeur: catégorie de dépense
const showAssociationError = ref<string | null>(null)
const newAssociationIncome = ref('')
const newAssociationExpense = ref('')

// Obtenir la liste des comptes uniques
const uniqueAccounts = computed(() => {
  const accounts = new Set<string>()
  props.expenses.forEach(expense => {
    if (expense.Compte) {
      accounts.add(expense.Compte)
    }
  })
  return Array.from(accounts)
})

// Fonction pour ajuster le montant d'une transaction selon type de compte
function getAdjustedAmount(expense: CsvRow): number {
  const amount = parseFloat(expense.Montant) || 0
  const account = expense.Compte
  
  // Si le compte est joint, diviser le montant par 2
  if (account && jointAccounts.value.includes(account)) {
    return amount / 2
  }
  
  return amount
}

// Obtenir la liste des catégories uniques
const uniqueCategories = computed(() => {
  const categories = new Set<string>()
  props.expenses.forEach(expense => {
    // Pour les revenus (montant > 0), utiliser la sous-catégorie
    const amount = parseFloat(expense.Montant)
    if (amount > 0) {
      const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
      categories.add(subCategory)
    } else {
      // Pour les dépenses, utiliser la catégorie normale
      const category = expense.Catégorie?.trim() || 'Non catégorisé'
      categories.add(category)
    }
  })
  return Array.from(categories).sort()
})

// Catégories filtrées selon le type de transaction actuel et le compte sélectionné pour le panneau d'exclusion
const filteredCategoriesToExclude = computed(() => {
  const account = filterAccountForExclusion.value
  const categories = new Set<string>()
  
  props.expenses.forEach(expense => {
    // Si on filtre pour un compte spécifique et que le compte ne correspond pas, on ignore
    if (account !== 'all' && expense.Compte !== account) return
    
    const amount = parseFloat(expense.Montant)
    
    // Pour le type "all" ou selon le type sélectionné
    if (transactionType.value === 'all' || 
        (transactionType.value === 'expenses' && amount < 0) || 
        (transactionType.value === 'income' && amount > 0)) {
      
      // Pour les revenus, utiliser la sous-catégorie
      if (amount > 0) {
        const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
        categories.add(subCategory)
      } 
      // Pour les dépenses, utiliser la catégorie normale
      else {
        const category = expense.Catégorie?.trim() || 'Non catégorisé'
        categories.add(category)
      }
    }
  })
  
  return Array.from(categories).sort()
})

// Les exclusions de catégories pour le compte actuellement sélectionné dans le panneau de filtrage avancé
const currentAccountExclusions = computed({
  get() {
    const account = filterAccountForExclusion.value
    if (account === 'all') {
      return [...excludedCategories.value]
    } else {
      return categoryExclusionsByAccount.value[account] || []
    }
  },
  set(value: string[]) {
    const account = filterAccountForExclusion.value
    if (account === 'all') {
      excludedCategories.value = value
    } else {
      if (!categoryExclusionsByAccount.value[account]) {
        categoryExclusionsByAccount.value[account] = []
      }
      categoryExclusionsByAccount.value[account] = value
    }
  }
})

// Indique s'il y a des exclusions (pour l'interface)
const hasAnyExclusions = computed(() => {
  return excludedCategories.value.length > 0 || 
         Object.values(categoryExclusionsByAccount.value).some(exclusions => exclusions.length > 0)
})

// Obtenir les catégories de dépenses uniquement
const expenseCategories = computed(() => {
  const categories = new Set<string>()
  props.expenses.forEach(expense => {
    const amount = parseFloat(expense.Montant)
    if (amount < 0) {
      const category = expense.Catégorie?.trim() || 'Non catégorisé'
      categories.add(category)
    }
  })
  return Array.from(categories).sort()
})

// Obtenir les catégories de revenus uniquement
const incomeCategories = computed(() => {
  const categories = new Set<string>()
  props.expenses.forEach(expense => {
    const amount = parseFloat(expense.Montant)
    if (amount > 0) {
      const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
      categories.add(subCategory)
    }
  })
  return Array.from(categories).sort()
})

// Vérifier si une catégorie est déjà associée
const isAlreadyAssociated = (category: string) => {
  // Vérifier si la catégorie est déjà une clé (remboursement)
  if (reimbursementAssociations.value[category]) return true
  
  // Vérifier si la catégorie est déjà une valeur (dépense associée)
  return Object.values(reimbursementAssociations.value).includes(category)
}

// Mise à jour des exclusions lors d'un changement
function updateExcludedCategories() {
  // Cette fonction existe uniquement pour réagir aux changements de cases à cocher
  // La logique de mise à jour est gérée par le computed setter de currentAccountExclusions
}

// Filtrer par compte
const filteredByAccount = computed(() => {
  if (selectedAccount.value === 'all') {
    return props.expenses
  }
  return props.expenses.filter(expense => expense.Compte === selectedAccount.value)
})

// Filtrer par type de transaction et exclure les catégories filtrées
const filteredExpensesByType = computed(() => {
  // D'abord filtrer par type de transaction
  let filtered = filteredByAccount.value
  
  if (transactionType.value === 'expenses') {
    filtered = filtered.filter(expense => getAdjustedAmount(expense) < 0)
  } else if (transactionType.value === 'income') {
    filtered = filtered.filter(expense => getAdjustedAmount(expense) > 0)
  }
  
  // Ensuite exclure les catégories filtrées globalement
  if (excludedCategories.value.length > 0) {
    filtered = filtered.filter(expense => {
      const amount = parseFloat(expense.Montant)
      const categoryToCheck = amount > 0 
        ? expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
        : expense.Catégorie?.trim() || 'Non catégorisé'
      
      return !excludedCategories.value.includes(categoryToCheck)
    })
  }
  
  // Exclure les catégories filtrées par compte spécifique
  filtered = filtered.filter(expense => {
    const account = expense.Compte
    if (!account || !categoryExclusionsByAccount.value[account]) return true
    
    const amount = parseFloat(expense.Montant)
    const categoryToCheck = amount > 0 
      ? expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
      : expense.Catégorie?.trim() || 'Non catégorisé'
    
    return !categoryExclusionsByAccount.value[account].includes(categoryToCheck)
  })
  
  return filtered
})

// Filtrer par catégorie
const finalFilteredTransactions = computed(() => {
  if (selectedCategory.value === 'all') {
    return filteredExpensesByType.value
  } else {
    return filteredExpensesByType.value.filter(expense => {
      const amount = getAdjustedAmount(expense)
      
      // Pour les revenus, comparer avec la sous-catégorie
      if (amount > 0) {
        const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
        return subCategory === selectedCategory.value
      } 
      // Pour les dépenses, comparer avec la catégorie normale
      else {
        const category = expense.Catégorie?.trim() || 'Non catégorisé'
        return category === selectedCategory.value
      }
    })
  }
})

// Calculer les totaux sur les transactions filtrées
const totalAmount = computed(() => {
  // Si nous sommes dans l'onglet "Dépenses", prendre en compte les remboursements pour calculer les montants nets
  if (transactionType.value === 'expenses') {
    // Créer une copie des dépenses filtrées pour travailler dessus
    const filteredExpenses = [...filteredExpensesByType.value]
    
    // Collecter d'abord tous les remboursements par catégorie et par compte
    const reimbursingCategories = new Set(Object.keys(reimbursementAssociations.value))
    const reimbursementsByCategory = {} as Record<string, number>
    
    // Calculer les montants des remboursements depuis toutes les transactions
    filteredByAccount.value.forEach(expense => {
      const amount = getAdjustedAmount(expense)
      if (amount > 0) {
        const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
        const account = expense.Compte
        
        // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
        const isExcludedGlobally = excludedCategories.value.includes(subCategory);
        const isExcludedForAccount = account && 
                                    categoryExclusionsByAccount.value[account] && 
                                    categoryExclusionsByAccount.value[account].includes(subCategory);
        
        // Si la catégorie de remboursement est exclue, ne pas prendre en compte son montant
        if (isExcludedGlobally || isExcludedForAccount) {
          return;
        }
        
        if (reimbursingCategories.has(subCategory)) {
          const targetExpenseCategory = reimbursementAssociations.value[subCategory]
          if (!reimbursementsByCategory[targetExpenseCategory]) {
            reimbursementsByCategory[targetExpenseCategory] = 0
          }
          reimbursementsByCategory[targetExpenseCategory] += amount
        }
      }
    })
    
    // Calculer le montant total en tenant compte des remboursements
    let total = 0
    filteredExpenses.forEach(expense => {
      const amount = getAdjustedAmount(expense)
      if (amount < 0) {
        const category = expense.Catégorie?.trim() || 'Non catégorisé'
        const account = expense.Compte
        
        // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
        const isExcludedGlobally = excludedCategories.value.includes(category);
        const isExcludedForAccount = account && 
                                   categoryExclusionsByAccount.value[account] && 
                                   categoryExclusionsByAccount.value[account].includes(category);
        
        // Si la catégorie est exclue, ne pas l'inclure
        if (isExcludedGlobally || isExcludedForAccount) {
          return;
        }
        
        const absAmount = Math.abs(amount)
        
        // Vérifier s'il y a des remboursements pour cette catégorie
        if (reimbursementsByCategory[category]) {
          // Calculer le montant net après remboursement
          const netAmount = Math.max(0, absAmount - reimbursementsByCategory[category])
          
          // Mettre à jour le remboursement restant pour cette catégorie
          reimbursementsByCategory[category] = Math.max(0, reimbursementsByCategory[category] - absAmount)
          
          // Ajouter au total
          total -= netAmount
        } else {
          // Pas de remboursement, ajouter le montant complet
          total += amount
        }
      }
    })
    
    return total
  } 
  // Pour les autres onglets, utiliser la somme normale
  else {
    return filteredExpensesByType.value.reduce((sum, e) => sum + getAdjustedAmount(e), 0)
  }
})

// Calculer le total pour une catégorie spécifique
function getCategoryTotal(categoryName: string, isIncome: boolean): number {
  // Identifier les catégories spéciales
  const isReimbursedExpenseCategory = !isIncome && Object.values(reimbursementAssociations.value).includes(categoryName);
  const isReimbursementCategory = isIncome && Object.keys(reimbursementAssociations.value).includes(categoryName);
  
  // Pour les catégories de remboursements (revenus), toujours utiliser filteredByAccount
  // pour avoir accès à tous les revenus, même dans l'onglet "Dépenses"
  if (isIncome) {
    return filteredByAccount.value.reduce((sum, expense) => {
      const amount = getAdjustedAmount(expense)
      
      if (amount > 0) {
        const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
        const account = expense.Compte;
        
        // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
        const isExcludedGlobally = excludedCategories.value.includes(subCategory);
        const isExcludedForAccount = account && 
                                    categoryExclusionsByAccount.value[account] && 
                                    categoryExclusionsByAccount.value[account].includes(subCategory);
        
        // Si la catégorie est exclue et qu'il s'agit de la catégorie recherchée, retourner 0
        if ((isExcludedGlobally || isExcludedForAccount) && subCategory === categoryName) {
          return sum;
        }
        
        if (subCategory === categoryName) {
          return sum + amount
        }
      }
      return sum
    }, 0)
  } 
  // Pour une catégorie de dépense remboursée, calculer le montant net (dépense - remboursement)
  else if (isReimbursedExpenseCategory) {
    // Calculer le montant total des dépenses pour cette catégorie
    const totalExpense = filteredByAccount.value.reduce((sum, expense) => {
      const amount = getAdjustedAmount(expense)
      
      if (amount < 0) {
        const category = expense.Catégorie?.trim() || 'Non catégorisé'
        if (category === categoryName) {
          return sum + Math.abs(amount)
        }
      }
      return sum
    }, 0)
    
    // Calculer le montant total des remboursements pour cette catégorie
    const totalReimbursement = filteredByAccount.value.reduce((sum, expense) => {
      const amount = getAdjustedAmount(expense)
      
      if (amount > 0) {
        const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
        const associatedExpenseCategory = reimbursementAssociations.value[subCategory]
        
        if (associatedExpenseCategory === categoryName) {
          return sum + amount
        }
      }
      return sum
    }, 0)
    
    // Le montant net est le total des dépenses moins les remboursements (mais jamais négatif)
    return Math.max(0, totalExpense - totalReimbursement)
  }
  // Pour les dépenses normales dans le contexte des associations, utiliser également filteredByAccount
  // lorsque l'on est dans l'onglet "Revenus" pour toujours montrer les dépenses disponibles
  else if (transactionType.value === 'income') {
    // Dans l'onglet Revenus, utiliser filteredByAccount pour voir toutes les dépenses
    return filteredByAccount.value.reduce((sum, expense) => {
      const amount = getAdjustedAmount(expense)
      
      if (amount < 0) {
        const category = expense.Catégorie?.trim() || 'Non catégorisé'
        if (category === categoryName) {
          return sum + Math.abs(amount)
        }
      }
      return sum
    }, 0)
  }
  // Pour les autres cas (dépenses normales non associées dans l'onglet dépenses ou tous), 
  // utiliser filteredExpensesByType pour respecter le filtrage actuel
  else {
    return filteredExpensesByType.value.reduce((sum, expense) => {
      const amount = getAdjustedAmount(expense)
      
      if (amount < 0) {
        const category = expense.Catégorie?.trim() || 'Non catégorisé'
        if (category === categoryName) {
          return sum + Math.abs(amount)
        }
      }
      return sum
    }, 0)
  }
}

// Ajouter une association de remboursement
function addReimbursementAssociation(incomeCategory: string, expenseCategory: string) {
  // Vérifier les montants
  const incomeTotal = getCategoryTotal(incomeCategory, true)
  const expenseTotal = getCategoryTotal(expenseCategory, false)
  
  if (incomeTotal > expenseTotal) {
    showAssociationError.value = `Erreur: Le montant des remboursements (${incomeTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}) est supérieur aux dépenses (${expenseTotal.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })}) pour cette catégorie`
    return false
  }
  
  // Tout est bon, ajouter l'association
  reimbursementAssociations.value[incomeCategory] = expenseCategory
  showAssociationError.value = null
  return true
}

// Supprimer une association de remboursement
function removeReimbursementAssociation(incomeCategory: string) {
  delete reimbursementAssociations.value[incomeCategory]
  showAssociationError.value = null
}

// Obtenir les catégories de revenus disponibles pour les associations (non encore associées)
const availableIncomeCategories = computed(() => {
  return incomeCategories.value.filter(category => !reimbursementAssociations.value[category])
})

// Obtenir les catégories de dépenses disponibles pour les associations (non encore associées)
const availableExpenseCategories = computed(() => {
  const usedExpenseCategories = Object.values(reimbursementAssociations.value)
  return expenseCategories.value.filter(category => !usedExpenseCategories.includes(category))
})

const averageAmount = computed(() =>
  filteredExpensesByType.value.length ? totalAmount.value / filteredExpensesByType.value.length : 0
)

// Formatter les dates
function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return 'N/A'
  
  try {
    // Gestion des différents formats de date
    let date: Date
    if (dateStr.includes('/')) {
      // Format "DD/MM/YYYY"
      const [day, month, year] = dateStr.split('/').map(Number)
      date = new Date(year, month - 1, day)
    } else {
      // Format "YYYY-MM-DD"
      date = new Date(dateStr)
    }
    
    return date.toLocaleDateString('fr-FR')
  } catch (e) {
    return dateStr
  }
}

// Préparer les données par catégorie (sur les dépenses filtrées)
const categoryData = computed(() => {
  const categories = {} as Record<string, number>
  const reimbursingCategories = new Set(Object.keys(reimbursementAssociations.value))
  const reimbursedCategories = new Set(Object.values(reimbursementAssociations.value))
  const reimbursementAmounts = {} as Record<string, number>
  
  // D'abord, calculer tous les montants de remboursement par catégorie
  // Important: utiliser filteredByAccount pour avoir accès à TOUS les remboursements même dans l'onglet "Dépenses"
  // mais vérifier également si la catégorie est exclue
  filteredByAccount.value.forEach(expense => {
    const amount = getAdjustedAmount(expense)
    
    // Pour les revenus (montant > 0), calculer les remboursements
    if (amount > 0) {
      const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
      const account = expense.Compte
      
      // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
      const isExcludedGlobally = excludedCategories.value.includes(subCategory);
      const isExcludedForAccount = account && 
                                  categoryExclusionsByAccount.value[account] && 
                                  categoryExclusionsByAccount.value[account].includes(subCategory);
      
      // Si la catégorie est exclue, ne pas l'inclure
      if (isExcludedGlobally || isExcludedForAccount) {
        return;
      }
      
      // Si c'est une catégorie de remboursement, on accumule son montant
      if (reimbursingCategories.has(subCategory)) {
        const targetExpenseCategory = reimbursementAssociations.value[subCategory]
        if (!reimbursementAmounts[targetExpenseCategory]) {
          reimbursementAmounts[targetExpenseCategory] = 0
        }
        reimbursementAmounts[targetExpenseCategory] += amount
      } 
      // On n'ajoute les revenus aux catégories que si on est sur tous les types ou les revenus et que ce n'est pas un remboursement
      else if (!reimbursingCategories.has(subCategory) && (transactionType.value === 'all' || transactionType.value === 'income')) {
        // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
        const isExcludedGlobally = excludedCategories.value.includes(subCategory);
        const isExcludedForAccount = account && 
                                    categoryExclusionsByAccount.value[account] && 
                                    categoryExclusionsByAccount.value[account].includes(subCategory);
        
        // Si la catégorie est exclue, ne pas l'inclure
        if (isExcludedGlobally || isExcludedForAccount) {
          return;
        }
        
        if (!categories[subCategory]) {
          categories[subCategory] = 0
        }
        categories[subCategory] += amount
      }
    }
  })
  
  // Créer une copie du dictionnaire de remboursements pour ne pas modifier directement les valeurs
  const processedReimbursements = {} as Record<string, number>
  for (const category in reimbursementAmounts) {
    processedReimbursements[category] = reimbursementAmounts[category]
  }
  
  // Pour l'onglet "Dépenses", créer une copie des montants de remboursement pour ne pas les modifier directement
  // car on va décompter les montants de remboursement au fur et à mesure
  const reimbursementsCopy = { ...reimbursementAmounts };
  
  // Ensuite, ajouter les dépenses en soustrayant les remboursements
  filteredExpensesByType.value.forEach(expense => {
    const amount = getAdjustedAmount(expense)
    
    // Pour les dépenses (montant < 0)
    if (amount < 0) {
      const category = expense.Catégorie?.trim() || 'Non catégorisé'
      const absAmount = Math.abs(amount)
      
      // Initialiser la catégorie si nécessaire
      if (!categories[category]) {
        categories[category] = 0
      }
      
      // Cas spécial pour les catégories remboursées dans l'onglet Dépenses
      if (transactionType.value === 'expenses' && reimbursedCategories.has(category)) {
        // Récupérer le montant de remboursement disponible pour cette catégorie
        const reimbursement = reimbursementsCopy[category] || 0;
        
        // Appliquer le remboursement à cette dépense
        if (reimbursement > 0) {
          // Si le remboursement est supérieur à la dépense
          if (reimbursement >= absAmount) {
            // La dépense est entièrement remboursée
            reimbursementsCopy[category] = reimbursement - absAmount;
            // Ne pas ajouter au total (car entièrement remboursé)
          } 
          // Si le remboursement est inférieur à la dépense
          else {
            // Ajouter seulement la partie non remboursée
            categories[category] += (absAmount - reimbursement);
            // Le remboursement est entièrement utilisé
            reimbursementsCopy[category] = 0;
          }
        }
        // Si pas de remboursement restant, ajouter le montant complet
        else {
          categories[category] += absAmount;
        }
      }
      // Pour les catégories non remboursées ou dans autres onglets
      else if (transactionType.value !== 'expenses' || !reimbursedCategories.has(category)) {
        categories[category] += absAmount;
      }
    }
  })
  
  // Trier par montant décroissant
  return Object.entries(categories)
    .sort((a, b) => b[1] - a[1])
    .reduce((obj, [key, value]) => {
      obj[key] = value
      return obj
    }, {} as Record<string, number>)
})

// Données pour le graphique en anneau (catégories)
const categoryChartData = computed(() => {
  const data = categoryData.value
  
  return {
    labels: Object.keys(data),
    datasets: [{
      data: Object.values(data),
      backgroundColor: [
        '#42b983', '#2c3e50', '#E46651', '#00D8FF', '#DD1B16',
        '#7957d5', '#ff7675', '#fd79a8', '#6c5ce7', '#fdcb6e'
      ],
      borderWidth: 1
    }]
  }
})

// Préparer les données par mois (pour tous les types de transactions)
const monthlyData = computed(() => {
  const months = {} as Record<string, { expenses: number; income: number }>
  const reimbursingCategories = new Set(Object.keys(reimbursementAssociations.value))
  const reimbursedCategories = new Set(Object.values(reimbursementAssociations.value))
  const monthReimbursements = {} as Record<string, Record<string, number>>
  
  // Initialiser la structure pour tous les mois concernés
  const initMonthKey = (dateStr: string): string | null => {
    if (!dateStr) return null
    
    let monthKey
    if (dateStr.includes('/')) {
      // Format "DD/MM/YYYY"
      const parts = dateStr.split('/')
      monthKey = `${parts[2]}-${parts[1]}`
    } else if (dateStr.includes('-')) {
      // Format "YYYY-MM-DD"
      monthKey = dateStr.substring(0, 7)
    } else {
      return null
    }
    
    if (!months[monthKey]) {
      months[monthKey] = { expenses: 0, income: 0 }
    }
    
    if (!monthReimbursements[monthKey]) {
      monthReimbursements[monthKey] = {}
    }
    
    return monthKey
  }
  
  // Première passe : collecter tous les remboursements par mois et catégorie
  // Important: utiliser filteredByAccount pour avoir accès à TOUS les remboursements
  filteredByAccount.value.forEach(expense => {
    const monthKey = initMonthKey(expense.Date)
    if (!monthKey) return
    
    const amount = getAdjustedAmount(expense)
    
    // Pour les revenus (remboursements)
    if (amount > 0) {
      const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
      
      // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
      const account = expense.Compte;
      const isExcludedGlobally = excludedCategories.value.includes(subCategory);
      const isExcludedForAccount = account && 
                                  categoryExclusionsByAccount.value[account] && 
                                  categoryExclusionsByAccount.value[account].includes(subCategory);
      
      // Si la catégorie est exclue, ne pas l'inclure
      if (isExcludedGlobally || isExcludedForAccount) {
        return;
      }
      
      // Si c'est un remboursement associé à une catégorie de dépense
      if (reimbursingCategories.has(subCategory)) {
        const targetExpenseCategory = reimbursementAssociations.value[subCategory]
        if (!monthReimbursements[monthKey][targetExpenseCategory]) {
          monthReimbursements[monthKey][targetExpenseCategory] = 0
        }
        monthReimbursements[monthKey][targetExpenseCategory] += amount
      }
      // Si c'est un revenu normal (non remboursement)
      else if ((transactionType.value === 'all' || transactionType.value === 'income')) {
        months[monthKey].income += amount
      }
    }
  })
  
  // Pour chaque mois, créer une copie des remboursements pour ne pas les modifier directement
  const processedMonthReimbursements = {} as Record<string, Record<string, number>>
  for (const monthKey in monthReimbursements) {
    processedMonthReimbursements[monthKey] = { ...monthReimbursements[monthKey] }
  }
  
  // Deuxième passe : calculer les revenus et dépenses en tenant compte des remboursements
  // Utiliser les transactions filtrées pour respecter les filtres d'affichage
  let transactionsToProcess = filteredByAccount.value
  if (transactionType.value === 'expenses') {
    transactionsToProcess = transactionsToProcess.filter(expense => getAdjustedAmount(expense) < 0)
  }
  
  transactionsToProcess.forEach(expense => {
    const monthKey = initMonthKey(expense.Date)
    if (!monthKey) return
    
    const amount = getAdjustedAmount(expense)
    
    // Pour les dépenses
    if (amount < 0) {
      const category = expense.Catégorie?.trim() || 'Non catégorisé'
      const account = expense.Compte
      
      // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
      const isExcludedGlobally = excludedCategories.value.includes(category);
      const isExcludedForAccount = account && 
                                 categoryExclusionsByAccount.value[account] && 
                                 categoryExclusionsByAccount.value[account].includes(category);
      
      // Si la catégorie est exclue, ne pas l'inclure
      if (isExcludedGlobally || isExcludedForAccount) {
        return;
      }
      
      const absAmount = Math.abs(amount)
      
      // Si cette catégorie est associée à des remboursements
      if (reimbursedCategories.has(category)) {
        // Récupérer le montant de remboursement disponible pour ce mois et cette catégorie
        const reimbursement = (processedMonthReimbursements[monthKey] || {})[category] || 0
        
        // Si un remboursement est disponible
        if (reimbursement > 0) {
          // Si le remboursement est supérieur à la dépense
          if (reimbursement >= absAmount) {
            // La dépense est entièrement remboursée
            processedMonthReimbursements[monthKey][category] = reimbursement - absAmount
            // Ne rien ajouter aux dépenses si on est dans l'onglet "Dépenses"
            if (transactionType.value !== 'expenses') {
              months[monthKey].expenses += 0
            }
          }
          // Si le remboursement est inférieur à la dépense
          else {
            // Ajouter seulement la partie non remboursée
            months[monthKey].expenses += (absAmount - reimbursement)
            // Le remboursement est entièrement utilisé
            processedMonthReimbursements[monthKey][category] = 0
          }
        }
        // Si pas de remboursement disponible
        else {
          months[monthKey].expenses += absAmount
        }
      }
      // Pour les dépenses sans remboursement
      else {
        months[monthKey].expenses += absAmount
      }
    }
  })
  
  // Trier par date chronologique
  return Object.entries(months)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .reduce((obj, [key, value]) => {
      // Formater pour affichage (ex: "2023-05" devient "Mai 2023")
      const [year, month] = key.split('-')
      const date = new Date(parseInt(year), parseInt(month) - 1)
      const monthName = date.toLocaleDateString('fr-FR', { month: 'short' })
      const displayKey = `${monthName} ${year}`
      
      obj[displayKey] = value
      return obj
    }, {} as Record<string, { expenses: number; income: number }>)
})

// Données pour le graphique en barres (évolution mensuelle)
const monthlyChartData = computed(() => {
  const data = monthlyData.value
  const labels = Object.keys(data)
  let values: Array<number> = []
  
  if (transactionType.value === 'expenses') {
    values = labels.map(label => data[label].expenses)
  } else if (transactionType.value === 'income') {
    values = labels.map(label => data[label].income)
  } else {
    values = labels.map(label => data[label].income - data[label].expenses)
  }
  
  return {
    labels,
    datasets: [{
      label: transactionType.value === 'expenses' ? 'Dépenses' : 
             transactionType.value === 'income' ? 'Revenus' : 'Solde',
      data: values,
      backgroundColor: transactionType.value === 'expenses' ? '#e74c3c' : 
                        transactionType.value === 'income' ? '#42b983' : '#3498db',
      borderColor: transactionType.value === 'expenses' ? '#e74c3c' : 
                    transactionType.value === 'income' ? '#42b983' : '#3498db',
      borderWidth: 1
    }]
  }
})

// Données pour le graphique en camembert (comptes)
const accountChartData = computed(() => {
  const accounts = {} as Record<string, number>
  
  // Utiliser les transactions filtrées par type
  filteredExpensesByType.value.forEach(expense => {
    const account = expense.Compte?.trim() || 'Non spécifié'
    const amount = getAdjustedAmount(expense)
    
    // Vérifier les exclusions de catégories (pour être cohérent avec les autres graphiques)
    const categoryField = amount > 0 ? 'Sous-Catégorie' : 'Catégorie'
    const category = expense[categoryField]?.trim() || 'Non catégorisé'
    
    // Vérifier si cette catégorie est exclue globalement ou pour ce compte spécifique
    const isExcludedGlobally = excludedCategories.value.includes(category)
    const isExcludedForAccount = account && 
                               categoryExclusionsByAccount.value[account] && 
                               categoryExclusionsByAccount.value[account].includes(category)
    
    // Si la catégorie est exclue, ne pas inclure cette transaction
    if (isExcludedGlobally || isExcludedForAccount) {
      return
    }
    
    // Ajouter le montant au total du compte (en valeur absolue)
    const absAmount = Math.abs(amount)
    if (!accounts[account]) {
      accounts[account] = 0
    }
    accounts[account] += absAmount
  })
  
  // Modifier les labels pour indiquer les comptes joints
  const labels = Object.keys(accounts).map(account => {
    if (jointAccounts.value.includes(account)) {
      return `${account} (joint)`
    }
    return account
  })
  
  return {
    labels: labels,
    datasets: [{
      data: Object.values(accounts),
      backgroundColor: [
        '#42b983', '#2c3e50', '#E46651', '#00D8FF', '#DD1B16'
      ],
      borderWidth: 1
    }]
  }
})

// Données pour le graphique de balance revenus/dépenses
const balanceChartData = computed(() => {
  const data = monthlyData.value
  const labels = Object.keys(data)
  
  return {
    labels,
    datasets: [
      {
        label: 'Revenus',
        data: labels.map(label => data[label].income),
        backgroundColor: '#42b983',
        borderColor: '#42b983',
        borderWidth: 1
      },
      {
        label: 'Dépenses',
        data: labels.map(label => data[label].expenses),
        backgroundColor: '#e74c3c',
        borderColor: '#e74c3c',
        borderWidth: 1
      }
    ]
  }
})

// Options communes pour les graphiques
const chartOptions = ref({
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'bottom' as const
    },
    tooltip: {
      callbacks: {
        label: function(context: any) {
          const value = context.raw
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
          }).format(value)
        }
      }
    }
  }
})

// Options spéciales pour le graphique de balance
const balanceChartOptions = computed(() => ({
  ...chartOptions.value,
  scales: {
    x: {
      stacked: false,
    },
    y: {
      stacked: false,
      ticks: {
        callback: function(value: any) {
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency', 
            currency: 'EUR',
            maximumFractionDigits: 0
          }).format(value)
        }
      }
    }
  }
}))

function goBack() {
  emit('back')
}
</script>

<style scoped>
.tabs {
  display: flex;
  margin-bottom: 20px;
  background: #f5f8fa;
  border-radius: 6px;
  overflow: hidden;
}

.tab-btn {
  flex: 1;
  padding: 10px;
  cursor: pointer;
  background: transparent;
  border: none;
  color: #555;
  font-weight: 500;
  transition: all 0.3s;
  border-bottom: 3px solid transparent;
}

.tab-btn:hover {
  background: rgba(66, 185, 131, 0.1);
}

.tab-btn.active {
  background: white;
  color: #42b983;
  border-bottom: 3px solid #42b983;
}

.summary-cards {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  margin: 20px 0;
  gap: 15px;
}

.card {
  background-color: #f5f8fa;
  border-radius: 8px;
  padding: 15px;
  flex: 1 0 20%;
  min-width: 120px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  text-align: center;
}

.card-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #42b983;
  position: relative;
}

.card-value.negative {
  color: #e74c3c;
}

.card-value.positive {
  color: #42b983;
}

.card-sign {
  position: absolute;
  font-size: 0.8em;
  top: 0;
  right: -15px;
}

.card-adjusted-indicator {
  position: relative;
  top: -8px;
  font-size: 1.1em;
  color: #7957d5;
  margin-left: 4px;
  cursor: help;
}

.joint-accounts-count {
  font-size: 0.7em;
  color: #7957d5;
  margin-left: 5px;
}

.card-label {
  font-size: 0.9rem;
  color: #666;
  margin-top: 5px;
}

.filter-section {
  margin: 20px 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
}

.filter-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.filter-select {
  padding: 8px 12px;
  border-radius: 4px;
  border: 1px solid #ddd;
  background: white;
  color: #333;
  font-size: 14px;
  min-width: 200px;
}

.advanced-filter-btn {
  padding: 8px 16px;
  background: #f0f0f0;
  color: #555;
  border: 1px solid #ddd;
  border-radius: 4px;
  cursor: pointer;
  font-size: 14px;
  transition: all 0.2s;
}

.advanced-filter-btn:hover {
  background: #e0e0e0;
}

.advanced-filters {
  margin: 10px 0 20px;
  padding: 15px;
  background: #f9f9f9;
  border-radius: 6px;
  border: 1px solid #e0e0e0;
}

.checkbox-container {
  display: flex;
  flex-wrap: wrap;
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
}

.checkbox-item {
  flex: 0 0 33.33%;
  padding: 5px 10px;
  display: flex;
  align-items: center;
}

.checkbox-item input {
  margin-right: 8px;
}

.exclude-categories {
  flex-direction: column;
  align-items: flex-start;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 5px;
}

.tooltip-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background-color: #7957d5;
  color: white;
  font-size: 12px;
  font-weight: bold;
  cursor: help;
}

.filter-info {
  margin-top: 10px;
  padding: 8px 12px;
  background: #f0f5ff;
  border-radius: 4px;
  font-size: 0.9rem;
  color: #555;
}

.charts-container {
  display: flex;
  flex-direction: column;
  gap: 30px;
  margin-bottom: 30px;
}

.chart-box {
  background-color: #fff;
  border-radius: 8px;
  padding: 20px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  height: 350px;
}

.transactions-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
  flex-wrap: wrap;
  gap: 15px;
}

.category-filter {
  display: flex;
  align-items: center;
  gap: 10px;
}

.transactions-table {
  height: auto;
  max-height: 500px;
}

.table-container {
  overflow-y: auto;
  max-height: 400px;
}

table {
  width: 100%;
  border-collapse: collapse;
}

th, td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid #eee;
}

th {
  background-color: #f8f8f8;
  font-weight: 600;
  color: #333;
}

.description {
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.negative {
  color: #e74c3c;
}

.positive {
  color: #42b983;
}

.sign {
  font-size: 0.8em;
  margin-left: 2px;
}

.joint-indicator {
  font-size: 0.8em;
  background-color: #7957d5;
  color: white;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: 4px;
  cursor: help;
}

.adjusted-amount {
  position: relative;
  text-decoration: none;
  border-bottom: 1px dashed #666;
}

.table-footer {
  padding: 10px;
  text-align: center;
  font-size: 0.9rem;
  color: #888;
}

.table-legend {
  padding: 8px 10px;
  margin-top: 5px;
  font-size: 0.85rem;
  background-color: #f8f9fa;
  border-radius: 4px;
  border-left: 3px solid #7957d5;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #555;
}

.existing-associations {
  margin-bottom: 15px;
  padding-bottom: 10px;
  border-bottom: 1px solid #e0e0e0;
}

.new-association {
  margin-top: 15px;
}

h5 {
  margin: 5px 0 10px 0;
  font-size: 0.95rem;
  color: #444;
}

.association-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  padding: 8px 10px;
  background-color: #f0f5ff;
  border-radius: 4px;
  font-size: 0.9rem;
}

.association-details {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.association-arrow {
  margin: 0 8px;
  color: #7957d5;
  font-weight: bold;
}

.income-category {
  color: #42b983;
  font-weight: 500;
}

.expense-category {
  color: #e74c3c;
  font-weight: 500;
}

.association-amounts {
  font-size: 0.85rem;
  color: #666;
  margin-top: 4px;
}

.income-amount {
  color: #42b983;
}

.expense-amount {
  color: #e74c3c;
}

.association-separator {
  margin: 0 5px;
  color: #999;
}

.association-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.association-selects {
  display: flex;
  align-items: center;
}

.add-association-btn {
  background: #7957d5;
  color: white;
  padding: 6px 12px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  align-self: flex-start;
}

.add-association-btn:hover {
  background: #6742c0;
}

.add-association-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.remove-association-btn {
  background: none;
  border: none;
  color: #999;
  font-size: 1.2rem;
  padding: 0 5px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.remove-association-btn:hover {
  color: #e74c3c;
}

.remove-icon {
  font-weight: bold;
}

.no-categories-message {
  font-style: italic;
  color: #999;
  font-size: 0.9rem;
  margin: 10px 0;
}

.association-error {
  color: #e74c3c;
  margin-top: 10px;
  font-size: 0.9rem;
  padding: 8px 10px;
  background-color: #ffeaea;
  border-radius: 4px;
  border-left: 3px solid #e74c3c;
}

h4 {
  margin-top: 0;
  color: #2c3e50;
  font-size: 1.1rem;
  margin-bottom: 15px;
}

.back-btn {
  background: #7c8c9e;
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  font-weight: 600;
  cursor: pointer;
  margin-top: 20px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  transition: background 0.2s;
}

.back-btn:hover {
  background: #66778a;
}

@media (min-width: 768px) {
  .charts-container {
    flex-direction: row;
    flex-wrap: wrap;
  }
  
  .chart-box {
    flex: 1 0 45%;
  }
}

@media (max-width: 768px) {
  .filter-section, .transactions-header {
    flex-direction: column;
    align-items: flex-start;
  }
  
  .filter-group, .category-filter {
    width: 100%;
  }
  
  .filter-select {
    flex-grow: 1;
  }
}
</style>
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
        </div>
        <div class="card-label">{{ transactionType === 'income' ? 'Total revenus' : transactionType === 'expenses' ? 'Total dépenses' : 'Solde' }}</div>
      </div>
      <div class="card">
        <div class="card-value">
          {{ Math.abs(averageAmount).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
        </div>
        <div class="card-label">Moyenne par transaction</div>
      </div>
      <div class="card">
        <div class="card-value">{{ uniqueAccounts.length }}</div>
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
                  {{ Math.abs(parseFloat(expense.Montant)).toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}
                  <span class="sign">{{ parseFloat(expense.Montant) < 0 ? '-' : '+' }}</span>
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
    filtered = filtered.filter(expense => parseFloat(expense.Montant) < 0)
  } else if (transactionType.value === 'income') {
    filtered = filtered.filter(expense => parseFloat(expense.Montant) > 0)
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
      const amount = parseFloat(expense.Montant)
      
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
const totalAmount = computed(() =>
  filteredExpensesByType.value.reduce((sum, e) => sum + (parseFloat(e.Montant) || 0), 0)
)

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
  
  filteredExpensesByType.value.forEach(expense => {
    const amount = parseFloat(expense.Montant) || 0
    const absAmount = Math.abs(amount)
    
    // Pour les revenus (montant > 0), utiliser la sous-catégorie
    if (amount > 0) {
      const subCategory = expense['Sous-Catégorie']?.trim() || 'Non catégorisé'
      if (!categories[subCategory]) {
        categories[subCategory] = 0
      }
      categories[subCategory] += absAmount
    } 
    // Pour les dépenses, utiliser la catégorie normale
    else {
      const category = expense.Catégorie?.trim() || 'Non catégorisé'
      if (!categories[category]) {
        categories[category] = 0
      }
      categories[category] += absAmount
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
  
  filteredExpensesByType.value.forEach(expense => {
    // Extraire le mois-année (format: "YYYY-MM")
    const dateStr = expense.Date
    if (!dateStr) return
    
    // Le format de date peut varier selon l'export Bankin - adapter si nécessaire
    let monthKey
    if (dateStr.includes('/')) {
      // Format "DD/MM/YYYY"
      const parts = dateStr.split('/')
      monthKey = `${parts[2]}-${parts[1]}`
    } else if (dateStr.includes('-')) {
      // Format "YYYY-MM-DD"
      monthKey = dateStr.substring(0, 7)
    } else {
      return
    }
    
    const amount = parseFloat(expense.Montant) || 0
    
    if (!months[monthKey]) {
      months[monthKey] = { expenses: 0, income: 0 }
    }
    
    if (amount < 0) {
      months[monthKey].expenses += Math.abs(amount)
    } else {
      months[monthKey].income += amount
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
    const amount = Math.abs(parseFloat(expense.Montant) || 0)
    
    if (!accounts[account]) {
      accounts[account] = 0
    }
    accounts[account] += amount
  })
  
  return {
    labels: Object.keys(accounts),
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

.table-footer {
  padding: 10px;
  text-align: center;
  font-size: 0.9rem;
  color: #888;
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
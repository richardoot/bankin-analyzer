<template>
  <div v-if="expenses.length">
    <h3>Analyse des dépenses</h3>
    
    <!-- Résumé chiffré -->
    <div class="summary-cards">
      <div class="card">
        <div class="card-value">{{ expenses.length }}</div>
        <div class="card-label">Transactions</div>
      </div>
      <div class="card">
        <div class="card-value">{{ totalAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}</div>
        <div class="card-label">Total</div>
      </div>
      <div class="card">
        <div class="card-value">{{ averageAmount.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' }) }}</div>
        <div class="card-label">Moyenne</div>
      </div>
    </div>

    <!-- Graphiques -->
    <div class="charts-container">
      <!-- Graphique par catégorie -->
      <div class="chart-box">
        <h4>Dépenses par catégorie</h4>
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
import { Doughnut, Bar } from 'vue-chartjs'

// Enregistrer tous les composants Chart.js nécessaires
Chart.register(...registerables)

const props = defineProps<{
  expenses: CsvRow[]
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

// Calculer les totaux
const totalAmount = computed(() =>
  props.expenses.reduce((sum, e) => sum + (parseFloat(e.Montant) || 0), 0)
)

const averageAmount = computed(() =>
  props.expenses.length ? totalAmount.value / props.expenses.length : 0
)

// Préparer les données par catégorie
const categoryData = computed(() => {
  const categories = {} as Record<string, number>
  
  props.expenses.forEach(expense => {
    // Utiliser la catégorie ou "Non catégorisé" si manquante
    const category = expense.Catégorie?.trim() || 'Non catégorisé'
    const amount = parseFloat(expense.Montant) || 0
    
    if (!categories[category]) {
      categories[category] = 0
    }
    categories[category] += amount
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

// Préparer les données par mois
const monthlyData = computed(() => {
  const months = {} as Record<string, number>
  
  props.expenses.forEach(expense => {
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
      months[monthKey] = 0
    }
    months[monthKey] += amount
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
    }, {} as Record<string, number>)
})

// Données pour le graphique en barres (évolution mensuelle)
const monthlyChartData = computed(() => {
  const data = monthlyData.value
  
  return {
    labels: Object.keys(data),
    datasets: [{
      label: 'Montant total',
      data: Object.values(data),
      backgroundColor: '#42b983',
      borderColor: '#42b983',
      borderWidth: 1
    }]
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

function goBack() {
  emit('back')
}
</script>

<style scoped>
.summary-cards {
  display: flex;
  justify-content: space-between;
  margin: 20px 0;
  gap: 15px;
}

.card {
  background-color: #f5f8fa;
  border-radius: 8px;
  padding: 15px;
  flex: 1;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05);
  text-align: center;
}

.card-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #42b983;
}

.card-label {
  font-size: 0.9rem;
  color: #666;
  margin-top: 5px;
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
</style>
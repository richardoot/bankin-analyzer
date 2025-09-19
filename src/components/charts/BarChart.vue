<template>
  <BaseCard variant="default" class="bar-chart-container">
    <!-- En-tête du graphique -->
    <div class="chart-header">
      <div class="chart-header-content">
        <div class="chart-title-section">
          <h3 class="chart-title">
            <svg
              class="chart-title-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <rect x="7" y="7" width="3" height="9" />
              <rect x="14" y="7" width="3" height="5" />
            </svg>
            {{ title }}
          </h3>
          <p class="chart-description">
            Évolution mensuelle des
            {{
              type === 'expenses'
                ? 'dépenses'
                : type === 'income'
                  ? 'revenus'
                  : 'flux financiers'
            }}
          </p>
        </div>

        <!-- Filtre par catégorie -->
        <div
          v-if="
            availableCategories &&
            availableCategories.length > 0 &&
            (type === 'expenses' || type === 'income')
          "
          class="category-filter-section"
        >
          <label for="category-select" class="filter-label">
            Filtrer par catégorie :
          </label>
          <select
            id="category-select"
            v-model="selectedCategory"
            class="category-select"
          >
            <option value="all">Toutes les catégories</option>
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
    </div>

    <!-- Annonce des changements de données pour les lecteurs d'écran -->
    <div class="sr-only" aria-live="polite" aria-atomic="false">
      Graphique mis à jour: {{ currentChartData.months.length }} mois affichés
      <span v-if="type === 'expenses'">
        , total des dépenses {{ formatAmount(totalAmount) }}
      </span>
      <span v-else-if="type === 'income'">
        , total des revenus {{ formatAmount(totalAmount) }}
      </span>
    </div>

    <!-- Zone du graphique -->
    <div ref="chartContainerRef" class="chart-container">
      <!-- SVG de l'histogramme -->
      <div class="chart-svg-container">
        <svg
          class="bar-chart-svg"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          :aria-label="`Graphique en barres des ${type === 'expenses' ? 'dépenses' : type === 'income' ? 'revenus' : 'flux financiers'} par mois`"
        >
          <!-- Grille de fond -->
          <defs>
            <pattern
              id="grid"
              width="50"
              height="40"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 50 0 L 0 0 0 40"
                fill="none"
                stroke="rgba(229, 231, 235, 0.3)"
                stroke-width="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          <!-- Axe Y (valeurs) -->
          <g class="y-axis">
            <line
              :x1="padding.left"
              :y1="padding.top"
              :x2="padding.left"
              :y2="svgHeight - padding.bottom"
              stroke="rgba(107, 114, 128, 0.3)"
              stroke-width="2"
            />
            <!-- Graduations Y -->
            <g v-for="(tick, index) in yTicks" :key="`y-tick-${index}`">
              <line
                :x1="padding.left - 5"
                :y1="getYPosition(tick)"
                :x2="padding.left"
                :y2="getYPosition(tick)"
                stroke="rgba(107, 114, 128, 0.5)"
                stroke-width="1"
              />
              <text
                :x="padding.left - 10"
                :y="getYPosition(tick) + 5"
                text-anchor="end"
                class="axis-label"
                fill="#374151"
                font-size="16"
                font-weight="600"
              >
                {{ formatShortAmount(tick) }}
              </text>
            </g>
          </g>

          <!-- Axe X (mois) -->
          <g class="x-axis">
            <line
              :x1="padding.left"
              :y1="svgHeight - padding.bottom"
              :x2="svgWidth - padding.right"
              :y2="svgHeight - padding.bottom"
              stroke="rgba(107, 114, 128, 0.3)"
              stroke-width="2"
            />
            <!-- Graduations X -->
            <g
              v-for="(month, index) in currentChartData.months"
              :key="`x-tick-${index}`"
            >
              <line
                :x1="getXPosition(index)"
                :y1="svgHeight - padding.bottom"
                :x2="getXPosition(index)"
                :y2="svgHeight - padding.bottom + 5"
                stroke="rgba(107, 114, 128, 0.5)"
                stroke-width="1"
              />
              <text
                :x="getXPosition(index)"
                :y="svgHeight - padding.bottom + 25"
                text-anchor="middle"
                class="axis-label"
                fill="#374151"
                font-size="15"
                font-weight="600"
              >
                {{ formatMonthShort(month) }}
              </text>
            </g>
          </g>

          <!-- Barres de l'histogramme -->
          <g v-if="currentChartData.months.length > 0" class="bars">
            <!-- Barres principales -->
            <g
              v-for="(month, index) in currentChartData.months"
              :key="`bar-${index}`"
            >
              <!-- Barre des dépenses (si type expenses ou comparison) -->
              <rect
                v-if="type === 'expenses' || type === 'comparison'"
                :x="getBarX(index, type === 'comparison' ? 0 : 0)"
                :y="
                  getYPosition(
                    type === 'comparison'
                      ? month.expenses
                      : getMonthValue(month)
                  )
                "
                :width="barWidth / (type === 'comparison' ? 2.2 : 1)"
                :height="
                  getBarHeight(
                    type === 'comparison'
                      ? month.expenses
                      : getMonthValue(month)
                  )
                "
                :fill="getBarColor('expenses')"
                stroke="rgba(255, 255, 255, 0.1)"
                stroke-width="1"
                class="bar expenses-bar"
                @click="handleBarClick(month, 'expenses')"
                @mouseenter="handleBarHover($event, month, 'expenses')"
                @mouseleave="handleBarLeave"
              />

              <!-- Barre des revenus (si type income ou comparison) -->
              <rect
                v-if="type === 'income' || type === 'comparison'"
                :x="getBarX(index, type === 'comparison' ? 1 : 0)"
                :y="
                  getYPosition(
                    type === 'comparison' ? month.income : getMonthValue(month)
                  )
                "
                :width="barWidth / (type === 'comparison' ? 2.2 : 1)"
                :height="
                  getBarHeight(
                    type === 'comparison' ? month.income : getMonthValue(month)
                  )
                "
                :fill="getBarColor('income')"
                stroke="rgba(255, 255, 255, 0.1)"
                stroke-width="1"
                class="bar income-bar"
                @click="handleBarClick(month, 'income')"
                @mouseenter="handleBarHover($event, month, 'income')"
                @mouseleave="handleBarLeave"
              />

              <!-- Barre du solde net (si type net) -->
              <rect
                v-if="type === 'net'"
                :x="getBarX(index, 0)"
                :y="getYPosition(Math.max(0, month.net))"
                :width="barWidth"
                :height="Math.abs(getBarHeight(month.net))"
                :fill="getBarColor('net', month.net)"
                stroke="rgba(255, 255, 255, 0.1)"
                stroke-width="1"
                class="bar net-bar"
                @click="handleBarClick(month, 'net')"
                @mouseenter="handleBarHover($event, month, 'net')"
                @mouseleave="handleBarLeave"
              />
            </g>
          </g>

          <!-- Ligne zéro pour le type net -->
          <line
            v-if="type === 'net'"
            :x1="padding.left"
            :y1="getYPosition(0)"
            :x2="svgWidth - padding.right"
            :y2="getYPosition(0)"
            stroke="#374151"
            stroke-width="2"
            stroke-dasharray="5,5"
          />
        </svg>
      </div>

      <!-- Légende -->
      <div class="chart-legend">
        <div v-if="type === 'comparison'" class="legend-items">
          <div class="legend-item expenses">
            <div class="legend-color expenses"></div>
            <span class="legend-label">Dépenses</span>
          </div>
          <div class="legend-item income">
            <div class="legend-color income"></div>
            <span class="legend-label">Revenus</span>
          </div>
        </div>
        <div v-else class="legend-single">
          <div class="legend-item">
            <div
              class="legend-color"
              :class="type"
              :style="{ backgroundColor: getBarColor(type) }"
            ></div>
            <span class="legend-label">
              {{
                type === 'expenses'
                  ? 'Dépenses'
                  : type === 'income'
                    ? 'Revenus'
                    : 'Solde net'
              }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Tooltip pour les valeurs -->
    <div v-if="hoveredBar" class="chart-tooltip" :style="tooltipStyle">
      <div class="tooltip-content">
        <div class="tooltip-month">
          {{ hoveredBar.month.month }} {{ hoveredBar.month.year }}
        </div>
        <div class="tooltip-values">
          <!-- Mode comparaison : afficher toutes les valeurs -->
          <div v-if="type === 'comparison'">
            <div>
              <span class="tooltip-label expenses">💸 Dépenses:</span>
              <span class="tooltip-value">{{
                props.formatAmount(hoveredBar.month.expenses)
              }}</span>
            </div>
            <div>
              <span class="tooltip-label income">💰 Revenus:</span>
              <span class="tooltip-value">{{
                props.formatAmount(hoveredBar.month.income)
              }}</span>
            </div>
          </div>

          <!-- Mode dépenses : afficher seulement les dépenses -->
          <div v-else-if="hoveredBar.type === 'expenses'">
            <span class="tooltip-label expenses">💸 Dépenses:</span>
            <span class="tooltip-value">{{
              props.formatAmount(hoveredBar.month.expenses)
            }}</span>
          </div>

          <!-- Mode revenus : afficher seulement les revenus -->
          <div v-else-if="hoveredBar.type === 'income'">
            <span class="tooltip-label income">💰 Revenus:</span>
            <span class="tooltip-value">{{
              props.formatAmount(hoveredBar.month.income)
            }}</span>
          </div>

          <!-- Mode solde net : afficher le solde -->
          <div v-else-if="hoveredBar.type === 'net'">
            <span
              class="tooltip-label net"
              :class="{
                positive: hoveredBar.month.net >= 0,
                negative: hoveredBar.month.net < 0,
              }"
            >
              💵 Solde net:
            </span>
            <span
              class="tooltip-value"
              :class="{
                positive: hoveredBar.month.net >= 0,
                negative: hoveredBar.month.net < 0,
              }"
            >
              {{ props.formatAmount(hoveredBar.month.net) }}
            </span>
          </div>

          <!-- Afficher le nombre de transactions -->
          <div class="tooltip-transactions">
            <span class="tooltip-label">📊 Transactions:</span>
            <span class="tooltip-value">{{
              hoveredBar.month.transactionCount
            }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Message quand pas de données -->
    <div v-if="currentChartData.months.length === 0" class="empty-state">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
        <path d="M8 12h8" />
      </svg>
      <p class="empty-message">Aucune donnée mensuelle à afficher</p>
    </div>
  </BaseCard>
</template>

<script setup lang="ts">
  import type { BarChartData, MonthlyData } from '@/composables/useBarChart'
  import type {
    CsvAnalysisResult,
    Transaction as GlobalTransaction,
  } from '@/types'
  import { computed, ref } from 'vue'
  import BaseCard from '@/components/shared/BaseCard.vue'
  import { useFormatting } from '@/composables/useFormatting'

  interface Props {
    chartData: BarChartData
    title: string
    type: 'expenses' | 'income' | 'net' | 'comparison'
    formatAmount: (amount: number) => string
    availableCategories?: string[]
    analysisResult?: CsvAnalysisResult
  }

  const props = defineProps<Props>()

  // Émissions pour les interactions
  const emit = defineEmits<{
    monthClick: [month: MonthlyData, type: string]
  }>()

  // Utiliser le composable de formatage (préparation future)
  const { formatAmount: _formatAmountFromComposable } = useFormatting()

  // Référence au conteneur du graphique
  const chartContainerRef = ref<HTMLElement | null>(null)

  // État local pour le filtrage par catégorie
  const selectedCategory = ref<string>('all')

  // État pour le hover des barres
  const hoveredBar = ref<{
    month: MonthlyData
    type: string
    x: number
    y: number
  } | null>(null)

  // Style du tooltip basé sur la position du hover
  const tooltipStyle = computed(() => {
    if (!hoveredBar.value) return {}
    return {
      left: `${hoveredBar.value.x}px`,
      top: `${hoveredBar.value.y}px`,
      transform: 'translate(-50%, 10px)',
    }
  })

  // Logique de filtrage par catégorie
  const filteredChartData = computed(() => {
    if (
      !props.availableCategories ||
      !props.analysisResult ||
      selectedCategory.value === 'all'
    ) {
      return props.chartData
    }

    // Calculer les données mensuelles pour la catégorie sélectionnée
    const transactions = props.analysisResult.transactions || []
    const monthlyData = new Map<
      string,
      { expenses: number; income: number; transactionCount: number }
    >()

    // Filtrer les transactions par catégorie et type
    transactions
      .filter((transaction: GlobalTransaction) => {
        const matchesCategory = transaction.category === selectedCategory.value
        const matchesType =
          (props.type === 'expenses' && transaction.type === 'expense') ||
          (props.type === 'income' && transaction.type === 'income')
        return matchesCategory && matchesType
      })
      .forEach((transaction: GlobalTransaction) => {
        // Parser la date
        const dateStr = transaction.date
        if (!dateStr) return

        let date: Date | null = null
        try {
          // Format DD/MM/YYYY (Bankin)
          if (dateStr.includes('/')) {
            const parts = dateStr.split('/')
            if (parts.length === 3) {
              const [day, month, year] = parts
              if (day && month && year) {
                date = new Date(
                  parseInt(year),
                  parseInt(month) - 1,
                  parseInt(day)
                )
              }
            }
          }
        } catch (_error) {
          return
        }

        if (!date || isNaN(date.getTime())) return

        const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

        if (!monthlyData.has(monthKey)) {
          monthlyData.set(monthKey, {
            expenses: 0,
            income: 0,
            transactionCount: 0,
          })
        }

        const monthData = monthlyData.get(monthKey)
        if (!monthData) return

        const amount = Math.abs(transaction.amount)

        if (transaction.type === 'expense') {
          monthData.expenses += amount
        } else if (transaction.type === 'income') {
          monthData.income += amount
        }
        monthData.transactionCount++
      })

    // Convertir en format MonthlyData
    const months = Array.from(monthlyData.entries())
      .map(([monthKey, data]) => {
        const parts = monthKey.split('-')
        if (parts.length !== 2) return null

        const [yearStr, monthStr] = parts
        if (!yearStr || !monthStr) return null

        const monthNames = [
          'Jan',
          'Fév',
          'Mar',
          'Avr',
          'Mai',
          'Jun',
          'Jul',
          'Aoû',
          'Sep',
          'Oct',
          'Nov',
          'Déc',
        ]

        const yearNum = parseInt(yearStr)
        const monthIndex = parseInt(monthStr) - 1

        if (
          isNaN(yearNum) ||
          monthIndex < 0 ||
          monthIndex >= 12 ||
          !monthNames[monthIndex]
        ) {
          return null
        }

        return {
          month: monthNames[monthIndex] as string,
          year: yearNum,
          monthKey,
          expenses: data.expenses,
          income: data.income,
          net: data.income - data.expenses,
          transactionCount: data.transactionCount,
        }
      })
      .filter((month): month is NonNullable<typeof month> => month !== null)
      .sort((a, b) => a.monthKey.localeCompare(b.monthKey))

    const maxValue = Math.max(
      ...months.map(m => Math.max(m.expenses, m.income)),
      0
    )
    const minValue = Math.min(
      ...months.map(m => Math.min(m.expenses, m.income, m.net)),
      0
    )
    const totalExpenses = months.reduce((sum, m) => sum + m.expenses, 0)
    const totalIncome = months.reduce((sum, m) => sum + m.income, 0)

    return {
      months,
      maxValue,
      minValue,
      totalExpenses,
      totalIncome,
      totalNet: totalIncome - totalExpenses,
    }
  })

  // Utiliser les données filtrées ou les données originales
  const currentChartData = computed(() => {
    return selectedCategory.value === 'all'
      ? props.chartData
      : filteredChartData.value
  })

  // Total amount selon le type de graphique
  const totalAmount = computed(() => {
    if (props.type === 'expenses') {
      return currentChartData.value.totalExpenses
    } else if (props.type === 'income') {
      return currentChartData.value.totalIncome
    } else if (props.type === 'net') {
      return currentChartData.value.totalNet
    }
    return 0
  })

  // Configuration du SVG
  const svgWidth = 1000
  const svgHeight = 400
  const padding = {
    top: 30,
    right: 60,
    bottom: 80,
    left: 100,
  }

  // Dimensions calculées
  const chartWidth = computed(() => svgWidth - padding.left - padding.right)
  const chartHeight = computed(() => svgHeight - padding.top - padding.bottom)
  const barWidth = computed(() => {
    if (currentChartData.value.months.length === 0) return 0
    return Math.max(
      20,
      (chartWidth.value / currentChartData.value.months.length) * 0.8
    )
  })

  // Graduations de l'axe Y
  const yTicks = computed(() => {
    const max = currentChartData.value.maxValue
    const min = props.type === 'net' ? currentChartData.value.minValue : 0
    const range = max - min
    const tickCount = 6
    const tickSize = range / (tickCount - 1)

    return Array.from({ length: tickCount }, (_, i) => min + i * tickSize)
  })

  // Position Y basée sur la valeur
  const getYPosition = (value: number): number => {
    const max = currentChartData.value.maxValue
    const min = props.type === 'net' ? currentChartData.value.minValue : 0
    const ratio = (value - min) / (max - min)
    return svgHeight - padding.bottom - ratio * chartHeight.value
  }

  // Position X basée sur l'index du mois
  const getXPosition = (index: number): number => {
    const spacing = chartWidth.value / currentChartData.value.months.length
    return padding.left + spacing * index + spacing / 2
  }

  // Position X d'une barre
  const getBarX = (index: number, subIndex: number = 0): number => {
    const centerX = getXPosition(index)
    const offset =
      props.type === 'comparison' ? ((subIndex - 0.5) * barWidth.value) / 2 : 0
    return centerX - barWidth.value / 2 + offset
  }

  // Hauteur d'une barre
  const getBarHeight = (value: number): number => {
    const max = currentChartData.value.maxValue
    const min = props.type === 'net' ? currentChartData.value.minValue : 0
    return (Math.abs(value) * chartHeight.value) / (max - min)
  }

  // Valeur d'un mois selon le type
  const getMonthValue = (month: MonthlyData): number => {
    switch (props.type) {
      case 'expenses':
        return month.expenses
      case 'income':
        return month.income
      case 'net':
        return month.net
      default:
        return 0
    }
  }

  // Couleur des barres
  const getBarColor = (type: string, value: number = 0): string => {
    switch (type) {
      case 'expenses':
        return '#ef4444'
      case 'income':
        return '#10b981'
      case 'net':
        return value >= 0 ? '#10b981' : '#ef4444'
      default:
        return '#6b7280'
    }
  }

  // Gestion du clic sur les barres
  const handleBarClick = (month: MonthlyData, type: string) => {
    emit('monthClick', month, type)
  }

  // Gestion du hover sur les barres
  const handleBarHover = (
    event: MouseEvent,
    month: MonthlyData,
    type: string
  ) => {
    const rect = (event.target as SVGRectElement).getBoundingClientRect()
    const container = chartContainerRef.value?.getBoundingClientRect()

    if (container) {
      hoveredBar.value = {
        month,
        type,
        x: rect.left + rect.width / 2 - container.left,
        y: rect.top - container.top,
      }
    }
  }

  // Gestion de la sortie du hover
  const handleBarLeave = () => {
    hoveredBar.value = null
  }

  // Formatage court des montants pour les axes (logique originale)
  const formatShortAmount = (amount: number): string => {
    // Protection contre les valeurs undefined/null/NaN
    if (amount == null || isNaN(amount)) {
      return '0€'
    }

    const abs = Math.abs(amount)
    if (abs >= 1000000) {
      return `${(amount / 1000000).toFixed(1)}M€`
    } else if (abs >= 10000) {
      return `${(amount / 1000).toFixed(0)}k€`
    } else if (abs >= 1000) {
      return `${(amount / 1000).toFixed(1)}k€`
    } else {
      return `${amount.toFixed(0)}€`
    }
  }

  // Formatage court des mois
  const formatMonthShort = (month: MonthlyData): string => {
    const date = new Date(`${month.year}-${month.monthKey.split('-')[1]}-01`)
    return date.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })
  }
</script>

<style scoped>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .bar-chart-container {
    width: 100%;
    max-width: 100%;
    min-height: 450px;
    margin-bottom: 1rem;
    overflow: visible;
    position: relative;
  }

  .chart-header {
    background: rgba(248, 250, 252, 0.5);
    backdrop-filter: blur(5px);
    padding: 1.5rem 2rem 1rem;
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  }

  .chart-header-content {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .chart-title-section {
    text-align: left;
    flex: 1;
    min-width: 250px;
  }

  .chart-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem;
  }

  .chart-title-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .chart-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  .category-filter-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 200px;
  }

  .filter-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin: 0;
  }

  .category-select {
    padding: 0.5rem 0.75rem;
    border: 1px solid rgba(209, 213, 219, 0.5);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
    background: var(--surface-color, rgba(255, 255, 255, 0.7));
    backdrop-filter: blur(5px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease;
    min-width: 180px;
  }

  .category-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .chart-container {
    padding: 1.5rem;
    position: relative;
    overflow: visible;
    max-width: 100%;
  }

  .chart-svg-container {
    width: 100%;
    margin-bottom: 1.5rem;
  }

  .bar-chart-svg {
    width: 100%;
    height: auto;
    overflow: visible;
  }

  .axis-label {
    font-family:
      system-ui,
      -apple-system,
      sans-serif;
    font-size: 16px;
    font-weight: 600;
  }

  .bar {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .chart-legend {
    display: flex;
    justify-content: center;
    margin-top: 1rem;
  }

  .legend-items {
    display: flex;
    gap: 1.5rem;
  }

  .legend-single {
    display: flex;
    justify-content: center;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .legend-color {
    width: 1rem;
    height: 1rem;
    border-radius: 0.25rem;
  }

  .legend-color.expenses {
    background-color: #ef4444;
  }

  .legend-color.income {
    background-color: #10b981;
  }

  .legend-color.net {
    background: linear-gradient(45deg, #10b981 50%, #ef4444 50%);
  }

  .legend-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  .empty-state {
    text-align: center;
    padding: 3rem 2rem;
    color: #6b7280;
  }

  .empty-icon {
    width: 3rem;
    height: 3rem;
    margin: 0 auto 1rem;
    opacity: 0.5;
  }

  .empty-message {
    font-size: 1rem;
    font-weight: 500;
    margin: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .bar-chart-container {
      min-height: 500px;
    }

    .chart-header {
      padding: 1rem 1.5rem 0.75rem;
    }

    .chart-title {
      font-size: 1.125rem;
    }

    .chart-container {
      padding: 1.5rem;
    }

    .legend-items {
      gap: 1rem;
    }

    .axis-label {
      font-size: 14px;
    }
  }

  @media (max-width: 480px) {
    .bar-chart-container {
      min-height: 400px;
    }

    .chart-header {
      padding: 0.75rem 1rem 0.5rem;
    }

    .chart-title {
      font-size: 1rem;
      flex-direction: column;
      gap: 0.25rem;
    }

    .chart-container {
      padding: 1rem;
    }

    .legend-items {
      flex-direction: column;
      gap: 0.5rem;
    }

    .axis-label {
      font-size: 13px;
    }
  }

  /* Support du thème sombre */
  @media (prefers-color-scheme: dark) {
    .chart-header {
      background: rgba(31, 41, 55, 0.5);
      border-bottom-color: rgba(75, 85, 99, 0.3);
    }

    .chart-title {
      color: #f3f4f6;
    }

    .chart-description {
      color: #9ca3af;
    }

    .filter-label {
      color: #e5e7eb;
    }

    .category-select {
      background: rgba(31, 41, 55, 0.7);
      border-color: rgba(75, 85, 99, 0.5);
      color: #f3f4f6;
    }

    .axis-label {
      fill: #e5e7eb;
    }

    .legend-label {
      color: #e5e7eb;
    }

    .empty-state {
      color: #9ca3af;
    }
  }
  /* Tooltip styles */
  .chart-tooltip {
    position: absolute;
    pointer-events: none;
    z-index: 50;
    background: rgba(17, 24, 39, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.1);
    animation: fadeIn 0.15s ease-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, 5px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 10px);
    }
  }

  .tooltip-content {
    font-size: 0.875rem;
  }

  .tooltip-month {
    font-weight: 600;
    color: #f9fafb;
    margin-bottom: 0.5rem;
    text-align: center;
    font-size: 0.9375rem;
  }

  .tooltip-values {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .tooltip-values > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    white-space: nowrap;
  }

  .tooltip-label {
    font-weight: 500;
    opacity: 0.9;
  }

  .tooltip-label.expenses {
    color: #fca5a5;
  }

  .tooltip-label.income {
    color: #86efac;
  }

  .tooltip-label.net {
    color: #93c5fd;
  }

  .tooltip-label.net.positive {
    color: #86efac;
  }

  .tooltip-label.net.negative {
    color: #fca5a5;
  }

  .tooltip-value {
    font-weight: 600;
    color: #f3f4f6;
    font-family: var(--font-family-mono);
  }

  .tooltip-value.positive {
    color: #86efac;
  }

  .tooltip-value.negative {
    color: #fca5a5;
  }

  .tooltip-transactions {
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    font-size: 0.8125rem;
  }

  .tooltip-transactions .tooltip-label {
    color: #9ca3af;
  }

  .tooltip-transactions .tooltip-value {
    color: #e5e7eb;
  }
</style>

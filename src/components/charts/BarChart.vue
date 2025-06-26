<template>
  <div class="bar-chart-container">
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

    <!-- Zone du graphique -->
    <div ref="chartContainerRef" class="chart-container">
      <!-- SVG de l'histogramme -->
      <div class="chart-svg-container">
        <svg
          class="bar-chart-svg"
          :viewBox="`0 0 ${svgWidth} ${svgHeight}`"
          xmlns="http://www.w3.org/2000/svg"
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
                :stroke="
                  isHovered(index, 'expenses')
                    ? '#ffffff'
                    : 'rgba(255, 255, 255, 0.1)'
                "
                :stroke-width="isHovered(index, 'expenses') ? '2' : '1'"
                class="bar expenses-bar"
                :class="{ 'bar-hovered': isHovered(index, 'expenses') }"
                @mouseenter="handleBarHover(index, 'expenses', true, $event)"
                @mouseleave="handleBarHover(index, 'expenses', false)"
                @click="handleBarClick(month, 'expenses')"
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
                :stroke="
                  isHovered(index, 'income')
                    ? '#ffffff'
                    : 'rgba(255, 255, 255, 0.1)'
                "
                :stroke-width="isHovered(index, 'income') ? '2' : '1'"
                class="bar income-bar"
                :class="{ 'bar-hovered': isHovered(index, 'income') }"
                @mouseenter="handleBarHover(index, 'income', true, $event)"
                @mouseleave="handleBarHover(index, 'income', false)"
                @click="handleBarClick(month, 'income')"
              />

              <!-- Barre du solde net (si type net) -->
              <rect
                v-if="type === 'net'"
                :x="getBarX(index, 0)"
                :y="getYPosition(Math.max(0, month.net))"
                :width="barWidth"
                :height="Math.abs(getBarHeight(month.net))"
                :fill="getBarColor('net', month.net)"
                :stroke="
                  isHovered(index, 'net')
                    ? '#ffffff'
                    : 'rgba(255, 255, 255, 0.1)'
                "
                :stroke-width="isHovered(index, 'net') ? '2' : '1'"
                class="bar net-bar"
                :class="{ 'bar-hovered': isHovered(index, 'net') }"
                @mouseenter="handleBarHover(index, 'net', true, $event)"
                @mouseleave="handleBarHover(index, 'net', false)"
                @click="handleBarClick(month, 'net')"
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
                formatAmount(hoveredBar.month.expenses)
              }}</span>
            </div>
            <div>
              <span class="tooltip-label income">💰 Revenus:</span>
              <span class="tooltip-value">{{
                formatAmount(hoveredBar.month.income)
              }}</span>
            </div>
          </div>

          <!-- Mode dépenses : afficher seulement les dépenses -->
          <div v-else-if="hoveredBar.type === 'expenses'">
            <span class="tooltip-label expenses">💸 Dépenses:</span>
            <span class="tooltip-value">{{
              formatAmount(hoveredBar.month.expenses)
            }}</span>
          </div>

          <!-- Mode revenus : afficher seulement les revenus -->
          <div v-else-if="hoveredBar.type === 'income'">
            <span class="tooltip-label income">💰 Revenus:</span>
            <span class="tooltip-value">{{
              formatAmount(hoveredBar.month.income)
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
              {{ hoveredBar.month.net >= 0 ? '📈' : '📉' }} Solde:
            </span>
            <span
              class="tooltip-value"
              :class="{
                positive: hoveredBar.month.net >= 0,
                negative: hoveredBar.month.net < 0,
              }"
            >
              {{ formatAmount(hoveredBar.month.net) }}
            </span>
          </div>

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
  </div>
</template>

<script setup lang="ts">
  import type { BarChartData, MonthlyData } from '@/composables/useBarChart'
  import type {
    CsvAnalysisResult,
    Transaction as GlobalTransaction,
  } from '@/types'
  import { computed, ref } from 'vue'

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
    monthHover: [month: MonthlyData | null, type: string | null]
  }>()

  // Référence au conteneur du graphique
  const chartContainerRef = ref<HTMLElement | null>(null)

  // État local pour le filtrage par catégorie
  const selectedCategory = ref<string>('all')

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

  // Configuration du SVG
  const svgWidth = 1200
  const svgHeight = 500
  const padding = {
    top: 30,
    right: 60,
    bottom: 80,
    left: 100,
  }

  // État pour les interactions
  const hoveredBar = ref<{
    month: MonthlyData
    type: string
    x: number
    y: number
  } | null>(null)

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

  // Vérification du survol
  const isHovered = (index: number, type: string): boolean => {
    return (
      hoveredBar.value?.month === currentChartData.value.months[index] &&
      hoveredBar.value?.type === type
    )
  }

  // Gestion du survol des barres
  const handleBarHover = (
    index: number,
    type: string,
    isHover: boolean,
    event?: MouseEvent
  ) => {
    if (isHover && event) {
      const month = currentChartData.value.months[index]
      if (!month) return

      // Utiliser la référence directe au conteneur de ce composant
      if (chartContainerRef.value) {
        const containerRect = chartContainerRef.value.getBoundingClientRect()

        // Position relative au conteneur du graphique spécifique
        const relativeX = event.clientX - containerRect.left
        const relativeY = event.clientY - containerRect.top

        hoveredBar.value = {
          month,
          type,
          x: relativeX,
          y: relativeY,
        }
      }

      emit('monthHover', month, type)
    } else {
      hoveredBar.value = null
      emit('monthHover', null, null)
    }
  }

  // Gestion du clic sur les barres
  const handleBarClick = (month: MonthlyData, type: string) => {
    emit('monthClick', month, type)
  }

  // Style du tooltip
  const tooltipStyle = computed(() => {
    if (!hoveredBar.value) return { display: 'none' }

    // Dimensions du tooltip
    const tooltipWidth = 220
    const tooltipHeight = 120
    const offset = 15 // Décalage pour éviter que le tooltip cache la barre

    // Utiliser la référence directe au conteneur de ce composant
    const containerWidth = chartContainerRef.value?.clientWidth || 1000
    const containerHeight = chartContainerRef.value?.clientHeight || 500

    // Position de base : au-dessus de la souris, centrée
    let leftPosition = hoveredBar.value.x
    let topPosition = hoveredBar.value.y - offset
    let transform = 'translate(-50%, -100%)'

    // Gestion du débordement horizontal
    if (leftPosition + tooltipWidth / 2 > containerWidth - 10) {
      // Tooltip déborde à droite : l'aligner à droite de la souris
      leftPosition = hoveredBar.value.x - offset
      transform = 'translate(-100%, -100%)'
    } else if (leftPosition - tooltipWidth / 2 < 10) {
      // Tooltip déborde à gauche : l'aligner à gauche de la souris
      leftPosition = hoveredBar.value.x + offset
      transform = 'translate(0%, -100%)'
    }

    // Gestion du débordement vertical
    if (topPosition - tooltipHeight < 10) {
      // Si le tooltip déborde en haut, le placer en dessous de la souris
      topPosition = hoveredBar.value.y + offset
      if (transform.includes('translate(-50%')) {
        transform = 'translate(-50%, 0%)'
      } else if (transform.includes('translate(-100%')) {
        transform = 'translate(-100%, 0%)'
      } else {
        transform = 'translate(0%, 0%)'
      }
    }

    // S'assurer que le tooltip ne déborde pas en bas
    if (topPosition + tooltipHeight > containerHeight - 10) {
      topPosition = containerHeight - tooltipHeight - 10
      transform = transform.replace('0%', '-100%')
    }

    return {
      position: 'absolute' as const,
      left: `${Math.max(10, Math.min(leftPosition, containerWidth - 10))}px`,
      top: `${Math.max(10, topPosition)}px`,
      transform,
      zIndex: 1000,
      pointerEvents: 'none' as const,
    }
  })

  // Formatage court des montants pour les axes
  const formatShortAmount = (amount: number): string => {
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
  .bar-chart-container {
    background: white;
    border-radius: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid #f3f4f6;
    transition: all 0.3s ease;
    width: 100%;
    max-width: 100%;
    min-height: 600px;
    overflow: visible; /* Permettre au tooltip de sortir légèrement */
    position: relative; /* Assurer le positionnement relatif pour le tooltip */
  }

  .bar-chart-container:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .chart-header {
    background: #f8fafc;
    padding: 1.5rem 2rem 1rem;
    border-bottom: 1px solid #e5e7eb;
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
    border: 1px solid #d1d5db;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    color: #374151;
    background-color: #ffffff;
    box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);
    transition: all 0.2s ease;
    min-width: 180px;
  }

  .category-select:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .category-select:hover {
    border-color: #9ca3af;
  }

  .chart-container {
    padding: 2rem;
    position: relative;
    overflow: visible; /* Permettre au tooltip de déborder légèrement */
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

  .bar:hover {
    opacity: 0.8;
  }

  .bar-hovered {
    filter: brightness(1.1);
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

  .chart-tooltip {
    background: rgba(17, 24, 39, 0.96);
    backdrop-filter: blur(12px);
    border-radius: 0.75rem;
    padding: 1rem 1.25rem;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(255, 255, 255, 0.15);
    pointer-events: none;
    max-width: 280px;
    min-width: 200px;
  }

  .tooltip-content {
    color: white;
    font-size: 0.9rem;
    line-height: 1.4;
  }

  .tooltip-month {
    font-weight: 700;
    margin-bottom: 0.75rem;
    color: #f9fafb;
    font-size: 1rem;
    text-align: center;
    border-bottom: 1px solid rgba(255, 255, 255, 0.2);
    padding-bottom: 0.5rem;
  }

  .tooltip-values {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .tooltip-values > div {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1.5rem;
    padding: 0.25rem 0;
  }

  .tooltip-label {
    font-weight: 600;
    font-size: 0.85rem;
  }

  .tooltip-label.expenses {
    color: #fca5a5;
  }

  .tooltip-label.income {
    color: #6ee7b7;
  }

  .tooltip-label.net.positive {
    color: #6ee7b7;
  }

  .tooltip-label.net.negative {
    color: #fca5a5;
  }

  .tooltip-value {
    font-weight: 700;
    font-size: 0.9rem;
  }

  .tooltip-value.positive {
    color: #6ee7b7;
  }

  .tooltip-value.negative {
    color: #fca5a5;
  }

  .tooltip-transactions {
    padding-top: 0.25rem;
    border-top: 1px solid rgba(255, 255, 255, 0.2);
    margin-top: 0.25rem;
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

    .chart-tooltip {
      max-width: 250px;
      min-width: 180px;
      padding: 0.875rem 1rem;
    }

    .tooltip-month {
      font-size: 0.9rem;
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

    .tooltip-content {
      font-size: 0.8125rem;
    }

    .chart-tooltip {
      max-width: 220px;
      min-width: 160px;
      padding: 0.75rem;
    }

    .axis-label {
      font-size: 13px;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .bar-chart-container {
      background: #1f2937;
      border-color: #374151;
    }

    .chart-header {
      background: #374151;
      border-bottom-color: #4b5563;
    }

    .chart-title {
      color: #f9fafb;
    }

    .chart-description {
      color: #9ca3af;
    }

    .filter-label {
      color: #e5e7eb;
    }

    .category-select {
      background-color: #374151;
      border-color: #4b5563;
      color: #f9fafb;
    }

    .category-select:hover {
      border-color: #6b7280;
    }

    .category-select:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .axis-label {
      fill: #e5e7eb !important;
    }

    .legend-label {
      color: #e5e7eb;
    }

    .empty-message {
      color: #9ca3af;
    }
  }
</style>

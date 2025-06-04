<template>
  <div class="pie-chart-container">
    <!-- En-tête du graphique -->
    <div class="chart-header">
      <h3 class="chart-title">
        <component :is="titleIcon" class="chart-title-icon" />
        {{ title }}
      </h3>
    </div>

    <!-- Zone du graphique -->
    <div class="chart-container">
      <!-- SVG du graphique camembert -->
      <div class="chart-svg-container">
        <svg
          class="pie-chart-svg"
          :viewBox="`0 0 ${svgSize} ${svgSize}`"
          xmlns="http://www.w3.org/2000/svg"
        >
          <!-- Cercle de fond -->
          <circle
            :cx="center"
            :cy="center"
            :r="radius"
            fill="none"
            stroke="rgba(229, 231, 235, 0.3)"
            stroke-width="1"
          />

          <!-- Segments du camembert -->
          <g v-if="chartData.categories.length > 0">
            <path
              v-for="(segment, index) in pieSegments"
              :key="`segment-${index}`"
              :d="segment.pathData"
              :fill="segment.color"
              :stroke="
                segment.isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.1)'
              "
              :stroke-width="segment.isHovered ? '3' : '1'"
              class="pie-segment"
              :class="{ 'segment-hovered': segment.isHovered }"
              @mouseenter="handleSegmentHover(index, true)"
              @mouseleave="handleSegmentHover(index, false)"
              @click="handleSegmentClick(segment.category)"
            />
          </g>

          <!-- Cercle central -->
          <circle
            :cx="center"
            :cy="center"
            :r="innerRadius"
            fill="rgba(255, 255, 255, 0.95)"
            stroke="rgba(229, 231, 235, 0.2)"
            stroke-width="1"
          />

          <!-- Texte central -->
          <text
            :x="center"
            :y="center - 8"
            text-anchor="middle"
            dominant-baseline="middle"
            class="center-text-main"
          >
            {{ chartData.categories.length }}
          </text>
          <text
            :x="center"
            :y="center + 12"
            text-anchor="middle"
            dominant-baseline="middle"
            class="center-text-sub"
          >
            {{ chartData.categories.length === 1 ? 'catégorie' : 'catégories' }}
          </text>
        </svg>

        <!-- Overlay de hover pour afficher les détails -->
        <div
          v-if="hoveredSegment !== null"
          class="hover-overlay"
          :style="overlayPosition"
        >
          <div class="hover-card">
            <div class="hover-category">{{ hoveredSegment.category.name }}</div>
            <div class="hover-amount">
              {{ formatAmount(hoveredSegment.category.value) }}
            </div>
            <div class="hover-percentage">
              {{ formatPercentage(hoveredSegment.category.percentage) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Légende -->
      <div ref="legendContainer" class="chart-legend">
        <div
          v-for="(category, index) in chartData.categories"
          :key="`legend-${index}`"
          :ref="el => setLegendItemRef(el, index)"
          class="legend-item"
          :class="{ 'legend-hovered': hoveredSegmentIndex === index }"
          @mouseenter="handleSegmentHover(index, true)"
          @mouseleave="handleSegmentHover(index, false)"
          @click="handleSegmentClick(category)"
        >
          <div
            class="legend-color"
            :style="{ backgroundColor: category.color }"
          ></div>
          <div class="legend-content">
            <div class="legend-name">{{ category.name }}</div>
            <div class="legend-values">
              <span class="legend-amount">{{
                formatAmount(category.value)
              }}</span>
              <span class="legend-percentage">{{
                formatPercentage(category.percentage)
              }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Message quand pas de données -->
    <div v-if="chartData.categories.length === 0" class="empty-state">
      <svg
        class="empty-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="M8 12h8" />
      </svg>
      <p class="empty-message">Aucune donnée à afficher</p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import type { CategoryData, PieChartData } from '@/composables/usePieChart'
  import { computed, ref, type Component } from 'vue'

  interface Props {
    chartData: PieChartData
    title: string
    type: 'expenses' | 'income'
    formatAmount: (amount: number) => string
    formatPercentage: (percentage: number) => string
  }

  const props = defineProps<Props>()

  // Émissions pour les interactions
  const emit = defineEmits<{
    categoryClick: [category: CategoryData]
    categoryHover: [category: CategoryData | null]
  }>()

  // Configuration du SVG
  const svgSize = 300
  const center = svgSize / 2
  const radius = 120
  const innerRadius = 60

  // État pour les interactions
  const hoveredSegmentIndex = ref<number | null>(null)
  const hoveredSegment = ref<{
    category: CategoryData
    x: number
    y: number
  } | null>(null)

  // Références pour le scroll automatique
  const legendContainer = ref<HTMLElement | null>(null)
  const legendItemRefs = ref<(HTMLElement | null)[]>([])

  // Fonction pour gérer les références des éléments de légende
  const setLegendItemRef = (el: unknown, index: number) => {
    if (el && el instanceof HTMLElement) {
      legendItemRefs.value[index] = el
    }
  }

  // Fonction pour scroller automatiquement vers l'élément survolé
  const scrollToLegendItem = (index: number) => {
    if (!legendContainer.value || !legendItemRefs.value[index]) return

    const container = legendContainer.value
    const item = legendItemRefs.value[index]

    // Position relative de l'élément dans le conteneur
    const itemTop = item.offsetTop
    const itemHeight = item.offsetHeight
    const containerHeight = container.clientHeight
    const scrollTop = container.scrollTop

    // Vérifie si l'élément est visible
    const isAbove = itemTop < scrollTop
    const isBelow = itemTop + itemHeight > scrollTop + containerHeight

    if (isAbove || isBelow) {
      // Calcule la position de scroll pour centrer l'élément
      const targetScrollTop = itemTop - containerHeight / 2 + itemHeight / 2

      // Animation de scroll fluide
      container.scrollTo({
        top: Math.max(0, targetScrollTop),
        behavior: 'smooth',
      })
    }
  }

  // Icône du titre basée sur le type
  const titleIcon = computed((): Component => {
    if (props.type === 'expenses') {
      return {
        template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
        <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
      </svg>`,
      }
    } else {
      return {
        template: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M7 13l3 3 7-7" />
        <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4" />
      </svg>`,
      }
    }
  })

  // Calcul des segments du camembert
  const pieSegments = computed(() => {
    if (props.chartData.categories.length === 0) return []

    let currentAngle = -90 // Commence en haut (12h)

    return props.chartData.categories.map((category, index) => {
      const angleSize = (category.percentage / 100) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + angleSize

      // Calcul des coordonnées pour le path SVG
      const startAngleRad = (startAngle * Math.PI) / 180
      const endAngleRad = (endAngle * Math.PI) / 180

      const x1 = center + radius * Math.cos(startAngleRad)
      const y1 = center + radius * Math.sin(startAngleRad)
      const x2 = center + radius * Math.cos(endAngleRad)
      const y2 = center + radius * Math.sin(endAngleRad)

      const largeArcFlag = angleSize > 180 ? 1 : 0

      const pathData = [
        `M ${center} ${center}`,
        `L ${x1} ${y1}`,
        `A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`,
        'Z',
      ].join(' ')

      currentAngle += angleSize

      return {
        pathData,
        color: category.color,
        category,
        isHovered: hoveredSegmentIndex.value === index,
      }
    })
  })

  // Position de l'overlay de hover
  const overlayPosition = computed(() => {
    if (!hoveredSegment.value) return {}

    return {
      left: `${hoveredSegment.value.x}px`,
      top: `${hoveredSegment.value.y}px`,
      transform: 'translate(-50%, -100%)',
    }
  })

  // Gestion du hover des segments
  const handleSegmentHover = (index: number, isHover: boolean) => {
    if (isHover) {
      hoveredSegmentIndex.value = index
      const category = props.chartData.categories[index]

      if (!category) return

      // Scroll automatique vers l'élément de légende correspondant
      scrollToLegendItem(index)

      // Position approximative pour l'overlay (centré sur le segment)
      const angle =
        props.chartData.categories
          .slice(0, index)
          .reduce((sum, cat) => sum + (cat.percentage / 100) * 360, 0) +
        ((category.percentage / 100) * 360) / 2 -
        90

      const angleRad = (angle * Math.PI) / 180
      const overlayRadius = radius * 0.7
      const x = center + overlayRadius * Math.cos(angleRad)
      const y = center + overlayRadius * Math.sin(angleRad)

      hoveredSegment.value = { category, x, y }
      emit('categoryHover', category)
    } else {
      hoveredSegmentIndex.value = null
      hoveredSegment.value = null
      emit('categoryHover', null)
    }
  }

  // Gestion du clic sur un segment
  const handleSegmentClick = (category: CategoryData) => {
    emit('categoryClick', category)
  }
</script>

<style scoped>
  .pie-chart-container {
    background: white;
    border-radius: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid #f3f4f6;
    transition: all 0.3s ease;
    width: 100%;
    max-width: 100%;
    min-height: 500px;
    margin: 0 auto;
    overflow: hidden;
  }

  .pie-chart-container:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  /* En-tête du graphique */
  .chart-header {
    background: #f8fafc;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .chart-title {
    margin: 0;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .chart-title-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  /* Zone du graphique */
  .chart-container {
    padding: 1.5rem;
    display: flex;
    align-items: center;
    gap: 2rem;
    min-height: 400px;
  }

  /* Conteneur principal du graphique */
  .chart-container {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 2rem;
    justify-content: center;
  }

  /* SVG du graphique */
  .chart-svg-container {
    position: relative;
    width: 300px;
    height: 300px;
  }

  .pie-chart-svg {
    width: 100%;
    height: 100%;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.1));
  }

  .pie-segment {
    cursor: pointer;
    transition: all 0.3s ease;
    transform-origin: center;
  }

  .pie-segment:hover,
  .segment-hovered {
    filter: brightness(1.1);
    transform: scale(1.02);
  }

  /* Texte central */
  .center-text-main {
    font-size: 2rem;
    font-weight: 700;
    fill: #1f2937;
  }

  .center-text-sub {
    font-size: 0.875rem;
    font-weight: 500;
    fill: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* Overlay de hover */
  .hover-overlay {
    position: absolute;
    pointer-events: none;
    z-index: 10;
  }

  .hover-card {
    background: rgba(17, 24, 39, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    color: white;
    font-size: 0.875rem;
    white-space: nowrap;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .hover-category {
    font-weight: 600;
    margin-bottom: 0.25rem;
    color: #f9fafb;
  }

  .hover-amount {
    font-weight: 500;
    color: #d1fae5;
    margin-bottom: 0.125rem;
  }

  .hover-percentage {
    font-weight: 400;
    color: #9ca3af;
    font-size: 0.8125rem;
  }

  /* Légende */
  .chart-legend {
    width: 280px;
    max-height: 300px;
    overflow-y: auto;
    overflow-x: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-right: 0.5rem;
    flex-shrink: 0;
  }

  /* Style de la scrollbar pour la légende */
  .chart-legend::-webkit-scrollbar {
    width: 6px;
  }

  .chart-legend::-webkit-scrollbar-track {
    background: rgba(229, 231, 235, 0.3);
    border-radius: 3px;
  }

  .chart-legend::-webkit-scrollbar-thumb {
    background: rgba(156, 163, 175, 0.5);
    border-radius: 3px;
  }

  .chart-legend::-webkit-scrollbar-thumb:hover {
    background: rgba(156, 163, 175, 0.7);
  }

  /* Indicateur de scroll */
  .chart-legend {
    position: relative;
  }

  .chart-legend::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 20px;
    background: linear-gradient(transparent, rgba(255, 255, 255, 0.8));
    pointer-events: none;
    opacity: 0;
    transition: opacity 0.2s ease;
    border-radius: 0 0 0.5rem 0.5rem;
  }

  .chart-legend:hover::after {
    opacity: 1;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border-radius: 0.5rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .legend-item:hover,
  .legend-hovered {
    background: rgba(243, 244, 246, 0.8);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .legend-color {
    width: 1rem;
    height: 1rem;
    border-radius: 0.25rem;
    flex-shrink: 0;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }

  .legend-content {
    flex: 1;
    min-width: 0;
  }

  .legend-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.125rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .legend-values {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .legend-amount {
    font-size: 0.8125rem;
    font-weight: 600;
    color: #1f2937;
  }

  .legend-percentage {
    font-size: 0.8125rem;
    font-weight: 500;
    color: #6b7280;
    padding: 0.125rem 0.5rem;
    background: rgba(229, 231, 235, 0.5);
    border-radius: 0.375rem;
  }

  /* État vide */
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3rem 1rem;
    text-align: center;
  }

  .empty-icon {
    width: 3rem;
    height: 3rem;
    color: #9ca3af;
    margin-bottom: 1rem;
  }

  .empty-message {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
    font-weight: 500;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .pie-chart-container {
      margin: 1rem;
      padding: 1rem;
      min-height: 400px;
    }

    .chart-container {
      flex-direction: column;
      align-items: center;
      gap: 1.5rem;
    }

    .chart-legend {
      width: 100%;
      max-width: 300px;
      max-height: 200px;
    }
  }

  @media (max-width: 640px) {
    .pie-chart-container {
      margin: 0.5rem;
      padding: 0.75rem;
      min-height: 350px;
    }

    .chart-svg-container {
      width: 250px;
      height: 250px;
    }

    .legend-item {
      padding: 0.5rem;
    }

    .legend-name {
      font-size: 0.8125rem;
    }

    .legend-values {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.25rem;
    }

    .chart-legend {
      max-height: 180px;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .pie-chart-container {
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

    .center-text-main {
      fill: #f9fafb;
    }

    .center-text-sub {
      fill: #9ca3af;
    }

    .legend-item {
      background: rgba(55, 65, 81, 0.6);
      border-color: rgba(75, 85, 99, 0.3);
    }

    .legend-item:hover,
    .legend-hovered {
      background: rgba(75, 85, 99, 0.8);
    }

    .legend-name {
      color: #e5e7eb;
    }

    .legend-amount {
      color: #f9fafb;
    }

    .legend-percentage {
      color: #9ca3af;
      background: rgba(75, 85, 99, 0.5);
    }

    .empty-message {
      color: #9ca3af;
    }

    .empty-icon {
      color: #6b7280;
    }

    .chart-legend::-webkit-scrollbar-track {
      background: rgba(75, 85, 99, 0.3);
    }

    .chart-legend::-webkit-scrollbar-thumb {
      background: rgba(156, 163, 175, 0.3);
    }

    .chart-legend::-webkit-scrollbar-thumb:hover {
      background: rgba(156, 163, 175, 0.5);
    }

    .chart-legend::after {
      background: linear-gradient(transparent, rgba(31, 41, 55, 0.8));
    }
  }
</style>

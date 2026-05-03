<script setup lang="ts">
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts'
  import type { ApexOptions } from 'apexcharts'
  import { useChartTheme } from '@/composables/useChartTheme'

  export interface ChartData {
    labels: string[]
    values: number[]
  }

  const props = withDefaults(
    defineProps<{
      data: ChartData
      title: string
      /** Top N categories to display individually; the rest are merged into "Autres". 0 disables grouping. */
      topN?: number
    }>(),
    {
      topN: 7,
    }
  )

  const { isDark, strokeColor, donutNameColor, donutValueColor } =
    useChartTheme()

  const PALETTE = [
    '#f97316', // orange-500
    '#8b5cf6', // violet-500
    '#06b6d4', // cyan-500
    '#eab308', // yellow-500
    '#ec4899', // pink-500
    '#14b8a6', // teal-500
    '#6366f1', // indigo-500
    '#f59e0b', // amber-500
    '#a855f7', // purple-500
    '#0ea5e9', // sky-500
  ]
  const OTHERS_COLOR_LIGHT = '#9ca3af' // gray-400
  const OTHERS_COLOR_DARK = '#64748b' // slate-500

  /**
   * Build the displayed data: keep the top N categories by value
   * and merge the remainder into a single "Autres" slice.
   */
  const processedData = computed<{
    labels: string[]
    values: number[]
    othersCount: number
  }>(() => {
    const pairs = props.data.labels.map((label, i) => ({
      label,
      value: props.data.values[i] ?? 0,
    }))
    pairs.sort((a, b) => b.value - a.value)

    const cap = props.topN > 0 ? props.topN : pairs.length
    if (pairs.length <= cap) {
      return {
        labels: pairs.map(p => p.label),
        values: pairs.map(p => p.value),
        othersCount: 0,
      }
    }

    const top = pairs.slice(0, cap)
    const rest = pairs.slice(cap)
    const othersValue = rest.reduce((sum, p) => sum + p.value, 0)
    return {
      labels: [...top.map(p => p.label), `Autres (${rest.length})`],
      values: [...top.map(p => p.value), othersValue],
      othersCount: rest.length,
    }
  })

  const sliceColors = computed(() => {
    const baseCount =
      processedData.value.othersCount > 0
        ? processedData.value.labels.length - 1
        : processedData.value.labels.length
    const colors = Array.from(
      { length: baseCount },
      (_, i) => PALETTE[i % PALETTE.length] ?? '#888'
    )
    if (processedData.value.othersCount > 0) {
      colors.push(isDark.value ? OTHERS_COLOR_DARK : OTHERS_COLOR_LIGHT)
    }
    return colors
  })

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'donut',
      fontFamily: 'Inter, system-ui, sans-serif',
      background: 'transparent',
      dropShadow: {
        enabled: true,
        top: 2,
        left: 0,
        blur: 8,
        opacity: isDark.value ? 0.3 : 0.15,
      },
      animations: {
        enabled: true,
        easing: 'easeinout',
        speed: 600,
        animateGradually: {
          enabled: true,
          delay: 100,
        },
        dynamicAnimation: {
          enabled: true,
          speed: 300,
        },
      },
    },
    labels: processedData.value.labels,
    legend: {
      show: false,
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 3,
      colors: [strokeColor.value],
    },
    tooltip: {
      enabled: true,
      fillSeriesColor: false,
      theme: isDark.value ? 'dark' : 'light',
      style: {
        fontSize: '13px',
        fontFamily: 'Inter, system-ui, sans-serif',
      },
      y: {
        formatter: (value: number) => {
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
          }).format(value)
        },
      },
    },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '70%',
          background: 'transparent',
          labels: {
            show: true,
            name: {
              show: true,
              fontSize: '14px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 500,
              color: donutNameColor.value,
              offsetY: -8,
            },
            value: {
              show: true,
              fontSize: '24px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 700,
              color: donutValueColor.value,
              offsetY: 4,
              formatter: (val: string) => {
                return new Intl.NumberFormat('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                }).format(Number(val))
              },
            },
            total: {
              show: true,
              showAlways: true,
              label: 'Total',
              fontSize: '14px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 500,
              color: donutNameColor.value,
              formatter: () => {
                const total = processedData.value.values.reduce(
                  (sum, val) => sum + val,
                  0
                )
                return new Intl.NumberFormat('fr-FR', {
                  style: 'currency',
                  currency: 'EUR',
                  maximumFractionDigits: 0,
                }).format(total)
              },
            },
          },
        },
      },
    },
    states: {
      hover: {
        filter: {
          type: 'darken',
          value: 0.9,
        },
      },
      active: {
        filter: {
          type: 'none',
        },
      },
    },
    colors: sliceColors.value,
    responsive: [],
  }))

  const series = computed(() => processedData.value.values)
</script>

<template>
  <div class="w-full h-full">
    <VueApexCharts
      v-if="data.values.length > 0"
      :key="isDark ? 'dark' : 'light'"
      type="donut"
      height="100%"
      :options="chartOptions"
      :series="series"
    />
    <div v-else class="py-12 text-center text-gray-500 dark:text-gray-400">
      Aucune donnée disponible
    </div>
  </div>
</template>

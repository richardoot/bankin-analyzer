<script setup lang="ts">
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts/core'
  import '@/lib/apexcharts-features'
  import type { ApexOptions } from 'apexcharts'
  import { useChartTheme } from '@/composables/useChartTheme'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'
  import { assignCategoryColors } from '@/lib/chartPalette'

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

  const {
    isDark,
    strokeColor,
    donutNameColor,
    donutValueColor,
    chartAnimations,
  } = useChartTheme()
  // The legend is always drawn — under the donut on a phone, beside it on
  // a desk — so a slice can be named without hovering it.
  const isMobile = useIsMobile()

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

  // The same assignment the category list uses, so a slice and its row
  // share a color by construction.
  const sliceColors = computed(() => {
    const colors = assignCategoryColors(
      processedData.value.labels,
      processedData.value.values,
      props.topN,
      isDark.value
    )
    return processedData.value.labels.map(label => colors.get(label) ?? '#888')
  })

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'donut',
      // No download menu: the dashboard lists the same numbers next to it.
      toolbar: { show: false },
      fontFamily: 'Inter, system-ui, sans-serif',
      background: 'transparent',
      dropShadow: {
        enabled: true,
        top: 2,
        left: 0,
        blur: 8,
        opacity: isDark.value ? 0.3 : 0.15,
      },
      animations: chartAnimations.value,
    },
    labels: processedData.value.labels,
    legend: {
      show: true,
      position: isMobile.value ? 'bottom' : 'right',
      fontSize: '12px',
      fontFamily: 'Inter, system-ui, sans-serif',
      labels: { colors: donutNameColor.value },
      markers: { size: 5 },
      itemMargin: { horizontal: 6, vertical: 2 },
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
        formatter: (value: number) => formatCurrency(value),
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
              fontSize: isMobile.value ? '18px' : '24px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 700,
              color: donutValueColor.value,
              offsetY: 4,
              formatter: (val: string) => formatCompactCurrency(Number(val)),
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
                return formatCompactCurrency(total)
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
    <!-- No remount on a theme switch: the options are reactive and the
         chart updates in place, instead of replaying its whole intro. -->
    <VueApexCharts
      v-if="data.values.length > 0"
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

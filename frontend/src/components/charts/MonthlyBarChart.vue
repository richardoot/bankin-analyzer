<script setup lang="ts">
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts/core'
  import '@/lib/apexcharts-features'
  import type { ApexOptions } from 'apexcharts'
  import { useChartTheme } from '@/composables/useChartTheme'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'

  export interface ChartData {
    labels: string[]
    values: number[]
  }

  const props = withDefaults(
    defineProps<{
      data: ChartData
      title: string
      color: string
      negativeColor?: string
      /**
       * The `YYYY-MM` behind each bar, aligned with `data.labels`. Given,
       * a bar becomes a way to its month: the chart emits `select-month`
       * and draws the bars with a pointer. The screen that listens adds
       * the keyboard way (a link beside the chart) — a bar cannot be one.
       */
      months?: string[] | undefined
    }>(),
    {
      negativeColor: '#22c55e', // green for reimbursements/credits
      months: undefined,
    }
  )

  const emit = defineEmits<{
    /** A bar was clicked — the `YYYY-MM` it stands for. */
    (e: 'select-month', yearMonth: string): void
  }>()

  const selectable = computed(() => props.months !== undefined)

  function onBarSelected(config?: { dataPointIndex: number }): void {
    const index = config?.dataPointIndex ?? -1
    const month = props.months?.[index]
    if (month) emit('select-month', month)
  }

  const { isDark, labelColor, chartTheme, chartAnimations } = useChartTheme()
  // A 300px chart with twelve full-currency ticks is unreadable at 375px:
  // shorter, compact axis labels, rotated month names.
  const isMobile = useIsMobile()

  // Compute colors array based on positive/negative values
  const barColors = computed(() =>
    props.data.values.map(value =>
      value < 0 ? props.negativeColor : props.color
    )
  )

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'bar',
      toolbar: {
        show: false,
      },
      fontFamily: 'inherit',
      background: 'transparent',
      animations: chartAnimations.value,
      ...(selectable.value && {
        events: {
          dataPointSelection: (
            _event: unknown,
            _context: unknown,
            config?: { dataPointIndex: number }
          ) => onBarSelected(config),
        },
      }),
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        columnWidth: '60%',
        distributed: true, // Enable per-bar coloring
      },
    },
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: false, // Hide legend when using distributed colors
    },
    xaxis: {
      categories: props.data.labels,
      labels: {
        rotate: -45,
        rotateAlways: isMobile.value,
        hideOverlappingLabels: true,
        style: {
          colors: labelColor.value,
          fontSize: isMobile.value ? '11px' : '12px',
        },
      },
      axisBorder: {
        show: false,
      },
      axisTicks: {
        show: false,
      },
    },
    yaxis: {
      ...(isMobile.value ? { tickAmount: 4 } : {}),
      labels: {
        style: {
          colors: labelColor.value,
          fontSize: isMobile.value ? '11px' : '12px',
        },
        formatter: (value: number) =>
          formatCompactCurrency(value, { compact: isMobile.value }),
      },
    },
    grid: {
      borderColor: chartTheme.value.grid?.borderColor || '#e5e7eb',
      strokeDashArray: 4,
    },
    colors: barColors.value,
    tooltip: {
      theme: isDark.value ? 'dark' : 'light',
      y: {
        formatter: (value: number) => formatCurrency(value),
      },
    },
  }))

  const series = computed(() => [
    {
      name: props.title,
      data: props.data.values,
    },
  ])
</script>

<template>
  <div
    class="w-full"
    :class="selectable ? '[&_.apexcharts-bar-area]:cursor-pointer' : ''"
  >
    <VueApexCharts
      type="bar"
      :height="isMobile ? 220 : 300"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

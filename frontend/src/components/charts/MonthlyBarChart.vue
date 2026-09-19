<script setup lang="ts">
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts'
  import type { ApexOptions } from 'apexcharts'
  import { useChartTheme } from '@/composables/useChartTheme'
  import { useIsMobile } from '@/composables/useMediaQuery'

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
    }>(),
    {
      negativeColor: '#22c55e', // green for reimbursements/credits
    }
  )

  const { isDark, labelColor, chartTheme } = useChartTheme()
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
        formatter: (value: number) => {
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: isMobile.value ? 1 : 0,
            ...(isMobile.value ? { notation: 'compact' as const } : {}),
          }).format(value)
        },
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
        formatter: (value: number) => {
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
          }).format(value)
        },
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
  <div class="w-full">
    <VueApexCharts
      :key="isDark ? 'dark' : 'light'"
      type="bar"
      :height="isMobile ? 220 : 300"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

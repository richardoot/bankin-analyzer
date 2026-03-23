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
      color: string
      negativeColor?: string
    }>(),
    {
      negativeColor: '#22c55e', // green for reimbursements/credits
    }
  )

  const { isDark, labelColor, chartTheme } = useChartTheme()

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
        style: {
          colors: labelColor.value,
          fontSize: '12px',
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
      labels: {
        style: {
          colors: labelColor.value,
          fontSize: '12px',
        },
        formatter: (value: number) => {
          return new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
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
      height="300"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

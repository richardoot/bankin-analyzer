<script setup lang="ts">
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts'
  import type { ApexOptions } from 'apexcharts'

  export interface ChartData {
    labels: string[]
    values: number[]
  }

  const props = defineProps<{
    data: ChartData
    title: string
  }>()

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'donut',
      fontFamily: 'Inter, system-ui, sans-serif',
      dropShadow: {
        enabled: true,
        top: 2,
        left: 0,
        blur: 8,
        opacity: 0.15,
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
    labels: props.data.labels,
    legend: {
      show: false,
    },
    dataLabels: {
      enabled: false,
    },
    stroke: {
      show: true,
      width: 3,
      colors: ['#ffffff'],
    },
    tooltip: {
      enabled: true,
      fillSeriesColor: false,
      theme: 'light',
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
              color: '#6b7280',
              offsetY: -8,
            },
            value: {
              show: true,
              fontSize: '24px',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontWeight: 700,
              color: '#111827',
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
              color: '#6b7280',
              formatter: () => {
                const total = props.data.values.reduce(
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
    colors: [
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
    ],
    responsive: [],
  }))

  const series = computed(() => props.data.values)
</script>

<template>
  <div class="w-full h-full">
    <VueApexCharts
      v-if="data.values.length > 0"
      type="donut"
      height="100%"
      :options="chartOptions"
      :series="series"
    />
    <div v-else class="py-12 text-center text-gray-500">
      Aucune donnée disponible
    </div>
  </div>
</template>

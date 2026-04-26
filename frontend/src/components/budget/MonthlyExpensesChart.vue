<script setup lang="ts">
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts'
  import type { ApexOptions } from 'apexcharts'
  import { useChartTheme } from '@/composables/useChartTheme'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    /** Total expenses per month (chronological) */
    monthlyTotals: number[]
    /** Month labels like ['2025-04', '2025-05', ...] */
    monthLabels: string[]
    /** Average monthly income — shown as a reference line */
    averageIncome: number
    /** Total budget — shown as a reference line */
    totalBudget: number
  }>()

  const { isDark, labelColor, chartTheme } = useChartTheme()

  const MONTHS_FR = [
    'Jan',
    'Fev',
    'Mar',
    'Avr',
    'Mai',
    'Juin',
    'Juil',
    'Aout',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ]

  function getCurrentYearMonth(): string {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  }

  const currentYearMonth = getCurrentYearMonth()

  // Build display labels and detect current month index
  const displayLabels = computed(() =>
    props.monthLabels.map(ym => {
      const month = parseInt(ym.split('-')[1] ?? '1', 10)
      return MONTHS_FR[month - 1] ?? ym
    })
  )

  const currentMonthIndex = computed(() =>
    props.monthLabels.indexOf(currentYearMonth)
  )

  // Bar colors: amber for current month, gray for others
  const barColors = computed(() =>
    props.monthLabels.map(
      ym =>
        ym === currentYearMonth
          ? '#f59e0b' // amber-500
          : isDark.value
            ? '#64748b' // slate-500
            : '#9ca3af' // gray-400
    )
  )

  // Annotations: horizontal lines for income and budget
  const yAnnotations = computed(() => {
    const annotations: ApexAnnotations['yaxis'] = []
    if (props.averageIncome > 0) {
      annotations.push({
        y: props.averageIncome,
        borderColor: '#34d399',
        strokeDashArray: 4,
        label: {
          text: `Revenus ${formatCurrency(props.averageIncome)}`,
          position: 'right',
          borderColor: 'transparent',
          style: {
            color: '#34d399',
            background: 'transparent',
            fontSize: '11px',
            fontWeight: '500',
            padding: { left: 4, right: 4, top: 2, bottom: 2 },
          },
        },
      })
    }
    if (props.totalBudget > 0) {
      annotations.push({
        y: props.totalBudget,
        borderColor: '#818cf8',
        strokeDashArray: 4,
        label: {
          text: `Budget ${formatCurrency(props.totalBudget)}`,
          position: 'right',
          borderColor: 'transparent',
          style: {
            color: '#818cf8',
            background: 'transparent',
            fontSize: '11px',
            fontWeight: '500',
            padding: { left: 4, right: 4, top: 2, bottom: 2 },
          },
        },
      })
    }
    return annotations
  })

  // Point annotation for current month
  const xAnnotations = computed(() => {
    if (currentMonthIndex.value < 0) return []
    const label = displayLabels.value[currentMonthIndex.value]
    if (!label) return []
    return [
      {
        x: label,
        borderColor: '#f59e0b',
        strokeDashArray: 3,
        label: {
          text: 'En cours',
          orientation: 'horizontal' as const,
          borderColor: '#f59e0b',
          style: {
            color: '#0f172a',
            background: '#f59e0b',
            fontSize: '10px',
            fontWeight: '600',
            padding: { left: 6, right: 6, top: 2, bottom: 2 },
          },
        },
      },
    ]
  })

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'inherit',
      background: 'transparent',
    },
    plotOptions: {
      bar: {
        borderRadius: 3,
        columnWidth: '55%',
        distributed: true,
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: displayLabels.value,
      labels: {
        style: {
          colors: props.monthLabels.map(ym =>
            ym === currentYearMonth ? '#f59e0b' : labelColor.value
          ),
          fontSize: '11px',
          fontWeight: props.monthLabels.map(ym =>
            ym === currentYearMonth ? '700' : '400'
          ),
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        style: {
          colors: labelColor.value,
          fontSize: '11px',
        },
        formatter: (value: number) =>
          new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR',
            maximumFractionDigits: 0,
          }).format(value),
      },
    },
    grid: {
      borderColor: chartTheme.value.grid?.borderColor ?? '#e5e7eb',
      strokeDashArray: 4,
    },
    colors: barColors.value,
    annotations: {
      yaxis: yAnnotations.value,
      xaxis: xAnnotations.value,
    },
    tooltip: {
      theme: isDark.value ? 'dark' : 'light',
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const val = props.monthlyTotals[dataPointIndex] ?? 0
        const ym = props.monthLabels[dataPointIndex] ?? ''
        const isCurrent = ym === currentYearMonth

        // Full month name
        const fullMonths = [
          'Janvier',
          'Fevrier',
          'Mars',
          'Avril',
          'Mai',
          'Juin',
          'Juillet',
          'Aout',
          'Septembre',
          'Octobre',
          'Novembre',
          'Decembre',
        ]
        const parts = ym.split('-')
        const monthIdx = parseInt(parts[1] ?? '1', 10)
        const fullLabel = `${fullMonths[monthIdx - 1] ?? ym} ${parts[0]}`

        const diffBudget =
          props.totalBudget > 0 ? val - props.totalBudget : null
        const epargne =
          props.averageIncome > 0 ? props.averageIncome - val : null

        let html = `<div style="padding:8px 12px;font-size:12px;line-height:1.6">`
        html += `<div style="font-weight:600;margin-bottom:2px">${fullLabel}`
        if (isCurrent)
          html += ` <span style="color:#f59e0b;font-weight:400">(en cours)</span>`
        html += `</div>`
        html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:0.7">Depenses</span><strong>${formatCurrency(val)}</strong></div>`
        if (diffBudget !== null) {
          const color = diffBudget > 0 ? '#f87171' : '#34d399'
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:0.7">vs Budget</span><span style="color:${color};font-weight:600">${diffBudget > 0 ? '+' : ''}${formatCurrency(diffBudget)}</span></div>`
        }
        if (epargne !== null) {
          const color = epargne >= 0 ? '#34d399' : '#f87171'
          html += `<div style="display:flex;justify-content:space-between;gap:16px"><span style="opacity:0.7">Epargne</span><span style="color:${color};font-weight:600">${formatCurrency(epargne)}</span></div>`
        }
        html += `</div>`
        return html
      },
    },
  }))

  const series = computed(() => [
    {
      name: 'Depenses',
      data: props.monthlyTotals,
    },
  ])
</script>

<template>
  <div v-if="monthlyTotals.length >= 2" class="w-full">
    <!-- Legend -->
    <div
      class="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400 dark:text-gray-500 mb-1"
    >
      <span class="flex items-center gap-1.5">
        <span
          class="inline-block w-3 h-2 rounded-sm"
          :class="isDark ? 'bg-slate-500' : 'bg-gray-400'"
        ></span>
        Depenses
      </span>
      <span class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-2 rounded-sm bg-amber-500"></span>
        Mois en cours
      </span>
      <span v-if="averageIncome > 0" class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-0.5 bg-emerald-400"></span>
        Revenus
      </span>
      <span v-if="totalBudget > 0" class="flex items-center gap-1.5">
        <span class="inline-block w-3 h-0.5 bg-indigo-400"></span>
        Budget
      </span>
    </div>

    <VueApexCharts
      :key="isDark ? 'dark' : 'light'"
      type="bar"
      :height="280"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

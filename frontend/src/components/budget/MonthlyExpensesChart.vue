<script setup lang="ts">
  /**
   * « Dépenses et enveloppe par mois » (agent-os/product/budget-refonte.md,
   * lot 5), drawn to the dashboard's chart (`IncomeExpensesChart`): the
   * plan's started months in columns of the one data hue, the current
   * month lighter, the comparison's months in light grey — and only while
   * the envelopes are edited, the page passing no comparison otherwise.
   * The total envelope dashed and the income solid, both in the text's
   * ink. The legend names only what is drawn; the tooltip says the gap to
   * the envelope in words, without a colour.
   */
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts/core'
  import '@/lib/apexcharts-features'
  import type { ApexOptions } from 'apexcharts'
  import { useChartTheme } from '@/composables/useChartTheme'
  import {
    formatCompactCurrency,
    formatCurrency,
    formatMonth,
  } from '@/lib/formatters'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import { DATA_HUE } from '@/lib/stateTints'
  import { budgetChartMonths, thisYearMonth } from '@/lib/budgetChartMonths'

  const props = defineProps<{
    /** Total expenses per month, aligned with `monthLabels`. */
    monthlyTotals: number[]
    /** Month labels like ['2025-04', '2025-05', ...] */
    monthLabels: string[]
    /** Average monthly income — the solid ink line. */
    averageIncome: number
    /** Total envelope — the dashed ink line. */
    totalBudget: number
    /** First month covered by the budget plan (YYYY-MM). */
    planStartMonth?: string | undefined
    /** Last month covered by the budget plan (YYYY-MM). */
    planEndMonth?: string | undefined
    /** First month of the comparison range (YYYY-MM), editing only. */
    comparisonStartMonth?: string | undefined
    /** Last month of the comparison range (YYYY-MM), editing only. */
    comparisonEndMonth?: string | undefined
    /** The month still running, drawn lighter. Defaults to today's. */
    currentMonth?: string | undefined
  }>()

  const emit = defineEmits<{
    /** A bar was clicked — the YYYY-MM it stands for. */
    (e: 'select-month', yearMonth: string): void
  }>()

  const { isDark, labelColor, chartTheme, chartAnimations, donutValueColor } =
    useChartTheme()
  const isMobile = useIsMobile()

  /** The one data hue of the page, the share bars' blue-400. */
  const BAR_COLOR = DATA_HUE
  /** The same blue, lighter: the current month, half a month. */
  const BAR_COLOR_CURRENT = 'rgba(96, 165, 250, 0.4)'
  /** The comparison's months: light grey, the past it is set against. */
  const COMPARISON_LIGHT = '#d1d5db' // gray-300
  const COMPARISON_DARK = '#475569' // slate-600

  const thisMonth = computed(() => props.currentMonth ?? thisYearMonth())

  const months = computed(() =>
    budgetChartMonths(props.monthLabels, {
      planStartMonth: props.planStartMonth,
      planEndMonth: props.planEndMonth,
      comparisonStartMonth: props.comparisonStartMonth,
      comparisonEndMonth: props.comparisonEndMonth,
      currentMonth: thisMonth.value,
    })
  )

  const totals = computed(() =>
    months.value.map(m => props.monthlyTotals[m.index] ?? 0)
  )

  const displayLabels = computed(() =>
    months.value.map(m => formatMonth(m.ym, { year: false }))
  )

  const hasComparison = computed(() =>
    months.value.some(m => m.kind === 'comparison')
  )
  const hasCurrentMonth = computed(() =>
    months.value.some(m => m.ym === thisMonth.value)
  )

  const comparisonColor = computed(() =>
    isDark.value ? COMPARISON_DARK : COMPARISON_LIGHT
  )

  const barColors = computed(() =>
    months.value.map(m => {
      if (m.kind === 'comparison') return comparisonColor.value
      return m.ym === thisMonth.value ? BAR_COLOR_CURRENT : BAR_COLOR
    })
  )

  const inkColor = computed(() => donutValueColor.value)

  // On a ~340px plot the full « Revenus 3 456,78 € » labels overlapped the
  // bars and each other; a phone gets « Rev. 3,5 k€ » on the left.
  const compact = (n: number): string =>
    formatCompactCurrency(n, { compact: true })

  type YAnnotation = NonNullable<
    NonNullable<ApexOptions['annotations']>['yaxis']
  >[number]

  function referenceLine(
    y: number,
    text: string,
    dashed: boolean
  ): YAnnotation {
    return {
      y,
      borderColor: inkColor.value,
      strokeDashArray: dashed ? 4 : 0,
      label: {
        text,
        position: isMobile.value ? 'left' : 'right',
        textAnchor: isMobile.value ? 'start' : 'end',
        borderColor: 'transparent',
        style: {
          color: inkColor.value,
          background: 'transparent',
          fontSize: '11px',
          fontWeight: '500',
          padding: { left: 4, right: 4, top: 2, bottom: 2 },
        },
      },
    }
  }

  /** The two references: the envelope dashed, the income solid. */
  const yAnnotations = computed(() => {
    const lines: YAnnotation[] = []
    if (props.averageIncome > 0) {
      lines.push(
        referenceLine(
          props.averageIncome,
          isMobile.value
            ? `Rev. ${compact(props.averageIncome)}`
            : `Revenus ${formatCurrency(props.averageIncome)}`,
          false
        )
      )
    }
    if (props.totalBudget > 0) {
      lines.push(
        referenceLine(
          props.totalBudget,
          isMobile.value
            ? `Env. ${compact(props.totalBudget)}`
            : `Enveloppe ${formatCurrency(props.totalBudget)}`,
          true
        )
      )
    }
    return lines
  })

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /** The gap to the envelope, in words. */
  function envelopeGap(value: number): string | null {
    if (props.totalBudget <= 0) return null
    const gap = value - props.totalBudget
    if (Math.abs(gap) < 0.005) return 'pile l’enveloppe'
    return gap > 0
      ? `${formatCurrency(gap)} au-dessus de l’enveloppe`
      : `${formatCurrency(-gap)} sous l’enveloppe`
  }

  /** A month's tooltip, in Apex's own markup so its theme applies. */
  function tooltip(index: number): string {
    const m = months.value[index]
    if (!m) return ''
    const value = totals.value[index] ?? 0
    const line = (label: string, text: string) =>
      `<div class="apexcharts-tooltip-series-group apexcharts-active" style="display:flex">` +
      `<div class="apexcharts-tooltip-text"><div class="apexcharts-tooltip-y-group">` +
      `<span class="apexcharts-tooltip-text-y-label">${escapeHtml(label)} : </span>` +
      `<span class="apexcharts-tooltip-text-y-value">${escapeHtml(text)}</span>` +
      `</div></div></div>`
    const name = formatMonth(m.ym, { style: 'long' })
    const title =
      m.ym === thisMonth.value
        ? `${name} · en cours`
        : m.kind === 'comparison'
          ? `${name} · comparaison`
          : name
    const rows = [line('Dépenses', formatCurrency(value))]
    const gap = envelopeGap(value)
    if (gap) rows.push(line('Enveloppe', gap))
    if (props.averageIncome > 0) {
      rows.push(line('Épargne', formatCurrency(props.averageIncome - value)))
    }
    return (
      `<div class="apexcharts-tooltip-title">${escapeHtml(title)}</div>` +
      rows.join('')
    )
  }

  const chartOptions = computed<ApexOptions>(() => ({
    chart: {
      type: 'bar',
      toolbar: { show: false },
      fontFamily: 'inherit',
      background: 'transparent',
      animations: chartAnimations.value,
      events: {
        // Reading a bar and then hunting for the same month in a selector is
        // one step too many: the bar IS the month.
        dataPointSelection: (
          _event: unknown,
          _context: unknown,
          config?: { dataPointIndex: number }
        ) => {
          const ym =
            config === undefined
              ? undefined
              : months.value[config.dataPointIndex]?.ym
          if (ym) emit('select-month', ym)
        },
      },
    },
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        // Wider bars on a phone: each one opens its month.
        columnWidth: isMobile.value ? '75%' : '60%',
        distributed: true,
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      categories: displayLabels.value,
      labels: {
        rotate: -45,
        rotateAlways: isMobile.value,
        hideOverlappingLabels: true,
        style: {
          colors: labelColor.value,
          fontSize: isMobile.value ? '11px' : '12px',
        },
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
    },
    yaxis: {
      min: 0,
      ...(isMobile.value ? { tickAmount: 4 } : {}),
      labels: {
        style: {
          colors: labelColor.value,
          fontSize: isMobile.value ? '11px' : '12px',
        },
        formatter: (value: number) =>
          isMobile.value ? compact(value) : formatCompactCurrency(value),
      },
    },
    grid: {
      borderColor: chartTheme.value.grid?.borderColor ?? '#e5e7eb',
      strokeDashArray: 4,
    },
    colors: barColors.value,
    annotations: { yaxis: yAnnotations.value },
    tooltip: {
      theme: isDark.value ? 'dark' : 'light',
      custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
        tooltip(dataPointIndex),
    },
  }))

  const series = computed(() => [{ name: 'Dépenses', data: totals.value }])
</script>

<template>
  <div
    v-if="months.length >= 2"
    class="w-full [&_.apexcharts-bar-area]:cursor-pointer"
    data-testid="monthly-expenses-chart"
  >
    <div
      data-testid="chart-legend"
      class="mb-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500 sm:gap-x-4 sm:text-xs dark:text-gray-400"
    >
      <span class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block h-2.5 w-3 rounded-sm"
          data-testid="legend-plan-swatch"
          :style="{ backgroundColor: BAR_COLOR }"
        />
        Dépenses
      </span>
      <span
        v-if="hasCurrentMonth"
        class="inline-flex items-center gap-1.5"
        data-testid="legend-current"
      >
        <span
          aria-hidden="true"
          class="inline-block h-2.5 w-3 rounded-sm"
          :style="{ backgroundColor: BAR_COLOR_CURRENT }"
        />
        mois en cours
      </span>
      <span v-if="hasComparison" class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block h-2.5 w-3 rounded-sm"
          data-testid="legend-comparison-swatch"
          :style="{ backgroundColor: comparisonColor }"
        />
        comparaison
      </span>
      <span v-if="averageIncome > 0" class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block w-3 border-t-2"
          data-testid="legend-income-swatch"
          :style="{ borderColor: inkColor }"
        />
        Revenus
      </span>
      <span v-if="totalBudget > 0" class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block w-3 border-t-2 border-dashed"
          data-testid="legend-budget-swatch"
          :style="{ borderColor: inkColor }"
        />
        Enveloppe
      </span>
    </div>

    <VueApexCharts
      :key="isDark ? 'dark' : 'light'"
      type="bar"
      :height="isMobile ? 220 : 280"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

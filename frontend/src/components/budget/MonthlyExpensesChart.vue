<script setup lang="ts">
  /**
   * « Dépenses et enveloppe par mois » (agent-os/product/budget-refonte.md,
   * lot 5), drawn to the dashboard's chart (`IncomeExpensesChart`): the
   * plan's started months in columns of the one data hue, the current
   * month lighter, the comparison's months in light grey whenever one is
   * chosen. Read « Tout », each plan month stacks its events hatched on
   * the rest, in the same hue, as the dashboard's `IncomeExpensesChart`
   * does. The income solid in green and the total envelope dashed in
   * amber (Richard, 2026-10-24): the threshold the columns are weighed
   * against, in the hue of an overrun. The legend names only what is
   * drawn; the tooltip says the gap to the envelope in words.
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
  import { DATA_HUE, INCOME_LINE_COLOR, STATE_COLORS } from '@/lib/stateTints'
  import { budgetChartMonths, thisYearMonth } from '@/lib/budgetChartMonths'

  const props = defineProps<{
    /** Total expenses per month, aligned with `monthLabels`. */
    monthlyTotals: number[]
    /** Month labels like ['2025-04', '2025-05', ...] */
    monthLabels: string[]
    /** Average monthly income — the solid green line. */
    averageIncome: number
    /** Total envelope — the dashed amber line. */
    totalBudget: number
    /**
     * The events' share of each month, aligned with `monthLabels`: hatched
     * on top of the plan's columns. The page passes it in the real reading
     * only — « Vie courante » leaves the events out of the columns.
     */
    exceptionalTotals?: number[] | undefined
    /** First month covered by the budget plan (YYYY-MM). */
    planStartMonth?: string | undefined
    /** Last month covered by the budget plan (YYYY-MM). */
    planEndMonth?: string | undefined
    /** First month of the comparison range (YYYY-MM), when one is chosen. */
    comparisonStartMonth?: string | undefined
    /** Last month of the comparison range (YYYY-MM), when one is chosen. */
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

  const roundCents = (value: number) => Math.round(value * 100) / 100

  /**
   * Each drawn month's events, never below zero: the plan's months only,
   * the comparison's columns staying one grey block.
   */
  const events = computed(() =>
    months.value.map(m =>
      m.kind === 'plan'
        ? Math.max(0, roundCents(props.exceptionalTotals?.[m.index] ?? 0))
        : 0
    )
  )

  /** Hatched only when the reading passes the events and a month has some. */
  const hasEvents = computed(() => events.value.some(v => v > 0))

  /**
   * A month under its events: the total less them, so the stack adds up
   * to the total. Never below zero.
   */
  const rests = computed(() =>
    totals.value.map((total, i) =>
      Math.max(0, roundCents(total - (events.value[i] ?? 0)))
    )
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
  /** The income, solid: green, Richard's exception of 2026-10-24. */
  const INCOME_COLOR = INCOME_LINE_COLOR
  /** The envelope, dashed: the amber of an overrun, the threshold it is. */
  const BUDGET_COLOR = STATE_COLORS.over

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
    dashed: boolean,
    color: string
  ): YAnnotation {
    return {
      y,
      borderColor: color,
      borderWidth: 2,
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
          false,
          INCOME_COLOR
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
          true,
          BUDGET_COLOR
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
    const monthEvents = events.value[index] ?? 0
    if (monthEvents > 0) {
      rows.push(line('dont événements', formatCurrency(monthEvents)))
    }
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
      stacked: true,
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
        borderRadiusWhenStacked: 'last',
        // Wider bars on a phone: each one opens its month.
        columnWidth: isMobile.value ? '75%' : '60%',
      },
    },
    dataLabels: { enabled: false },
    legend: { show: false },
    xaxis: {
      type: 'category',
      labels: {
        // A point's x is its `YYYY-MM`, unique across years: two Mays of a
        // twelve-month comparison stay two columns. Shown short.
        formatter: (value: string) =>
          typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)
            ? formatMonth(value, { year: false })
            : String(value ?? ''),
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
    // Each column carries its own colour (`fillColor`); the series colour
    // is the hatching's, the one data hue.
    colors: hasEvents.value ? [BAR_COLOR, BAR_COLOR] : [BAR_COLOR],
    fill: {
      type: hasEvents.value ? ['solid', 'pattern'] : ['solid'],
      opacity: 1,
      pattern: {
        style: 'slantedLines',
        width: 6,
        height: 6,
        strokeWidth: 2,
      },
    },
    annotations: { yaxis: yAnnotations.value },
    tooltip: {
      theme: isDark.value ? 'dark' : 'light',
      custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
        tooltip(dataPointIndex),
    },
  }))

  /** A column's point, in the colour of its month. */
  const point = (i: number, y: number) => ({
    x: months.value[i]?.ym ?? '',
    y,
    fillColor: barColors.value[i] ?? BAR_COLOR,
  })

  const series = computed<NonNullable<ApexOptions['series']>>(() =>
    hasEvents.value
      ? [
          {
            name: 'Dépenses',
            data: rests.value.map((y, i) => point(i, y)),
          },
          {
            name: 'événements',
            data: events.value.map((y, i) => point(i, y)),
          },
        ]
      : [
          {
            name: 'Dépenses',
            data: totals.value.map((y, i) => point(i, y)),
          },
        ]
  )

  /** The legend's hatched marker: the hue's stripes, as Apex draws them. */
  const hatchedMarker = {
    backgroundImage: `repeating-linear-gradient(-45deg, ${BAR_COLOR} 0 1.5px, transparent 1.5px 4px)`,
    borderColor: BAR_COLOR,
  }
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
        v-if="hasEvents"
        class="inline-flex items-center gap-1.5"
        data-testid="legend-events"
      >
        <span
          aria-hidden="true"
          data-testid="legend-events-swatch"
          class="inline-block h-2.5 w-3 rounded-sm border"
          :style="hatchedMarker"
        />
        dont événements
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
          :style="{ borderColor: INCOME_COLOR }"
        />
        Revenus
      </span>
      <span v-if="totalBudget > 0" class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block w-3 border-t-2 border-dashed"
          data-testid="legend-budget-swatch"
          :style="{ borderColor: BUDGET_COLOR }"
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

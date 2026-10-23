<script setup lang="ts">
  /**
   * The period month by month, in one chart (« Où part l'argent »,
   * agent-os/product/dashboard-refonte.md, lot 4): the expenses in
   * columns — the everyday share solid, the rest hatched on top of it, as
   * an expanded category row draws its events — the income as a line in
   * the text's ink, the habit dashed across, the current month lighter:
   * half a month is not a month.
   *
   * Read « Tout », the columns are one series, « Dépenses », solid. A
   * column opens its month (`select-month`); the screen that listens adds
   * the keyboard way, a link beside the chart. The legend and the tooltip
   * are drawn by hand: Apex cannot hatch a legend marker, and a month
   * without anything outside the everyday says nothing about it.
   */
  import { computed } from 'vue'
  import VueApexCharts from 'vue3-apexcharts/core'
  import '@/lib/apexcharts-features'
  import type { ApexOptions } from 'apexcharts'
  import { DATA_HUE } from '@/lib/stateTints'
  import { useChartTheme } from '@/composables/useChartTheme'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'

  export interface IncomeExpensesMonth {
    /** `YYYY-MM`. */
    month: string
    /** The axis label, « Jan 2026 ». */
    label: string
    /** Every expense of the month, netted. */
    netExpenses: number
    /** The same, the events set aside and smoothed purchases sliced. */
    everydayNetExpenses: number
    income: number
  }

  const props = withDefaults(
    defineProps<{
      months: IncomeExpensesMonth[]
      /** « Vie courante » stacks the rest hatched; « Tout » draws one series. */
      reading: 'everyday' | 'real'
      /** The habit of the main series, dashed across; null draws nothing. */
      habit: number | null
      /** The month still running, drawn lighter. Defaults to today's. */
      currentMonth?: string | undefined
    }>(),
    { currentMonth: undefined }
  )

  const emit = defineEmits<{
    /** A column was clicked — the `YYYY-MM` it stands for. */
    (e: 'select-month', yearMonth: string): void
  }>()

  const { isDark, labelColor, chartTheme, chartAnimations, donutValueColor } =
    useChartTheme()
  const isMobile = useIsMobile()

  /** The one data hue of the page, the share bars' blue-400. */
  const BAR_COLOR = DATA_HUE
  /** The same blue, lighter: the current month. */
  const BAR_COLOR_CURRENT = 'rgba(96, 165, 250, 0.4)'

  const thisMonth = computed(() => {
    if (props.currentMonth) return props.currentMonth
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  const isEveryday = computed(() => props.reading === 'everyday')

  const roundCents = (value: number) => Math.round(value * 100) / 100

  /**
   * What the everyday leaves out of a month: never below zero — a month a
   * smoothed purchase's slices reach without the purchase itself would
   * otherwise hang a column under the axis.
   */
  const outside = (m: IncomeExpensesMonth) =>
    Math.max(0, roundCents(m.netExpenses - m.everydayNetExpenses))

  const hasCurrentMonth = computed(() =>
    props.months.some(m => m.month === thisMonth.value)
  )

  /** A column's point, lighter on the current month. */
  function point(m: IncomeExpensesMonth, y: number) {
    return m.month === thisMonth.value
      ? { x: m.label, y, fillColor: BAR_COLOR_CURRENT }
      : { x: m.label, y }
  }

  const series = computed<NonNullable<ApexOptions['series']>>(() => {
    const income = {
      name: 'Revenus',
      type: 'line',
      data: props.months.map(m => ({ x: m.label, y: m.income })),
    }
    if (!isEveryday.value) {
      return [
        {
          name: 'Dépenses',
          type: 'bar',
          data: props.months.map(m => point(m, m.netExpenses)),
        },
        income,
      ]
    }
    return [
      {
        name: 'Vie courante',
        type: 'bar',
        data: props.months.map(m => point(m, m.everydayNetExpenses)),
      },
      {
        name: 'Hors vie courante',
        type: 'bar',
        data: props.months.map(m => point(m, outside(m))),
      },
      income,
    ]
  })

  function onSelected(config?: { dataPointIndex: number }): void {
    const month = props.months[config?.dataPointIndex ?? -1]?.month
    if (month) emit('select-month', month)
  }

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * A month's tooltip, in Apex's own markup so its theme applies: the
   * expenses, what the everyday leaves out when there is any, the income.
   */
  function tooltip(index: number): string {
    const m = props.months[index]
    if (!m) return ''
    const line = (label: string, value: number) =>
      `<div class="apexcharts-tooltip-series-group apexcharts-active" style="display:flex">` +
      `<div class="apexcharts-tooltip-text"><div class="apexcharts-tooltip-y-group">` +
      `<span class="apexcharts-tooltip-text-y-label">${escapeHtml(label)}: </span>` +
      `<span class="apexcharts-tooltip-text-y-value">${escapeHtml(formatCurrency(value))}</span>` +
      `</div></div></div>`
    const title =
      m.month === thisMonth.value ? `${m.label} · en cours` : m.label
    const rows = isEveryday.value
      ? [
          line('Vie courante', m.everydayNetExpenses),
          ...(outside(m) > 0 ? [line('Hors vie courante', outside(m))] : []),
        ]
      : [line('Dépenses', m.netExpenses)]
    return (
      `<div class="apexcharts-tooltip-title">${escapeHtml(title)}</div>` +
      rows.join('') +
      line('Revenus', m.income)
    )
  }

  const inkColor = computed(() => donutValueColor.value)

  /** The habit, dashed across, in the ink of the axis labels. */
  const annotations = computed<NonNullable<ApexOptions['annotations']>>(() =>
    props.habit === null
      ? { yaxis: [] }
      : {
          yaxis: [
            {
              y: props.habit,
              borderColor: labelColor.value,
              strokeDashArray: 4,
              label: {
                text: 'habitude',
                borderWidth: 0,
                position: 'left',
                textAnchor: 'start',
                offsetX: 4,
                style: {
                  color: labelColor.value,
                  background: 'transparent',
                  fontSize: '11px',
                },
              },
            },
          ],
        }
  )

  const options = computed<ApexOptions>(() => {
    const bars = isEveryday.value ? 2 : 1
    const perSeries = <T,>(bar: T, line: T): T[] => [
      ...Array.from({ length: bars }, () => bar),
      line,
    ]
    return {
      chart: {
        type: 'line',
        stacked: true,
        stackOnlyBar: true,
        toolbar: { show: false },
        fontFamily: 'inherit',
        background: 'transparent',
        animations: chartAnimations.value,
        events: {
          dataPointSelection: (
            _event: unknown,
            _context: unknown,
            config?: { dataPointIndex: number }
          ) => onSelected(config),
        },
      },
      plotOptions: {
        bar: {
          borderRadius: 4,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          columnWidth: '60%',
        },
      },
      colors: perSeries(BAR_COLOR, inkColor.value),
      fill: {
        type: isEveryday.value
          ? ['solid', 'pattern', 'solid']
          : ['solid', 'solid'],
        opacity: 1,
        pattern: {
          style: 'slantedLines',
          width: 6,
          height: 6,
          strokeWidth: 2,
        },
      },
      stroke: {
        width: perSeries(0, 2),
        curve: 'straight',
      },
      markers: {
        size: perSeries(0, 3),
        strokeWidth: 0,
        hover: { sizeOffset: 2 },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        type: 'category',
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
            formatCompactCurrency(value, { compact: isMobile.value }),
        },
      },
      grid: {
        borderColor: chartTheme.value.grid?.borderColor || '#e5e7eb',
        strokeDashArray: 4,
      },
      annotations: annotations.value,
      tooltip: {
        theme: isDark.value ? 'dark' : 'light',
        shared: true,
        intersect: false,
        custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
          tooltip(dataPointIndex),
      },
    }
  })

  /** The legend's hatched marker: the hue's stripes, as Apex draws them. */
  const hatchedMarker = {
    backgroundImage: `repeating-linear-gradient(-45deg, ${BAR_COLOR} 0 1.5px, transparent 1.5px 4px)`,
    borderColor: BAR_COLOR,
  }
</script>

<template>
  <div
    class="w-full [&_.apexcharts-bar-area]:cursor-pointer"
    data-testid="income-expenses-chart"
  >
    <div
      data-testid="chart-legend"
      class="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
    >
      <template v-if="reading === 'everyday'">
        <span class="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            class="inline-block h-2.5 w-3 rounded-sm"
            :style="{ backgroundColor: BAR_COLOR }"
          />
          Vie courante
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            data-testid="chart-legend-hatched"
            class="inline-block h-2.5 w-3 rounded-sm border"
            :style="hatchedMarker"
          />
          Hors vie courante
        </span>
      </template>
      <span v-else class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block h-2.5 w-3 rounded-sm"
          :style="{ backgroundColor: BAR_COLOR }"
        />
        Dépenses
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block w-3 border-t-2"
          :style="{ borderColor: inkColor }"
        />
        Revenus
      </span>
      <span
        v-if="habit !== null"
        class="inline-flex items-center gap-1.5"
        data-testid="chart-legend-habit"
      >
        <span
          aria-hidden="true"
          class="inline-block w-3 border-t border-dashed border-current"
        />
        habitude
      </span>
      <span
        v-if="hasCurrentMonth"
        class="inline-flex items-center gap-1.5"
        data-testid="chart-legend-current"
      >
        <span
          aria-hidden="true"
          class="inline-block h-2.5 w-3 rounded-sm"
          :style="{ backgroundColor: BAR_COLOR_CURRENT }"
        />
        mois en cours
      </span>
    </div>
    <VueApexCharts
      type="line"
      :height="isMobile ? 220 : 300"
      :options="options"
      :series="series"
    />
  </div>
</template>

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
      /**
       * A value to draw as a dashed horizontal line across the bars — the
       * period's monthly average, say.
       */
      reference?: number | undefined
      /**
       * A second series stacked on top of `data`, in the same hue, hatched:
       * the share of each month a part of the spending carries (the events).
       * `data` is then the rest, so a stack sums to the month's total.
       */
      overlay?: { values: number[]; label: string } | undefined
    }>(),
    {
      negativeColor: '#22c55e', // green for reimbursements/credits
      months: undefined,
      reference: undefined,
      overlay: undefined,
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

  const baseOptions = computed<ApexOptions>(() => ({
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

  /** The dashed line at `reference`, in the ink of the axis labels. */
  const referenceAnnotation = computed<ApexOptions['annotations']>(() =>
    props.reference === undefined
      ? undefined
      : {
          yaxis: [
            {
              y: props.reference,
              borderColor: labelColor.value,
              strokeDashArray: 4,
              label: {
                text: 'moyenne',
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

  /**
   * With an overlay the bars stack two series, so they can no longer be
   * colored one by one (`distributed` colors by data point and turns the
   * legend into a list of months): one hue per series, the overlay hatched,
   * a negative month still green through a color range. The legend is the
   * template's own, above the chart: Apex cannot hatch a legend marker. The
   * tooltip is drawn by hand too, so a month without any overlay says
   * nothing about it, rather than « dont événements : 0,00 € ».
   */
  const stackedOptions = computed<ApexOptions>(() => {
    const overlay = props.overlay
    if (!overlay) return {}
    const base = baseOptions.value
    return {
      chart: { ...base.chart, stacked: true },
      plotOptions: {
        bar: {
          borderRadius: 4,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          columnWidth: '60%',
          distributed: false,
          colors: {
            ranges: [
              {
                from: Number.MIN_SAFE_INTEGER,
                to: -0.01,
                color: props.negativeColor,
              },
            ],
          },
        },
      },
      colors: [props.color, props.color],
      fill: {
        type: ['solid', 'pattern'],
        pattern: {
          style: 'slantedLines',
          width: 6,
          height: 6,
          strokeWidth: 2,
        },
      },
      legend: { show: false },
      tooltip: {
        theme: isDark.value ? 'dark' : 'light',
        shared: true,
        intersect: false,
        custom: ({ dataPointIndex }: { dataPointIndex: number }) =>
          stackTooltip(dataPointIndex, overlay),
      },
    }
  })

  function escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  /**
   * The month's tooltip, in Apex's own markup so its theme applies: the
   * whole stack under the series' name, then « dont » the overlay's part,
   * only when that month carries one.
   */
  function stackTooltip(
    index: number,
    overlay: { values: number[]; label: string }
  ): string {
    const rest = props.data.values[index] ?? 0
    const extra = overlay.values[index] ?? 0
    const line = (label: string, value: number) =>
      `<div class="apexcharts-tooltip-series-group apexcharts-active" style="display:flex">` +
      `<div class="apexcharts-tooltip-text"><div class="apexcharts-tooltip-y-group">` +
      `<span class="apexcharts-tooltip-text-y-label">${escapeHtml(label)}: </span>` +
      `<span class="apexcharts-tooltip-text-y-value">${escapeHtml(formatCurrency(value))}</span>` +
      `</div></div></div>`
    const title = props.data.labels[index] ?? ''
    return (
      `<div class="apexcharts-tooltip-title">${escapeHtml(title)}</div>` +
      line(props.title, rest + extra) +
      (extra > 0 ? line(`dont ${overlay.label}`, extra) : '')
    )
  }

  /** The legend's hatched marker: the hue's stripes, as Apex draws them. */
  const hatchedMarker = computed(() => ({
    backgroundImage: `repeating-linear-gradient(-45deg, ${props.color} 0 1.5px, transparent 1.5px 4px)`,
    borderColor: props.color,
  }))

  /**
   * Without `reference` nor `overlay` the options are exactly the plain
   * chart's: the pages' monthly charts are drawn as they always were.
   */
  const chartOptions = computed<ApexOptions>(() => ({
    ...baseOptions.value,
    ...stackedOptions.value,
    ...(referenceAnnotation.value && {
      annotations: referenceAnnotation.value,
    }),
  }))

  const series = computed(() => [
    {
      name: props.title,
      data: props.data.values,
    },
    ...(props.overlay
      ? [{ name: props.overlay.label, data: props.overlay.values }]
      : []),
  ])
</script>

<template>
  <div
    class="w-full"
    :class="selectable ? '[&_.apexcharts-bar-area]:cursor-pointer' : ''"
  >
    <!-- The legend, when the bars stack two series: Apex's own cannot
         show a hatched marker. -->
    <div
      v-if="overlay"
      data-testid="chart-legend"
      class="mb-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
    >
      <span class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          class="inline-block h-2.5 w-3 rounded-sm"
          :style="{ backgroundColor: color }"
        />
        {{ title }}
      </span>
      <span class="inline-flex items-center gap-1.5">
        <span
          aria-hidden="true"
          data-testid="chart-legend-hatched"
          class="inline-block h-2.5 w-3 rounded-sm border"
          :style="hatchedMarker"
        />
        {{ overlay.label }}
      </span>
    </div>
    <VueApexCharts
      type="bar"
      :height="isMobile ? 220 : 300"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

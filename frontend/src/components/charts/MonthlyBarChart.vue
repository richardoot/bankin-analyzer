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
   * a negative month still green through a color range, and the legend
   * naming both series. The tooltip reads the month's whole stack: the
   * total first, then « dont » the overlay's part.
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
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        fontSize: '12px',
        labels: { colors: labelColor.value },
      },
      tooltip: {
        theme: isDark.value ? 'dark' : 'light',
        shared: true,
        intersect: false,
        y: {
          formatter: (
            value: number,
            opts?: { seriesIndex: number; dataPointIndex: number }
          ) => {
            if (opts?.seriesIndex !== 0) return formatCurrency(value)
            const extra = overlay.values[opts.dataPointIndex] ?? 0
            return formatCurrency(value + extra)
          },
          title: {
            formatter: (seriesName: string) =>
              seriesName === overlay.label
                ? `dont ${overlay.label}`
                : seriesName,
          },
        },
      },
    }
  })

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
    <VueApexCharts
      type="bar"
      :height="isMobile ? 220 : 300"
      :options="chartOptions"
      :series="series"
    />
  </div>
</template>

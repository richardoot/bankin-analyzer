<script setup lang="ts">
  import { computed } from 'vue'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'

  /**
   * A family's years side by side, one column each, on the family's own
   * scale: its largest year, or its envelope when that is higher.
   *
   * The current year wears the family's color, the past ones stay gray. An
   * envelope is a dashed line across every year — it is today's, one value —
   * and whatever a column spends above it is drawn again in red.
   *
   * `years` arrive continuous and sorted: a year without spending is already
   * there at 0, the chart fills no gap.
   */
  const props = withDefaults(
    defineProps<{
      years: { year: number; amount: number }[]
      currentYear: number
      /** The current year's column. */
      color: string
      /** The annual envelope, drawn dashed when given. */
      envelope?: number | undefined
      /** The chart in words, said by a screen reader. */
      label: string
    }>(),
    { envelope: undefined }
  )

  const COLUMN = 30
  const STEP = 42
  /** The plot's height; the year labels sit below it. */
  const PLOT = 48
  const HEIGHT = 64
  const LABEL_Y = 62
  /** A year at 0 keeps a sliver, so it still reads as a year. */
  const MIN_HEIGHT = 2
  const OVER_COLOR = '#ef4444' // red-500

  const width = computed(() => props.years.length * STEP - 12)

  const scale = computed(
    () => Math.max(...props.years.map(y => y.amount), props.envelope ?? 0) || 1
  )

  function heightOf(amount: number): number {
    return Math.max(MIN_HEIGHT, +((amount / scale.value) * PLOT).toFixed(1))
  }

  const envelopeY = computed(() =>
    props.envelope === undefined
      ? null
      : +(PLOT - (props.envelope / scale.value) * PLOT).toFixed(1)
  )

  const columns = computed(() =>
    props.years.map((y, i) => {
      const height = heightOf(y.amount)
      const current = y.year === props.currentYear
      const over =
        props.envelope !== undefined && y.amount > props.envelope
          ? y.amount - props.envelope
          : 0
      const overHeight =
        over > 0 ? +((over / scale.value) * PLOT).toFixed(1) : 0
      return {
        year: y.year,
        x: i * STEP,
        y: +(PLOT - height).toFixed(1),
        height,
        current,
        title: `${y.year} : ${formatCurrency(y.amount)}`,
        overHeight,
        overTitle: `${y.year} : dépassement de ${formatCurrency(over)}`,
      }
    })
  )
</script>

<template>
  <svg
    v-if="years.length"
    :width="width"
    :height="HEIGHT"
    class="block overflow-visible"
    role="img"
    :aria-label="label"
  >
    <template v-for="col in columns" :key="col.year">
      <rect
        :data-testid="`year-column-${col.year}`"
        :x="col.x"
        :y="col.y"
        :width="COLUMN"
        :height="col.height"
        rx="3"
        :fill="col.current ? color : undefined"
        :class="col.current ? undefined : 'fill-gray-400 dark:fill-slate-500'"
      >
        <title>{{ col.title }}</title>
      </rect>
      <rect
        v-if="col.overHeight > 0"
        :data-testid="`year-column-over-${col.year}`"
        :x="col.x"
        :y="col.y"
        :width="COLUMN"
        :height="col.overHeight"
        rx="3"
        :fill="OVER_COLOR"
      >
        <title>{{ col.overTitle }}</title>
      </rect>
      <text
        :x="col.x + COLUMN / 2"
        :y="LABEL_Y"
        text-anchor="middle"
        font-size="10"
        :font-weight="col.current ? 600 : undefined"
        :class="
          col.current
            ? 'fill-gray-700 dark:fill-slate-200'
            : 'fill-gray-400 dark:fill-slate-500'
        "
      >
        {{ col.year }}
      </text>
    </template>
    <g
      v-if="envelopeY !== null && envelope !== undefined"
      data-testid="year-envelope"
    >
      <line
        x1="0"
        :x2="width"
        :y1="envelopeY"
        :y2="envelopeY"
        stroke-width="1"
        stroke-dasharray="3 3"
        class="stroke-gray-400 dark:stroke-slate-500"
      />
      <text
        :x="width"
        :y="envelopeY - 4"
        text-anchor="end"
        font-size="10"
        class="fill-gray-400 dark:fill-slate-500"
      >
        enveloppe {{ formatCompactCurrency(envelope) }}
      </text>
    </g>
  </svg>
</template>

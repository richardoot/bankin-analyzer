<script setup lang="ts">
  import { computed } from 'vue'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'
  import { STATE_COLORS } from '@/lib/stateTints'

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
  /**
   * With an envelope, a margin above the plot holds its name: the chart is
   * a few columns wide, the name is wider, and the line often sits at the
   * very top (the envelope is usually the scale). The name starts at the
   * left and runs over the row's free space, never over the family's name.
   */
  const ENVELOPE_MARGIN = 14
  const LABELS = 16
  /** A year at 0 keeps a sliver, so it still reads as a year. */
  const MIN_HEIGHT = 2
  /** An overrun is a state, never a reproach: amber, not red. */
  const OVER_COLOR = STATE_COLORS.over

  const width = computed(() => props.years.length * STEP - 12)
  const top = computed(() =>
    props.envelope === undefined ? 0 : ENVELOPE_MARGIN
  )
  const height = computed(() => top.value + PLOT + LABELS)
  const labelY = computed(() => top.value + PLOT + LABELS - 2)

  const scale = computed(
    () => Math.max(...props.years.map(y => y.amount), props.envelope ?? 0) || 1
  )

  function heightOf(amount: number): number {
    return Math.max(MIN_HEIGHT, +((amount / scale.value) * PLOT).toFixed(1))
  }

  const envelopeY = computed(() =>
    props.envelope === undefined
      ? null
      : +(top.value + PLOT - (props.envelope / scale.value) * PLOT).toFixed(1)
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
        y: +(top.value + PLOT - height).toFixed(1),
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
    :height="height"
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
        :y="labelY"
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
        x="0"
        :y="ENVELOPE_MARGIN - 4"
        text-anchor="start"
        font-size="10"
        class="fill-gray-400 dark:fill-slate-500"
      >
        enveloppe {{ formatCompactCurrency(envelope) }}
      </text>
    </g>
  </svg>
</template>

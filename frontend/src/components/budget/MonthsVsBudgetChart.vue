<script setup lang="ts">
  import { computed } from 'vue'
  import { DATA_HUE, STATE_COLORS } from '@/lib/stateTints'

  /**
   * A budget row's months against its envelope: one column per month, the
   * envelope a dashed line across them.
   *
   * Plain SVG — a row is too small for a tooltip, and a page of rows does
   * not need a chart library each. Every column is measured from zero on one
   * scale that keeps the envelope in view, so the columns compare with each
   * other and with the line. The columns carry the data hue (`DATA_HUE`); a
   * month above the envelope takes the state amber (`STATE_COLORS.over`).
   * The running month is drawn in a lighter blue, being incomplete, and the
   * month the page isolated sits on a grey band.
   * Without an envelope (`budget` at 0) the columns stand alone.
   */
  const props = withDefaults(
    defineProps<{
      values: number[]
      /** The `YYYY-MM` of each value, same order. */
      months: string[]
      /** The monthly envelope; 0 when there is none. */
      budget: number
      /** The month still running, drawn lighter. */
      runningMonth?: string | undefined
      /** The month the page isolated, drawn on a band. */
      selectedMonth?: string | undefined
      /** What a screen reader says, in words. */
      label: string
      width?: number
      height?: number
    }>(),
    {
      runningMonth: undefined,
      selectedMonth: undefined,
      width: 120,
      height: 28,
    }
  )

  /** Air above the tallest mark, so the dashed line never sits on the edge. */
  const PAD_TOP = 2
  /** Share of each slot the column fills; the rest is the gap. */
  const COLUMN_SHARE = 0.7
  /** Below a cent, a month is not « above » its envelope. */
  const TOLERANCE = 0.005

  const hasBudget = computed(() => props.budget > TOLERANCE)

  const scaleMax = computed(() => {
    const max = Math.max(0, ...props.values, hasBudget.value ? props.budget : 0)
    return max || 1
  })

  function yOf(v: number): number {
    const usable = props.height - PAD_TOP
    return +(props.height - (Math.max(0, v) / scaleMax.value) * usable).toFixed(
      1
    )
  }

  const columns = computed(() => {
    const n = props.values.length
    if (n === 0) return []
    const slot = props.width / n
    const columnWidth = +(slot * COLUMN_SHARE).toFixed(1)
    return props.values.map((value, i) => {
      const month = props.months[i] ?? ''
      const y = yOf(value)
      return {
        month,
        slotX: +(i * slot).toFixed(1),
        slotWidth: +slot.toFixed(1),
        x: +(i * slot + (slot - columnWidth) / 2).toFixed(1),
        y,
        width: columnWidth,
        height: +(props.height - y).toFixed(1),
        over: hasBudget.value && value > props.budget + TOLERANCE,
        running: month !== '' && month === props.runningMonth,
        selected: month !== '' && month === props.selectedMonth,
      }
    })
  })

  /** blue-300: the data hue, lighter, for a month not finished yet. */
  const RUNNING_HUE = '#93c5fd'

  /** A column's fill: above the envelope first, then running, then data. */
  function fillOf(col: { over: boolean; running: boolean }): string {
    if (col.over) return STATE_COLORS.over
    return col.running ? RUNNING_HUE : DATA_HUE
  }

  const budgetY = computed(() => (hasBudget.value ? yOf(props.budget) : null))
</script>

<template>
  <svg
    v-if="columns.length > 0"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    class="block overflow-visible"
    role="img"
    :aria-label="label"
  >
    <rect
      v-for="col in columns.filter(c => c.selected)"
      :key="`band-${col.month}`"
      data-testid="months-chart-selected-band"
      :x="col.slotX"
      y="0"
      :width="col.slotWidth"
      :height="height"
      rx="2"
      class="fill-gray-200 dark:fill-slate-700"
    />
    <rect
      v-for="col in columns"
      :key="col.month"
      data-testid="months-chart-column"
      :data-month="col.month"
      :data-over="col.over ? 'true' : undefined"
      :data-running="col.running ? 'true' : undefined"
      :data-selected="col.selected ? 'true' : undefined"
      :x="col.x"
      :y="col.y"
      :width="col.width"
      :height="col.height"
      rx="1"
      :fill="fillOf(col)"
    />
    <line
      v-if="budgetY !== null"
      data-testid="months-chart-budget"
      x1="0"
      :x2="width"
      :y1="budgetY"
      :y2="budgetY"
      stroke-width="1"
      stroke-dasharray="3 2"
      class="stroke-gray-700 dark:stroke-slate-300"
    />
  </svg>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * A budget row's months against its envelope: one column per month, the
   * envelope a dashed line across them.
   *
   * Plain SVG — a row is too small for a tooltip, and a page of rows does
   * not need a chart library each. Every column is measured from zero on one
   * scale that keeps the envelope in view, so the columns compare with each
   * other and with the line. A month above the envelope takes the state red;
   * every other one stays neutral gray. The running month is drawn lighter,
   * being incomplete, and the month the page isolated sits on a band.
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
      :class="[
        col.over
          ? 'fill-red-500 dark:fill-red-400'
          : 'fill-gray-500 dark:fill-slate-400',
        { 'opacity-40': col.running },
      ]"
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
      class="stroke-gray-900 dark:stroke-gray-100"
    />
  </svg>
</template>

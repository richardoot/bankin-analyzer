<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * A small line over a series, in two readings.
   *
   * `baseline: 'min'` — the default, and what the trend tiles use — stretches
   * the series between its own minimum and maximum: it shows the shape, and
   * a flat spending line becomes a cliff. `baseline: 'zero'` measures every
   * point from zero, so lines drawn side by side compare: a constant series
   * stays a flat line, a single 15 € month stays a small bump.
   *
   * `reference` draws a dashed horizontal line at that value — an average,
   * an envelope — in the end color; the scale widens to keep it in view.
   */
  const props = withDefaults(
    defineProps<{
      data: number[]
      width?: number
      height?: number
      color?: string
      baseline?: 'min' | 'zero'
      reference?: number | undefined
      /** The last point (and the reference line); `color` when absent. */
      endColor?: string | undefined
      /** Said by a screen reader; without it the chart is decoration. */
      label?: string | undefined
    }>(),
    {
      width: 96,
      height: 28,
      color: '#818cf8', // indigo-400
      baseline: 'min',
      reference: undefined,
      endColor: undefined,
      label: undefined,
    }
  )

  /** Two pixels of air above and below, as the line always had. */
  const PAD = 2

  const scale = computed(() => {
    const values =
      props.reference === undefined
        ? props.data
        : [...props.data, props.reference]
    const max = Math.max(...values)
    const min =
      props.baseline === 'zero' ? Math.min(0, ...values) : Math.min(...values)
    return { min, range: max - min || 1 }
  })

  function yOf(v: number): number {
    const { min, range } = scale.value
    return +(
      props.height -
      PAD -
      ((v - min) / range) * (props.height - 2 * PAD)
    ).toFixed(1)
  }

  const points = computed(() => {
    if (props.data.length < 2) return { line: '', area: '', lastX: 0, lastY: 0 }

    const step = props.width / (props.data.length - 1)

    const pts = props.data.map((v, i) => ({
      x: +(i * step).toFixed(1),
      y: yOf(v),
    }))

    const line = pts.map(p => `${p.x},${p.y}`).join(' ')
    const area = `${line} ${props.width},${props.height} 0,${props.height}`
    const last = pts.at(-1)
    if (!last) return { line, area, lastX: 0, lastY: 0 }

    return { line, area, lastX: last.x, lastY: last.y }
  })

  const referenceY = computed(() =>
    props.reference === undefined ? null : yOf(props.reference)
  )

  /** From zero the area is the whole series' weight; at 0.14 it is a block. */
  const areaOpacity = computed(() =>
    props.baseline === 'zero' ? '0.07' : '0.14'
  )

  const markColor = computed(() => props.endColor ?? props.color)
</script>

<template>
  <svg
    v-if="data.length >= 2"
    :width="width"
    :height="height"
    class="block overflow-visible"
    :role="label ? 'img' : undefined"
    :aria-label="label"
    :aria-hidden="label ? undefined : 'true'"
  >
    <polygon :points="points.area" :fill="color" :fill-opacity="areaOpacity" />
    <line
      v-if="referenceY !== null"
      data-testid="sparkline-reference"
      x1="0"
      :x2="width"
      :y1="referenceY"
      :y2="referenceY"
      :stroke="markColor"
      stroke-width="1"
      stroke-dasharray="3 3"
    />
    <polyline
      :points="points.line"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle :cx="points.lastX" :cy="points.lastY" r="2.5" :fill="markColor" />
  </svg>
</template>

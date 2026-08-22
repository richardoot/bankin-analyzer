<script setup lang="ts">
  import { computed } from 'vue'

  const props = withDefaults(
    defineProps<{
      data: number[]
      width?: number
      height?: number
      color?: string
    }>(),
    {
      width: 96,
      height: 28,
      color: '#818cf8', // indigo-400
    }
  )

  const points = computed(() => {
    if (props.data.length < 2) return { line: '', area: '', lastX: 0, lastY: 0 }

    const max = Math.max(...props.data)
    const min = Math.min(...props.data)
    const range = max - min || 1
    const step = props.width / (props.data.length - 1)

    const pts = props.data.map((v, i) => {
      const x = i * step
      const y = props.height - 2 - ((v - min) / range) * (props.height - 4)
      return { x: +x.toFixed(1), y: +y.toFixed(1) }
    })

    const line = pts.map(p => `${p.x},${p.y}`).join(' ')
    const area = `${line} ${props.width},${props.height} 0,${props.height}`
    const last = pts.at(-1)
    if (!last) return { line, area, lastX: 0, lastY: 0 }

    return { line, area, lastX: last.x, lastY: last.y }
  })
</script>

<template>
  <svg
    v-if="data.length >= 2"
    :width="width"
    :height="height"
    class="block overflow-visible"
  >
    <polygon :points="points.area" :fill="color" fill-opacity="0.14" />
    <polyline
      :points="points.line"
      fill="none"
      :stroke="color"
      stroke-width="1.5"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle :cx="points.lastX" :cy="points.lastY" r="2.5" :fill="color" />
  </svg>
</template>

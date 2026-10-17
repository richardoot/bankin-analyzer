<script setup lang="ts">
  /**
   * The frame every icon shares: a 24-unit outline drawn with the current
   * text colour, hidden from assistive technology (the control that holds
   * it carries the name). Size is the caller's: pass `class="h-4 w-4"`.
   */
  withDefaults(
    defineProps<{
      strokeWidth?: number | undefined
    }>(),
    { strokeWidth: 2 }
  )
</script>

<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <slot />
  </svg>
</template>

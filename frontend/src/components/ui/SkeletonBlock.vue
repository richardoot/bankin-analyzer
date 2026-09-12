<script setup lang="ts">
  /**
   * A placeholder shaped like the content it stands in for, instead of a
   * spinner shaped like nothing. Compose a few per screen: `lines` stacks
   * that many text bars; a single block takes its shape from `class` on the
   * caller's side (h-24, rounded-xl…).
   */
  const props = withDefaults(
    defineProps<{
      lines?: number | undefined
    }>(),
    { lines: 0 }
  )

  const lineCount = () => props.lines ?? 0
</script>

<template>
  <div
    v-if="lineCount() > 0"
    aria-hidden="true"
    class="animate-pulse space-y-3"
  >
    <div
      v-for="line in lineCount()"
      :key="line"
      class="h-4 rounded bg-gray-200 dark:bg-slate-700"
      :class="line === lineCount() && lineCount() > 1 ? 'w-2/3' : 'w-full'"
    />
  </div>
  <div
    v-else
    aria-hidden="true"
    class="animate-pulse rounded-lg bg-gray-200 dark:bg-slate-700"
  />
</template>

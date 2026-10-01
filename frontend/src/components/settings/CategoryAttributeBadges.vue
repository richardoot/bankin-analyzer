<script setup lang="ts">
  /**
   * The two attributes every calculation reads, as two small words: whether
   * the spending is constrained or chosen, and whether it keeps running on
   * its own. Rendered nowhere else, so the vocabulary stays in one place.
   */
  import type { CategoryNature, CategoryRhythm } from '@/lib/api'

  defineProps<{
    nature?: CategoryNature | null | undefined
    rhythm?: CategoryRhythm | null | undefined
  }>()

  const NATURE: Record<CategoryNature, string> = {
    ESSENTIAL: 'Essentiel',
    PLEASURE: 'Plaisir',
  }
  const RHYTHM: Record<CategoryRhythm, string> = {
    COMMITTED: 'Engagé',
    VARIABLE: 'Variable',
  }
</script>

<template>
  <span v-if="nature || rhythm" class="inline-flex items-center gap-1">
    <span
      v-if="nature"
      class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
      :class="
        nature === 'ESSENTIAL'
          ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
          : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      "
      :title="nature === 'ESSENTIAL' ? 'Dépense contrainte' : 'Dépense choisie'"
    >
      {{ NATURE[nature] }}
    </span>
    <span
      v-if="rhythm"
      class="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600 dark:bg-slate-700 dark:text-gray-300"
      :title="
        rhythm === 'COMMITTED'
          ? 'Continue tout seul, jamais déduit pendant une absence'
          : 'Dépend de ce que vous faites, suspendu pendant une absence'
      "
    >
      {{ RHYTHM[rhythm] }}
    </span>
  </span>
</template>

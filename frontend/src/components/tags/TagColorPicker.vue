<script setup lang="ts">
  /**
   * The swatches a tag or a family takes its colour from: a pressed button
   * per colour, each named aloud, the current one ringed.
   */
  import { TAG_COLORS, TAG_COLOR_NAMES } from './tagFormModel'

  withDefaults(defineProps<{ legend?: string }>(), { legend: 'Couleur' })

  const model = defineModel<string | null>({ required: true })
</script>

<template>
  <fieldset>
    <legend class="text-xs text-gray-600 dark:text-gray-400">
      {{ legend }}
    </legend>
    <div class="mt-1.5 flex flex-wrap items-center gap-2">
      <button
        v-for="c in TAG_COLORS"
        :key="c"
        type="button"
        :aria-pressed="model === c"
        class="relative h-8 w-8 shrink-0 rounded-full border-2 transition-transform pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5 pointer-coarse:before:content-[''] hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:h-7 sm:w-7"
        :class="
          model === c
            ? 'border-gray-900 dark:border-white'
            : 'border-transparent'
        "
        :style="{ backgroundColor: c }"
        :aria-label="`Couleur ${TAG_COLOR_NAMES[c] ?? c}`"
        @click="model = c"
      ></button>
    </div>
  </fieldset>
</template>

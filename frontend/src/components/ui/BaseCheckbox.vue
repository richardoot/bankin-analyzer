<script setup lang="ts">
  import { useId } from 'vue'

  /**
   * A checkbox and its label as one tappable unit. The box itself stays
   * 16px; the label row is the target — 44px high on a touch screen — so
   * a decision never rests on a 16px square (the duplicates review, the
   * settlement's per-line choice).
   */
  defineOptions({ inheritAttrs: false })

  withDefaults(
    defineProps<{
      label: string
      description?: string | undefined
      disabled?: boolean | undefined
    }>(),
    { description: undefined, disabled: false }
  )

  const model = defineModel<boolean>({ default: false })
  const id = useId()
</script>

<template>
  <label
    :for="id"
    class="flex cursor-pointer items-start gap-3 pointer-coarse:min-h-[44px] pointer-coarse:py-2"
    :class="disabled ? 'cursor-not-allowed opacity-50' : ''"
  >
    <input
      :id="id"
      v-model="model"
      type="checkbox"
      v-bind="$attrs"
      :disabled="disabled"
      class="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-2 focus:ring-primary-500 focus:ring-offset-0 dark:border-slate-600 dark:bg-slate-800"
    />
    <span class="min-w-0">
      <span class="block text-sm text-gray-700 dark:text-gray-300">
        {{ label }}
      </span>
      <span
        v-if="description"
        class="block text-xs text-gray-500 dark:text-gray-400"
      >
        {{ description }}
      </span>
    </span>
  </label>
</template>

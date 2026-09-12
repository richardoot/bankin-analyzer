<script setup lang="ts">
  import { useId } from 'vue'

  /**
   * A labeled input whose error is wired for everyone: the label points at
   * the field, the field names its error via aria-describedby, and the
   * error is announced when it appears. Extra attributes (type, placeholder,
   * data-testid, autocomplete…) fall through to the input.
   */
  defineOptions({ inheritAttrs: false })

  defineProps<{
    label: string
    error?: string | undefined
  }>()

  const model = defineModel<string>({ default: '' })
  const id = useId()
  const errorId = `${id}-error`
</script>

<template>
  <div>
    <label
      :for="id"
      class="block text-sm font-medium text-gray-700 dark:text-gray-300"
    >
      {{ label }}
    </label>
    <input
      :id="id"
      v-model="model"
      v-bind="$attrs"
      :aria-invalid="error ? true : undefined"
      :aria-describedby="error ? errorId : undefined"
      class="mt-1 block w-full rounded-lg border border-gray-300 dark:border-slate-600 px-4 py-3 text-gray-900 dark:text-gray-100 bg-white dark:bg-slate-800 placeholder-gray-500 dark:placeholder-gray-400 focus:border-primary-500 dark:focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:focus:ring-primary-400/20 aria-[invalid]:border-red-500"
    />
    <p
      v-if="error"
      :id="errorId"
      aria-live="polite"
      class="mt-1.5 text-sm text-red-600 dark:text-red-400"
    >
      {{ error }}
    </p>
  </div>
</template>

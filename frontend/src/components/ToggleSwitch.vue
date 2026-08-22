<script setup lang="ts">
  /**
   * Small accessible on/off switch. Emits `change` with the next value so the
   * parent stays in control of (possibly async) state updates.
   */
  withDefaults(
    defineProps<{
      checked: boolean
      disabled?: boolean
      loading?: boolean
      /** Describes the switch for assistive technology. */
      label: string
    }>(),
    {
      disabled: false,
      loading: false,
    }
  )

  const emit = defineEmits<{
    (e: 'change', next: boolean): void
  }>()

  function onClick(currentChecked: boolean, disabled: boolean): void {
    if (disabled) return
    emit('change', !currentChecked)
  }
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="checked"
    :aria-label="label"
    :disabled="disabled || loading"
    :title="label"
    class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
    :class="
      checked
        ? 'bg-emerald-500 dark:bg-emerald-600'
        : 'bg-gray-300 dark:bg-slate-600'
    "
    @click="onClick(checked, disabled === true || loading === true)"
  >
    <span
      class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
      :class="checked ? 'translate-x-4' : 'translate-x-0.5'"
    >
      <svg
        v-if="loading"
        class="h-4 w-4 animate-spin text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          class="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          stroke-width="4"
        />
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
    </span>
  </button>
</template>

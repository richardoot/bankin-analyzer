<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * The one place a button decides its colors. Variants name intent —
   * primary action, quiet secondary, destructive — so a screen never
   * respells bg-primary-600 (or worse, its own hue) again.
   *
   * `loading` disables the button and shows a spinner in place of the
   * label's icon; the click handler simply cannot fire mid-flight.
   */
  const props = withDefaults(
    defineProps<{
      variant?:
        | 'primary'
        | 'secondary'
        | 'danger'
        | 'danger-outline'
        | 'ghost'
        | undefined
      size?: 'sm' | 'md' | undefined
      type?: 'button' | 'submit' | undefined
      disabled?: boolean | undefined
      loading?: boolean | undefined
    }>(),
    {
      variant: 'primary',
      size: 'md',
      type: 'button',
      disabled: false,
      loading: false,
    }
  )

  const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
    primary:
      'bg-primary-600 dark:bg-primary-500 text-white hover:bg-primary-700 dark:hover:bg-primary-600',
    secondary:
      'border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    'danger-outline':
      'border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
    ghost:
      'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-gray-100',
  }

  const SIZES: Record<NonNullable<typeof props.size>, string> = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-sm sm:text-base',
  }

  const classes = computed(() => [
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[props.variant],
    SIZES[props.size],
  ])
</script>

<template>
  <button :type="type" :disabled="disabled || loading" :class="classes">
    <svg
      v-if="loading"
      class="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      aria-hidden="true"
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
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <slot />
  </button>
</template>

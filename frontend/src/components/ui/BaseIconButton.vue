<script setup lang="ts">
  import { computed } from 'vue'
  import IconSpinner from '@/components/icons/IconSpinner.vue'

  /**
   * A button that is only an icon: a cross, a pencil, a bin. The name is
   * mandatory — it is what a screen reader says and what the tooltip
   * shows — and the touch target is built in: the visible square stays
   * 32px (sm) or 40px (md) so a row does not grow, while an invisible halo
   * widens the hit area to 44px on a touch screen.
   *
   * `variant` sets the resting colour and the hover tint: `ghost` for a
   * quiet control, `danger` for one that removes something.
   */
  const props = withDefaults(
    defineProps<{
      label: string
      size?: 'sm' | 'md' | undefined
      variant?: 'ghost' | 'danger' | 'primary' | undefined
      type?: 'button' | 'submit' | undefined
      disabled?: boolean | undefined
      loading?: boolean | undefined
    }>(),
    {
      size: 'md',
      variant: 'ghost',
      type: 'button',
      disabled: false,
      loading: false,
    }
  )

  const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
    ghost:
      'text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-slate-700 dark:hover:text-gray-200',
    danger:
      'text-gray-400 hover:bg-red-50 hover:text-red-600 dark:text-gray-500 dark:hover:bg-red-900/20 dark:hover:text-red-400',
    primary:
      'text-primary-700 hover:bg-primary-50 hover:text-primary-800 dark:text-primary-400 dark:hover:bg-primary-900/20 dark:hover:text-primary-300',
  }

  const SIZES: Record<NonNullable<typeof props.size>, string> = {
    sm: 'h-8 w-8 pointer-coarse:before:-inset-1.5 [&>svg]:h-4 [&>svg]:w-4',
    md: 'h-10 w-10 pointer-coarse:before:-inset-0.5 [&>svg]:h-5 [&>svg]:w-5',
  }

  const classes = computed(() => [
    "relative inline-flex shrink-0 items-center justify-center rounded-lg transition-colors pointer-coarse:before:absolute pointer-coarse:before:content-['']",
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
    'disabled:cursor-not-allowed disabled:opacity-50',
    VARIANTS[props.variant],
    SIZES[props.size],
  ])
</script>

<template>
  <button
    :type="type"
    :aria-label="label"
    :title="label"
    :disabled="disabled || loading"
    :class="classes"
  >
    <IconSpinner v-if="loading" />
    <slot v-else />
  </button>
</template>

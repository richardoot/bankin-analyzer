<script setup lang="ts">
  import { computed } from 'vue'
  import { RouterLink, type RouteLocationRaw } from 'vue-router'
  import IconSpinner from '@/components/icons/IconSpinner.vue'

  /**
   * The one place a button decides its colors. Variants name intent —
   * primary action, quiet secondary, tinted (a primary action that must
   * not shout next to the real one), destructive — so a screen never
   * respells bg-primary-600 (or worse, its own hue) again.
   *
   * With `to`, it renders a RouterLink that looks exactly the same: a
   * link-button is no longer rewritten by hand because the brick could
   * not navigate. `loading` disables the button and shows a spinner in
   * place of the label's icon; the click handler simply cannot fire
   * mid-flight. Disabled is one state everywhere: the same button at half
   * opacity, never a paler hue of its own.
   *
   * On a touch screen the md size grows to the 44px a thumb needs; the sm
   * size keeps its footprint and widens its hit area with an invisible
   * halo instead.
   */
  const props = withDefaults(
    defineProps<{
      variant?:
        | 'primary'
        | 'secondary'
        | 'tinted'
        | 'danger'
        | 'danger-outline'
        | 'ghost'
        | undefined
      size?: 'sm' | 'md' | undefined
      type?: 'button' | 'submit' | undefined
      disabled?: boolean | undefined
      loading?: boolean | undefined
      /** Render as a RouterLink to this route. */
      to?: RouteLocationRaw | undefined
      /** Stretch to the container's width (a form's submit, a sheet's action). */
      block?: boolean | undefined
    }>(),
    {
      variant: 'primary',
      size: 'md',
      type: 'button',
      disabled: false,
      loading: false,
      to: undefined,
      block: false,
    }
  )

  const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700',
    secondary:
      'border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700',
    tinted:
      'border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 hover:bg-primary-100 dark:hover:bg-primary-900/30',
    danger: 'bg-red-600 text-white hover:bg-red-700',
    'danger-outline':
      'border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20',
    ghost:
      'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-gray-100',
  }

  const SIZES: Record<NonNullable<typeof props.size>, string> = {
    sm: "relative px-3 py-1.5 text-sm pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-1 pointer-coarse:before:content-['']",
    md: 'px-4 py-2 text-sm sm:text-base pointer-coarse:min-h-[44px]',
  }

  const isDisabled = computed(() => props.disabled || props.loading)

  const classes = computed(() => [
    'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors',
    'focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    VARIANTS[props.variant],
    SIZES[props.size],
    props.block ? 'flex w-full' : '',
  ])
</script>

<template>
  <RouterLink
    v-if="to !== undefined"
    :to="to"
    :class="classes"
    :aria-disabled="isDisabled ? true : undefined"
    :tabindex="isDisabled ? -1 : undefined"
  >
    <IconSpinner v-if="loading" class="h-4 w-4" />
    <slot />
  </RouterLink>
  <button v-else :type="type" :disabled="isDisabled" :class="classes">
    <IconSpinner v-if="loading" class="h-4 w-4" />
    <slot />
  </button>
</template>

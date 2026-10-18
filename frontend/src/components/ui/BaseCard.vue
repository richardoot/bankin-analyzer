<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * The white surface a screen groups its content on. One rounding, one
   * shadow, one dark background — the three or four respellings that
   * drifted apart (p-6 here, p-4 sm:p-6 there, a border, a bigger shadow)
   * are now a `padding` and a `variant`.
   *
   * `raised` is for the card that *is* the page — a login box, a settings
   * section, an import step — and keeps the larger radius and shadow those
   * screens had; `default` is for cards inside a page.
   */
  const props = withDefaults(
    defineProps<{
      as?: 'div' | 'section' | 'article' | undefined
      padding?: 'none' | 'sm' | 'md' | 'lg' | undefined
      variant?: 'default' | 'raised' | undefined
      bordered?: boolean | undefined
    }>(),
    { as: 'div', padding: 'md', variant: 'default', bordered: false }
  )

  const PADDINGS: Record<NonNullable<typeof props.padding>, string> = {
    none: '',
    sm: 'p-4',
    md: 'p-4 sm:p-6',
    lg: 'p-4 sm:p-8',
  }

  const VARIANTS: Record<NonNullable<typeof props.variant>, string> = {
    default: 'rounded-xl shadow-sm',
    raised: 'rounded-2xl shadow-lg',
  }

  const classes = computed(() => [
    'bg-white dark:bg-slate-900 dark:shadow-slate-900/20',
    VARIANTS[props.variant],
    PADDINGS[props.padding],
    props.bordered ? 'border border-gray-200 dark:border-slate-700' : '',
  ])
</script>

<template>
  <component :is="as" :class="classes">
    <slot />
  </component>
</template>

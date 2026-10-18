<script setup lang="ts">
  import { computed } from 'vue'

  /**
   * The one shell every page sits in: the grey background, the vertical
   * rhythm, the minimum height that fills the viewport under the 4rem
   * navbar without adding 64px of empty scroll, and the column width.
   *
   * Three widths, no more. `wide` (1280px) is for the dense data screens —
   * Dashboard, Transactions, Budget, Remboursements — whose tables and
   * grids need the room. `default` (1024px) is for lists and settings.
   * `narrow` (768px) is for reading and single forms — Import, Profil, the
   * legal pages, the authentication screens — where a wider column only
   * stretches the sentences. The eye no longer changes column on every
   * navbar click: a screen picks one of these and nothing else.
   *
   * `center` lays the content out in the middle of the viewport, for the
   * screens that are one card and nothing else (login, callbacks).
   */
  const props = withDefaults(
    defineProps<{
      width?: 'wide' | 'default' | 'narrow' | undefined
      center?: boolean | undefined
    }>(),
    { width: 'default', center: false }
  )

  const WIDTHS: Record<NonNullable<typeof props.width>, string> = {
    wide: 'max-w-7xl',
    default: 'max-w-5xl',
    narrow: 'max-w-3xl',
  }

  const widthClass = computed(() => WIDTHS[props.width])
</script>

<template>
  <div
    class="min-h-[calc(100vh-4rem)] bg-gray-50 py-6 transition-colors sm:py-8 dark:bg-slate-800"
    :class="center ? 'flex items-center' : ''"
  >
    <div class="mx-auto w-full px-4 sm:px-6 lg:px-8" :class="widthClass">
      <slot />
    </div>
  </div>
</template>

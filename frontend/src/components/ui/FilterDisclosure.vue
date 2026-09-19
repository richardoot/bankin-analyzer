<script setup lang="ts">
  import { computed, useId } from 'vue'
  import { useIsMobile } from '@/composables/useMediaQuery'

  /**
   * The filter card of a list page, sized for the screen it is on.
   *
   * On a desk every control is laid out at once — glanceable, and the
   * screen has room. On a phone the same eleven controls ran four screens
   * tall before the first row of results; here they fold behind one
   * « Filtres » button, and the FilterChips a page renders underneath
   * stay as the readable summary of what is active.
   *
   * Slots: #search (the keyword field, always visible), default (the
   * controls, foldable below `md`), #summary (result count), #actions
   * (buttons kept beside the summary).
   */
  const props = defineProps<{
    /** How many filters are active — shown on the fold button. */
    activeCount?: number | undefined
    label?: string | undefined
  }>()

  const count = computed(() => props.activeCount ?? 0)
  const labelText = computed(() => props.label ?? 'Filtres')

  const expanded = defineModel<boolean>('expanded', { default: false })
  const isMobile = useIsMobile()
  const panelId = useId()
</script>

<template>
  <div
    class="flex flex-col rounded-xl bg-white p-4 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
  >
    <div v-if="$slots.search">
      <slot name="search" />
    </div>

    <!--
      Toolbar row. On a phone it sits right under the search field and holds
      the fold button; on a desk it is the footer under the controls.
    -->
    <div
      class="order-2 mt-3 flex items-center justify-between gap-2 md:order-3 md:mt-4 md:border-t md:border-gray-200 md:pt-3 dark:md:border-slate-700"
    >
      <button
        type="button"
        data-testid="filter-disclosure-toggle"
        class="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors md:hidden"
        :class="
          expanded || count > 0
            ? 'border-primary-300 bg-primary-50 text-primary-700 dark:border-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
            : 'border-gray-300 bg-white text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300'
        "
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click="expanded = !expanded"
      >
        <svg
          class="h-4 w-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
          />
        </svg>
        <span>{{ labelText }}</span>
        <span
          v-if="count > 0"
          data-testid="filter-disclosure-count"
          class="rounded-full bg-primary-600 px-1.5 text-xs font-semibold tabular-nums text-white dark:bg-primary-500"
        >
          {{ count }}
        </span>
        <svg
          class="h-4 w-4 transition-transform duration-200"
          :class="{ 'rotate-180': expanded }"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      <div
        class="min-w-0 flex-1 truncate text-right text-xs text-gray-500 md:text-left md:text-sm dark:text-gray-400"
      >
        <slot name="summary" />
      </div>

      <div v-if="$slots.actions" class="flex shrink-0 items-center gap-2">
        <slot name="actions" />
      </div>
    </div>

    <div
      v-show="!isMobile || expanded"
      :id="panelId"
      data-testid="filter-disclosure-panel"
      class="order-3 mt-4 md:order-2"
    >
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
  /**
   * The active filters, readable in one line and each removable where it is
   * read. Eleven controls can compose a filter; without this row the only
   * way to know what is hiding rows was to re-inspect each control — or to
   * forget one and wonder where the transactions went.
   */
  export interface FilterChip {
    /** Stable key handed back on remove. */
    key: string
    label: string
  }

  defineProps<{
    chips: FilterChip[]
  }>()

  const emit = defineEmits<{ remove: [key: string]; clear: [] }>()
</script>

<template>
  <div
    v-if="chips.length > 0"
    data-testid="active-filter-chips"
    class="flex flex-wrap items-center gap-2"
  >
    <span
      v-for="chip in chips"
      :key="chip.key"
      class="inline-flex items-center gap-1.5 rounded-full bg-primary-50 py-1 pl-3 pr-1.5 text-xs font-medium text-primary-800 dark:bg-primary-900/30 dark:text-primary-300"
    >
      {{ chip.label }}
      <button
        type="button"
        :aria-label="`Retirer le filtre ${chip.label}`"
        class="rounded-full p-0.5 transition-colors hover:bg-primary-100 dark:hover:bg-primary-900/50"
        @click="emit('remove', chip.key)"
      >
        <svg
          class="h-3 w-3"
          fill="none"
          stroke="currentColor"
          stroke-width="2.5"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </span>
    <button
      v-if="chips.length > 1"
      type="button"
      class="text-xs font-medium text-gray-500 underline-offset-2 transition-colors hover:text-gray-700 hover:underline dark:text-gray-400 dark:hover:text-gray-200"
      @click="emit('clear')"
    >
      Tout effacer
    </button>
  </div>
</template>

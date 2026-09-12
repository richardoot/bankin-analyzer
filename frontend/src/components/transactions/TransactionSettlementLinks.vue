<script setup lang="ts">
  import type { TransactionSettlementSummaryDto } from '@/lib/api'

  /**
   * One link per person settled by this income, declared once for both
   * layouts. The title carries the person's name — the spec suite finds
   * these buttons by it.
   */
  withDefaults(
    defineProps<{
      settlements: TransactionSettlementSummaryDto[]
      disabled?: boolean | undefined
      dense?: boolean | undefined
    }>(),
    { disabled: false, dense: false }
  )

  const emit = defineEmits<{
    open: [settlement: TransactionSettlementSummaryDto]
  }>()
</script>

<template>
  <button
    v-for="settlement in settlements"
    :key="settlement.id"
    type="button"
    class="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400 rounded transition-colors disabled:opacity-50"
    :class="
      dense
        ? 'px-2 py-1 text-[11px] hover:bg-primary-50 dark:hover:bg-primary-900/20'
        : 'px-2 py-1 text-xs font-medium text-primary-700 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30'
    "
    :disabled="disabled"
    :title="`Voir le règlement de ${settlement.personName}`"
    @click="emit('open', settlement)"
  >
    <svg
      :class="dense ? 'h-3 w-3' : 'h-3.5 w-3.5'"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-width="2"
        d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6.828-6.828l3-3a4 4 0 015.656 5.656l-1.5 1.5m-9.9 4.244a4 4 0 010-5.656"
      />
    </svg>
    {{ settlement.personName }}
  </button>
</template>

<script setup lang="ts">
  import type { TransactionSettlementSummaryDto } from '@/lib/api'
  import IconLink from '@/components/icons/IconLink.vue'

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
    class="relative inline-flex items-center gap-1 rounded text-primary-700 transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-[''] disabled:opacity-50 dark:text-primary-400"
    :class="
      dense
        ? 'min-h-[28px] px-2 text-xs hover:bg-primary-50 dark:hover:bg-primary-900/20'
        : 'px-2 py-1 text-xs font-medium text-primary-700 bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30'
    "
    :disabled="disabled"
    :title="`Voir le règlement de ${settlement.personName}`"
    @click="emit('open', settlement)"
  >
    <IconLink class="h-3.5 w-3.5" />
    {{ settlement.personName }}
  </button>
</template>

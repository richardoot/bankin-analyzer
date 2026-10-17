<script setup lang="ts">
  /**
   * Marks a recurrence paid from a joint account: its amounts are already
   * the user's share, divided by the account's divisor.
   */
  defineProps<{ divisor: number }>()
</script>

<template>
  <span
    v-if="divisor > 1"
    class="shrink-0 rounded-full bg-primary-100 px-1.5 py-0.5 text-[10px] font-medium leading-none text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
    :title="`Payé depuis un compte joint : montants divisés par ${divisor}`"
    data-testid="joint-badge"
    >Joint ÷{{ divisor }}</span
  >
</template>

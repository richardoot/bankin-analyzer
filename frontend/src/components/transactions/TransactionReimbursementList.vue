<script setup lang="ts">
  import type { ReimbursementDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  /**
   * The reimbursements attached to one expense, declared once for both
   * layouts. `dense` is the mobile fit: initials and amounts only; the
   * regular fit adds the partial detail and the remaining line.
   */
  const props = withDefaults(
    defineProps<{
      reimbursements: ReimbursementDto[]
      dense?: boolean | undefined
      /** Shown when positive and not dense. */
      remainingAmount?: number | undefined
    }>(),
    { dense: false, remainingAmount: 0 }
  )

  const emit = defineEmits<{ delete: [id: string] }>()

  const remaining = () => props.remainingAmount ?? 0
</script>

<template>
  <div
    class="pl-3 border-l-2 border-amber-200 dark:border-amber-700"
    :class="dense ? 'space-y-1' : 'md:pl-4'"
  >
    <div
      v-for="reimb in reimbursements"
      :key="reimb.id"
      class="flex items-center justify-between"
      :class="dense ? 'py-0.5' : 'py-1 text-sm'"
    >
      <div class="flex items-center" :class="dense ? 'gap-1.5' : 'gap-2'">
        <span
          class="inline-flex items-center justify-center rounded-full font-medium"
          :class="[
            dense ? 'h-5 w-5 text-[10px]' : 'h-6 w-6 text-xs',
            reimb.status === 'COMPLETED'
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
              : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400',
          ]"
        >
          {{ reimb.personName.charAt(0).toUpperCase() }}
        </span>
        <span
          class="text-gray-700 dark:text-gray-300"
          :class="dense ? 'text-xs' : ''"
        >
          {{ reimb.personName }}
        </span>
        <span v-if="!dense" class="text-gray-500 dark:text-gray-400">:</span>
        <span
          class="font-medium"
          :class="[
            dense ? 'text-xs' : '',
            reimb.status === 'COMPLETED'
              ? 'text-green-600 dark:text-green-400'
              : 'text-amber-600 dark:text-amber-400',
          ]"
        >
          {{ formatCurrency(reimb.amount) }}
        </span>
        <span
          v-if="!dense && reimb.status === 'PARTIAL'"
          class="text-xs text-green-600 dark:text-green-400"
        >
          (reçu : {{ formatCurrency(reimb.amountReceived) }})
        </span>
      </div>
      <button
        v-if="reimb.status !== 'COMPLETED'"
        class="text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded transition-colors"
        :class="
          dense ? 'p-1.5' : 'p-1 hover:bg-red-50 dark:hover:bg-red-900/20'
        "
        title="Supprimer"
        @click.stop="emit('delete', reimb.id)"
      >
        <svg
          :class="dense ? 'h-3.5 w-3.5' : 'h-4 w-4'"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    </div>
    <div
      v-if="!dense && remaining() > 0"
      class="text-xs text-gray-500 dark:text-gray-400 mt-1"
    >
      Restant : {{ formatCurrency(remaining()) }}
    </div>
  </div>
</template>

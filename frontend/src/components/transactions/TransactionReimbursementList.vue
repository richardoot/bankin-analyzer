<script setup lang="ts">
  import type { ReimbursementDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'

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
    class="pl-3 border-l-2 border-debt-200 dark:border-debt-700"
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
              ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
              : 'bg-debt-100 dark:bg-debt-900/30 text-debt-700 dark:text-debt-300',
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
              ? 'text-green-700 dark:text-green-400'
              : 'text-debt-700 dark:text-debt-400',
          ]"
        >
          {{ formatCurrency(reimb.amount) }}
        </span>
        <span
          v-if="!dense && reimb.status === 'PARTIAL'"
          class="text-xs text-green-700 dark:text-green-400"
        >
          (reçu : {{ formatCurrency(reimb.amountReceived) }})
        </span>
        <!-- The income that repaid it, when cash came in. -->
        <TransactionsLink
          v-if="reimb.incomeTransactionIds.length > 0"
          :to="
            transactionsLink({
              ids: reimb.incomeTransactionIds,
              label: `Revenu ayant remboursé ${reimb.personName}`,
            })
          "
          :subject="`ce que ${reimb.personName} a remboursé`"
          icon-only
          class="h-6 w-6"
          :data-testid="`reimbursement-income-link-${reimb.id}`"
        />
      </div>
      <BaseIconButton
        v-if="reimb.status !== 'COMPLETED'"
        size="sm"
        variant="danger"
        class="-my-1"
        :label="`Supprimer le remboursement de ${reimb.personName}`"
        @click.stop="emit('delete', reimb.id)"
      >
        <IconClose />
      </BaseIconButton>
    </div>
    <div
      v-if="!dense && remaining() > 0"
      class="text-xs text-gray-500 dark:text-gray-400 mt-1"
    >
      Restant : {{ formatCurrency(remaining()) }}
    </div>
  </div>
</template>

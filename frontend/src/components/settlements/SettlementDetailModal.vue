<script setup lang="ts">
  import { computed } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import type { SettlementDto } from '@/lib/api'
  import { formatCurrency, formatDate, formatDateTime } from '@/lib/formatters'

  const props = withDefaults(
    defineProps<{
      isOpen: boolean
      settlement: SettlementDto | null
      hideDelete?: boolean
    }>(),
    { hideDelete: false }
  )

  const emit = defineEmits<{
    close: []
    delete: []
  }>()

  const totalSettled = computed(() => {
    if (!props.settlement) return 0
    return props.settlement.reimbursements.reduce(
      (sum, r) => sum + r.amountSettled,
      0
    )
  })
</script>

<template>
  <BaseModal
    :open="isOpen && settlement !== null"
    title="Détails du règlement"
    :subtitle="
      settlement ? `Créé le ${formatDateTime(settlement.createdAt)}` : undefined
    "
    max-width="lg"
    @close="emit('close')"
  >
    <template v-if="settlement">
      <!-- Person info -->
      <div class="mb-6 flex items-center gap-3">
        <div
          class="flex h-12 w-12 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30"
        >
          <span
            class="text-xl font-semibold text-primary-700 dark:text-primary-400"
          >
            {{ settlement.personName.charAt(0).toUpperCase() }}
          </span>
        </div>
        <div>
          <h3 class="font-medium text-gray-900 dark:text-gray-100">
            {{ settlement.personName }}
          </h3>
          <p class="text-sm text-gray-500 dark:text-gray-400">
            Montant réglé : {{ formatCurrency(settlement.amountUsed) }}
          </p>
        </div>
      </div>

      <!-- Income transaction -->
      <div class="mb-6 rounded-lg bg-primary-50 p-4 dark:bg-primary-900/20">
        <SectionLabel as="h4" class="mb-2">
          Transaction de règlement
        </SectionLabel>
        <p class="font-medium text-gray-900 dark:text-gray-100">
          {{ settlement.incomeTransactionDescription }}
        </p>
        <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
          {{ formatDate(settlement.incomeTransactionDate) }}
        </p>
        <div
          class="mt-2 flex items-center justify-between border-t border-primary-200 pt-2 dark:border-primary-800"
        >
          <span class="text-sm text-gray-600 dark:text-gray-400"
            >Montant total</span
          >
          <span class="font-bold text-primary-600 dark:text-primary-400">
            +{{ formatCurrency(settlement.incomeTransactionAmount) }}
          </span>
        </div>
        <div class="mt-1 flex items-center justify-between">
          <span class="text-sm text-gray-600 dark:text-gray-400"
            >Montant utilisé</span
          >
          <span class="font-medium text-gray-700 dark:text-gray-300">
            {{ formatCurrency(settlement.amountUsed) }}
          </span>
        </div>
      </div>

      <!-- Reimbursements list -->
      <div>
        <SectionLabel as="h4" class="mb-3">
          Remboursements réglés ({{ settlement.reimbursements.length }})
        </SectionLabel>

        <div class="space-y-2">
          <div
            v-for="reimbursement in settlement.reimbursements"
            :key="reimbursement.reimbursementId"
            class="rounded-lg bg-gray-50 p-3 dark:bg-slate-800"
          >
            <div class="flex items-start justify-between gap-4">
              <div class="min-w-0 flex-1">
                <p
                  class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                  :title="reimbursement.transactionDescription"
                >
                  {{ reimbursement.transactionDescription }}
                </p>
                <p class="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                  {{ formatDate(reimbursement.transactionDate) }}
                  <span v-if="reimbursement.expenseCategoryName" class="ml-2">
                    - {{ reimbursement.expenseCategoryName }}
                  </span>
                </p>
              </div>
              <div class="shrink-0 text-right">
                <p
                  class="text-sm font-semibold text-gray-900 dark:text-gray-100"
                >
                  {{ formatCurrency(reimbursement.amountSettled) }}
                </p>
                <p
                  v-if="
                    reimbursement.amountSettled < reimbursement.originalAmount
                  "
                  class="text-xs text-amber-700 dark:text-amber-400"
                >
                  sur {{ formatCurrency(reimbursement.originalAmount) }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Total -->
        <div
          class="mt-4 flex items-center justify-between border-t border-gray-200 pt-3 dark:border-slate-700"
        >
          <span class="font-medium text-gray-700 dark:text-gray-300"
            >Total réglé</span
          >
          <span
            class="text-lg font-bold text-primary-600 dark:text-primary-400"
          >
            {{ formatCurrency(totalSettled) }}
          </span>
        </div>
      </div>

      <!-- Note -->
      <div
        v-if="settlement.note"
        class="mt-4 rounded-lg bg-gray-50 p-3 dark:bg-slate-800"
      >
        <SectionLabel as="h4" class="mb-1">Note</SectionLabel>
        <p class="text-sm text-gray-700 dark:text-gray-300">
          {{ settlement.note }}
        </p>
      </div>
    </template>

    <template v-if="!hideDelete" #footer-start>
      <BaseButton variant="danger-outline" @click="emit('delete')">
        <IconTrash class="h-4 w-4" />
        Annuler ce règlement
      </BaseButton>
    </template>

    <template #footer>
      <BaseButton variant="secondary" @click="emit('close')">Fermer</BaseButton>
    </template>
  </BaseModal>
</template>

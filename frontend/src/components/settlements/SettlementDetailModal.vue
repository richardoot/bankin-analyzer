<script setup lang="ts">
  import { computed } from 'vue'
  import type { SettlementDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    isOpen: boolean
    settlement: SettlementDto | null
  }>()

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

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  function formatDateTime(dateStr: string): string {
    return new Date(dateStr).toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen && settlement"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <!-- Backdrop -->
        <div class="fixed inset-0 bg-black/50" @click="emit('close')" />

        <!-- Modal -->
        <div
          class="relative z-10 w-full max-w-lg max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 p-6"
          >
            <div>
              <h2
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                Details du reglement
              </h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                Cree le {{ formatDateTime(settlement.createdAt) }}
              </p>
            </div>
            <button
              type="button"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              @click="emit('close')"
            >
              <svg
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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

          <!-- Content -->
          <div class="flex-1 overflow-y-auto p-6">
            <!-- Person info -->
            <div class="flex items-center gap-3 mb-6">
              <div
                class="h-12 w-12 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center"
              >
                <span
                  class="text-xl font-semibold text-emerald-700 dark:text-emerald-400"
                >
                  {{ settlement.personName.charAt(0).toUpperCase() }}
                </span>
              </div>
              <div>
                <h3 class="font-medium text-gray-900 dark:text-gray-100">
                  {{ settlement.personName }}
                </h3>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  Montant regle: {{ formatCurrency(settlement.amountUsed) }}
                </p>
              </div>
            </div>

            <!-- Income transaction -->
            <div
              class="mb-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"
            >
              <h4
                class="text-sm font-medium text-emerald-700 dark:text-emerald-400 mb-2 flex items-center gap-2"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z"
                  />
                </svg>
                Transaction de reglement
              </h4>
              <div class="text-gray-900 dark:text-gray-100 font-medium">
                {{ settlement.incomeTransactionDescription }}
              </div>
              <div class="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {{ formatDate(settlement.incomeTransactionDate) }}
              </div>
              <div
                class="flex justify-between items-center mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400"
                  >Montant total</span
                >
                <span class="font-bold text-emerald-600 dark:text-emerald-400">
                  +{{ formatCurrency(settlement.incomeTransactionAmount) }}
                </span>
              </div>
              <div class="flex justify-between items-center mt-1">
                <span class="text-sm text-gray-600 dark:text-gray-400"
                  >Montant utilise</span
                >
                <span class="font-medium text-gray-700 dark:text-gray-300">
                  {{ formatCurrency(settlement.amountUsed) }}
                </span>
              </div>
            </div>

            <!-- Reimbursements list -->
            <div>
              <h4
                class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                  />
                </svg>
                Remboursements regles ({{ settlement.reimbursements.length }})
              </h4>

              <div class="space-y-2">
                <div
                  v-for="reimbursement in settlement.reimbursements"
                  :key="reimbursement.reimbursementId"
                  class="p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
                >
                  <div class="flex justify-between items-start">
                    <div class="flex-1 min-w-0">
                      <div
                        class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
                      >
                        {{ reimbursement.transactionDescription }}
                      </div>
                      <div
                        class="text-xs text-gray-500 dark:text-gray-400 mt-0.5"
                      >
                        {{ formatDate(reimbursement.transactionDate) }}
                        <span v-if="reimbursement.categoryName" class="ml-2">
                          - {{ reimbursement.categoryName }}
                        </span>
                      </div>
                    </div>
                    <div class="text-right ml-4">
                      <div
                        class="text-sm font-semibold text-gray-900 dark:text-gray-100"
                      >
                        {{ formatCurrency(reimbursement.amountSettled) }}
                      </div>
                      <div
                        v-if="
                          reimbursement.amountSettled <
                          reimbursement.originalAmount
                        "
                        class="text-xs text-orange-600 dark:text-orange-400"
                      >
                        sur {{ formatCurrency(reimbursement.originalAmount) }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Total -->
              <div
                class="mt-4 pt-3 border-t border-gray-200 dark:border-slate-700 flex justify-between items-center"
              >
                <span class="font-medium text-gray-700 dark:text-gray-300"
                  >Total regle</span
                >
                <span
                  class="text-lg font-bold text-emerald-600 dark:text-emerald-400"
                >
                  {{ formatCurrency(totalSettled) }}
                </span>
              </div>
            </div>

            <!-- Note -->
            <div
              v-if="settlement.note"
              class="mt-4 p-3 bg-gray-50 dark:bg-slate-800 rounded-lg"
            >
              <h4
                class="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1"
              >
                Note
              </h4>
              <p class="text-sm text-gray-700 dark:text-gray-300">
                {{ settlement.note }}
              </p>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="flex justify-between items-center border-t border-gray-200 dark:border-slate-700 p-6"
          >
            <button
              type="button"
              class="px-4 py-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors flex items-center gap-2"
              @click="emit('delete')"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
              Annuler ce reglement
            </button>
            <button
              type="button"
              class="px-6 py-2 bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
              @click="emit('close')"
            >
              Fermer
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .modal-enter-active,
  .modal-leave-active {
    transition: opacity 0.2s ease;
  }

  .modal-enter-from,
  .modal-leave-to {
    opacity: 0;
  }
</style>

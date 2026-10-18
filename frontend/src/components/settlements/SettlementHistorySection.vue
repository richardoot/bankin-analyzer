<script setup lang="ts">
  import { ref, computed } from 'vue'
  import type { SettlementDto } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconEye from '@/components/icons/IconEye.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'

  const props = defineProps<{
    settlements: SettlementDto[]
    isLoading: boolean
  }>()

  const emit = defineEmits<{
    delete: [settlementId: string]
    viewDetails: [settlement: SettlementDto]
  }>()

  // Filter state
  const selectedPersonId = ref<string | null>(null)

  // Get unique persons from settlements
  const persons = computed(() => {
    const personMap = new Map<string, string>()
    props.settlements.forEach(s => {
      personMap.set(s.personId, s.personName)
    })
    return Array.from(personMap.entries()).map(([id, name]) => ({ id, name }))
  })

  // Filtered settlements
  const filteredSettlements = computed(() => {
    if (!selectedPersonId.value) return props.settlements
    return props.settlements.filter(s => s.personId === selectedPersonId.value)
  })

  function getCategoryNames(settlement: SettlementDto): string {
    const uniqueCategories = new Set(
      settlement.reimbursements.map(
        r => r.expenseCategoryName || 'Sans catégorie'
      )
    )
    return Array.from(uniqueCategories).join(', ')
  }
</script>

<template>
  <BaseCard>
    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Historique des règlements
      </h2>

      <!-- Person filter -->
      <div v-if="persons.length > 1" class="flex items-center gap-2">
        <label
          for="settlement-history-person"
          class="text-sm text-gray-600 dark:text-gray-400 shrink-0"
          >Filtrer :</label
        >
        <select
          id="settlement-history-person"
          v-model="selectedPersonId"
          class="flex-1 sm:flex-initial px-3 py-2 sm:py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:focus:border-primary-400 min-h-[44px] sm:min-h-0"
        >
          <option :value="null">Tous</option>
          <option v-for="person in persons" :key="person.id" :value="person.id">
            {{ person.name }}
          </option>
        </select>
      </div>
    </div>

    <!-- Loading state -->
    <div v-if="isLoading" class="flex justify-center items-center py-8">
      <div class="flex items-center gap-3 text-gray-500 dark:text-gray-400">
        <svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          />
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        <span>Chargement...</span>
      </div>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="settlements.length === 0"
      class="text-center py-8 text-gray-500 dark:text-gray-400"
    >
      <svg
        class="mx-auto h-12 w-12 text-gray-500 dark:text-gray-400 mb-3"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="1.5"
          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
        />
      </svg>
      <p class="text-sm">Aucun règlement enregistré</p>
      <p class="text-xs mt-1">Les règlements apparaîtront ici une fois créés</p>
    </div>

    <!-- Settlements list -->
    <div v-else class="space-y-3">
      <div
        v-for="settlement in filteredSettlements"
        :key="settlement.id"
        class="border border-gray-200 dark:border-slate-700 rounded-lg p-3 sm:p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
      >
        <!-- Mobile layout -->
        <div class="block sm:hidden">
          <!-- Row 1: Date + Amount -->
          <div class="flex items-center justify-between mb-2">
            <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
              {{ formatDate(settlement.createdAt) }}
            </span>
            <span class="text-lg font-bold text-green-700 dark:text-green-400">
              {{ formatCurrency(settlement.amountUsed) }}
            </span>
          </div>

          <!-- Row 2: Person -->
          <div class="flex items-center gap-2 mb-2">
            <div
              class="h-6 w-6 bg-debt-100 dark:bg-debt-900/30 rounded-full flex items-center justify-center shrink-0"
            >
              <span
                class="text-xs font-semibold text-debt-700 dark:text-debt-300"
              >
                {{ settlement.personName.charAt(0).toUpperCase() }}
              </span>
            </div>
            <span class="text-sm text-gray-700 dark:text-gray-300 truncate">
              {{ settlement.personName }}
            </span>
            <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">
              ({{ settlement.reimbursements.length }} remb.)
            </span>
          </div>

          <!-- Row 3: Categories -->
          <div class="text-sm text-gray-600 dark:text-gray-400 mb-2 truncate">
            {{ getCategoryNames(settlement) }}
          </div>

          <!-- Row 4: Income transaction + Actions -->
          <div
            class="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-slate-700"
          >
            <div
              class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 truncate mr-2"
            >
              <svg
                class="h-3.5 w-3.5 shrink-0"
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
              <span class="truncate">{{
                settlement.incomeTransactionDescription
              }}</span>
            </div>

            <!-- Actions -->
            <div class="flex gap-1 shrink-0">
              <BaseIconButton
                label="Voir les détails du règlement"
                @click="emit('viewDetails', settlement)"
              >
                <IconEye />
              </BaseIconButton>
              <BaseIconButton
                variant="danger"
                label="Annuler le règlement"
                @click="emit('delete', settlement.id)"
              >
                <IconTrash />
              </BaseIconButton>
            </div>
          </div>
        </div>

        <!-- Desktop layout -->
        <div class="hidden sm:flex items-start justify-between gap-4">
          <!-- Main info -->
          <div class="flex-1 min-w-0">
            <!-- Header: Date and Person -->
            <div class="flex items-center gap-3 mb-2">
              <span
                class="text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                {{ formatDate(settlement.createdAt) }}
              </span>
              <span class="text-gray-500 dark:text-gray-400">-</span>
              <div class="flex items-center gap-2">
                <div
                  class="h-6 w-6 bg-debt-100 dark:bg-debt-900/30 rounded-full flex items-center justify-center"
                >
                  <span
                    class="text-xs font-semibold text-debt-700 dark:text-debt-300"
                  >
                    {{ settlement.personName.charAt(0).toUpperCase() }}
                  </span>
                </div>
                <span class="text-sm text-gray-700 dark:text-gray-300">
                  {{ settlement.personName }}
                </span>
              </div>
            </div>

            <!-- Categories -->
            <div class="text-sm text-gray-600 dark:text-gray-400 mb-1">
              {{ getCategoryNames(settlement) }}
            </div>

            <!-- Income transaction -->
            <div
              class="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1"
            >
              <svg
                class="h-3.5 w-3.5"
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
              via {{ settlement.incomeTransactionDescription }} ({{
                formatDate(settlement.incomeTransactionDate)
              }})
            </div>
          </div>

          <!-- Amount and actions -->
          <div class="flex items-center gap-3">
            <div class="text-right">
              <div class="text-lg font-bold text-green-700 dark:text-green-400">
                {{ formatCurrency(settlement.amountUsed) }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ settlement.reimbursements.length }} remboursement(s)
              </div>
            </div>

            <!-- Actions dropdown -->
            <div class="flex gap-1">
              <BaseIconButton
                label="Voir les détails du règlement"
                @click="emit('viewDetails', settlement)"
              >
                <IconEye />
              </BaseIconButton>
              <BaseIconButton
                variant="danger"
                label="Annuler le règlement"
                @click="emit('delete', settlement.id)"
              >
                <IconTrash />
              </BaseIconButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Filtered empty state -->
      <div
        v-if="filteredSettlements.length === 0 && settlements.length > 0"
        class="text-center py-6 text-gray-500 dark:text-gray-400 text-sm"
      >
        Aucun règlement pour cette personne
      </div>
    </div>
  </BaseCard>
</template>

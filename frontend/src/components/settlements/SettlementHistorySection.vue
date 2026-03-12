<script setup lang="ts">
  import { ref, computed } from 'vue'
  import type { SettlementDto } from '@/lib/api'

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

  function formatCurrency(amount: number): string {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  function getCategoryNames(settlement: SettlementDto): string {
    const uniqueCategories = new Set(
      settlement.reimbursements.map(r => r.categoryName || 'Sans categorie')
    )
    return Array.from(uniqueCategories).join(', ')
  }
</script>

<template>
  <div
    class="bg-white dark:bg-slate-900 rounded-xl shadow-sm dark:shadow-slate-900/20 p-6"
  >
    <div class="flex items-center justify-between mb-4">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Historique des Reglements
      </h2>

      <!-- Person filter -->
      <div v-if="persons.length > 1" class="flex items-center gap-2">
        <label class="text-sm text-gray-600 dark:text-gray-400">Filtrer:</label>
        <select
          v-model="selectedPersonId"
          class="px-3 py-1.5 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-emerald-500 dark:focus:border-emerald-400"
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
        class="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500 mb-3"
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
      <p class="text-sm">Aucun reglement enregistre</p>
      <p class="text-xs mt-1">Les reglements apparaitront ici une fois crees</p>
    </div>

    <!-- Settlements list -->
    <div v-else class="space-y-3">
      <div
        v-for="settlement in filteredSettlements"
        :key="settlement.id"
        class="border border-gray-200 dark:border-slate-700 rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
      >
        <div class="flex items-start justify-between gap-4">
          <!-- Main info -->
          <div class="flex-1 min-w-0">
            <!-- Header: Date and Person -->
            <div class="flex items-center gap-3 mb-2">
              <span
                class="text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                {{ formatDate(settlement.createdAt) }}
              </span>
              <span class="text-gray-400 dark:text-gray-500">-</span>
              <div class="flex items-center gap-2">
                <div
                  class="h-6 w-6 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center"
                >
                  <span
                    class="text-xs font-semibold text-emerald-700 dark:text-emerald-400"
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
              <div
                class="text-lg font-bold text-emerald-600 dark:text-emerald-400"
              >
                {{ formatCurrency(settlement.amountUsed) }}
              </div>
              <div class="text-xs text-gray-500 dark:text-gray-400">
                {{ settlement.reimbursements.length }} remboursement(s)
              </div>
            </div>

            <!-- Actions dropdown -->
            <div class="flex gap-1">
              <button
                type="button"
                class="p-2 text-gray-400 dark:text-gray-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors"
                title="Voir les details"
                @click="emit('viewDetails', settlement)"
              >
                <svg
                  class="h-5 w-5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                  />
                </svg>
              </button>
              <button
                type="button"
                class="p-2 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                title="Annuler le reglement"
                @click="emit('delete', settlement.id)"
              >
                <svg
                  class="h-5 w-5"
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
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Filtered empty state -->
      <div
        v-if="filteredSettlements.length === 0 && settlements.length > 0"
        class="text-center py-6 text-gray-500 dark:text-gray-400 text-sm"
      >
        Aucun reglement pour cette personne
      </div>
    </div>
  </div>
</template>

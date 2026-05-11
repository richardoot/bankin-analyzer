<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import { api } from '@/lib/api'
  import type { BudgetPlanSummaryDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    open: boolean
    /** Currently-displayed plan id (highlighted in the list) */
    activePlanId?: string | null
  }>()

  const emit = defineEmits<{
    (e: 'close'): void
    (e: 'select', planId: string): void
    (e: 'deleted', planId: string): void
  }>()

  const plans = ref<BudgetPlanSummaryDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const deletingId = ref<string | null>(null)

  type Status = 'past' | 'current' | 'future'

  function todayUtcMidnight(): Date {
    const now = new Date()
    return new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
    )
  }

  function planStatus(plan: BudgetPlanSummaryDto): Status {
    const today = todayUtcMidnight().getTime()
    const start = new Date(`${plan.startDate}T00:00:00Z`).getTime()
    const end = new Date(`${plan.endDate}T23:59:59Z`).getTime()
    if (today < start) return 'future'
    if (today > end) return 'past'
    return 'current'
  }

  function statusLabel(s: Status): string {
    switch (s) {
      case 'current':
        return 'En cours'
      case 'future':
        return 'À venir'
      case 'past':
        return 'Terminé'
    }
  }

  function statusClass(s: Status): string {
    switch (s) {
      case 'current':
        return 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
      case 'future':
        return 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
      case 'past':
        return 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
    }
  }

  function formatRange(start: string, end: string): string {
    const s = new Date(`${start}T00:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    const e = new Date(`${end}T00:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    return `${s} → ${e}`
  }

  async function loadPlans() {
    isLoading.value = true
    error.value = null
    try {
      plans.value = await api.getBudgetPlans()
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Échec du chargement des plans'
    } finally {
      isLoading.value = false
    }
  }

  // Sort plans: current first, then future (chronological), then past (most recent first)
  const sortedPlans = computed(() => {
    const groups: Record<Status, BudgetPlanSummaryDto[]> = {
      current: [],
      future: [],
      past: [],
    }
    for (const p of plans.value) {
      groups[planStatus(p)].push(p)
    }
    groups.future.sort((a, b) => a.startDate.localeCompare(b.startDate))
    groups.past.sort((a, b) => b.startDate.localeCompare(a.startDate))
    return [...groups.current, ...groups.future, ...groups.past]
  })

  watch(
    () => props.open,
    open => {
      if (open) void loadPlans()
    },
    { immediate: true }
  )

  function selectPlan(planId: string) {
    emit('select', planId)
  }

  function onClose() {
    emit('close')
  }

  async function onDelete(plan: BudgetPlanSummaryDto) {
    const confirmed = window.confirm(
      `Supprimer le budget « ${plan.name} » (${formatRange(plan.startDate, plan.endDate)}) ?\n\nCette action est irréversible.`
    )
    if (!confirmed) return
    deletingId.value = plan.id
    error.value = null
    try {
      await api.deleteBudgetPlan(plan.id)
      plans.value = plans.value.filter(p => p.id !== plan.id)
      emit('deleted', plan.id)
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : 'Échec de la suppression'
    } finally {
      deletingId.value = null
    }
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      data-testid="budget-history-modal"
      role="dialog"
      aria-modal="true"
      @click.self="onClose"
    >
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
      >
        <div
          class="flex items-center justify-between px-5 py-4 border-b border-gray-100 dark:border-slate-700"
        >
          <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Historique des budgets
          </h2>
          <button
            type="button"
            class="text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 transition-colors"
            @click="onClose"
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="flex-1 overflow-y-auto">
          <div
            v-if="isLoading"
            class="px-5 py-8 text-sm text-gray-500 dark:text-gray-400"
          >
            Chargement…
          </div>
          <div
            v-else-if="error"
            class="m-5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 px-3 py-2 rounded-lg text-sm"
          >
            {{ error }}
          </div>
          <div
            v-else-if="plans.length === 0"
            class="px-5 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
          >
            Aucun budget enregistré pour l'instant.
          </div>
          <table v-else class="w-full text-sm">
            <thead
              class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-slate-800/40"
            >
              <tr>
                <th class="text-left px-5 py-2">Nom</th>
                <th class="text-left px-3 py-2">Plage</th>
                <th class="text-center px-3 py-2">Statut</th>
                <th class="text-right px-3 py-2">Mois</th>
                <th class="text-right px-3 py-2">Total budgété</th>
                <th class="px-3 py-2 w-10">
                  <span class="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
              <tr
                v-for="plan in sortedPlans"
                :key="plan.id"
                :data-testid="`history-row-${plan.id}`"
                class="cursor-pointer transition-colors"
                :class="
                  plan.id === activePlanId
                    ? 'bg-indigo-50 dark:bg-indigo-900/20'
                    : 'hover:bg-gray-50 dark:hover:bg-slate-800/40'
                "
                @click="selectPlan(plan.id)"
              >
                <td
                  class="px-5 py-3 font-medium text-gray-900 dark:text-gray-100"
                >
                  {{ plan.name }}
                  <span
                    v-if="plan.id === activePlanId"
                    class="ml-1.5 text-xs text-indigo-600 dark:text-indigo-400"
                  >
                    (affiché)
                  </span>
                </td>
                <td
                  class="px-3 py-3 text-gray-600 dark:text-gray-400 tabular-nums"
                >
                  {{ formatRange(plan.startDate, plan.endDate) }}
                </td>
                <td class="px-3 py-3 text-center">
                  <span
                    class="inline-block px-2 py-0.5 text-xs font-medium rounded-full"
                    :class="statusClass(planStatus(plan))"
                  >
                    {{ statusLabel(planStatus(plan)) }}
                  </span>
                </td>
                <td
                  class="px-3 py-3 text-right text-gray-600 dark:text-gray-400 tabular-nums"
                >
                  {{ plan.monthCount }}
                </td>
                <td
                  class="px-3 py-3 text-right text-gray-900 dark:text-gray-100 tabular-nums font-medium"
                >
                  {{ formatCurrency(plan.totalAmount) }}
                </td>
                <td class="px-3 py-3 text-right">
                  <button
                    type="button"
                    :data-testid="`delete-row-${plan.id}`"
                    class="p-1.5 rounded text-gray-400 hover:text-red-600 dark:text-gray-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50 disabled:cursor-wait"
                    :disabled="deletingId === plan.id"
                    :aria-label="`Supprimer le budget ${plan.name}`"
                    @click.stop="onDelete(plan)"
                  >
                    <svg
                      v-if="deletingId === plan.id"
                      class="animate-spin h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
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
                    <svg
                      v-else
                      class="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"
                      />
                    </svg>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div
          class="flex items-center justify-end px-5 py-3 border-t border-gray-100 dark:border-slate-700"
        >
          <button
            type="button"
            class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-md transition-colors"
            @click="onClose"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

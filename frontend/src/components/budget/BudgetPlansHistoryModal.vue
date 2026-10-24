<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import { api } from '@/lib/api'
  import type { BudgetPlanSummaryDto } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'

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

  /**
   * Six columns do not fit in 358px: under `md` each plan is a card that
   * says the same things on three lines, with its own open and delete
   * controls, instead of a table whose total and bin sit off screen.
   */
  const isMobile = useIsMobile()

  const plans = ref<BudgetPlanSummaryDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const deletingId = ref<string | null>(null)
  /** The plan the confirmation is asking about. */
  const planToDelete = ref<BudgetPlanSummaryDto | null>(null)

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
        // A status, not an action: the ink (primary marks the plan shown).
        return 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100'
      case 'future':
        return 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
      case 'past':
        return 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400'
    }
  }

  function formatRange(start: string, end: string): string {
    return `${formatDate(start, 'medium')} → ${formatDate(end, 'medium')}`
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

  function onDelete(plan: BudgetPlanSummaryDto) {
    planToDelete.value = plan
  }

  function cancelDelete() {
    if (deletingId.value) return
    planToDelete.value = null
  }

  async function confirmDelete() {
    const plan = planToDelete.value
    if (!plan) return
    deletingId.value = plan.id
    error.value = null
    try {
      await api.deleteBudgetPlan(plan.id)
      plans.value = plans.value.filter(p => p.id !== plan.id)
      planToDelete.value = null
      emit('deleted', plan.id)
    } catch (err) {
      planToDelete.value = null
      error.value =
        err instanceof Error ? err.message : 'Impossible de supprimer le budget'
    } finally {
      deletingId.value = null
    }
  }
</script>

<template>
  <BaseModal
    :open="open"
    title="Historique des budgets"
    max-width="2xl"
    data-testid="budget-history-modal"
    @close="onClose"
  >
    <p v-if="isLoading" class="py-8 text-sm text-gray-500 dark:text-gray-400">
      Chargement…
    </p>
    <InlineAlert v-else-if="error" retry-label="Réessayer" @retry="loadPlans">
      {{ error }}
    </InlineAlert>
    <p
      v-else-if="plans.length === 0"
      class="py-12 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      Aucun budget enregistré pour l'instant.
    </p>

    <!-- Phone: one card per plan -->
    <ul v-else-if="isMobile" class="space-y-2" data-testid="history-cards">
      <li
        v-for="plan in sortedPlans"
        :key="plan.id"
        :data-testid="`history-row-${plan.id}`"
        :aria-current="plan.id === activePlanId ? 'true' : undefined"
        class="flex items-start gap-2 rounded-lg border p-3"
        :class="
          plan.id === activePlanId
            ? 'border-primary-200 bg-primary-50 dark:border-primary-800 dark:bg-primary-900/20'
            : 'border-gray-200 dark:border-slate-700'
        "
      >
        <button
          type="button"
          class="min-w-0 flex-1 text-left"
          :aria-label="`Afficher le budget ${plan.name}`"
          @click="selectPlan(plan.id)"
        >
          <span class="flex items-center gap-2">
            <span
              class="truncate font-medium text-gray-900 dark:text-gray-100"
              :title="plan.name"
            >
              {{ plan.name }}
            </span>
            <span
              class="inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium"
              :class="statusClass(planStatus(plan))"
            >
              {{ statusLabel(planStatus(plan)) }}
            </span>
          </span>
          <span
            class="mt-1 block text-sm text-gray-600 tabular-nums dark:text-gray-400"
          >
            {{ formatRange(plan.startDate, plan.endDate) }}
          </span>
          <span
            class="mt-1 block text-sm text-gray-600 tabular-nums dark:text-gray-400"
          >
            {{ plan.monthCount }} mois ·
            <span class="font-medium text-gray-900 dark:text-gray-100">
              {{ formatCurrency(plan.totalAmount) }}
            </span>
            <span
              v-if="plan.id === activePlanId"
              class="ml-1.5 text-xs text-gray-500 dark:text-gray-400"
            >
              (affiché)
            </span>
          </span>
        </button>
        <BaseIconButton
          size="sm"
          variant="danger"
          :label="`Supprimer le budget ${plan.name}`"
          :data-testid="`delete-row-${plan.id}`"
          :loading="deletingId === plan.id"
          @click="onDelete(plan)"
        >
          <IconTrash />
        </BaseIconButton>
      </li>
    </ul>

    <!-- Desk: the table -->
    <table v-else class="w-full text-sm">
      <thead
        class="bg-gray-50 text-xs font-semibold tracking-wide text-gray-500 uppercase dark:bg-slate-800/40 dark:text-gray-400"
      >
        <tr>
          <th class="px-3 py-2 text-left">Nom</th>
          <th class="px-3 py-2 text-left">Plage</th>
          <th class="px-3 py-2 text-center">Statut</th>
          <th class="px-3 py-2 text-right">Mois</th>
          <th class="px-3 py-2 text-right">Total budgété</th>
          <th class="w-10 px-3 py-2">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
        <tr
          v-for="plan in sortedPlans"
          :key="plan.id"
          :data-testid="`history-row-${plan.id}`"
          tabindex="0"
          :aria-current="plan.id === activePlanId ? 'true' : undefined"
          :aria-label="`Afficher le budget ${plan.name}`"
          class="cursor-pointer transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary-500"
          :class="
            plan.id === activePlanId
              ? 'bg-primary-50 dark:bg-primary-900/20'
              : 'hover:bg-gray-50 dark:hover:bg-slate-800/40'
          "
          @click="selectPlan(plan.id)"
          @keydown.enter.self.prevent="selectPlan(plan.id)"
          @keydown.space.self.prevent="selectPlan(plan.id)"
        >
          <td class="px-3 py-3 font-medium text-gray-900 dark:text-gray-100">
            {{ plan.name }}
            <span
              v-if="plan.id === activePlanId"
              class="ml-1.5 text-xs text-gray-500 dark:text-gray-400"
            >
              (affiché)
            </span>
          </td>
          <td class="px-3 py-3 text-gray-600 tabular-nums dark:text-gray-400">
            {{ formatRange(plan.startDate, plan.endDate) }}
          </td>
          <td class="px-3 py-3 text-center">
            <span
              class="inline-block rounded-full px-2 py-0.5 text-xs font-medium"
              :class="statusClass(planStatus(plan))"
            >
              {{ statusLabel(planStatus(plan)) }}
            </span>
          </td>
          <td
            class="px-3 py-3 text-right text-gray-600 tabular-nums dark:text-gray-400"
          >
            {{ plan.monthCount }}
          </td>
          <td
            class="px-3 py-3 text-right font-medium text-gray-900 tabular-nums dark:text-gray-100"
          >
            {{ formatCurrency(plan.totalAmount) }}
          </td>
          <td class="px-3 py-3 text-right">
            <BaseIconButton
              size="sm"
              variant="danger"
              :label="`Supprimer le budget ${plan.name}`"
              :data-testid="`delete-row-${plan.id}`"
              :loading="deletingId === plan.id"
              @click.stop="onDelete(plan)"
            >
              <IconTrash />
            </BaseIconButton>
          </td>
        </tr>
      </tbody>
    </table>

    <template #footer>
      <BaseButton variant="secondary" @click="onClose">Fermer</BaseButton>
    </template>
  </BaseModal>

  <ConfirmDialog
    :open="planToDelete !== null"
    title="Supprimer ce budget ?"
    :loading="deletingId !== null"
    @confirm="confirmDelete"
    @cancel="cancelDelete"
  >
    Le budget
    <span class="font-medium text-gray-900 dark:text-gray-100"
      >« {{ planToDelete?.name }} »</span
    >
    <template v-if="planToDelete">
      ({{
        formatRange(planToDelete.startDate, planToDelete.endDate)
      }})</template
    >
    et ses enveloppes seront supprimés. Cette action est irréversible.
  </ConfirmDialog>
</template>

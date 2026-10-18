<script setup lang="ts">
  import { computed } from 'vue'
  import type { BudgetPlanDto } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import { planStatus } from './planStatus'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import IconClock from '@/components/icons/IconClock.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'

  /**
   * The plan introducing itself: name, status badge, date span, the
   * savings/projects equation decided at creation — and the two header
   * actions. The outcome of a save is not said here: it belongs next to
   * the button that asked for it, in BudgetEditBar.
   *
   * Everything shown derives from the plan itself; the page only says
   * whether editing is in flight (which locks the actions).
   */
  const props = withDefaults(
    defineProps<{
      plan: BudgetPlanDto | null
      isLoading?: boolean | undefined
      planCount?: number | undefined
      isEditing?: boolean | undefined
    }>(),
    {
      isLoading: false,
      planCount: 0,
      isEditing: false,
    }
  )

  const emit = defineEmits<{ 'open-history': []; create: [] }>()

  const formatDateLabel = (iso: string): string => formatDate(iso, 'long')

  const currentPlanStatus = computed(() => planStatus(props.plan))

  const statusBadge = computed(() => {
    const s = currentPlanStatus.value
    if (s === 'current')
      return {
        label: 'En cours',
        class:
          'bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400',
      }
    if (s === 'future')
      return {
        label: 'À venir',
        class:
          'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
      }
    if (s === 'past')
      return {
        label: 'Terminé',
        class: 'bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-400',
      }
    return null
  })
</script>

<template>
  <div
    class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6"
  >
    <div>
      <h1
        class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
      >
        Budget
      </h1>
      <p
        v-if="plan"
        class="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400 flex flex-wrap items-center gap-x-1.5 gap-y-1"
      >
        <span class="font-medium text-gray-900 dark:text-gray-100">
          {{ plan.name }}
        </span>
        <span
          v-if="statusBadge"
          :data-testid="`plan-status-${currentPlanStatus}`"
          class="px-2 py-0.5 text-[11px] font-medium rounded-full"
          :class="statusBadge.class"
        >
          {{ statusBadge.label }}
        </span>
        <span class="text-gray-300 dark:text-gray-600">·</span>
        <span>
          {{ formatDateLabel(plan.startDate) }} →
          {{ formatDateLabel(plan.endDate) }}
        </span>
        <span class="text-gray-500 dark:text-gray-400">
          ({{ plan.monthCount }} mois)
        </span>
      </p>
      <!-- The plan's equation, when one was decided at creation. -->
      <p
        v-if="
          plan &&
          plan.projectReserve !== null &&
          plan.projectReserve !== undefined
        "
        data-testid="plan-project-reserve"
        class="mt-1.5 text-xs text-gray-500 dark:text-gray-400"
      >
        Épargne décidée
        <strong class="text-gray-700 dark:text-gray-300 tabular-nums">
          {{ formatCurrency(plan.savingsTarget ?? 0) }} / mois
        </strong>
        · Budget projets
        <strong
          class="tabular-nums"
          :class="
            plan.projectReserve < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-gray-700 dark:text-gray-300'
          "
        >
          {{ formatCurrency(plan.projectReserve) }}
        </strong>
        <span v-if="plan.projectReserve < 0">
          — ce plan ne tient pas dans les revenus prévus
        </span>
      </p>
    </div>

    <!-- Without a plan the page's empty state carries « Créer un budget »
         and « Historique »: the header does not repeat them. -->
    <div v-if="plan" class="flex items-center gap-2 shrink-0">
      <BaseButton
        v-if="(planCount ?? 0) > 0"
        variant="secondary"
        size="sm"
        data-testid="header-history-button"
        :disabled="isEditing"
        :title="
          isEditing
            ? 'Enregistrez ou annulez les modifications avant de changer de plan'
            : undefined
        "
        @click="emit('open-history')"
      >
        <IconClock class="h-4 w-4" />
        Historique
      </BaseButton>
      <BaseButton
        size="sm"
        data-testid="header-new-plan-button"
        :disabled="isEditing"
        :title="
          isEditing
            ? 'Enregistrez ou annulez les modifications avant de créer un plan'
            : undefined
        "
        @click="emit('create')"
      >
        <IconPlus class="h-4 w-4" />
        Nouveau budget
      </BaseButton>
    </div>
  </div>
</template>

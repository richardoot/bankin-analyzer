<script setup lang="ts">
  import { computed } from 'vue'
  import type { BudgetPlanDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import { planStatus } from './planStatus'

  /**
   * The plan introducing itself: name, status badge, date span, the
   * savings/projects equation decided at creation — and the two header
   * actions. The save indicator lives here too, since it competes for the
   * same corner of the screen.
   *
   * Everything shown derives from the plan itself; the page only says
   * whether editing is in flight (which locks the actions) and how the
   * last save went.
   */
  const props = withDefaults(
    defineProps<{
      plan: BudgetPlanDto | null
      isLoading?: boolean | undefined
      planCount?: number | undefined
      isEditing?: boolean | undefined
      isSaving?: boolean | undefined
      saveSuccess?: boolean | undefined
    }>(),
    {
      isLoading: false,
      planCount: 0,
      isEditing: false,
      isSaving: false,
      saveSuccess: false,
    }
  )

  const emit = defineEmits<{ 'open-history': []; create: [] }>()

  function formatDateLabel(iso: string): string {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

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
          'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400',
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
              : 'text-indigo-600 dark:text-indigo-400'
          "
        >
          {{ formatCurrency(plan.projectReserve) }}
        </strong>
        <span v-if="plan.projectReserve < 0">
          — ce plan ne tient pas dans les revenus prévus
        </span>
      </p>
      <p
        v-else-if="!isLoading"
        class="mt-1 text-sm sm:text-base text-gray-600 dark:text-gray-400"
      >
        Aucun budget en cours.
      </p>
    </div>

    <div class="flex items-center gap-2 shrink-0">
      <button
        v-if="(planCount ?? 0) > 0"
        type="button"
        data-testid="header-history-button"
        :disabled="isEditing"
        :title="
          isEditing
            ? 'Enregistrez ou annulez les modifications avant de changer de plan'
            : undefined
        "
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        @click="emit('open-history')"
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
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        Historique
      </button>
      <button
        type="button"
        data-testid="header-new-plan-button"
        :disabled="isEditing"
        :title="
          isEditing
            ? 'Enregistrez ou annulez les modifications avant de créer un plan'
            : undefined
        "
        class="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        @click="emit('create')"
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
            d="M12 4v16m8-8H4"
          />
        </svg>
        Nouveau budget
      </button>
    </div>

    <!-- Save indicator -->
    <div
      v-if="plan && (isSaving || saveSuccess)"
      class="flex items-center gap-2 text-sm shrink-0"
      aria-live="polite"
    >
      <template v-if="isSaving">
        <svg
          class="animate-spin h-4 w-4 text-indigo-600 dark:text-indigo-400"
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
        <span class="text-gray-500 dark:text-gray-400">Sauvegarde…</span>
      </template>
      <template v-else>
        <svg
          class="h-4 w-4 text-primary-600 dark:text-primary-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <span class="text-primary-600 dark:text-primary-400">Sauvegardé</span>
      </template>
    </div>
  </div>
</template>

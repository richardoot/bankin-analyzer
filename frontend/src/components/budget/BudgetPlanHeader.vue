<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { BudgetPlanDto } from '@/lib/api'
  import { formatDate } from '@/lib/formatters'
  import { planStatus } from './planStatus'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import IconClock from '@/components/icons/IconClock.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'
  import IconDots from '@/components/icons/IconDots.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import { useMediaQuery } from '@/composables/useMediaQuery'

  /**
   * The plan introducing itself: name, status badge, date span — and the
   * two header actions. The savings decided at creation are read in the
   * band of the month (BudgetMonthBand), the projects reserve with the
   * projects of the period. The outcome of a save is not said here: it belongs next to
   * the button that asked for it, in BudgetEditBar.
   *
   * Everything shown derives from the plan itself; the page only says
   * whether editing is in flight (which locks the actions). The `actions`
   * slot takes what the page adds after them: the « Lecture » menu, as on
   * the dashboard.
   *
   * On a phone (budget-refonte.md, lot 7) the two actions go behind a
   * « … » button, next to « Lecture » reduced to its icon: a sheet offers
   * them, 44 px each, and the title keeps the row.
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

  const isPhone = useMediaQuery('(max-width: 639.98px)')
  const moreOpen = ref(false)

  /** « … » on a phone: the sheet closes, then the action runs. */
  function pick(action: 'open-history' | 'create'): void {
    moreOpen.value = false
    if (action === 'open-history') emit('open-history')
    else emit('create')
  }

  const formatDateLabel = (iso: string): string => formatDate(iso, 'long')

  const currentPlanStatus = computed(() => planStatus(props.plan))

  const statusBadge = computed(() => {
    const s = currentPlanStatus.value
    if (s === 'current')
      return {
        label: 'En cours',
        // A status, not an action: the ink, as the plan's name (primary is
        // for what can be pressed or chosen).
        class: 'bg-gray-100 dark:bg-slate-700 text-gray-900 dark:text-gray-100',
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
  <!-- One row at every width: on a phone the actions are two icons. -->
  <div class="mb-6 flex items-start justify-between gap-3 sm:gap-4">
    <div class="min-w-0">
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
    </div>

    <!-- Without a plan the page's empty state carries « Créer un budget »
         and « Historique »: the header does not repeat them. -->
    <div v-if="plan" class="flex shrink-0 flex-wrap items-center gap-2">
      <template v-if="!isPhone">
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
      </template>
      <slot name="actions" />
      <!-- A phone: the two actions behind « … », in a sheet. -->
      <template v-if="isPhone">
        <BaseIconButton
          label="Plus d’actions : historique, nouveau budget"
          aria-haspopup="menu"
          :aria-expanded="moreOpen"
          size="md"
          :disabled="isEditing"
          class="border border-gray-300 dark:border-slate-600"
          data-testid="header-more-button"
          @click="moreOpen = true"
        >
          <IconDots />
        </BaseIconButton>
        <BaseModal
          :open="moreOpen"
          title="Budget"
          :subtitle="plan.name"
          max-width="sm"
          data-testid="header-more-sheet"
          @close="moreOpen = false"
        >
          <div
            role="menu"
            aria-label="Actions du budget"
            class="-mx-2 space-y-0.5"
          >
            <button
              v-if="(planCount ?? 0) > 0"
              type="button"
              role="menuitem"
              class="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-200 dark:hover:bg-slate-800"
              data-testid="header-more-history"
              @click="pick('open-history')"
            >
              <IconClock class="h-4 w-4 shrink-0 text-gray-500" />
              Historique des budgets
            </button>
            <button
              type="button"
              role="menuitem"
              class="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-sm text-gray-700 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-200 dark:hover:bg-slate-800"
              data-testid="header-more-new-plan"
              @click="pick('create')"
            >
              <IconPlus class="h-4 w-4 shrink-0 text-gray-500" />
              Nouveau budget
            </button>
          </div>
        </BaseModal>
      </template>
    </div>
  </div>
</template>

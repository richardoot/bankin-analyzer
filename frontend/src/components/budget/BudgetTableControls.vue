<script setup lang="ts">
  import { SORT_OPTIONS, type SortOrder } from './sortOptions'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import IconPencil from '@/components/icons/IconPencil.vue'

  /**
   * The header of « Les enveloppes »: its title, the sort, the way into
   * edit mode. In edit mode only (budget-refonte.md, lot 4), the
   * closed-period warning stands above it, the comparison (the
   * `comparison` slot, which the page fills then) on the title's line,
   * and the quick actions under it. The reading (Vie courante / Tout) is the
   * page's « Lecture » menu, and the month read is « Mois lu » in the band
   * of the month (BudgetMonthBand): neither is a control of the table.
   * Pure controls — every decision leaves as an event, every
   * figure arrives as a prop.
   */
  defineProps<{
    editing: boolean
    planIsPast: boolean
    /** Which reference « Appliquer les moyennes » would copy into the envelopes. */
    averagesSource: 'historical' | 'actual' | 'none'
  }>()

  const emit = defineEmits<{
    'enter-edit': []
    'apply-averages': []
    'adjust-percent': [percent: number]
    reset: []
  }>()
  const sortOrder = defineModel<SortOrder>('sortOrder', {
    default: 'amount-desc',
  })
</script>

<template>
  <div>
    <!-- Rewriting the envelopes of a closed period moves the gap on a
         bilan that has already been read. Allowed, but never silent. -->
    <div
      v-if="editing && planIsPast"
      data-testid="budget-past-plan-warning"
      class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300"
    >
      Ce plan est terminé. Modifier ses enveloppes change le bilan d'une période
      déjà écoulée.
    </div>

    <div
      class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-3"
    >
      <div class="min-w-0">
        <h2
          id="budget-envelopes-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          Les enveloppes
        </h2>
        <p
          data-testid="budget-envelopes-subtitle"
          class="mt-0.5 text-xs text-gray-500 dark:text-gray-400"
        >
          Toutes les catégories du plan, les plus lourdes en tête
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 sm:justify-end">
        <!-- « Comparer avec », when the page gives it (edit mode only): on
             the title's line, the past the envelopes are set against. -->
        <div
          v-if="$slots.comparison"
          class="w-full min-w-0 sm:w-auto"
          data-testid="budget-comparison-slot"
        >
          <slot name="comparison" />
        </div>
        <BaseButton
          v-if="!editing"
          variant="tinted"
          size="sm"
          data-testid="budget-edit-button"
          @click="emit('enter-edit')"
        >
          <IconPencil class="h-4 w-4" />
          <span class="sm:hidden">Modifier</span>
          <span class="hidden sm:inline">Modifier les budgets</span>
        </BaseButton>
        <label
          for="budget-sort"
          class="text-sm text-gray-500 dark:text-gray-400 shrink-0"
        >
          Trier :
        </label>
        <select
          id="budget-sort"
          v-model="sortOrder"
          class="min-h-[40px] min-w-0 flex-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-sm text-gray-900 sm:min-h-0 sm:flex-none dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
        >
          <option
            v-for="opt in SORT_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </option>
        </select>
      </div>
    </div>

    <!-- Quick actions — edit mode only. Applying an average or shaving
         5 % off every envelope is an edit like any other; offering it
         outside edit mode is what made a budget change a single
         unannounced click. -->
    <div
      v-if="editing"
      data-testid="budget-quick-actions"
      class="mb-4 grid grid-cols-2 items-center gap-2 rounded-lg bg-gray-50 p-3 sm:flex sm:flex-wrap dark:bg-slate-800"
    >
      <span
        class="col-span-2 mr-1 text-xs text-gray-500 sm:col-auto dark:text-gray-400"
      >
        Actions rapides :
      </span>
      <BaseButton
        v-if="averagesSource !== 'none'"
        variant="tinted"
        size="sm"
        class="col-span-2 sm:col-auto"
        data-testid="budget-apply-averages"
        @click="emit('apply-averages')"
      >
        {{
          averagesSource === 'historical'
            ? 'Reprendre les moyennes historiques'
            : 'Reprendre le réel à date'
        }}
      </BaseButton>
      <BaseButton
        variant="secondary"
        size="sm"
        @click="emit('adjust-percent', -5)"
      >
        −5%
      </BaseButton>
      <BaseButton
        variant="secondary"
        size="sm"
        @click="emit('adjust-percent', 5)"
      >
        +5%
      </BaseButton>
      <!-- Clears the draft only: « Annuler » still brings the plan back,
           so this is a quiet secondary, not a destructive red. -->
      <BaseButton
        variant="secondary"
        size="sm"
        class="col-span-2 sm:col-auto sm:ml-auto"
        data-testid="budget-clear-envelopes"
        @click="emit('reset')"
      >
        Vider toutes les enveloppes
      </BaseButton>
      <p
        class="col-span-2 text-[11px] text-gray-500 sm:basis-full dark:text-gray-400"
      >
        Les moyennes et les ±5 % portent sur les catégories affichées ; « Vider
        » met à zéro toutes les enveloppes du plan, y compris celles absentes du
        tableau. Rien ne part avant « Enregistrer », et « Annuler » restaure
        tout.
      </p>
    </div>
  </div>
</template>

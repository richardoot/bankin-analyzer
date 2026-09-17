<script setup lang="ts">
  import { formatCurrency } from '@/lib/formatters'

  /**
   * The only way a budget change reaches the server. Sticky at the bottom
   * so the count of pending changes and the way out are never scrolled
   * away from; the saved → draft totals make the consequence readable
   * before committing.
   */
  defineProps<{
    dirtyCount: number
    savedTotal: number
    draftTotal: number
    delta: number
    saving: boolean
  }>()

  const emit = defineEmits<{ save: []; cancel: [] }>()
</script>

<template>
  <div
    data-testid="budget-edit-bar"
    class="sticky bottom-0 z-10 mt-4 -mx-4 sm:mx-0 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 border-t sm:border border-gray-200 dark:border-slate-700 sm:rounded-xl shadow-lg dark:shadow-slate-900/40 px-4 py-3"
  >
    <p class="text-sm text-gray-600 dark:text-gray-400">
      <span
        v-if="dirtyCount > 0"
        data-testid="budget-dirty-count"
        class="font-medium text-gray-900 dark:text-gray-100"
      >
        {{ dirtyCount }} catégorie{{ dirtyCount > 1 ? 's' : '' }} modifiée{{
          dirtyCount > 1 ? 's' : ''
        }}
      </span>
      <span v-else>Aucune modification</span>
      <span class="mx-1.5 text-gray-300 dark:text-gray-600">·</span>
      <span class="tabular-nums">
        Total {{ formatCurrency(savedTotal) }}
        <template v-if="dirtyCount > 0">
          →
          <strong class="text-gray-900 dark:text-gray-100">
            {{ formatCurrency(draftTotal) }}
          </strong>
          <span
            data-testid="budget-draft-delta"
            :class="
              delta > 0
                ? 'text-red-600 dark:text-red-400'
                : 'text-primary-600 dark:text-primary-400'
            "
          >
            ({{ delta > 0 ? '+' : '' }}{{ formatCurrency(delta) }})
          </span>
        </template>
        <span class="text-gray-500 dark:text-gray-400">/ mois</span>
      </span>
    </p>
    <div class="flex items-center gap-2 shrink-0">
      <button
        type="button"
        data-testid="budget-cancel-button"
        :disabled="saving"
        class="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
        @click="emit('cancel')"
      >
        Annuler
      </button>
      <button
        type="button"
        data-testid="budget-save-button"
        :disabled="saving || dirtyCount === 0"
        class="px-4 py-1.5 text-sm font-medium bg-primary-600 dark:bg-primary-500 text-white rounded-lg hover:bg-primary-700 dark:hover:bg-primary-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        @click="emit('save')"
      >
        {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
      </button>
    </div>
  </div>
</template>

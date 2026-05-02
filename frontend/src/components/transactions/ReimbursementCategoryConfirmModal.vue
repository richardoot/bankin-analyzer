<script setup lang="ts">
  import { computed } from 'vue'
  import type { ReimbursementDto, CategoryDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    isOpen: boolean
    /** Reimbursements affected by the transaction category change */
    reimbursements: ReimbursementDto[]
    /** New expense category (after the transaction was updated) */
    newExpenseCategoryName: string
    /** Income category to suggest as the new reimbursement category. Null if the new expense category has no association. */
    suggestedIncomeCategory: CategoryDto | null
    /** Whether the update operation is in flight */
    isUpdating: boolean
  }>()

  const emit = defineEmits<{
    update: [newCategoryId: string | null]
    keep: []
    delete: []
  }>()

  /** Reimbursements that would actually change category (current categoryId !== suggested) */
  const reimbursementsToChange = computed(() => {
    const suggested = props.suggestedIncomeCategory
    if (!suggested) return []
    return props.reimbursements.filter(r => r.categoryId !== suggested.id)
  })

  function handleUpdate(): void {
    emit('update', props.suggestedIncomeCategory?.id ?? null)
  }

  function handleKeep(): void {
    emit('keep')
  }

  function handleDelete(): void {
    emit('delete')
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/40 backdrop-blur-sm"
        @click="handleKeep"
      />

      <!-- Modal -->
      <div
        class="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-xl overflow-hidden"
      >
        <!-- Header -->
        <div class="px-6 py-4 border-b border-gray-100 dark:border-slate-800">
          <div class="flex items-start gap-3">
            <span
              class="flex-shrink-0 w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center"
            >
              <svg
                class="w-5 h-5 text-amber-600 dark:text-amber-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </span>
            <div class="min-w-0">
              <h3
                class="text-base font-semibold text-gray-900 dark:text-gray-100"
              >
                Remboursements associes
              </h3>
              <p class="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Cette transaction a
                {{ reimbursements.length }}
                remboursement{{ reimbursements.length > 1 ? 's' : '' }} en cours
              </p>
            </div>
          </div>
        </div>

        <!-- Body -->
        <div class="px-6 py-4 space-y-3">
          <!-- Reimbursements list -->
          <div
            class="bg-gray-50 dark:bg-slate-800 rounded-xl p-3 space-y-2 max-h-48 overflow-y-auto"
          >
            <div
              v-for="reimb in reimbursements"
              :key="reimb.id"
              class="flex items-center justify-between gap-2 text-sm"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span
                  class="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-medium shrink-0"
                >
                  {{ reimb.personName.charAt(0).toUpperCase() }}
                </span>
                <span class="text-gray-700 dark:text-gray-300 truncate">
                  {{ reimb.personName }}
                </span>
                <span
                  class="text-xs text-gray-500 dark:text-gray-400 shrink-0"
                  style="font-variant-numeric: tabular-nums"
                >
                  {{ formatCurrency(reimb.amount) }}
                </span>
              </div>
              <span
                class="text-xs text-gray-500 dark:text-gray-400 shrink-0 truncate ml-2"
                :title="reimb.categoryName ?? 'Sans categorie'"
              >
                {{ reimb.categoryName ?? 'Sans categorie' }}
              </span>
            </div>
          </div>

          <!-- Suggestion / explanation -->
          <div v-if="suggestedIncomeCategory" class="text-sm">
            <p class="text-gray-700 dark:text-gray-300 mb-2">
              La categorie de la transaction est passee a
              <span class="font-medium">{{ newExpenseCategoryName }}</span
              >. Voulez-vous mettre a jour
              <span
                v-if="reimbursementsToChange.length === reimbursements.length"
                >les remboursements</span
              >
              <span v-else>les remboursements concernes</span>
              vers la categorie associee
              <span
                class="font-medium text-emerald-700 dark:text-emerald-400"
                >{{ suggestedIncomeCategory.name }}</span
              >
              ?
            </p>
            <p
              v-if="reimbursementsToChange.length === 0"
              class="text-xs text-gray-500 dark:text-gray-400 italic"
            >
              Tous les remboursements ont deja la bonne categorie.
            </p>
          </div>
          <div v-else class="text-sm">
            <p class="text-gray-700 dark:text-gray-300">
              La nouvelle categorie
              <span class="font-medium">{{ newExpenseCategoryName }}</span> n'a
              pas de categorie de remboursement associee. Vous pouvez creer une
              association dans les preferences pour automatiser ce comportement.
            </p>
          </div>
        </div>

        <!-- Footer actions -->
        <div
          class="px-6 py-4 border-t border-gray-100 dark:border-slate-800 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <!-- Destructive action (left on desktop, last on mobile via order) -->
          <button
            type="button"
            class="order-3 sm:order-1 inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="isUpdating"
            @click="handleDelete"
          >
            <svg
              class="w-4 h-4"
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
            <span>{{
              reimbursements.length > 1
                ? `Supprimer les ${reimbursements.length} remboursements`
                : 'Supprimer le remboursement'
            }}</span>
          </button>

          <!-- Non-destructive actions (right on desktop) -->
          <div
            class="order-1 sm:order-2 flex flex-col-reverse sm:flex-row gap-2 sm:items-center"
          >
            <button
              type="button"
              class="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-800 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
              :disabled="isUpdating"
              @click="handleKeep"
            >
              {{ suggestedIncomeCategory ? 'Garder telle quelle' : 'Compris' }}
            </button>
            <button
              v-if="
                suggestedIncomeCategory && reimbursementsToChange.length > 0
              "
              type="button"
              class="px-4 py-2 text-sm font-medium text-white bg-indigo-600 dark:bg-indigo-500 hover:bg-indigo-700 dark:hover:bg-indigo-600 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              :disabled="isUpdating"
              @click="handleUpdate"
            >
              <svg
                v-if="isUpdating"
                class="w-4 h-4 animate-spin"
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
              <span>Mettre a jour</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

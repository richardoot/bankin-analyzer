<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
    type SettlementReimbursementItemDto,
  } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import IncomeTransactionPicker from './IncomeTransactionPicker.vue'
  import {
    availableAmountOf,
    byOldestFirst,
    cascadeAllocate,
    prorataAllocate,
    round2,
    toAllocationLine,
    type AllocationLine,
  } from '@/lib/settlements'

  const props = defineProps<{
    isOpen: boolean
    personId: string
    personName: string
    /** Every pending reimbursement of this person (amountRemaining > 0). */
    pendingReimbursements: ReimbursementDto[]
  }>()

  const emit = defineEmits<{
    close: []
    confirm: [settlement: SettlementDto]
  }>()

  interface LineState {
    amount: number
    forceComplete: boolean
  }

  const currentStep = ref<1 | 2>(1)
  /**
   * Step 1 answers "which debts", step 2 answers "with what money". Keeping the
   * two apart is what lets the selection exist before a pot is known — the
   * amounts below are only ever derived from it.
   */
  const selectedIds = ref<Set<string>>(new Set())
  const selectedTransaction = ref<TransactionDto | null>(null)
  const allocations = ref<Record<string, LineState>>({})
  const expandedCategories = ref<Set<string>>(new Set())
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)

  // --- Debt lines, grouped by category -------------------------------------

  const lines = computed((): AllocationLine[] =>
    props.pendingReimbursements.map(toAllocationLine).sort(byOldestFirst)
  )

  function categoryKey(categoryId: string | null): string {
    return categoryId ?? 'none'
  }

  interface CategoryGroup {
    key: string
    categoryId: string | null
    categoryName: string
    lines: AllocationLine[]
    /** Total owed across the group, selected or not. */
    due: number
    /** Total owed across the *selected* lines of the group. */
    selectedDue: number
    /** Total allocated from the pot, step 2 only. */
    allocated: number
    selectedCount: number
  }

  function buildGroups(source: AllocationLine[]): CategoryGroup[] {
    const byKey = new Map<string, CategoryGroup>()

    for (const line of source) {
      const key = categoryKey(line.categoryId)
      let group = byKey.get(key)
      if (!group) {
        group = {
          key,
          categoryId: line.categoryId,
          categoryName: line.categoryName,
          lines: [],
          due: 0,
          selectedDue: 0,
          allocated: 0,
          selectedCount: 0,
        }
        byKey.set(key, group)
      }
      group.lines.push(line)
      group.due = round2(group.due + line.amountDue)

      if (selectedIds.value.has(line.reimbursementId)) {
        group.selectedDue = round2(group.selectedDue + line.amountDue)
        group.selectedCount += 1
        group.allocated = round2(
          group.allocated +
            (allocations.value[line.reimbursementId]?.amount ?? 0)
        )
      }
    }

    return Array.from(byKey.values())
  }

  /** Every pending line, for the step 1 picker. */
  const groups = computed((): CategoryGroup[] => buildGroups(lines.value))

  const selectedLines = computed((): AllocationLine[] =>
    lines.value.filter(line => selectedIds.value.has(line.reimbursementId))
  )

  /** Only what was retained, for the step 2 recap. */
  const allocationGroups = computed((): CategoryGroup[] =>
    buildGroups(selectedLines.value)
  )

  const selectedDueTotal = computed(() =>
    round2(selectedLines.value.reduce((sum, line) => sum + line.amountDue, 0))
  )

  const hasSelection = computed(() => selectedLines.value.length > 0)

  // --- Step 1: selecting the debts -----------------------------------------

  function isSelected(reimbursementId: string): boolean {
    return selectedIds.value.has(reimbursementId)
  }

  function setSelected(reimbursementId: string, selected: boolean): void {
    const next = new Set(selectedIds.value)
    if (selected) next.add(reimbursementId)
    else next.delete(reimbursementId)
    selectedIds.value = next
  }

  function toggleLineSelection(reimbursementId: string): void {
    setSelected(reimbursementId, !isSelected(reimbursementId))
  }

  function toggleCategorySelection(group: CategoryGroup): void {
    const selectAll = group.selectedCount < group.lines.length
    const next = new Set(selectedIds.value)
    for (const line of group.lines) {
      if (selectAll) next.add(line.reimbursementId)
      else next.delete(line.reimbursementId)
    }
    selectedIds.value = next
  }

  function selectAllLines(): void {
    selectedIds.value = new Set(lines.value.map(line => line.reimbursementId))
  }

  function clearSelection(): void {
    selectedIds.value = new Set()
  }

  function toggleExpanded(key: string): void {
    const next = new Set(expandedCategories.value)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    expandedCategories.value = next
  }

  // --- Step 2: the pot and its allocation ----------------------------------

  const pot = computed(() =>
    selectedTransaction.value ? availableAmountOf(selectedTransaction.value) : 0
  )

  const allocatedTotal = computed(() =>
    round2(
      selectedLines.value.reduce(
        (sum, line) =>
          sum + (allocations.value[line.reimbursementId]?.amount ?? 0),
        0
      )
    )
  )

  const remainingToAllocate = computed(() =>
    round2(pot.value - allocatedTotal.value)
  )

  const isOverAllocated = computed(() => remainingToAllocate.value < -0.001)

  const canConfirm = computed(
    () =>
      selectedTransaction.value !== null &&
      allocatedTotal.value > 0 &&
      !isOverAllocated.value &&
      !isSubmitting.value
  )

  /**
   * The selection *is* the scope now, so the pot cascades straight onto it —
   * no more guessing from the receipt's category which lines were meant.
   */
  function applyAutoAllocation(): void {
    const allocated = cascadeAllocate(selectedLines.value, pot.value)

    const next: Record<string, LineState> = {}
    for (const line of selectedLines.value) {
      next[line.reimbursementId] = {
        amount: allocated.get(line.reimbursementId) ?? 0,
        forceComplete: false,
      }
    }
    allocations.value = next

    // Open every category that got something: it shows which transactions are
    // being paid, and it is the only place the per-line amount and the
    // "solder cette ligne" shortfall control are reachable.
    expandedCategories.value = new Set(
      allocationGroups.value
        .filter(group => group.allocated > 0)
        .map(group => group.key)
    )
  }

  function stateOf(reimbursementId: string): LineState {
    return (
      allocations.value[reimbursementId] ?? { amount: 0, forceComplete: false }
    )
  }

  function dueOf(reimbursementId: string): number {
    return (
      lines.value.find(line => line.reimbursementId === reimbursementId)
        ?.amountDue ?? 0
    )
  }

  function setLineAmount(reimbursementId: string, rawAmount: number): void {
    const due = dueOf(reimbursementId)
    const amount = round2(Math.min(Math.max(0, rawAmount), due))
    const previous = stateOf(reimbursementId)
    allocations.value[reimbursementId] = {
      amount,
      // Crediting the full due makes the "solder" flag meaningless.
      forceComplete:
        amount > 0 && amount < due ? previous.forceComplete : false,
    }
  }

  /**
   * Committed on `change` rather than `input`: the field is value-bound and
   * clamped, so writing back on every keystroke would eat a half-typed "0.".
   */
  function onAmountCommit(reimbursementId: string, event: Event): void {
    const value = Number.parseFloat((event.target as HTMLInputElement).value)
    setLineAmount(reimbursementId, Number.isFinite(value) ? value : 0)
  }

  function toggleForceComplete(reimbursementId: string): void {
    const state = stateOf(reimbursementId)
    allocations.value[reimbursementId] = {
      ...state,
      forceComplete: !state.forceComplete,
    }
  }

  function applyToGroup(group: CategoryGroup, budget: number): void {
    const allocated = cascadeAllocate(group.lines, budget)
    for (const line of group.lines) {
      setLineAmount(
        line.reimbursementId,
        allocated.get(line.reimbursementId) ?? 0
      )
    }
  }

  function onCategoryAmountCommit(group: CategoryGroup, event: Event): void {
    const value = Number.parseFloat((event.target as HTMLInputElement).value)
    applyToGroup(group, Number.isFinite(value) ? Math.max(0, value) : 0)
  }

  function spreadGroupProrata(group: CategoryGroup): void {
    const allocated = prorataAllocate(group.lines, group.allocated)
    for (const line of group.lines) {
      setLineAmount(
        line.reimbursementId,
        allocated.get(line.reimbursementId) ?? 0
      )
    }
  }

  function clearAmounts(): void {
    for (const line of selectedLines.value) {
      setLineAmount(line.reimbursementId, 0)
    }
  }

  function allocateEverything(): void {
    applyAutoAllocation()
  }

  // --- The receipt ---------------------------------------------------------

  /**
   * Ranked against the *selection* rather than the whole backlog: the total the
   * user just committed to is the strongest amount signal there is, and it does
   * not exist until step 1 is done.
   */
  const suggestionContext = computed(() => {
    const scope = hasSelection.value ? selectedLines.value : lines.value
    const scopeGroups = hasSelection.value
      ? allocationGroups.value.map(group => group.selectedDue)
      : groups.value.map(group => group.due)

    return {
      personName: props.personName,
      pendingTotals: [
        round2(scope.reduce((sum, line) => sum + line.amountDue, 0)),
        ...scopeGroups,
        ...scope.map(line => line.amountDue),
      ],
    }
  })

  function selectTransaction(transaction: TransactionDto): void {
    selectedTransaction.value = transaction
    applyAutoAllocation()
  }

  // --- Navigation ----------------------------------------------------------

  function resetModal(): void {
    currentStep.value = 1
    selectedIds.value = new Set()
    selectedTransaction.value = null
    allocations.value = {}
    expandedCategories.value = new Set(groups.value.map(group => group.key))
    error.value = null
    isSubmitting.value = false
  }

  function goToReceipt(): void {
    if (!hasSelection.value) return
    currentStep.value = 2
    // The selection may have changed since the receipt was picked, which would
    // leave stale amounts behind.
    if (selectedTransaction.value) applyAutoAllocation()
  }

  function goBackToSelection(): void {
    currentStep.value = 1
    // Reopen everything: the allocation left the categories it did not pay
    // collapsed, which is exactly where a line the user came back to add is
    // hiding.
    expandedCategories.value = new Set(groups.value.map(group => group.key))
  }

  function handleClose(): void {
    resetModal()
    emit('close')
  }

  async function handleConfirm(): Promise<void> {
    if (!selectedTransaction.value || !canConfirm.value) return

    isSubmitting.value = true
    error.value = null

    try {
      const reimbursements: SettlementReimbursementItemDto[] =
        selectedLines.value
          .map(line => ({ line, state: stateOf(line.reimbursementId) }))
          .filter(({ state }) => state.amount > 0)
          .map(({ line, state }) => ({
            reimbursementId: line.reimbursementId,
            amountSettled: state.amount,
            ...(state.forceComplete && { forceComplete: true }),
          }))

      const settlement = await api.createSettlement({
        personId: props.personId,
        incomeTransactionId: selectedTransaction.value.id,
        reimbursements,
      })

      emit('confirm', settlement)
      handleClose()
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Erreur lors de la creation'
    } finally {
      isSubmitting.value = false
    }
  }

  watch(
    () => props.isOpen,
    isOpen => {
      if (isOpen) resetModal()
    }
  )

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="isOpen"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div class="fixed inset-0 bg-black/50" @click="handleClose" />

        <div
          class="relative z-10 w-full max-w-2xl max-h-[90vh] overflow-hidden rounded-2xl bg-white dark:bg-slate-900 shadow-xl dark:shadow-slate-900/30 flex flex-col"
        >
          <!-- Header -->
          <div
            class="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 p-6"
          >
            <div>
              <h2
                class="text-xl font-semibold text-gray-900 dark:text-gray-100"
              >
                Enregistrer un reglement
              </h2>
              <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
                {{ personName }}
                <span v-if="currentStep === 1">
                  &middot; etape 1 sur 2 : que voulez-vous regler ?</span
                >
                <span v-else>
                  &middot; etape 2 sur 2 : d'ou vient l'argent ?</span
                >
              </p>
            </div>
            <button
              type="button"
              class="text-gray-400 hover:text-gray-500 dark:hover:text-gray-300"
              aria-label="Fermer"
              @click="handleClose"
            >
              <svg
                class="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
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

          <div class="flex-1 overflow-y-auto p-6">
            <div
              v-if="error"
              class="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm"
            >
              {{ error }}
            </div>

            <!-- ============ Step 1: pick the debts to settle ============ -->
            <div v-if="currentStep === 1" data-testid="settlement-step-select">
              <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
                Quels remboursements en attente de {{ personName }}
                souhaitez-vous regler ?
              </p>

              <div class="flex justify-end gap-3 mb-2 text-sm">
                <button
                  type="button"
                  data-testid="settlement-select-all"
                  class="text-emerald-600 dark:text-emerald-400 hover:underline"
                  @click="selectAllLines"
                >
                  Tout selectionner
                </button>
                <span class="text-gray-300 dark:text-gray-600">|</span>
                <button
                  type="button"
                  class="text-gray-600 dark:text-gray-400 hover:underline"
                  @click="clearSelection"
                >
                  Tout decocher
                </button>
              </div>

              <div class="space-y-2">
                <div
                  v-for="group in groups"
                  :key="group.key"
                  class="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden"
                >
                  <!-- Category row -->
                  <div
                    class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800"
                  >
                    <button
                      type="button"
                      class="p-1 text-gray-400 dark:text-gray-500 shrink-0"
                      :aria-label="`Deplier ${group.categoryName}`"
                      :aria-expanded="expandedCategories.has(group.key)"
                      @click="toggleExpanded(group.key)"
                    >
                      <svg
                        class="w-4 h-4 transition-transform duration-200"
                        :class="{
                          'rotate-90': expandedCategories.has(group.key),
                        }"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </button>
                    <input
                      type="checkbox"
                      class="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                      :checked="group.selectedCount > 0"
                      :indeterminate="
                        group.selectedCount > 0 &&
                        group.selectedCount < group.lines.length
                      "
                      :aria-label="`Selectionner ${group.categoryName}`"
                      @change="toggleCategorySelection(group)"
                    />
                    <div class="flex-1 min-w-0">
                      <div
                        class="font-medium text-gray-900 dark:text-gray-100 truncate"
                      >
                        {{ group.categoryName }}
                      </div>
                      <div class="text-xs text-gray-500 dark:text-gray-400">
                        {{ group.lines.length }} ligne(s) &middot; du
                        {{ formatCurrency(group.due) }}
                      </div>
                    </div>
                    <div
                      v-if="group.selectedCount > 0"
                      class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0"
                    >
                      {{ formatCurrency(group.selectedDue) }}
                    </div>
                  </div>

                  <!-- Lines -->
                  <div
                    v-if="expandedCategories.has(group.key)"
                    class="divide-y divide-gray-100 dark:divide-slate-700"
                  >
                    <label
                      v-for="line in group.lines"
                      :key="line.reimbursementId"
                      class="flex items-center gap-2 p-3 pl-10 cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50"
                    >
                      <input
                        type="checkbox"
                        class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500 shrink-0"
                        :checked="isSelected(line.reimbursementId)"
                        :aria-label="`Selectionner ${line.description}`"
                        @change="toggleLineSelection(line.reimbursementId)"
                      />
                      <div class="flex-1 min-w-0">
                        <div
                          class="text-sm text-gray-900 dark:text-gray-100 truncate"
                        >
                          <span class="text-gray-400 dark:text-gray-500"
                            >[{{ formatDate(line.date) }}]</span
                          >
                          {{ line.description }}
                        </div>
                      </div>
                      <div
                        class="text-sm text-gray-700 dark:text-gray-300 whitespace-nowrap shrink-0"
                      >
                        {{ formatCurrency(line.amountDue) }}
                      </div>
                    </label>
                  </div>
                </div>
              </div>

              <p
                v-if="groups.length === 0"
                class="py-8 text-center text-gray-500 dark:text-gray-400"
              >
                Aucun remboursement en attente pour {{ personName }}
              </p>
            </div>

            <!-- ====== Step 2: find the receipt, then fine-tune ====== -->
            <div v-else data-testid="settlement-step-receipt">
              <div
                class="mb-4 p-3 rounded-lg bg-gray-50 dark:bg-slate-800 flex items-center justify-between gap-3"
              >
                <span class="text-sm text-gray-600 dark:text-gray-400">
                  {{ selectedLines.length }} remboursement(s) retenu(s)
                </span>
                <span
                  class="text-sm font-semibold text-gray-900 dark:text-gray-100 whitespace-nowrap"
                  data-testid="settlement-selected-total"
                >
                  {{ formatCurrency(selectedDueTotal) }} a couvrir
                </span>
              </div>

              <label
                class="block text-sm text-gray-600 dark:text-gray-400 mb-3"
                for="settlement-search"
              >
                Quelle transaction correspond au paiement de {{ personName }} ?
              </label>

              <IncomeTransactionPicker
                :context="suggestionContext"
                :selected-transaction-id="selectedTransaction?.id ?? null"
                @select="selectTransaction"
              />

              <!-- Recap, once the money is known -->
              <div v-if="selectedTransaction" class="mt-6">
                <div
                  class="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg flex items-center justify-between gap-3"
                >
                  <div class="min-w-0">
                    <div
                      class="font-medium text-gray-900 dark:text-gray-100 truncate"
                    >
                      {{ selectedTransaction.description }}
                    </div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">
                      {{ formatDate(selectedTransaction.date) }} &middot;
                      {{ selectedTransaction.account }}
                    </div>
                  </div>
                  <div
                    class="text-lg font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap"
                  >
                    +{{ formatCurrency(pot) }}
                  </div>
                </div>

                <div class="flex items-center justify-between gap-3 mb-2">
                  <h3
                    class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
                  >
                    Repartition
                  </h3>
                  <div class="flex gap-3 text-sm">
                    <button
                      type="button"
                      class="text-emerald-600 dark:text-emerald-400 hover:underline"
                      @click="allocateEverything"
                    >
                      Tout affecter
                    </button>
                    <span class="text-gray-300 dark:text-gray-600">|</span>
                    <button
                      type="button"
                      class="text-gray-600 dark:text-gray-400 hover:underline"
                      @click="clearAmounts"
                    >
                      Tout remettre a zero
                    </button>
                  </div>
                </div>

                <div class="space-y-2">
                  <div
                    v-for="group in allocationGroups"
                    :key="group.key"
                    class="border border-gray-200 dark:border-slate-700 rounded-lg overflow-hidden"
                  >
                    <!-- Category row -->
                    <div
                      class="flex items-center gap-2 p-3 bg-gray-50 dark:bg-slate-800"
                    >
                      <button
                        type="button"
                        class="p-1 text-gray-400 dark:text-gray-500 shrink-0"
                        :aria-label="`Deplier ${group.categoryName}`"
                        :aria-expanded="expandedCategories.has(group.key)"
                        @click="toggleExpanded(group.key)"
                      >
                        <svg
                          class="w-4 h-4 transition-transform duration-200"
                          :class="{
                            'rotate-90': expandedCategories.has(group.key),
                          }"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                      <div class="flex-1 min-w-0">
                        <div
                          class="font-medium text-gray-900 dark:text-gray-100 truncate"
                        >
                          {{ group.categoryName }}
                        </div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">
                          {{ group.lines.length }} ligne(s) &middot; du
                          {{ formatCurrency(group.selectedDue) }}
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          :max="group.selectedDue"
                          :value="group.allocated"
                          :aria-label="`Montant affecte a ${group.categoryName}`"
                          class="w-24 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
                          @change="onCategoryAmountCommit(group, $event)"
                        />
                        <span class="text-gray-500 dark:text-gray-400"
                          >&euro;</span
                        >
                      </div>
                    </div>

                    <!-- Lines -->
                    <div
                      v-if="expandedCategories.has(group.key)"
                      class="divide-y divide-gray-100 dark:divide-slate-700"
                    >
                      <div
                        v-for="line in group.lines"
                        :key="line.reimbursementId"
                        class="p-3 pl-10"
                      >
                        <div class="flex items-center gap-2">
                          <div class="flex-1 min-w-0">
                            <div
                              class="text-sm text-gray-900 dark:text-gray-100 truncate"
                            >
                              <span class="text-gray-400 dark:text-gray-500"
                                >[{{ formatDate(line.date) }}]</span
                              >
                              {{ line.description }}
                            </div>
                            <div
                              class="text-xs text-gray-500 dark:text-gray-400"
                            >
                              du {{ formatCurrency(line.amountDue) }}
                            </div>
                          </div>
                          <div class="flex items-center gap-1 shrink-0">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              :max="line.amountDue"
                              :value="stateOf(line.reimbursementId).amount"
                              :aria-label="`Montant affecte a ${line.description}`"
                              class="w-24 px-2 py-1 text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
                              @change="
                                onAmountCommit(line.reimbursementId, $event)
                              "
                            />
                            <span class="text-gray-500 dark:text-gray-400"
                              >&euro;</span
                            >
                          </div>
                        </div>

                        <!-- Settle-the-shortfall, only when the line stays short -->
                        <label
                          v-if="
                            stateOf(line.reimbursementId).amount > 0 &&
                            stateOf(line.reimbursementId).amount <
                              line.amountDue
                          "
                          class="mt-2 ml-6 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                            :checked="
                              stateOf(line.reimbursementId).forceComplete
                            "
                            :aria-label="`Solder ${line.description}`"
                            @change="toggleForceComplete(line.reimbursementId)"
                          />
                          Solder cette ligne malgre l'ecart de
                          {{
                            formatCurrency(
                              round2(
                                line.amountDue -
                                  stateOf(line.reimbursementId).amount
                              )
                            )
                          }}
                        </label>
                      </div>

                      <div
                        v-if="group.lines.length > 1 && group.allocated > 0"
                        class="px-3 py-2 pl-10 text-right"
                      >
                        <button
                          type="button"
                          class="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                          @click="spreadGroupProrata(group)"
                        >
                          Repartir au prorata
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div
            class="border-t border-gray-200 dark:border-slate-700 p-6 space-y-3"
          >
            <!-- Selection total, step 1 only -->
            <div
              v-if="currentStep === 1"
              class="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-slate-800"
            >
              <span class="text-sm text-gray-700 dark:text-gray-300">
                {{ selectedLines.length }} remboursement(s) selectionne(s)
              </span>
              <span
                class="text-sm font-semibold text-gray-900 dark:text-gray-100"
                data-testid="settlement-selection-total"
              >
                {{ formatCurrency(selectedDueTotal) }}
              </span>
            </div>

            <!-- Running balance, step 2 only -->
            <div
              v-if="currentStep === 2 && selectedTransaction"
              class="flex items-center justify-between p-3 rounded-lg"
              :class="{
                'bg-emerald-50 dark:bg-emerald-900/20':
                  Math.abs(remainingToAllocate) < 0.01,
                'bg-amber-50 dark:bg-amber-900/20': remainingToAllocate >= 0.01,
                'bg-red-50 dark:bg-red-900/20': isOverAllocated,
              }"
            >
              <span class="text-sm text-gray-700 dark:text-gray-300">
                Affecte {{ formatCurrency(allocatedTotal) }}
              </span>
              <span
                class="text-sm font-semibold"
                :class="{
                  'text-emerald-700 dark:text-emerald-400':
                    Math.abs(remainingToAllocate) < 0.01,
                  'text-amber-700 dark:text-amber-400':
                    remainingToAllocate >= 0.01,
                  'text-red-700 dark:text-red-400': isOverAllocated,
                }"
              >
                <template v-if="isOverAllocated">
                  Depassement de
                  {{ formatCurrency(Math.abs(remainingToAllocate)) }}
                </template>
                <template v-else-if="remainingToAllocate >= 0.01">
                  {{ formatCurrency(remainingToAllocate) }} resteront
                  disponibles sur cette transaction
                </template>
                <template v-else> Tout est affecte </template>
              </span>
            </div>

            <div class="flex justify-between items-center">
              <button
                v-if="currentStep === 2"
                type="button"
                data-testid="settlement-back"
                class="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                :disabled="isSubmitting"
                @click="goBackToSelection"
              >
                Retour
              </button>
              <div v-else />

              <div class="flex gap-3">
                <button
                  type="button"
                  class="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                  :disabled="isSubmitting"
                  @click="handleClose"
                >
                  Annuler
                </button>
                <button
                  v-if="currentStep === 1"
                  type="button"
                  data-testid="settlement-continue"
                  class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="!hasSelection"
                  @click="goToReceipt"
                >
                  Continuer
                </button>
                <button
                  v-else
                  type="button"
                  class="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  :disabled="!canConfirm"
                  @click="handleConfirm"
                >
                  <span v-if="isSubmitting" class="flex items-center gap-2">
                    <span
                      class="inline-block animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"
                    />
                    Creation...
                  </span>
                  <span v-else>Confirmer le reglement</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
  .modal-enter-active,
  .modal-leave-active {
    transition: opacity 0.2s ease;
  }

  .modal-enter-from,
  .modal-leave-to {
    opacity: 0;
  }
</style>

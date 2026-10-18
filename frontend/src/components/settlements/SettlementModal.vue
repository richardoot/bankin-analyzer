<script setup lang="ts">
  import { ref, computed, watch, nextTick } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import StepIndicator from '@/components/ui/StepIndicator.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
    type SettlementReimbursementItemDto,
  } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import IncomeTransactionPicker from './IncomeTransactionPicker.vue'
  import { useIsMobile } from '@/composables/useMediaQuery'
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

  const STEP_LABELS = ['Remboursements', 'Transaction reçue']

  interface LineState {
    amount: number
    forceComplete: boolean
  }

  const currentStep = ref<1 | 2>(1)
  /**
   * On a phone the second step has to leave the receipt list at least half
   * the screen: the step trail and the « Annuler » button give way there —
   * the header's back arrow and cross already do both jobs.
   */
  const isMobile = useIsMobile()
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
   * Committed on `change` rather than `input` (BaseField `lazy`): the field
   * is clamped, so writing back on every keystroke would eat a half-typed
   * "0,".
   */
  function onAmountCommit(reimbursementId: string, value: number | null): void {
    setLineAmount(reimbursementId, value ?? 0)
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

  function onCategoryAmountCommit(
    group: CategoryGroup,
    value: number | null
  ): void {
    applyToGroup(group, Math.max(0, value ?? 0))
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

  /**
   * The recap renders under the receipt list; on a phone that is below the
   * fold, so a tap on a suggestion must bring it into view or nothing seems
   * to happen.
   */
  const recapRef = ref<HTMLElement | null>(null)

  function selectTransaction(transaction: TransactionDto): void {
    selectedTransaction.value = transaction
    applyAutoAllocation()
    void nextTick(() => {
      recapRef.value?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
    })
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

  /** A started settlement is a draft: the shell asks before dropping it. */
  const isDirty = computed(
    () => selectedIds.value.size > 0 || selectedTransaction.value !== null
  )

  const modalRef = ref<InstanceType<typeof BaseModal> | null>(null)

  function handleClose(): void {
    resetModal()
    emit('close')
  }

  /** « Annuler » closes the way the cross does — through the draft guard. */
  function requestClose(): void {
    modalRef.value?.requestClose()
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
        e instanceof Error ? e.message : 'Erreur lors de la création'
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
</script>

<template>
  <BaseModal
    ref="modalRef"
    :open="isOpen"
    title="Enregistrer un règlement"
    :subtitle="
      currentStep === 1
        ? `${personName} · que voulez-vous régler ?`
        : `${personName} · d'où vient l'argent ?`
    "
    max-width="xl"
    :closable="!isSubmitting"
    :dirty="isDirty"
    :back-label="currentStep === 2 ? 'Retour à la sélection' : undefined"
    back-test-id="settlement-back"
    @back="goBackToSelection"
    @close="handleClose"
  >
    <template v-if="currentStep === 1 || !isMobile" #subheader>
      <StepIndicator
        class="justify-start"
        :steps="STEP_LABELS"
        :current="currentStep"
      />
    </template>

    <InlineAlert v-if="error" class="mb-4">{{ error }}</InlineAlert>

    <!-- ============ Step 1: pick the debts to settle ============ -->
    <div v-if="currentStep === 1" data-testid="settlement-step-select">
      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Quels remboursements en attente de {{ personName }} souhaitez-vous
          régler ?
        </p>
        <div class="flex items-center gap-1">
          <BaseButton
            variant="ghost"
            size="sm"
            data-testid="settlement-select-all"
            @click="selectAllLines"
          >
            Tout sélectionner
          </BaseButton>
          <BaseButton variant="ghost" size="sm" @click="clearSelection">
            Tout décocher
          </BaseButton>
        </div>
      </div>

      <div class="space-y-2">
        <div
          v-for="group in groups"
          :key="group.key"
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
        >
          <!-- Category row -->
          <div
            class="flex items-center gap-2 bg-gray-50 p-2 pr-3 dark:bg-slate-800"
          >
            <BaseIconButton
              size="sm"
              :label="`Déplier ${group.categoryName}`"
              :aria-expanded="expandedCategories.has(group.key)"
              @click="toggleExpanded(group.key)"
            >
              <IconChevronRight
                class="transition-transform duration-200"
                :class="{ 'rotate-90': expandedCategories.has(group.key) }"
              />
            </BaseIconButton>
            <label
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1 pointer-coarse:min-h-[44px]"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                :checked="group.selectedCount > 0"
                :indeterminate="
                  group.selectedCount > 0 &&
                  group.selectedCount < group.lines.length
                "
                :aria-label="`Sélectionner ${group.categoryName}`"
                @change="toggleCategorySelection(group)"
              />
              <span class="min-w-0 flex-1">
                <span
                  class="block truncate font-medium text-gray-900 dark:text-gray-100"
                  :title="group.categoryName"
                >
                  {{ group.categoryName }}
                </span>
                <span class="block text-xs text-gray-500 dark:text-gray-400">
                  {{ group.lines.length }} ligne(s) &middot; dû
                  {{ formatCurrency(group.due) }}
                </span>
              </span>
            </label>
            <span
              v-if="group.selectedCount > 0"
              class="shrink-0 text-sm font-semibold whitespace-nowrap text-debt-700 dark:text-debt-400"
            >
              {{ formatCurrency(group.selectedDue) }}
            </span>
          </div>

          <!-- Lines -->
          <div
            v-if="expandedCategories.has(group.key)"
            class="divide-y divide-gray-100 dark:divide-slate-700"
          >
            <label
              v-for="line in group.lines"
              :key="line.reimbursementId"
              class="flex cursor-pointer items-center gap-3 p-3 pl-4 hover:bg-gray-50 pointer-coarse:min-h-[44px] sm:pl-12 dark:hover:bg-slate-800/50"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                :checked="isSelected(line.reimbursementId)"
                :aria-label="`Sélectionner ${line.description}`"
                @change="toggleLineSelection(line.reimbursementId)"
              />
              <span
                class="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-gray-100"
                :title="line.description"
              >
                <span class="text-gray-500 dark:text-gray-400"
                  >[{{ formatDate(line.date) }}]</span
                >
                {{ line.description }}
              </span>
              <span
                class="shrink-0 text-sm whitespace-nowrap text-gray-700 dark:text-gray-300"
              >
                {{ formatCurrency(line.amountDue) }}
              </span>
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
        class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-gray-50 p-3 dark:bg-slate-800"
      >
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {{ selectedLines.length }} remboursement(s) retenu(s)
        </span>
        <span
          class="text-sm font-semibold whitespace-nowrap text-gray-900 dark:text-gray-100"
          data-testid="settlement-selected-total"
        >
          {{ formatCurrency(selectedDueTotal) }} à couvrir
        </span>
      </div>

      <label
        class="mb-3 block text-sm text-gray-600 dark:text-gray-400"
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
      <div
        v-if="selectedTransaction"
        ref="recapRef"
        class="mt-6 scroll-mt-2"
        data-testid="settlement-recap"
      >
        <div
          class="mb-4 flex items-center justify-between gap-3 rounded-lg bg-green-50 p-3 dark:bg-green-900/20"
        >
          <div class="min-w-0">
            <p
              class="truncate font-medium text-gray-900 dark:text-gray-100"
              :title="selectedTransaction.description"
            >
              {{ selectedTransaction.description }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              {{ formatDate(selectedTransaction.date) }} &middot;
              {{ selectedTransaction.account }}
            </p>
          </div>
          <p
            class="text-lg font-bold whitespace-nowrap text-green-700 dark:text-green-400"
          >
            +{{ formatCurrency(pot) }}
          </p>
        </div>

        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <SectionLabel as="h3">Répartition</SectionLabel>
          <div class="flex items-center gap-1">
            <BaseButton variant="ghost" size="sm" @click="allocateEverything">
              Tout affecter
            </BaseButton>
            <BaseButton variant="ghost" size="sm" @click="clearAmounts">
              Tout remettre à zéro
            </BaseButton>
          </div>
        </div>

        <div class="space-y-2">
          <div
            v-for="group in allocationGroups"
            :key="group.key"
            class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
          >
            <!-- Category row -->
            <div
              class="flex items-center gap-2 bg-gray-50 p-2 pr-3 dark:bg-slate-800"
            >
              <BaseIconButton
                size="sm"
                :label="`Déplier ${group.categoryName}`"
                :aria-expanded="expandedCategories.has(group.key)"
                @click="toggleExpanded(group.key)"
              >
                <IconChevronRight
                  class="transition-transform duration-200"
                  :class="{ 'rotate-90': expandedCategories.has(group.key) }"
                />
              </BaseIconButton>
              <div class="min-w-0 flex-1">
                <p
                  class="truncate font-medium text-gray-900 dark:text-gray-100"
                  :title="group.categoryName"
                >
                  {{ group.categoryName }}
                </p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  {{ group.lines.length }} ligne(s) &middot; dû
                  {{ formatCurrency(group.selectedDue) }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-1">
                <BaseField
                  amount
                  lazy
                  size="sm"
                  label-hidden
                  :label="`Montant affecté à ${group.categoryName}`"
                  :model-value="group.allocated"
                  class="w-20 sm:w-24 [&_input]:text-right"
                  @update:model-value="
                    value =>
                      onCategoryAmountCommit(group, value as number | null)
                  "
                />
                <span class="text-gray-500 dark:text-gray-400">&euro;</span>
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
                class="p-3 pl-4 sm:pl-12"
              >
                <div class="flex items-center gap-2">
                  <div class="min-w-0 flex-1">
                    <p
                      class="truncate text-sm text-gray-900 dark:text-gray-100"
                      :title="line.description"
                    >
                      <span class="text-gray-500 dark:text-gray-400"
                        >[{{ formatDate(line.date) }}]</span
                      >
                      {{ line.description }}
                    </p>
                    <p class="text-xs text-gray-500 dark:text-gray-400">
                      dû {{ formatCurrency(line.amountDue) }}
                    </p>
                  </div>
                  <div class="flex shrink-0 items-center gap-1">
                    <BaseField
                      amount
                      lazy
                      size="sm"
                      label-hidden
                      :label="`Montant affecté à ${line.description}`"
                      :model-value="stateOf(line.reimbursementId).amount"
                      class="w-20 sm:w-24 [&_input]:text-right"
                      @update:model-value="
                        value =>
                          onAmountCommit(
                            line.reimbursementId,
                            value as number | null
                          )
                      "
                    />
                    <span class="text-gray-500 dark:text-gray-400">&euro;</span>
                  </div>
                </div>

                <!-- Settle-the-shortfall, only when the line stays short -->
                <div
                  v-if="
                    stateOf(line.reimbursementId).amount > 0 &&
                    stateOf(line.reimbursementId).amount < line.amountDue
                  "
                  class="mt-2"
                >
                  <BaseCheckbox
                    :model-value="stateOf(line.reimbursementId).forceComplete"
                    :label="`Solder cette ligne malgré l'écart de ${formatCurrency(
                      round2(
                        line.amountDue - stateOf(line.reimbursementId).amount
                      )
                    )}`"
                    :aria-label="`Solder ${line.description}`"
                    @update:model-value="
                      toggleForceComplete(line.reimbursementId)
                    "
                  />
                </div>
              </div>

              <div
                v-if="group.lines.length > 1 && group.allocated > 0"
                class="px-3 py-1 text-right"
              >
                <BaseButton
                  variant="ghost"
                  size="sm"
                  @click="spreadGroupProrata(group)"
                >
                  Répartir au prorata
                </BaseButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer-start>
      <!-- Selection total, step 1 only -->
      <p
        v-if="currentStep === 1"
        class="flex items-center justify-between gap-3 text-gray-700 dark:text-gray-300"
      >
        <span>{{ selectedLines.length }} remboursement(s) sélectionné(s)</span>
        <span
          class="font-semibold text-gray-900 dark:text-gray-100"
          data-testid="settlement-selection-total"
        >
          {{ formatCurrency(selectedDueTotal) }}
        </span>
      </p>

      <!-- Running balance, step 2 only -->
      <p
        v-else-if="selectedTransaction"
        class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
      >
        <span class="text-gray-700 dark:text-gray-300">
          Affecté {{ formatCurrency(allocatedTotal) }}
        </span>
        <span
          class="font-semibold"
          :class="{
            'text-green-700 dark:text-green-400':
              Math.abs(remainingToAllocate) < 0.01,
            'text-amber-700 dark:text-amber-400': remainingToAllocate >= 0.01,
            'text-red-700 dark:text-red-400': isOverAllocated,
          }"
        >
          <template v-if="isOverAllocated">
            Dépassement de
            {{ formatCurrency(Math.abs(remainingToAllocate)) }}
          </template>
          <template v-else-if="remainingToAllocate >= 0.01">
            {{ formatCurrency(remainingToAllocate) }} resteront disponibles sur
            cette transaction
          </template>
          <template v-else>Tout est affecté</template>
        </span>
      </p>
    </template>

    <template #footer>
      <!-- Step 2 on a phone: the header's cross already closes. -->
      <BaseButton
        variant="secondary"
        :disabled="isSubmitting"
        :class="currentStep === 2 ? 'max-sm:hidden' : ''"
        data-testid="settlement-cancel"
        @click="requestClose"
      >
        Annuler
      </BaseButton>
      <BaseButton
        v-if="currentStep === 1"
        data-testid="settlement-continue"
        :disabled="!hasSelection"
        @click="goToReceipt"
      >
        Continuer
      </BaseButton>
      <BaseButton
        v-else
        :disabled="!canConfirm"
        :loading="isSubmitting"
        @click="handleConfirm"
      >
        Confirmer le règlement
      </BaseButton>
    </template>
  </BaseModal>
</template>

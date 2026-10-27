<script setup lang="ts">
  import { ref, computed, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SegmentedControl, {
    type SegmentedOption,
  } from '@/components/ui/SegmentedControl.vue'
  import StepIndicator from '@/components/ui/StepIndicator.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import {
    api,
    type ReimbursementDto,
    type TransactionDto,
    type SettlementDto,
    type SettlementReimbursementItemDto,
  } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import {
    availableAmountOf,
    byOldestFirst,
    cascadeAllocate,
    prorataAllocate,
    rankDebtGroups,
    round2,
    type RankedDebtGroup,
    type RankedDebtLine,
    type SuggestionReason,
  } from '@/lib/settlements'

  /**
   * Settle from the money's side: an income arrived, which debt does it pay?
   *
   * The mirror of `SettlementModal`, which starts from a person's debts and
   * looks for the receipt. Here the receipt is known, so the first step lists
   * every pending debt, grouped by person and ranked by `rankDebtGroups`, and
   * a selection that fits in what the income has available is confirmed
   * straight away, each line settled in full. Only when the selection owes
   * more than the income holds does a second step appear, the allocation of
   * `SettlementModal` (oldest first or prorata, amounts bounded, settle the
   * shortfall anyway).
   *
   * One settlement, one person: the server refuses debts of several people,
   * so ticking another person's debt replaces the selection.
   */
  const props = withDefaults(
    defineProps<{
      isOpen: boolean
      transaction: TransactionDto | null
      /** Every pending debt, all persons (amountRemaining > 0). */
      pendingReimbursements: ReimbursementDto[]
      /** What the row's « Régler {personne} » already knows to tick. */
      preselect?: { personId: string; reimbursementIds: string[] } | null
    }>(),
    { preselect: null }
  )

  const emit = defineEmits<{
    close: []
    confirm: [settlement: SettlementDto]
  }>()

  const STEP_LABELS = ['Remboursements', 'Répartition']

  const REASON_LABELS: Record<SuggestionReason, string> = {
    amount: 'montant exact',
    name: 'nom dans le libellé',
  }

  type AllocationMode = 'cascade' | 'prorata'

  const MODE_OPTIONS: SegmentedOption<AllocationMode>[] = [
    { value: 'cascade', label: "Plus ancienne d'abord" },
    { value: 'prorata', label: 'Au prorata' },
  ]

  interface LineState {
    amount: number
    forceComplete: boolean
  }

  const currentStep = ref<1 | 2>(1)
  /** On a phone the allocation keeps the room: no step trail there. */
  const isMobile = useIsMobile()
  const selectedIds = ref<Set<string>>(new Set())
  const expandedPersons = ref<Set<string>>(new Set())
  const mode = ref<AllocationMode>('cascade')
  const allocations = ref<Record<string, LineState>>({})
  const isSubmitting = ref(false)
  const error = ref<string | null>(null)
  /** The selection the modal opened with, to tell a draft from a glance. */
  const initialSelection = ref('')

  // --- The income ----------------------------------------------------------

  const available = computed(() =>
    props.transaction ? availableAmountOf(props.transaction) : 0
  )

  const subtitle = computed(() => {
    if (!props.transaction) return undefined
    if (currentStep.value === 2) {
      return `${selectedPersonName.value} · comment répartir les ${formatCurrency(available.value)} reçus ?`
    }
    return `${props.transaction.description} · ${formatDate(props.transaction.date)} · quelle dette règle-t-il ?`
  })

  // --- Debt groups, by person ----------------------------------------------

  const groups = computed((): RankedDebtGroup[] =>
    props.transaction
      ? rankDebtGroups(props.pendingReimbursements, props.transaction)
      : []
  )

  const allLines = computed((): (RankedDebtLine & { personId: string })[] =>
    groups.value.flatMap(group =>
      group.lines.map(line => ({ ...line, personId: group.personId }))
    )
  )

  const selectedLines = computed(() =>
    allLines.value
      .filter(line => selectedIds.value.has(line.reimbursementId))
      .sort(byOldestFirst)
  )

  const selectedGroup = computed(
    (): RankedDebtGroup | null =>
      groups.value.find(
        group => group.personId === selectedLines.value[0]?.personId
      ) ?? null
  )

  const selectedPersonName = computed(
    () => selectedGroup.value?.personName ?? ''
  )

  const selectedDueTotal = computed(() =>
    round2(selectedLines.value.reduce((sum, line) => sum + line.amountDue, 0))
  )

  const hasSelection = computed(() => selectedLines.value.length > 0)

  /** The selection is paid in full by the income: no allocation to make. */
  const fitsAvailable = computed(
    () => selectedDueTotal.value <= available.value + 0.001
  )

  function selectedCountOf(group: RankedDebtGroup): number {
    return group.lines.filter(line =>
      selectedIds.value.has(line.reimbursementId)
    ).length
  }

  function isSelected(reimbursementId: string): boolean {
    return selectedIds.value.has(reimbursementId)
  }

  /**
   * Ticking a debt of another person starts over with that debt: a
   * settlement belongs to one person.
   */
  function toggleLine(group: RankedDebtGroup, reimbursementId: string): void {
    if (isSelected(reimbursementId)) {
      const next = new Set(selectedIds.value)
      next.delete(reimbursementId)
      selectedIds.value = next
      return
    }
    const samePerson =
      selectedGroup.value === null ||
      selectedGroup.value.personId === group.personId
    const next = samePerson ? new Set(selectedIds.value) : new Set<string>()
    next.add(reimbursementId)
    selectedIds.value = next
  }

  function toggleGroup(group: RankedDebtGroup): void {
    if (selectedCountOf(group) === group.lines.length) {
      const next = new Set(selectedIds.value)
      for (const line of group.lines) next.delete(line.reimbursementId)
      selectedIds.value = next
      return
    }
    selectedIds.value = new Set(group.lines.map(line => line.reimbursementId))
    expandPerson(group.personId)
  }

  /**
   * « Tout » within the one-person rule: every debt of the person already
   * chosen, or of the most likely one when nothing is ticked yet.
   */
  function selectAll(): void {
    const group = selectedGroup.value ?? groups.value[0]
    if (!group) return
    selectedIds.value = new Set(group.lines.map(line => line.reimbursementId))
    expandPerson(group.personId)
  }

  function clearSelection(): void {
    selectedIds.value = new Set()
  }

  function expandPerson(personId: string): void {
    if (expandedPersons.value.has(personId)) return
    expandedPersons.value = new Set([...expandedPersons.value, personId])
  }

  function toggleExpanded(personId: string): void {
    const next = new Set(expandedPersons.value)
    if (next.has(personId)) next.delete(personId)
    else next.add(personId)
    expandedPersons.value = next
  }

  const replaceHint = computed(() => {
    if (groups.value.length < 2) return null
    return selectedGroup.value
      ? `Un règlement ne concerne qu'une personne : cocher une dette d'une autre personne remplacera la sélection de ${selectedGroup.value.personName}.`
      : "Un règlement ne concerne qu'une personne : cocher une dette d'une autre personne remplace la sélection."
  })

  // --- Step 2: the allocation, when the income falls short -----------------

  interface CategoryGroup {
    key: string
    categoryName: string
    lines: RankedDebtLine[]
    due: number
    allocated: number
  }

  const allocationGroups = computed((): CategoryGroup[] => {
    const byKey = new Map<string, CategoryGroup>()
    for (const line of selectedLines.value) {
      const key = line.categoryId ?? 'none'
      let group = byKey.get(key)
      if (!group) {
        group = {
          key,
          categoryName: line.categoryName,
          lines: [],
          due: 0,
          allocated: 0,
        }
        byKey.set(key, group)
      }
      group.lines.push(line)
      group.due = round2(group.due + line.amountDue)
      group.allocated = round2(
        group.allocated + stateOf(line.reimbursementId).amount
      )
    }
    return [...byKey.values()]
  })

  function stateOf(reimbursementId: string): LineState {
    return (
      allocations.value[reimbursementId] ?? { amount: 0, forceComplete: false }
    )
  }

  const allocatedTotal = computed(() =>
    round2(
      selectedLines.value.reduce(
        (sum, line) => sum + stateOf(line.reimbursementId).amount,
        0
      )
    )
  )

  const remainingToAllocate = computed(() =>
    round2(available.value - allocatedTotal.value)
  )

  function applyAllocation(): void {
    const allocated =
      mode.value === 'cascade'
        ? cascadeAllocate(selectedLines.value, available.value)
        : prorataAllocate(selectedLines.value, available.value)
    const next: Record<string, LineState> = {}
    for (const line of selectedLines.value) {
      next[line.reimbursementId] = {
        amount: allocated.get(line.reimbursementId) ?? 0,
        forceComplete: false,
      }
    }
    allocations.value = next
  }

  watch(mode, () => {
    if (currentStep.value === 2) applyAllocation()
  })

  /**
   * Bounded twice: never more than the line owes, never more than the income
   * has left once the other lines have had theirs.
   */
  function setLineAmount(line: RankedDebtLine, rawAmount: number): void {
    const others = round2(
      allocatedTotal.value - stateOf(line.reimbursementId).amount
    )
    const ceiling = Math.max(
      0,
      Math.min(line.amountDue, available.value - others)
    )
    const amount = round2(Math.min(Math.max(0, rawAmount), ceiling))
    const previous = stateOf(line.reimbursementId)
    allocations.value = {
      ...allocations.value,
      [line.reimbursementId]: {
        amount,
        // Crediting the full due makes the "solder" flag meaningless.
        forceComplete:
          amount > 0 && amount < line.amountDue
            ? previous.forceComplete
            : false,
      },
    }
  }

  /**
   * Committed on `change` rather than `input` (BaseField `lazy`): the field
   * is clamped, so writing back on every keystroke would eat a half-typed
   * "0,".
   */
  function onAmountCommit(line: RankedDebtLine, value: number | null): void {
    setLineAmount(line, value ?? 0)
  }

  function toggleForceComplete(reimbursementId: string): void {
    const state = stateOf(reimbursementId)
    allocations.value = {
      ...allocations.value,
      [reimbursementId]: { ...state, forceComplete: !state.forceComplete },
    }
  }

  function goToAllocation(): void {
    if (!hasSelection.value) return
    mode.value = 'cascade'
    currentStep.value = 2
    applyAllocation()
  }

  function goBackToSelection(): void {
    currentStep.value = 1
  }

  /** « Le règlement est daté d'aujourd'hui » : the server dates it on save. */
  const today = computed(() => formatDate(new Date().toISOString()))

  // --- Confirmation --------------------------------------------------------

  const canConfirmDirect = computed(
    () => hasSelection.value && fitsAvailable.value && !isSubmitting.value
  )

  const canConfirmAllocation = computed(
    () =>
      allocatedTotal.value > 0 &&
      remainingToAllocate.value > -0.001 &&
      !isSubmitting.value
  )

  async function submit(
    reimbursements: SettlementReimbursementItemDto[]
  ): Promise<void> {
    const group = selectedGroup.value
    if (!props.transaction || !group || reimbursements.length === 0) return

    isSubmitting.value = true
    error.value = null

    try {
      const settlement = await api.createSettlement({
        personId: group.personId,
        incomeTransactionId: props.transaction.id,
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

  /** The income covers the selection: each line is settled in full. */
  function confirmDirect(): Promise<void> {
    if (!canConfirmDirect.value) return Promise.resolve()
    return submit(
      selectedLines.value.map(line => ({
        reimbursementId: line.reimbursementId,
        amountSettled: line.amountDue,
      }))
    )
  }

  function confirmAllocation(): Promise<void> {
    if (!canConfirmAllocation.value) return Promise.resolve()
    return submit(
      selectedLines.value
        .map(line => ({ line, state: stateOf(line.reimbursementId) }))
        .filter(({ state }) => state.amount > 0)
        .map(({ line, state }) => ({
          reimbursementId: line.reimbursementId,
          amountSettled: state.amount,
          ...(state.forceComplete && { forceComplete: true }),
        }))
    )
  }

  // --- Open / close --------------------------------------------------------

  function selectionKey(ids: Iterable<string>): string {
    return [...ids].sort().join(',')
  }

  function resetModal(): void {
    currentStep.value = 1
    mode.value = 'cascade'
    allocations.value = {}
    error.value = null
    isSubmitting.value = false

    const known = new Set(allLines.value.map(line => line.reimbursementId))
    const preselect = props.preselect
    const ids = (preselect?.reimbursementIds ?? []).filter(id => known.has(id))
    selectedIds.value = new Set(ids)
    initialSelection.value = selectionKey(ids)

    const expanded = new Set<string>()
    const first = groups.value[0]
    if (first) expanded.add(first.personId)
    if (preselect && ids.length > 0) expanded.add(preselect.personId)
    expandedPersons.value = expanded
  }

  /** A changed selection, or an allocation under way, is a draft. */
  const isDirty = computed(
    () =>
      currentStep.value === 2 ||
      selectionKey(selectedIds.value) !== initialSelection.value
  )

  const modalRef = ref<InstanceType<typeof BaseModal> | null>(null)

  function handleClose(): void {
    emit('close')
  }

  /** « Annuler » closes the way the cross does — through the draft guard. */
  function requestClose(): void {
    modalRef.value?.requestClose()
  }

  watch(
    () => props.isOpen,
    isOpen => {
      if (isOpen) resetModal()
    },
    { immediate: true }
  )
</script>

<template>
  <BaseModal
    ref="modalRef"
    :open="isOpen"
    title="Régler avec ce revenu"
    :subtitle="subtitle"
    max-width="xl"
    :closable="!isSubmitting"
    :dirty="isDirty"
    :back-label="currentStep === 2 ? 'Retour à la sélection' : undefined"
    back-test-id="income-settlement-back"
    @back="goBackToSelection"
    @close="handleClose"
  >
    <template v-if="currentStep === 2 && !isMobile" #subheader>
      <StepIndicator class="justify-start" :steps="STEP_LABELS" :current="2" />
    </template>

    <InlineAlert v-if="error" class="mb-4">{{ error }}</InlineAlert>

    <!-- ============ Step 1: which debt does it pay? ============ -->
    <div
      v-if="currentStep === 1 && transaction"
      data-testid="income-settlement-step-select"
    >
      <div
        class="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-green-50 p-3 dark:bg-green-900/20"
        data-testid="income-settlement-receipt"
      >
        <span class="text-sm text-gray-600 dark:text-gray-400">
          Reçu sur {{ transaction.account }}
        </span>
        <span
          class="text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
        >
          <span class="font-semibold">{{
            formatCurrency(transaction.amount)
          }}</span>
          &middot;
          <span
            class="font-semibold text-green-700 dark:text-green-400"
            data-testid="income-settlement-available"
            >{{ formatCurrency(available) }} disponibles</span
          >
        </span>
      </div>

      <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p class="text-sm text-gray-600 dark:text-gray-400">
          Dettes en attente, la personne la plus probable en tête
        </p>
        <div class="flex items-center gap-1">
          <BaseButton
            variant="ghost"
            size="sm"
            data-testid="income-settlement-select-all"
            @click="selectAll"
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
          :key="group.personId"
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
          :data-testid="`income-settlement-group-${group.personId}`"
        >
          <!-- Person row -->
          <div
            class="flex items-center gap-2 bg-gray-50 p-2 pr-3 dark:bg-slate-800"
          >
            <BaseIconButton
              size="sm"
              :label="`Déplier ${group.personName}`"
              :aria-expanded="expandedPersons.has(group.personId)"
              @click="toggleExpanded(group.personId)"
            >
              <IconChevronRight
                class="transition-transform duration-200"
                :class="{ 'rotate-90': expandedPersons.has(group.personId) }"
              />
            </BaseIconButton>
            <label
              class="flex min-w-0 flex-1 cursor-pointer items-center gap-3 py-1 pointer-coarse:min-h-[44px]"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
                :checked="selectedCountOf(group) > 0"
                :indeterminate="
                  selectedCountOf(group) > 0 &&
                  selectedCountOf(group) < group.lines.length
                "
                :aria-label="`Sélectionner ${group.personName}`"
                @change="toggleGroup(group)"
              />
              <span
                class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-debt-100 text-sm font-semibold text-debt-700 dark:bg-debt-900/30 dark:text-debt-300"
                aria-hidden="true"
              >
                {{ group.personName.charAt(0).toUpperCase() }}
              </span>
              <!-- On a phone the badge wraps under the name instead of
                   squeezing it. -->
              <span
                class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span class="min-w-0 basis-full sm:flex-1 sm:basis-auto">
                  <span
                    class="block truncate font-medium text-gray-900 dark:text-gray-100"
                    :title="group.personName"
                  >
                    {{ group.personName }}
                  </span>
                  <span class="block text-xs text-gray-500 dark:text-gray-400">
                    {{ group.lines.length }} ligne(s) &middot; dû
                    {{ formatCurrency(group.due) }}
                  </span>
                </span>
                <span
                  v-if="group.reasons.includes('name')"
                  class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                  data-testid="income-settlement-reason-name"
                >
                  {{ REASON_LABELS.name }}
                </span>
              </span>
            </label>
          </div>

          <!-- Lines -->
          <div
            v-if="expandedPersons.has(group.personId)"
            class="divide-y divide-gray-100 dark:divide-slate-700"
          >
            <label
              v-for="line in group.lines"
              :key="line.reimbursementId"
              class="flex cursor-pointer items-center gap-3 p-3 pl-4 hover:bg-gray-50 pointer-coarse:min-h-[44px] sm:pl-12 dark:hover:bg-slate-800/50"
              :data-testid="`income-settlement-line-${line.reimbursementId}`"
            >
              <input
                type="checkbox"
                class="h-4 w-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-800"
                :checked="isSelected(line.reimbursementId)"
                :aria-label="`Sélectionner ${line.description}`"
                @change="toggleLine(group, line.reimbursementId)"
              />
              <!-- On a phone the badge wraps under the description instead
                   of squeezing it. -->
              <span
                class="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1"
              >
                <span
                  class="flex min-w-0 basis-full items-center gap-1 text-sm text-gray-900 sm:flex-1 sm:basis-auto dark:text-gray-100"
                  :title="line.description"
                >
                  <span class="min-w-0 truncate">
                    <span class="text-gray-500 dark:text-gray-400"
                      >[{{ formatDate(line.date) }}]</span
                    >
                    {{ line.description }}
                  </span>
                  <TransactionsLink
                    :to="
                      transactionsLink({
                        ids: [line.transactionId],
                        label: line.description,
                      })
                    "
                    :subject="line.description"
                    icon-only
                    new-tab
                    class="h-6 w-6"
                    :data-testid="`income-settlement-line-link-${line.reimbursementId}`"
                  />
                </span>
                <span
                  v-if="line.exactAmount"
                  class="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400"
                  data-testid="income-settlement-reason-amount"
                >
                  {{ REASON_LABELS.amount }}
                </span>
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
        Aucun remboursement en attente
      </p>

      <p
        v-if="replaceHint"
        class="mt-3 text-xs text-gray-500 dark:text-gray-400"
        data-testid="income-settlement-one-person"
      >
        {{ replaceHint }}
      </p>
    </div>

    <!-- ====== Step 2: the income falls short, split it ====== -->
    <div v-else-if="transaction" data-testid="income-settlement-step-allocate">
      <div
        class="mb-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-3 dark:bg-slate-800"
      >
        <span class="text-sm text-gray-600 dark:text-gray-400">
          {{ selectedLines.length }} remboursement(s) retenu(s)
        </span>
        <span
          class="text-sm whitespace-nowrap text-gray-900 dark:text-gray-100"
        >
          <span class="font-semibold"
            >{{ formatCurrency(selectedDueTotal) }} dus</span
          >
          &middot;
          <span class="font-semibold text-green-700 dark:text-green-400"
            >{{ formatCurrency(available) }} disponibles</span
          >
        </span>
      </div>

      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span
          id="income-settlement-mode-label"
          class="text-sm text-gray-600 dark:text-gray-400"
        >
          Ordre de répartition
        </span>
        <SegmentedControl
          v-model="mode"
          :options="MODE_OPTIONS"
          labelled-by="income-settlement-mode-label"
          size="sm"
          data-testid="income-settlement-mode"
        />
      </div>

      <div class="space-y-2">
        <div
          v-for="group in allocationGroups"
          :key="group.key"
          class="overflow-hidden rounded-lg border border-gray-200 dark:border-slate-700"
        >
          <div class="bg-gray-50 px-3 py-2 dark:bg-slate-800">
            <p
              class="truncate font-medium text-gray-900 dark:text-gray-100"
              :title="group.categoryName"
            >
              {{ group.categoryName }}
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              {{ group.lines.length }} ligne(s) &middot; dû
              {{ formatCurrency(group.due) }} &middot;
              <span class="font-semibold text-gray-700 dark:text-gray-300"
                >{{ formatCurrency(group.allocated) }} imputés</span
              >
            </p>
          </div>

          <div class="divide-y divide-gray-100 dark:divide-slate-700">
            <div
              v-for="line in group.lines"
              :key="line.reimbursementId"
              class="p-3"
              :data-testid="`income-settlement-allocation-${line.reimbursementId}`"
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
                    <template v-if="stateOf(line.reimbursementId).amount === 0">
                      &middot; reste en attente
                    </template>
                  </p>
                </div>
                <div class="flex shrink-0 items-center gap-1">
                  <!-- BaseField hands its class to the input, which is
                       full-width: the width goes on a wrapper. -->
                  <div class="w-24">
                    <BaseField
                      amount
                      lazy
                      size="sm"
                      label-hidden
                      :label="`Montant imputé à ${line.description}`"
                      :model-value="stateOf(line.reimbursementId).amount"
                      class="text-right"
                      @update:model-value="
                        value => onAmountCommit(line, value as number | null)
                      "
                    />
                  </div>
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
                  :label="`Solder malgré ${formatCurrency(
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
          </div>
        </div>
      </div>

      <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Le règlement est daté d'aujourd'hui, {{ today }}.
      </p>
    </div>

    <template #footer-start>
      <p
        v-if="currentStep === 1"
        class="flex flex-wrap items-center gap-x-2 text-gray-700 dark:text-gray-300"
        data-testid="income-settlement-selection-total"
      >
        <span
          >{{ selectedLines.length }} remboursement(s) sélectionné(s)
          &middot;</span
        >
        <span>
          <span class="font-semibold text-gray-900 dark:text-gray-100">{{
            formatCurrency(selectedDueTotal)
          }}</span>
          sur {{ formatCurrency(available) }} disponibles
        </span>
      </p>
      <p
        v-else
        class="flex flex-wrap items-center gap-x-2 text-gray-700 dark:text-gray-300"
        data-testid="income-settlement-allocated-total"
      >
        <span>
          Total imputé
          <span class="font-semibold text-gray-900 dark:text-gray-100">{{
            formatCurrency(allocatedTotal)
          }}</span>
        </span>
        <span>
          sur {{ formatCurrency(available) }} &middot; reste
          {{ formatCurrency(Math.max(0, remainingToAllocate)) }}
        </span>
      </p>
    </template>

    <template #footer>
      <BaseButton
        variant="secondary"
        :disabled="isSubmitting"
        :class="currentStep === 2 ? 'max-sm:hidden' : ''"
        data-testid="income-settlement-cancel"
        @click="requestClose"
      >
        Annuler
      </BaseButton>
      <BaseButton
        v-if="currentStep === 1 && hasSelection && !fitsAvailable"
        data-testid="income-settlement-continue"
        @click="goToAllocation"
      >
        Continuer
      </BaseButton>
      <BaseButton
        v-else-if="currentStep === 1"
        data-testid="income-settlement-confirm"
        :disabled="!canConfirmDirect"
        :loading="isSubmitting"
        @click="confirmDirect"
      >
        Confirmer le règlement
      </BaseButton>
      <BaseButton
        v-else
        data-testid="income-settlement-confirm"
        :disabled="!canConfirmAllocation"
        :loading="isSubmitting"
        @click="confirmAllocation"
      >
        Confirmer le règlement
      </BaseButton>
    </template>
  </BaseModal>
</template>

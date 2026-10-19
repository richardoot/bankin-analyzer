<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type {
    RecurrencePeriod,
    ReimbursementDto,
    TagDto,
    TransactionDto,
    TransactionSettlementSummaryDto,
  } from '@/lib/api'
  import { formatCurrency, formatDate } from '@/lib/formatters'
  import TagChip from '@/components/tags/TagChip.vue'
  import { transactionsLink } from '@/lib/transactionsLink'
  import TagSelector from '@/components/tags/TagSelector.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import BaseMenu, { type MenuItem } from '@/components/ui/BaseMenu.vue'
  import IconArrowPath from '@/components/icons/IconArrowPath.vue'
  import IconCalendar from '@/components/icons/IconCalendar.vue'
  import IconCash from '@/components/icons/IconCash.vue'
  import IconCheck from '@/components/icons/IconCheck.vue'
  import IconClock from '@/components/icons/IconClock.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import IconDocumentText from '@/components/icons/IconDocumentText.vue'
  import IconPencil from '@/components/icons/IconPencil.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'
  import IconTag from '@/components/icons/IconTag.vue'
  import TransactionNoteEditor from './TransactionNoteEditor.vue'
  import TransactionReimbursementList from './TransactionReimbursementList.vue'
  import TransactionSettlementLinks from './TransactionSettlementLinks.vue'
  import { rowGridClass } from './rowGrid'
  import { smoothingEnded } from '@/lib/amortization'

  /**
   * One transaction, one declaration.
   *
   * Two arrangements of the same fields live side by side in this file,
   * composing the same leaf pieces (note editor, reimbursement list,
   * settlement links) declared exactly once:
   *
   * - below `lg`, a card: two lines, tappable. A tap on the line opens
   *   the filing dialog — the category is what a transaction gets edited
   *   for — and the rest of the actions wait behind a « … » menu instead
   *   of a strip of affordances repeated on every line. The pointed
   *   toggle stays in view: it is the one quick flip a line has. In
   *   selection mode a tap ticks the line.
   * - from `lg`, a table row: the secondary affordances (« + Note »,
   *   « Étiquette », « Abonnement », « Étaler ») show on hover *and* on
   *   focus within the row, never on hover alone; what exists (a note,
   *   tags, a subscription or smoothing badge, reimbursements) is always
   *   drawn.
   *
   * Every target reaches 44px on a touch screen, through an invisible halo
   * where the visible control is smaller.
   *
   * The page stays the orchestrator: it owns the data and the API calls,
   * and keeps the single-editor / single-expansion invariants (only one
   * row edits its note at a time). The row owns nothing but its note draft.
   */
  const props = withDefaults(
    defineProps<{
      transaction: TransactionDto
      reimbursements: ReimbursementDto[]
      remainingAmount: number
      allTags: TagDto[]
      selectionMode?: boolean | undefined
      selected?: boolean | undefined
      isEditingNote?: boolean | undefined
      reimbursementsExpanded?: boolean | undefined
      settlementLoading?: boolean | undefined
    }>(),
    {
      selectionMode: false,
      selected: false,
      isEditingNote: false,
      reimbursementsExpanded: false,
      settlementLoading: false,
    }
  )

  const emit = defineEmits<{
    'toggle-select': []
    'open-category': []
    'toggle-pointed': []
    'start-note': []
    'save-note': [note: string]
    'cancel-note': []
    'open-reimbursement': []
    'toggle-reimbursements': []
    'open-settlement': [settlement: TransactionSettlementSummaryDto]
    'delete-reimbursement': [id: string]
    'attach-tag': [id: string]
    'detach-tag': [id: string]
    'create-tag': [name: string]
    'mark-recurring': []
    'show-recurrence': []
    'unlink-recurrence': []
    /** « Étaler sur… »: the smoothing dialog, to set, change or stop it. */
    'open-amortization': []
  }>()

  const RECURRENCE_PERIOD_LABELS: Record<RecurrencePeriod, string> = {
    WEEKLY: 'hebdo',
    FOUR_WEEKLY: '4 semaines',
    MONTHLY: 'mensuel',
    QUARTERLY: 'trimestriel',
    YEARLY: 'annuel',
  }

  // The draft starts from the stored note each time editing opens; the page
  // only learns about it on save.
  const noteDraft = ref('')
  watch(
    () => props.isEditingNote,
    editing => {
      if (editing) noteDraft.value = props.transaction.note ?? ''
    }
  )

  const isExpense = computed(() => props.transaction.type === 'EXPENSE')
  const isTransfer = computed(() => props.transaction.type === 'TRANSFER')
  const categoryLabel = computed(
    () => props.transaction.categoryName || 'Sans catégorie'
  )

  /**
   * Red for spending, green for earning, grey for money merely moving —
   * the amount, the mobile icon and the desktop pill all say the same.
   */
  const amountClass = computed(() =>
    isTransfer.value
      ? 'text-gray-500 dark:text-gray-400'
      : isExpense.value
        ? 'text-red-600 dark:text-red-400'
        : 'text-green-700 dark:text-green-400'
  )
  const iconClass = computed(() =>
    !props.transaction.categoryName
      ? 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
      : isTransfer.value
        ? 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-200'
        : isExpense.value
          ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
  )
  /** The desktop category pill, in the same palette as the mobile icon. */
  const categoryPillClass = computed(() =>
    !props.transaction.categoryName
      ? 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
      : isTransfer.value
        ? 'bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-slate-600'
        : isExpense.value
          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
          : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
  )

  const reimbursementSummary = computed(() => {
    const total = props.reimbursements.reduce((sum, r) => sum + r.amount, 0)
    return {
      totalAmount: total,
      allCompleted: props.reimbursements.every(r => r.status === 'COMPLETED'),
    }
  })

  const tagIds = computed(() => (props.transaction.tags ?? []).map(t => t.id))

  /**
   * A desktop affordance that waits for the row to be hovered — or to
   * hold the focus, so the keyboard sees exactly what the mouse sees.
   */
  const REVEAL_ON_HOVER =
    'opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 aria-expanded:opacity-100'

  const canAssign = computed(() => isExpense.value && props.remainingAmount > 0)
  const canFollow = computed(
    () => isExpense.value && !props.transaction.recurrence
  )

  /**
   * Only an expense is smoothed (agent-os/product/amortization-framework.md):
   * the action is not offered on an income or a transfer.
   */
  const canSmooth = computed(
    () => isExpense.value && props.transaction.amount < 0
  )
  const amortizationMonths = computed(
    () => props.transaction.amortizationMonths ?? null
  )
  /**
   * A smoothing reads like a subscription (same edge, same badge), in teal
   * while its slices fall, grey and « terminé » once the last one has.
   */
  const smoothingStatus = computed<'ACTIVE' | 'STOPPED' | null>(() => {
    if (amortizationMonths.value === null) return null
    const today = new Date()
    const currentMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
    return smoothingEnded(
      props.transaction.date,
      amortizationMonths.value,
      currentMonth
    )
      ? 'STOPPED'
      : 'ACTIVE'
  })
  /**
   * The line's left edge, the subscription's first: blue for a running
   * subscription, teal for a running smoothing (the Budget page's colour
   * for it), grey once either has ended.
   */
  const edgeClass = computed(() => {
    const recurrence = props.transaction.recurrence?.status
    const status = recurrence ?? smoothingStatus.value
    if (status === 'STOPPED') return 'border-l-gray-300 dark:border-l-slate-600'
    if (recurrence === 'ACTIVE')
      return 'border-l-blue-400 dark:border-l-blue-500'
    if (status === 'ACTIVE') return 'border-l-teal-400 dark:border-l-teal-500'
    return 'border-l-transparent'
  })

  /** Whether the tags line has something to show on a phone. */
  const hasTagLineContent = computed(
    () =>
      Boolean(props.transaction.recurrence) ||
      amortizationMonths.value !== null ||
      (props.transaction.tags ?? []).length > 0
  )

  // ── The « … » menu of the card (below lg) ──
  const tagSelector = ref<InstanceType<typeof TagSelector> | null>(null)
  const menu = ref<InstanceType<typeof BaseMenu> | null>(null)

  const menuItems = computed<MenuItem[]>(() => {
    const items: MenuItem[] = [
      {
        key: 'category',
        label: 'Modifier la catégorie',
        icon: IconPencil,
        testId: 'row-menu-category',
      },
      {
        key: 'note',
        label: props.transaction.note ? 'Modifier la note' : 'Ajouter une note',
        icon: IconDocumentText,
        testId: 'row-menu-note',
      },
    ]
    if (canAssign.value) {
      items.push({
        key: 'reimbursement',
        label: 'Ajouter un remboursement',
        icon: IconCash,
        testId: 'row-menu-reimbursement',
      })
    }
    items.push({
      key: 'tag',
      label: 'Ajouter une étiquette',
      icon: IconTag,
      testId: 'row-menu-tag',
    })
    if (canSmooth.value) {
      items.push({
        key: 'amortization',
        label:
          amortizationMonths.value !== null
            ? `Étalé sur ${amortizationMonths.value} mois…`
            : 'Étaler sur plusieurs mois…',
        icon: IconCalendar,
        testId: 'row-menu-amortization',
      })
    }
    if (canFollow.value) {
      items.push({
        key: 'recurring',
        label: 'Suivre comme abonnement',
        icon: IconArrowPath,
        testId: 'row-menu-recurring',
      })
    }
    if (props.transaction.recurrence?.linked) {
      items.push({
        key: 'unlink',
        label: "Détacher de l'abonnement",
        icon: IconClose,
        danger: true,
        testId: 'row-menu-unlink',
      })
    }
    return items
  })

  function onMenuSelect(key: string): void {
    switch (key) {
      case 'category':
        emit('open-category')
        break
      case 'note':
        emit('start-note')
        break
      case 'reimbursement':
        emit('open-reimbursement')
        break
      case 'tag':
        // The panel hangs under the tags line; Escape returns to the menu.
        tagSelector.value?.open(
          (menu.value?.$el as HTMLElement | undefined)?.querySelector(
            'button'
          ) ?? null
        )
        break
      case 'amortization':
        emit('open-amortization')
        break
      case 'recurring':
        emit('mark-recurring')
        break
      case 'unlink':
        emit('unlink-recurrence')
        break
      default:
        break
    }
  }

  // ── The tappable line ──
  /**
   * A tap on the line's quiet area is the primary action; a tap on any
   * control inside it is that control's. Checked by walking up from the
   * target rather than stopping propagation on each button, so a new
   * control cannot forget to.
   */
  function isInteractive(target: EventTarget | null): boolean {
    return (
      target instanceof Element &&
      target.closest('button, a, input, select, textarea, [role="menu"]') !==
        null
    )
  }

  function onCardClick(event: MouseEvent): void {
    if (isInteractive(event.target)) return
    if (props.selectionMode) emit('toggle-select')
    else if (!props.isEditingNote) emit('open-category')
  }

  function onGridClick(event: MouseEvent): void {
    if (!props.selectionMode || isInteractive(event.target)) return
    emit('toggle-select')
  }
</script>

<template>
  <div
    class="group border-l-4 px-4 py-2.5 transition-colors hover:bg-gray-50 lg:py-3 dark:hover:bg-slate-800"
    :class="[
      {
        'bg-primary-50/50 dark:bg-primary-900/10': selectionMode && selected,
      },
      // A subscription or a smoothed line reads apart at a glance by its
      // edge. The left edge only: the divider below the row keeps the
      // list's colour.
      edgeClass,
    ]"
    :data-recurring="transaction.recurrence ? 'true' : undefined"
  >
    <!-- ==================== CARD (below lg) ==================== -->
    <div
      class="lg:hidden"
      :class="selectionMode || !isEditingNote ? 'cursor-pointer' : ''"
      data-testid="row-card"
      @click="onCardClick"
    >
      <div class="flex items-center gap-3">
        <!-- Selection checkbox (replaces the icon in selection mode) -->
        <div
          v-if="selectionMode"
          class="flex h-9 w-9 shrink-0 items-center justify-center"
        >
          <input
            type="checkbox"
            :checked="selected"
            :aria-label="`Sélectionner ${transaction.description}`"
            class="h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-primary-400"
            @change="emit('toggle-select')"
          />
        </div>

        <!-- Category icon: the same action as the line, made explicit -->
        <button
          v-else
          type="button"
          class="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm transition-colors pointer-coarse:before:absolute pointer-coarse:before:-inset-1 pointer-coarse:before:content-['']"
          :class="iconClass"
          :aria-label="`Catégorie : ${categoryLabel}, modifier`"
          @click="emit('open-category')"
        >
          {{
            transaction.categoryIcon ||
            (transaction.categoryName
              ? transaction.categoryName.charAt(0)
              : '?')
          }}
        </button>

        <!-- Description + meta line -->
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <span
              class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
              :title="transaction.description"
            >
              {{ transaction.description }}
            </span>
            <span class="shrink-0 text-sm font-semibold" :class="amountClass">
              {{ formatCurrency(transaction.amount) }}
            </span>
          </div>
          <div class="flex items-center justify-between gap-2">
            <div
              class="flex min-w-0 items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400"
            >
              <span class="shrink-0">{{ formatDate(transaction.date) }}</span>
              <span class="text-gray-300 dark:text-gray-600" aria-hidden="true"
                >&middot;</span
              >
              <button
                type="button"
                class="relative min-w-0 truncate transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-3.5 pointer-coarse:before:content-[''] hover:text-gray-700 dark:hover:text-gray-300"
                :title="categoryLabel"
                @click="emit('open-category')"
              >
                {{ categoryLabel }}
              </button>
              <!-- Reimbursement inline badge -->
              <template v-if="isExpense && reimbursements.length > 0">
                <span
                  class="text-gray-300 dark:text-gray-600"
                  aria-hidden="true"
                  >&middot;</span
                >
                <button
                  type="button"
                  class="relative inline-flex min-h-[24px] shrink-0 items-center gap-1 rounded-full px-1.5 text-[11px] font-medium transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2.5 pointer-coarse:before:content-['']"
                  :class="
                    reimbursementSummary.allCompleted
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300'
                      : 'bg-debt-100 dark:bg-debt-900/30 text-debt-700 dark:text-debt-300'
                  "
                  :aria-expanded="reimbursementsExpanded"
                  @click="emit('toggle-reimbursements')"
                >
                  <IconCheck
                    v-if="reimbursementSummary.allCompleted"
                    class="h-3 w-3"
                    :stroke-width="2.5"
                  />
                  <IconClock v-else class="h-3 w-3" />
                  <span v-if="reimbursementSummary.allCompleted"
                    >Remboursé</span
                  >
                  <template v-else>
                    {{ formatCurrency(reimbursementSummary.totalAmount) }}
                    <span class="opacity-70">en attente</span>
                  </template>
                </button>
              </template>
            </div>

            <!-- Pointed toggle + the actions on demand -->
            <div class="-my-1 -mr-2 flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                class="relative flex h-8 w-8 items-center justify-center rounded-lg transition-colors pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5 pointer-coarse:before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
                :class="
                  transaction.isPointed
                    ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400'
                    : 'text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-gray-500 dark:hover:bg-slate-700'
                "
                :title="transaction.isPointed ? 'Dépointer' : 'Pointer'"
                :aria-label="transaction.isPointed ? 'Dépointer' : 'Pointer'"
                @click="emit('toggle-pointed')"
              >
                <IconCheck class="h-4 w-4" :stroke-width="2.5" />
              </button>
              <BaseMenu
                v-if="!selectionMode"
                ref="menu"
                label="Autres actions"
                :items="menuItems"
                data-testid="row-menu"
                @select="onMenuSelect"
              />
            </div>
          </div>
        </div>
      </div>

      <!-- ── The note, when there is one (tap to edit) ── -->
      <div v-if="transaction.note && !isEditingNote" class="ml-12">
        <button
          type="button"
          class="relative block max-w-full truncate text-left text-xs italic text-gray-500 pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-3.5 pointer-coarse:before:content-[''] hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
          :title="transaction.note"
          @click="emit('start-note')"
        >
          {{ transaction.note }}
        </button>
      </div>

      <!-- Note editor -->
      <div v-if="isEditingNote" class="ml-12 mt-1.5">
        <TransactionNoteEditor
          v-model="noteDraft"
          dense
          @save="emit('save-note', noteDraft)"
          @cancel="emit('cancel-note')"
        />
      </div>

      <!-- Settlement links (one per person settled by this income) -->
      <div
        v-if="transaction.type === 'INCOME' && transaction.settlements?.length"
        class="ml-10 mt-0.5 flex flex-wrap items-center gap-1"
      >
        <TransactionSettlementLinks
          :settlements="transaction.settlements"
          :disabled="settlementLoading"
          dense
          @open="s => emit('open-settlement', s)"
        />
      </div>

      <!-- ── Expanded reimbursements ── -->
      <div
        v-if="isExpense && reimbursementsExpanded && reimbursements.length > 0"
        class="ml-12 mt-1.5"
      >
        <TransactionReimbursementList
          :reimbursements="reimbursements"
          dense
          @delete="id => emit('delete-reimbursement', id)"
        />
      </div>
    </div>

    <!-- ==================== TABLE ROW (lg and up) ==================== -->
    <div
      class="hidden items-center gap-2 lg:grid"
      :class="[
        rowGridClass(selectionMode),
        selectionMode ? 'cursor-pointer' : '',
      ]"
      data-testid="row-grid"
      @click="onGridClick"
    >
      <!-- Checkbox -->
      <div v-if="selectionMode" class="flex items-center">
        <input
          type="checkbox"
          :checked="selected"
          :aria-label="`Sélectionner ${transaction.description}`"
          class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700 dark:text-primary-400"
          data-testid="select-row-desktop"
          @change="emit('toggle-select')"
        />
      </div>

      <!-- Date -->
      <div class="text-sm tabular-nums text-gray-600 dark:text-gray-400">
        {{ formatDate(transaction.date) }}
      </div>

      <!-- Description -->
      <div
        class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
        :title="transaction.description"
      >
        {{ transaction.description }}
      </div>

      <!-- Note (editable); the « + Note » affordance shows on hover or focus -->
      <div class="min-w-0">
        <TransactionNoteEditor
          v-if="isEditingNote"
          v-model="noteDraft"
          @save="emit('save-note', noteDraft)"
          @cancel="emit('cancel-note')"
        />
        <button
          v-else
          type="button"
          class="block w-full truncate rounded text-left text-sm text-gray-500 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:text-gray-300"
          :title="transaction.note ?? 'Ajouter une note'"
          @click="emit('start-note')"
        >
          <span v-if="transaction.note" class="block truncate">{{
            transaction.note
          }}</span>
          <span
            v-else
            class="opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
            >+ Note</span
          >
        </button>
      </div>

      <!-- Amount -->
      <div class="text-right text-sm font-semibold tabular-nums">
        <span :class="amountClass">
          {{ formatCurrency(transaction.amount) }}
        </span>
      </div>

      <!-- Category (clickable to open modal) -->
      <div class="min-w-0">
        <button
          type="button"
          class="inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1"
          :class="categoryPillClass"
          :title="`${categoryLabel} — modifier`"
          @click="emit('open-category')"
        >
          <span class="truncate"
            >{{ transaction.categoryIcon ? transaction.categoryIcon + ' ' : ''
            }}{{ categoryLabel }}</span
          >
          <IconPencil class="h-3 w-3 shrink-0 opacity-50" />
        </button>
      </div>

      <!-- Pointed status (toggle) -->
      <div class="flex justify-center">
        <button
          type="button"
          class="relative flex h-8 w-8 items-center justify-center rounded-full transition-colors pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5 pointer-coarse:before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          :class="
            transaction.isPointed
              ? 'bg-primary-100 text-primary-700 hover:bg-primary-200 dark:bg-primary-900/30 dark:text-primary-400 dark:hover:bg-primary-900/50'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-400 dark:hover:bg-slate-600'
          "
          :title="transaction.isPointed ? 'Dépointer' : 'Pointer'"
          :aria-label="transaction.isPointed ? 'Dépointer' : 'Pointer'"
          @click="emit('toggle-pointed')"
        >
          <IconCheck
            v-if="transaction.isPointed"
            class="h-4 w-4"
            :stroke-width="2.5"
          />
          <IconClose v-else class="h-4 w-4" />
        </button>
      </div>

      <!-- Actions: the primary one always drawn, the secondary ones
           (étiquette, abonnement) on hover or focus within the row -->
      <div class="flex items-center justify-end gap-1">
        <BaseButton
          v-if="canAssign"
          size="sm"
          variant="tinted"
          class="whitespace-nowrap"
          @click="emit('open-reimbursement')"
        >
          <IconPlus class="h-3.5 w-3.5" />
          Assigner
        </BaseButton>
        <span
          v-else-if="isExpense"
          class="px-2 text-xs font-medium text-gray-500 dark:text-gray-400"
        >
          Assigné
        </span>
        <!-- Settlement links (one per person settled by this income) -->
        <div
          v-else-if="transaction.type === 'INCOME' && transaction.settlements"
          class="flex flex-wrap justify-end gap-1"
        >
          <TransactionSettlementLinks
            :settlements="transaction.settlements"
            :disabled="settlementLoading"
            @open="s => emit('open-settlement', s)"
          />
        </div>
        <TagSelector
          v-if="!selectionMode"
          :selected-tag-ids="tagIds"
          :tags="allTags"
          icon-only
          :trigger-class="REVEAL_ON_HOVER"
          @attach="id => emit('attach-tag', id)"
          @detach="id => emit('detach-tag', id)"
          @create="name => emit('create-tag', name)"
        />
        <!-- Follow as a subscription: for a charge detection cannot see
             yet, an annual plan paid once. -->
        <BaseIconButton
          v-if="canFollow && !selectionMode"
          size="sm"
          label="Suivre comme abonnement"
          :class="REVEAL_ON_HOVER"
          data-testid="mark-recurring"
          @click="emit('mark-recurring')"
        >
          <IconArrowPath />
        </BaseIconButton>
        <!-- Keeps « Assigner » in the same place on rows that cannot be
             followed (already a subscription, income). -->
        <span
          v-else-if="!selectionMode"
          aria-hidden="true"
          class="h-8 w-8 shrink-0"
          data-testid="mark-recurring-placeholder"
        />
        <!-- Smooth over several months: an expense only. A smoothed row
             reaches the dialog through its badge too. -->
        <BaseIconButton
          v-if="canSmooth && !selectionMode"
          size="sm"
          :label="
            amortizationMonths !== null
              ? `Étalé sur ${amortizationMonths} mois, modifier`
              : 'Étaler sur plusieurs mois'
          "
          :class="REVEAL_ON_HOVER"
          data-testid="open-amortization"
          @click="emit('open-amortization')"
        >
          <IconCalendar />
        </BaseIconButton>
        <span
          v-else-if="!selectionMode"
          aria-hidden="true"
          class="h-8 w-8 shrink-0"
        />
      </div>
    </div>

    <!--
      Tags line (both layouts), drawn only when it has something to show:
      the subscription badge, the tags. The phone's tag picker also hangs
      here, its trigger hidden: the « … » menu opens it, and its panel then
      appears where the tags are.
    -->
    <div
      class="flex flex-wrap items-center gap-1.5 ml-12 lg:ml-2"
      :class="hasTagLineContent ? 'mt-1.5 lg:mt-2' : ''"
      data-testid="row-tags"
    >
      <button
        v-if="transaction.recurrence"
        type="button"
        class="relative inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        :class="
          transaction.recurrence.status === 'ACTIVE'
            ? 'bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
        "
        :title="`Voir toutes les échéances de ${transaction.recurrence.label}`"
        data-testid="recurrence-badge"
        @click="emit('show-recurrence')"
      >
        <IconArrowPath class="h-3.5 w-3.5" />
        {{ transaction.recurrence.name }} ·
        {{ RECURRENCE_PERIOD_LABELS[transaction.recurrence.period] }}
        <template v-if="transaction.recurrence.status === 'STOPPED'">
          · terminé
        </template>
      </button>
      <BaseIconButton
        v-if="transaction.recurrence?.linked && !selectionMode"
        size="sm"
        variant="danger"
        class="max-lg:hidden"
        :label="`Détacher de ${transaction.recurrence.name}`"
        data-testid="unlink-recurrence"
        @click="emit('unlink-recurrence')"
      >
        <IconClose />
      </BaseIconButton>
      <!-- A smoothed expense says so, and over how long, in the subscription
           badge's format but teal; the badge opens the dialog that changes
           or stops it. -->
      <button
        v-if="amortizationMonths !== null"
        type="button"
        class="relative inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-2 pointer-coarse:before:content-[''] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-default"
        :class="
          smoothingStatus === 'ACTIVE'
            ? 'bg-teal-50 text-teal-800 hover:bg-teal-100 disabled:hover:bg-teal-50 dark:bg-teal-900/30 dark:text-teal-300 dark:hover:bg-teal-900/50'
            : 'bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:hover:bg-gray-100 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600'
        "
        :title="`Compté en vie courante par tranches sur ${amortizationMonths} mois — modifier`"
        :disabled="selectionMode"
        data-testid="amortization-badge"
        @click="emit('open-amortization')"
      >
        <IconCalendar class="h-3.5 w-3.5" />
        Lissé · {{ amortizationMonths }} mois
        <template v-if="smoothingStatus === 'STOPPED'"> · terminé </template>
        <span class="sr-only">, modifier l'étalement</span>
      </button>
      <TagChip
        v-for="t in transaction.tags ?? []"
        :key="t.id"
        :name="t.name"
        :color="t.color"
        :icon="t.icon"
        :to="transactionsLink({ tagId: t.id, label: t.name })"
        dense
        removable
        @remove="emit('detach-tag', t.id)"
      />
      <TagSelector
        v-if="!selectionMode"
        ref="tagSelector"
        class="lg:hidden"
        :selected-tag-ids="tagIds"
        :tags="allTags"
        hide-trigger
        @attach="id => emit('attach-tag', id)"
        @detach="id => emit('detach-tag', id)"
        @create="name => emit('create-tag', name)"
      />
    </div>

    <!-- Reimbursements for this transaction (table only; the card expands on demand) -->
    <div
      v-if="isExpense && reimbursements.length > 0"
      class="hidden lg:block mt-2 ml-8"
    >
      <TransactionReimbursementList
        :reimbursements="reimbursements"
        :remaining-amount="remainingAmount"
        @delete="id => emit('delete-reimbursement', id)"
      />
    </div>
  </div>
</template>

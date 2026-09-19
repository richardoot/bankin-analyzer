<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import type {
    ReimbursementDto,
    TagDto,
    TransactionDto,
    TransactionSettlementSummaryDto,
  } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import TagChip from '@/components/tags/TagChip.vue'
  import TagSelector from '@/components/tags/TagSelector.vue'
  import TransactionNoteEditor from './TransactionNoteEditor.vue'
  import TransactionReimbursementList from './TransactionReimbursementList.vue'
  import TransactionSettlementLinks from './TransactionSettlementLinks.vue'

  /**
   * One transaction, one declaration.
   *
   * The row used to exist twice in the page — a card layout for mobile, a
   * grid for desktop — and every field, badge and action had to be written
   * (and fixed) in both. The two arrangements still exist, but side by side
   * in this file, composing the same leaf pieces (note editor,
   * reimbursement list, settlement links) declared exactly once.
   *
   * The page stays the orchestrator: it owns the data and the API calls,
   * and keeps the single-editor / single-expansion invariants (only one row
   * edits its note at a time). The row owns nothing but its note draft.
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
  }>()

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

  const reimbursementSummary = computed(() => {
    const total = props.reimbursements.reduce((sum, r) => sum + r.amount, 0)
    return {
      totalAmount: total,
      allCompleted: props.reimbursements.every(r => r.status === 'COMPLETED'),
    }
  })

  const tagIds = computed(() => (props.transaction.tags ?? []).map(t => t.id))

  function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }
</script>

<template>
  <div
    class="px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
    :class="{
      'bg-primary-50/50 dark:bg-primary-900/10': selectionMode && selected,
    }"
  >
    <!-- ==================== MOBILE CARD LAYOUT ==================== -->
    <div class="block md:hidden">
      <!-- ── Compact row: icon + description + amount ── -->
      <div class="flex items-center gap-3 min-h-[52px]">
        <!-- Selection checkbox (replaces icon in selection mode) -->
        <div
          v-if="selectionMode"
          class="flex items-center justify-center w-9 h-9 shrink-0"
        >
          <input
            type="checkbox"
            :checked="selected"
            class="h-5 w-5 text-primary-600 dark:text-primary-500 border-gray-300 dark:border-slate-600 rounded focus:ring-primary-500 dark:bg-slate-700"
            @change="emit('toggle-select')"
          />
        </div>

        <!-- Category icon -->
        <button
          v-else
          class="flex items-center justify-center w-9 h-9 rounded-xl text-sm shrink-0 transition-colors"
          :class="
            transaction.categoryName
              ? isExpense
                ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400'
                : 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
          "
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
        <div class="flex-1 min-w-0">
          <div class="flex items-baseline justify-between gap-2">
            <span
              class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
            >
              {{ transaction.description }}
            </span>
            <span
              class="text-sm font-semibold shrink-0"
              :class="
                isExpense
                  ? 'text-red-600 dark:text-red-500'
                  : 'text-green-600 dark:text-green-500'
              "
            >
              {{ formatCurrency(transaction.amount) }}
            </span>
          </div>
          <div class="flex items-center justify-between mt-0.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <span class="text-xs text-gray-500 dark:text-gray-400 shrink-0">
                {{ formatDate(transaction.date) }}
              </span>
              <span class="text-xs text-gray-300 dark:text-gray-600 shrink-0"
                >&middot;</span
              >
              <button
                class="relative truncate text-xs text-gray-500 transition-colors pointer-coarse:before:absolute pointer-coarse:before:inset-x-0 pointer-coarse:before:-inset-y-3 pointer-coarse:before:content-[''] hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300"
                @click="emit('open-category')"
              >
                {{ transaction.categoryName || 'Sans catégorie' }}
              </button>
              <!-- Reimbursement inline badge -->
              <template v-if="isExpense && reimbursements.length > 0">
                <span class="text-xs text-gray-300 dark:text-gray-600 shrink-0"
                  >&middot;</span
                >
                <button
                  class="inline-flex items-center gap-1 shrink-0 px-1.5 py-0.5 rounded-full text-[11px] font-medium transition-colors"
                  :class="
                    reimbursementSummary.allCompleted
                      ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                      : 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                  "
                  @click="emit('toggle-reimbursements')"
                >
                  <svg
                    class="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      v-if="reimbursementSummary.allCompleted"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2.5"
                      d="M5 13l4 4L19 7"
                    />
                    <path
                      v-else
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
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
            <!-- Pointed toggle -->
            <button
              class="relative -my-1 -mr-1.5 ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors pointer-coarse:before:absolute pointer-coarse:before:-inset-1 pointer-coarse:before:content-['']"
              :class="
                transaction.isPointed
                  ? 'bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400'
                  : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400'
              "
              :title="transaction.isPointed ? 'Depointer' : 'Pointer'"
              @click="emit('toggle-pointed')"
            >
              <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>

      <!-- ── Inline note (shown only if exists or editing) ── -->
      <div v-if="transaction.note && !isEditingNote" class="ml-12 mt-0.5">
        <button
          class="text-xs text-gray-500 dark:text-gray-400 italic truncate max-w-full text-left"
          @click="emit('start-note')"
        >
          {{ transaction.note }}
        </button>
      </div>

      <!-- Note editor -->
      <div v-if="isEditingNote" class="mt-1.5">
        <TransactionNoteEditor
          v-model="noteDraft"
          dense
          @save="emit('save-note', noteDraft)"
          @cancel="emit('cancel-note')"
        />
      </div>

      <!-- ── Quick action bar (contextual, compact) ── -->
      <div v-if="!selectionMode" class="ml-10 mt-0.5 flex items-center gap-1">
        <!-- Add note -->
        <button
          v-if="!transaction.note && !isEditingNote"
          class="inline-flex min-h-[36px] items-center rounded px-2.5 text-xs text-gray-500 transition-colors hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-slate-700"
          @click="emit('start-note')"
        >
          + Note
        </button>
        <!-- Assign reimbursement -->
        <button
          v-if="isExpense && remainingAmount > 0"
          class="inline-flex min-h-[36px] items-center rounded px-2.5 text-xs text-amber-600 transition-colors hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/20"
          @click="emit('open-reimbursement')"
        >
          + Remb.
        </button>
        <span
          v-else-if="
            isExpense && reimbursements.length > 0 && remainingAmount <= 0
          "
          class="inline-flex min-h-[36px] items-center px-2.5 text-xs text-green-500 dark:text-green-400"
        >
          Assigne
        </span>
        <!-- Settlement links (one per person settled by this income) -->
        <TransactionSettlementLinks
          v-if="transaction.type === 'INCOME' && transaction.settlements"
          :settlements="transaction.settlements"
          :disabled="settlementLoading"
          dense
          @open="s => emit('open-settlement', s)"
        />
      </div>

      <!-- ── Expanded reimbursements ── -->
      <div
        v-if="isExpense && reimbursementsExpanded && reimbursements.length > 0"
        class="mt-1.5"
      >
        <TransactionReimbursementList
          :reimbursements="reimbursements"
          dense
          @delete="id => emit('delete-reimbursement', id)"
        />
      </div>
    </div>

    <!-- ==================== DESKTOP GRID LAYOUT ==================== -->
    <div
      class="hidden md:grid gap-2 items-center"
      :class="selectionMode ? 'grid-cols-12' : 'grid-cols-11'"
    >
      <!-- Checkbox -->
      <div v-if="selectionMode" class="col-span-1 flex items-center">
        <input
          type="checkbox"
          :checked="selected"
          class="h-4 w-4 text-primary-600 dark:text-primary-500 border-gray-300 dark:border-slate-600 rounded focus:ring-primary-500 dark:focus:ring-primary-400 dark:bg-slate-700"
          data-testid="select-row-desktop"
          @change="emit('toggle-select')"
        />
      </div>

      <!-- Date -->
      <div class="col-span-1 text-sm text-gray-600 dark:text-gray-400">
        {{ formatDate(transaction.date) }}
      </div>

      <!-- Description -->
      <div
        class="col-span-3 text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
      >
        {{ transaction.description }}
      </div>

      <!-- Note (editable) -->
      <div class="col-span-2">
        <TransactionNoteEditor
          v-if="isEditingNote"
          v-model="noteDraft"
          @save="emit('save-note', noteDraft)"
          @cancel="emit('cancel-note')"
        />
        <button
          v-else
          class="w-full text-left text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 truncate group"
          :title="transaction.note ?? 'Cliquer pour ajouter une note'"
          @click="emit('start-note')"
        >
          <span v-if="transaction.note" class="block truncate">{{
            transaction.note
          }}</span>
          <span
            v-else
            class="text-gray-300 dark:text-gray-600 group-hover:text-gray-400 dark:group-hover:text-gray-500"
            >+ Note</span
          >
        </button>
      </div>

      <!-- Amount -->
      <div class="col-span-1 text-sm font-semibold text-right">
        <span
          :class="
            isExpense
              ? 'text-red-600 dark:text-red-500'
              : 'text-green-600 dark:text-green-500'
          "
        >
          {{ formatCurrency(transaction.amount) }}
        </span>
      </div>

      <!-- Category (clickable to open modal) -->
      <div class="col-span-2">
        <button
          class="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full transition-colors"
          :class="
            transaction.categoryName
              ? isExpense
                ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/50'
                : 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
          "
          @click="emit('open-category')"
        >
          {{ transaction.categoryIcon ? transaction.categoryIcon + ' ' : ''
          }}{{ transaction.categoryName || 'Sans catégorie' }}
          <svg
            class="h-3 w-3 opacity-50"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
            />
          </svg>
        </button>
      </div>

      <!-- Pointed status (toggle) -->
      <div class="col-span-1 flex justify-center">
        <button
          class="p-1 rounded-full transition-colors"
          :class="
            transaction.isPointed
              ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-900/50'
              : 'bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-slate-600'
          "
          :title="transaction.isPointed ? 'Depointer' : 'Pointer'"
          @click="emit('toggle-pointed')"
        >
          <svg
            v-if="transaction.isPointed"
            class="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clip-rule="evenodd"
            />
          </svg>
          <svg v-else class="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>

      <!-- Actions -->
      <div class="col-span-1 flex justify-center">
        <button
          v-if="isExpense && remainingAmount > 0"
          class="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          @click="emit('open-reimbursement')"
        >
          <svg
            class="h-3.5 w-3.5"
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
          Assigner
        </button>
        <span
          v-else-if="isExpense"
          class="text-xs text-green-600 dark:text-green-400 font-medium"
        >
          Assigne
        </span>
        <!-- Settlement links (one per person settled by this income) -->
        <div
          v-else-if="transaction.type === 'INCOME' && transaction.settlements"
          class="flex flex-wrap justify-center gap-1"
        >
          <TransactionSettlementLinks
            :settlements="transaction.settlements"
            :disabled="settlementLoading"
            @open="s => emit('open-settlement', s)"
          />
        </div>
      </div>
    </div>

    <!-- Tags line (both layouts) -->
    <div class="flex flex-wrap items-center gap-1.5 mt-2 ml-12 md:ml-2">
      <TagChip
        v-for="t in transaction.tags ?? []"
        :key="t.id"
        :name="t.name"
        :color="t.color"
        :icon="t.icon"
        dense
        removable
        @remove="emit('detach-tag', t.id)"
      />
      <TagSelector
        v-if="!selectionMode"
        :selected-tag-ids="tagIds"
        :tags="allTags"
        @attach="id => emit('attach-tag', id)"
        @detach="id => emit('detach-tag', id)"
        @create="name => emit('create-tag', name)"
      />
    </div>

    <!-- Reimbursements for this transaction (desktop only; mobile expands on demand) -->
    <div
      v-if="isExpense && reimbursements.length > 0"
      class="hidden md:block mt-2 ml-4 md:ml-8"
    >
      <TransactionReimbursementList
        :reimbursements="reimbursements"
        :remaining-amount="remainingAmount"
        @delete="id => emit('delete-reimbursement', id)"
      />
    </div>
  </div>
</template>

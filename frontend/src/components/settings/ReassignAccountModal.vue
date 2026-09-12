<script setup lang="ts">
  /**
   * Confirms correcting which account a bank account is, once a sync has
   * already written something under the old one.
   *
   * The preview is computed by the caller before this even opens — a link
   * nothing was ever written under skips this entirely and applies straight
   * through. Reaching this dialog means at least one thing here is not a
   * no-op: a row moving, two rows merging, a reference being dropped, or a
   * row left alone because it carries work since.
   */
  import { ref } from 'vue'
  import { useModalA11y } from '@/composables/useModalA11y'
  import { api } from '@/lib/api'
  import type { ReassignmentOutcomeDto } from '@/lib/api'

  export interface PendingReassignment {
    linkId: string
    bankAccountName: string
    /** Where its rows sit today — shown when clearing to "aucun" leaves them there. */
    currentAccountLabel: string | null
    targetAccountId: string | null
    targetAccountLabel: string
    preview: ReassignmentOutcomeDto
  }

  const props = defineProps<{
    pending: PendingReassignment | null
  }>()

  const emit = defineEmits<{
    close: []
    reassigned: [ReassignmentOutcomeDto]
  }>()

  // Escape closes, Tab stays inside, focus returns to the opener after.
  const modalPanelRef = ref<HTMLElement | null>(null)
  useModalA11y({
    isOpen: () => props.pending !== null,
    onClose: () => emit('close'),
    panel: modalPanelRef,
  })

  const applying = ref(false)
  const error = ref<string | null>(null)

  const LINES: {
    key: keyof ReassignmentOutcomeDto
    label: (n: number) => string
    tone: string
  }[] = [
    {
      key: 'moved',
      label: n =>
        `${n} transaction${n > 1 ? 's' : ''} déplacée${n > 1 ? 's' : ''}`,
      tone: 'text-gray-700 dark:text-gray-300',
    },
    {
      key: 'merged',
      label: n =>
        `${n} déjà présente${n > 1 ? 's' : ''} sur le nouveau compte, fusionnée${n > 1 ? 's' : ''}`,
      tone: 'text-gray-700 dark:text-gray-300',
    },
    {
      key: 'unlinked',
      label: n =>
        `${n} référence${n > 1 ? 's' : ''} bancaire${n > 1 ? 's' : ''} retirée${n > 1 ? 's' : ''} — la transaction reste, sans lien vers la banque`,
      tone: 'text-gray-700 dark:text-gray-300',
    },
    {
      key: 'blockedByWork',
      label: n =>
        `${n} laissée${n > 1 ? 's' : ''} de côté : déjà catégorisée, taguée ou remboursée depuis`,
      tone: 'text-amber-700 dark:text-amber-400',
    },
    {
      key: 'ambiguous',
      label: n =>
        `${n} à trancher vous-même : plusieurs comptes se ressemblent trop`,
      tone: 'text-amber-700 dark:text-amber-400',
    },
  ]

  async function confirm(): Promise<void> {
    if (!props.pending) return
    applying.value = true
    error.value = null
    try {
      const outcome = await api.reassignLink(
        props.pending.linkId,
        props.pending.targetAccountId
      )
      emit('reassigned', outcome)
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Correction impossible'
    } finally {
      applying.value = false
    }
  }
</script>

<template>
  <div
    v-if="pending"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
    data-testid="reassign-modal"
  >
    <div
      ref="modalPanelRef"
      role="dialog"
      aria-modal="true"
      class="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl dark:bg-slate-900"
    >
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Corriger « {{ pending.bankAccountName }} »
      </h2>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-400">
        Une synchronisation a déjà écrit sous l'ancien compte. La corriger vers
        <strong>{{ pending.targetAccountLabel }}</strong> va :
      </p>

      <ul class="mt-4 space-y-1.5 text-sm">
        <li
          v-for="line in LINES.filter(
            l => pending && pending.preview[l.key] > 0
          )"
          :key="line.key"
          :class="line.tone"
          :data-testid="`reassign-line-${line.key}`"
        >
          • {{ line.label(pending.preview[line.key]) }}
        </li>
      </ul>

      <!-- "— aucun —" doesn't move anything: it only stops the sync's claim
           on rows that are, right now, staying exactly where they landed. -->
      <p
        v-if="pending.targetAccountId === null && pending.currentAccountLabel"
        class="mt-3 rounded-lg bg-sky-50 p-3 text-sm text-sky-800 dark:bg-sky-900/20 dark:text-sky-200"
        data-testid="reassign-aucun-hint"
      >
        Ces transactions resteront sur
        <strong>{{ pending.currentAccountLabel }}</strong
        >. Si vous connaissez déjà le bon compte, choisissez-le directement dans
        la liste plutôt que de passer par « — aucun — ».
      </p>

      <p
        v-if="error"
        role="alert"
        class="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
      >
        {{ error }}
      </p>

      <div class="mt-6 flex justify-end gap-3">
        <button
          type="button"
          data-testid="reassign-cancel"
          :disabled="applying"
          class="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600"
          @click="emit('close')"
        >
          Annuler
        </button>
        <button
          type="button"
          data-testid="reassign-confirm"
          :disabled="applying"
          class="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-50"
          @click="confirm"
        >
          {{ applying ? 'Correction…' : 'Corriger' }}
        </button>
      </div>
    </div>
  </div>
</template>

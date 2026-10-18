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
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
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
  <BaseModal
    :open="pending !== null"
    :title="pending ? `Corriger « ${pending.bankAccountName} »` : undefined"
    max-width="lg"
    :closable="!applying"
    data-testid="reassign-modal"
    @close="emit('close')"
  >
    <template v-if="pending">
      <p class="text-sm text-gray-600 dark:text-gray-400">
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
      <InlineAlert
        v-if="pending.targetAccountId === null && pending.currentAccountLabel"
        variant="info"
        class="mt-3"
        data-testid="reassign-aucun-hint"
      >
        Ces transactions resteront sur
        <strong>{{ pending.currentAccountLabel }}</strong
        >. Si vous connaissez déjà le bon compte, choisissez-le directement dans
        la liste plutôt que de passer par « — aucun — ».
      </InlineAlert>

      <InlineAlert v-if="error" class="mt-4">{{ error }}</InlineAlert>
    </template>

    <template #footer>
      <BaseButton
        variant="secondary"
        data-testid="reassign-cancel"
        :disabled="applying"
        @click="emit('close')"
      >
        Annuler
      </BaseButton>
      <BaseButton
        data-testid="reassign-confirm"
        :loading="applying"
        @click="confirm"
      >
        Corriger
      </BaseButton>
    </template>
  </BaseModal>
</template>

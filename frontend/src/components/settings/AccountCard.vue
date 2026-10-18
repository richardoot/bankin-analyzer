<script setup lang="ts">
  /**
   * One account, expandable: its name, its type, the divisor applied to its
   * amounts, and whether it counts in statistics and budgets.
   *
   * Extracted out of the settings page so the same card can appear twice —
   * once under the bank connection that reads it, once among the accounts no
   * bank has ever heard of — without a bank-specific detail leaking into
   * either. Whatever a bank has to say about this account arrives through the
   * `bank-link` slot instead.
   */
  import { ref } from 'vue'
  import { useAccountsStore } from '@/stores/accounts'
  import { useToast } from '@/composables/useToast'
  import type { AccountDto, AccountType } from '@/lib/api'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'

  const props = defineProps<{
    account: AccountDto
    expanded: boolean
    /**
     * Rows a bank sync inserted or claimed on this account and then lost the
     * reference to — cleared to "aucun", or a correction still pending on
     * the other side of a swap. Still real, still here; just waiting for
     * someone to say where they actually belong.
     */
    needsReviewCount?: number | undefined
  }>()

  const emit = defineEmits<{
    toggle: []
    'ask-delete': []
  }>()

  const accountsStore = useAccountsStore()
  const toast = useToast()

  const ACCOUNT_TYPES: { value: AccountType; label: string; hint: string }[] = [
    { value: 'STANDARD', label: 'Courant', hint: 'Montants pris tels quels' },
    {
      value: 'JOINT',
      label: 'Joint',
      hint: 'Montants divisés (÷2 par défaut)',
    },
    {
      value: 'INVESTMENT',
      label: 'Investissement',
      hint: 'Exclu du budget par défaut',
    },
  ]

  // ── Rename ────────────────────────────────────────────────────────────────
  const renameDraft = ref<string | null>(null)
  const renameError = ref<string | null>(null)
  const renameSaving = ref(false)

  function draft(): string {
    return renameDraft.value ?? props.account.name
  }

  function onDraftChange(value: string): void {
    renameDraft.value = value
    renameError.value = null
  }

  function isDraftDirty(): boolean {
    if (renameDraft.value === null) return false
    const trimmed = renameDraft.value.trim()
    return trimmed !== props.account.name && trimmed.length > 0
  }

  async function submitRename(): Promise<void> {
    const trimmed = renameDraft.value?.trim() ?? ''
    if (trimmed.length === 0 || trimmed === props.account.name) return

    renameSaving.value = true
    renameError.value = null
    try {
      await accountsStore.rename(props.account.id, trimmed)
      renameDraft.value = null
      toast.success(`Compte renommé en « ${trimmed} »`)
    } catch (err) {
      renameError.value =
        err instanceof Error ? err.message : 'Erreur lors du renommage'
    } finally {
      renameSaving.value = false
    }
  }

  function cancelRename(): void {
    renameDraft.value = null
    renameError.value = null
  }

  // ── Type, divisor, exclusions ─────────────────────────────────────────────
  // One in-flight flag for the whole card: every control here writes through
  // the same store, so they are disabled together while a write is pending.
  const saving = ref(false)

  async function withSaving(
    action: () => Promise<boolean>,
    successMessage: string
  ): Promise<void> {
    if (saving.value) return
    saving.value = true
    try {
      const ok = await action()
      if (ok) toast.success(successMessage)
      else toast.error('Erreur lors de la mise à jour du compte')
    } finally {
      saving.value = false
    }
  }

  async function setType(type: AccountType): Promise<void> {
    if (props.account.type === type) return
    const label = ACCOUNT_TYPES.find(t => t.value === type)?.label ?? type
    await withSaving(
      () => accountsStore.updateType(props.account.id, type),
      `« ${props.account.name} » passé en compte ${label.toLowerCase()}`
    )
  }

  /**
   * The divisor is committed on change (blur or Enter) rather than on every
   * keystroke — an intermediate "1" while typing "12" would otherwise be
   * saved. Out-of-range values are rejected by the backend, so clamp here.
   */
  async function setDivisor(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const parsed = Number.parseInt(input.value, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
      toast.error('Le diviseur doit être compris entre 1 et 10')
      // The refused value must not stay on screen as if it had been kept.
      input.value = String(props.account.divisor)
      return
    }
    if (parsed === props.account.divisor) return
    await withSaving(
      () => accountsStore.updateSettings(props.account.id, { divisor: parsed }),
      `Montants de « ${props.account.name} » divisés par ${parsed}`
    )
  }

  async function setExcludedFromStats(included: boolean): Promise<void> {
    await withSaving(
      () =>
        accountsStore.updateSettings(props.account.id, {
          isExcludedFromStats: !included,
        }),
      included
        ? `« ${props.account.name} » compté dans les statistiques`
        : `« ${props.account.name} » retiré des statistiques`
    )
  }

  async function setExcludedFromBudget(included: boolean): Promise<void> {
    await withSaving(
      () =>
        accountsStore.updateSettings(props.account.id, {
          isExcludedFromBudget: !included,
        }),
      included
        ? `« ${props.account.name} » compté dans les budgets`
        : `« ${props.account.name} » retiré des budgets`
    )
  }

  // ── Badges ────────────────────────────────────────────────────────────────
  // Small summary shown on the collapsed header so the card is readable
  // without opening it. Amber only for what needs a hand (« à réaffecter »);
  // the account's kind is information (blue), its exclusions a setting
  // (grey) — neither a warning nor a danger.
  function computeBadges(): { label: string; tone: string }[] {
    const list: { label: string; tone: string }[] = []
    if (props.needsReviewCount) {
      list.push({
        label: `${props.needsReviewCount} à réaffecter`,
        tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      })
    }
    if (props.account.type === 'JOINT') {
      list.push({
        label: `Joint ÷${props.account.divisor}`,
        tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      })
    } else if (props.account.type === 'INVESTMENT') {
      list.push({
        label: 'Investissement',
        tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      })
    } else if (props.account.divisor !== 1) {
      list.push({
        label: `÷${props.account.divisor}`,
        tone: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
      })
    }
    if (props.account.isExcludedFromStats) {
      list.push({
        label: 'Hors statistiques',
        tone: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
      })
    }
    if (props.account.isExcludedFromBudget) {
      list.push({
        label: 'Hors budget',
        tone: 'bg-gray-100 text-gray-700 dark:bg-slate-700 dark:text-gray-300',
      })
    }
    return list
  }
</script>

<template>
  <li
    class="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700"
    data-testid="account-card"
  >
    <!-- Collapsed header: name + badges, click to open -->
    <button
      type="button"
      class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
      :aria-expanded="expanded"
      @click="emit('toggle')"
    >
      <span
        class="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-gray-100"
      >
        {{ account.name }}
      </span>
      <!-- A phone shows the first badge and counts the rest: three of
           them side by side left the account name four characters. -->
      <span class="flex shrink-0 flex-wrap justify-end gap-1">
        <slot name="extra-badges" />
        <span
          v-for="(badge, index) in computeBadges()"
          :key="badge.label"
          class="rounded-full px-2 py-0.5 text-[10px] font-medium"
          :class="[badge.tone, index > 0 ? 'hidden sm:inline' : '']"
        >
          {{ badge.label }}
        </span>
        <span
          v-if="computeBadges().length > 1"
          class="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600 sm:hidden dark:bg-slate-700 dark:text-gray-300"
        >
          +{{ computeBadges().length - 1 }}
        </span>
      </span>
      <svg
        class="h-4 w-4 shrink-0 text-gray-400 transition-transform"
        :class="expanded ? 'rotate-180' : ''"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>

    <!-- Whatever a bank has to say about this account that is worth seeing
         without expanding anything — whether it is read, and any warning.
         Reassigning which account a bank slot means is rarer and lives in
         the expanded body instead, through `bank-link`. -->
    <div
      v-if="$slots['bank-summary']"
      class="border-t border-gray-100 px-4 py-3 dark:border-slate-700/60"
    >
      <slot name="bank-summary" />
    </div>

    <div
      v-show="expanded"
      class="space-y-5 border-t border-gray-200 px-4 py-4 dark:border-slate-700"
    >
      <!-- Name -->
      <div>
        <form
          class="flex flex-col gap-2 sm:flex-row sm:items-end"
          @submit.prevent="submitRename"
        >
          <BaseField
            label="Nom du compte"
            size="sm"
            type="text"
            class="flex-1"
            :model-value="draft()"
            :disabled="renameSaving"
            maxlength="100"
            @update:model-value="onDraftChange(String($event))"
          />
          <div class="flex gap-2">
            <BaseButton
              type="submit"
              size="sm"
              :disabled="!isDraftDirty()"
              :loading="renameSaving"
            >
              {{ renameSaving ? 'Enregistrement…' : 'Renommer' }}
            </BaseButton>
            <BaseButton
              v-if="isDraftDirty()"
              variant="secondary"
              size="sm"
              :disabled="renameSaving"
              @click="cancelRename"
            >
              Annuler
            </BaseButton>
          </div>
        </form>
        <p
          v-if="renameError"
          class="mt-2 text-sm text-red-600 dark:text-red-400"
          data-testid="rename-error"
        >
          {{ renameError }}
        </p>
      </div>

      <!-- Whatever a bank has to say about this account: linked or not,
           whether it is read, and any warning — the merged view's whole
           reason for existing. -->
      <slot name="bank-link" />

      <!-- Type -->
      <div>
        <span
          class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
        >
          Type de compte
        </span>
        <SegmentedControl
          :model-value="account.type"
          size="sm"
          :label="`Type du compte ${account.name}`"
          :disabled="saving"
          :options="
            ACCOUNT_TYPES.map(t => ({
              value: t.value,
              label: t.label,
              title: t.hint,
            }))
          "
          @update:model-value="setType($event)"
        />
      </div>

      <!-- Divisor -->
      <div>
        <div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
          <BaseField
            label="Diviseur des montants"
            size="sm"
            type="number"
            min="1"
            max="10"
            class="w-20"
            :model-value="account.divisor"
            :disabled="saving"
            @change="setDivisor($event)"
          />
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Chaque montant de ce compte est divisé par cette valeur dans le
            tableau de bord, le budget et les remboursements. Passer le compte
            en joint le règle sur 2.
          </p>
        </div>
      </div>

      <!-- Exclusions -->
      <div class="space-y-3">
        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Compter dans les statistiques
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Décochez pour sortir ce compte du tableau de bord.
            </p>
          </div>
          <ToggleSwitch
            :checked="!account.isExcludedFromStats"
            :loading="saving"
            :label="
              account.isExcludedFromStats
                ? `Compter ${account.name} dans les statistiques`
                : `Retirer ${account.name} des statistiques`
            "
            @change="setExcludedFromStats"
          />
        </div>

        <div class="flex items-center justify-between gap-3">
          <div>
            <p class="text-sm font-medium text-gray-700 dark:text-gray-300">
              Compter dans les budgets
            </p>
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Décochez pour sortir ce compte des budgets et des moyennes.
            </p>
          </div>
          <ToggleSwitch
            :checked="!account.isExcludedFromBudget"
            :loading="saving"
            :label="
              account.isExcludedFromBudget
                ? `Compter ${account.name} dans les budgets`
                : `Retirer ${account.name} des budgets`
            "
            @change="setExcludedFromBudget"
          />
        </div>
      </div>

      <div
        class="flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:flex-wrap dark:border-slate-700/60"
      >
        <BaseButton
          variant="danger-outline"
          size="sm"
          :disabled="saving"
          data-testid="delete-account"
          @click="emit('ask-delete')"
        >
          Supprimer le compte…
        </BaseButton>
      </div>
    </div>
  </li>
</template>

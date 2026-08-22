<script setup lang="ts">
  /**
   * Everything about one bank account lives in one expandable card: its name,
   * its type, the divisor applied to its amounts, and whether it counts in
   * statistics and budgets. Previously the name and the type were edited in
   * two separate sections of the preferences page.
   */
  import { computed, onMounted, ref } from 'vue'
  import { useAccountsStore } from '@/stores/accounts'
  import { useToast } from '@/composables/useToast'
  import type { AccountDto, AccountType } from '@/lib/api'
  import SettingsCard from '@/components/settings/SettingsCard.vue'
  import DeleteBankAccountModal from '@/components/settings/DeleteBankAccountModal.vue'
  import ToggleSwitch from '@/components/ToggleSwitch.vue'

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

  onMounted(() => accountsStore.load())

  // ── Expand / collapse ─────────────────────────────────────────────────────
  const expanded = ref<Set<string>>(new Set())

  function isExpanded(accountId: string): boolean {
    return expanded.value.has(accountId)
  }

  function toggleExpanded(accountId: string): void {
    const next = new Set(expanded.value)
    if (next.has(accountId)) next.delete(accountId)
    else next.add(accountId)
    expanded.value = next
  }

  // ── Rename ────────────────────────────────────────────────────────────────
  const renameDrafts = ref<Record<string, string>>({})
  const renameErrors = ref<Record<string, string | null>>({})
  const renameSaving = ref<Record<string, boolean>>({})

  function draftFor(account: AccountDto): string {
    return renameDrafts.value[account.id] ?? account.name
  }

  function onDraftChange(accountId: string, value: string): void {
    renameDrafts.value[accountId] = value
    renameErrors.value[accountId] = null
  }

  function isDraftDirty(account: AccountDto): boolean {
    const draft = renameDrafts.value[account.id]
    if (draft === undefined) return false
    const trimmed = draft.trim()
    return trimmed !== account.name && trimmed.length > 0
  }

  async function submitRename(account: AccountDto): Promise<void> {
    const draft = renameDrafts.value[account.id]?.trim() ?? ''
    if (draft.length === 0 || draft === account.name) return

    renameSaving.value[account.id] = true
    renameErrors.value[account.id] = null
    try {
      await accountsStore.rename(account.id, draft)
      delete renameDrafts.value[account.id]
      toast.success(`Compte renommé en « ${draft} »`)
    } catch (err) {
      renameErrors.value[account.id] =
        err instanceof Error ? err.message : 'Erreur lors du renommage'
    } finally {
      renameSaving.value[account.id] = false
    }
  }

  function cancelRename(accountId: string): void {
    delete renameDrafts.value[accountId]
    renameErrors.value[accountId] = null
  }

  // ── Type, divisor, exclusions ─────────────────────────────────────────────
  // One in-flight flag per account: every control in a card writes through the
  // same store, so they are disabled together while a write is pending.
  const saving = ref<Set<string>>(new Set())

  function isSaving(accountId: string): boolean {
    return saving.value.has(accountId)
  }

  async function withSaving(
    accountId: string,
    action: () => Promise<boolean>,
    successMessage: string
  ): Promise<void> {
    if (saving.value.has(accountId)) return
    const next = new Set(saving.value)
    next.add(accountId)
    saving.value = next
    try {
      const ok = await action()
      if (ok) toast.success(successMessage)
      else toast.error('Erreur lors de la mise à jour du compte')
    } finally {
      const after = new Set(saving.value)
      after.delete(accountId)
      saving.value = after
    }
  }

  async function setType(
    account: AccountDto,
    type: AccountType
  ): Promise<void> {
    if (account.type === type) return
    const label = ACCOUNT_TYPES.find(t => t.value === type)?.label ?? type
    await withSaving(
      account.id,
      () => accountsStore.updateType(account.id, type),
      `« ${account.name} » passé en compte ${label.toLowerCase()}`
    )
  }

  /**
   * The divisor is committed on change (blur or Enter) rather than on every
   * keystroke — an intermediate "1" while typing "12" would otherwise be
   * saved. Out-of-range values are rejected by the backend, so clamp here.
   */
  async function setDivisor(account: AccountDto, raw: string): Promise<void> {
    const parsed = Number.parseInt(raw, 10)
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 10) {
      toast.error('Le diviseur doit être compris entre 1 et 10')
      return
    }
    if (parsed === account.divisor) return
    await withSaving(
      account.id,
      () => accountsStore.updateSettings(account.id, { divisor: parsed }),
      `Montants de « ${account.name} » divisés par ${parsed}`
    )
  }

  async function setExcludedFromStats(
    account: AccountDto,
    included: boolean
  ): Promise<void> {
    await withSaving(
      account.id,
      () =>
        accountsStore.updateSettings(account.id, {
          isExcludedFromStats: !included,
        }),
      included
        ? `« ${account.name} » compté dans les statistiques`
        : `« ${account.name} » retiré des statistiques`
    )
  }

  async function setExcludedFromBudget(
    account: AccountDto,
    included: boolean
  ): Promise<void> {
    await withSaving(
      account.id,
      () =>
        accountsStore.updateSettings(account.id, {
          isExcludedFromBudget: !included,
        }),
      included
        ? `« ${account.name} » compté dans les budgets`
        : `« ${account.name} » retiré des budgets`
    )
  }

  // ── Badges ────────────────────────────────────────────────────────────────
  // Small summary shown on the collapsed header so the card is readable
  // without opening it.
  function badgesFor(account: AccountDto): { label: string; tone: string }[] {
    const badges: { label: string; tone: string }[] = []
    if (account.type === 'JOINT') {
      badges.push({
        label: `Joint ÷${account.divisor}`,
        tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      })
    } else if (account.type === 'INVESTMENT') {
      badges.push({
        label: 'Investissement',
        tone: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
      })
    } else if (account.divisor !== 1) {
      badges.push({
        label: `÷${account.divisor}`,
        tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300',
      })
    }
    if (account.isExcludedFromStats) {
      badges.push({
        label: 'Hors statistiques',
        tone: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
      })
    }
    if (account.isExcludedFromBudget) {
      badges.push({
        label: 'Hors budget',
        tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
      })
    }
    return badges
  }

  const accounts = computed(() => accountsStore.sortedAccounts)

  // ── Deletion ──────────────────────────────────────────────────────────────
  // The modal owns the whole safety sequence (impact preview, name
  // confirmation, error display); the page only says which account is aimed at
  // and reacts once it is gone.
  const accountPendingDeletion = ref<AccountDto | null>(null)

  function askDeletion(account: AccountDto): void {
    accountPendingDeletion.value = account
  }

  function onDeleted(payload: {
    account: AccountDto
    deletedTransactions: number
  }): void {
    accountPendingDeletion.value = null
    const next = new Set(expanded.value)
    next.delete(payload.account.id)
    expanded.value = next
    toast.success(
      `« ${payload.account.name} » supprimé (${payload.deletedTransactions} transaction${
        payload.deletedTransactions > 1 ? 's' : ''
      })`
    )
  }

  /** Merging still needs an endpoint the API does not expose yet. */
  const UNAVAILABLE_HINT =
    'Pas encore disponible : cette action nécessite un nouvel endpoint côté serveur.'
</script>

<template>
  <div class="space-y-8">
    <SettingsCard
      title="Comptes bancaires"
      description="Renommez un compte, choisissez comment ses montants sont comptés, et excluez-le des statistiques ou des budgets."
    >
      <div v-if="accountsStore.isLoading && accounts.length === 0" class="py-8">
        <p class="text-center text-sm text-gray-500 dark:text-gray-400">
          Chargement…
        </p>
      </div>

      <p
        v-else-if="accounts.length === 0"
        class="rounded-lg bg-gray-50 p-4 text-sm italic text-gray-500 dark:bg-slate-800 dark:text-gray-400"
      >
        Aucun compte disponible. Importez des transactions pour voir vos
        comptes.
      </p>

      <ul v-else class="space-y-3">
        <li
          v-for="account in accounts"
          :key="account.id"
          class="overflow-hidden rounded-xl border border-gray-200 dark:border-slate-700"
          data-testid="account-card"
        >
          <!-- Collapsed header: name + badges, click to open -->
          <button
            type="button"
            class="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
            :aria-expanded="isExpanded(account.id)"
            @click="toggleExpanded(account.id)"
          >
            <span
              class="min-w-0 flex-1 truncate font-medium text-gray-900 dark:text-gray-100"
            >
              {{ account.name }}
            </span>
            <span class="flex shrink-0 flex-wrap justify-end gap-1">
              <span
                v-for="badge in badgesFor(account)"
                :key="badge.label"
                class="rounded-full px-2 py-0.5 text-[10px] font-medium"
                :class="badge.tone"
              >
                {{ badge.label }}
              </span>
            </span>
            <svg
              class="h-4 w-4 shrink-0 text-gray-400 transition-transform"
              :class="isExpanded(account.id) ? 'rotate-180' : ''"
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

          <div
            v-show="isExpanded(account.id)"
            class="space-y-5 border-t border-gray-200 px-4 py-4 dark:border-slate-700"
          >
            <!-- Name -->
            <div>
              <label
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                :for="`account-name-${account.id}`"
              >
                Nom du compte
              </label>
              <form
                class="flex flex-col gap-2 sm:flex-row sm:items-center"
                @submit.prevent="submitRename(account)"
              >
                <input
                  :id="`account-name-${account.id}`"
                  type="text"
                  :value="draftFor(account)"
                  :disabled="renameSaving[account.id]"
                  maxlength="100"
                  class="flex-1 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                  @input="
                    onDraftChange(
                      account.id,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
                <div class="flex gap-2">
                  <button
                    type="submit"
                    :disabled="
                      !isDraftDirty(account) || renameSaving[account.id]
                    "
                    class="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {{
                      renameSaving[account.id] ? 'Enregistrement…' : 'Renommer'
                    }}
                  </button>
                  <button
                    v-if="isDraftDirty(account)"
                    type="button"
                    :disabled="renameSaving[account.id]"
                    class="rounded-md bg-gray-100 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 disabled:opacity-50 dark:bg-slate-700 dark:text-gray-200 dark:hover:bg-slate-600"
                    @click="cancelRename(account.id)"
                  >
                    Annuler
                  </button>
                </div>
              </form>
              <p
                v-if="renameErrors[account.id]"
                class="mt-2 text-sm text-red-600 dark:text-red-400"
                data-testid="rename-error"
              >
                {{ renameErrors[account.id] }}
              </p>
            </div>

            <!-- Type -->
            <div>
              <span
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Type de compte
              </span>
              <div
                class="inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 p-1 dark:border-slate-700"
                role="group"
                :aria-label="`Type du compte ${account.name}`"
              >
                <button
                  v-for="option in ACCOUNT_TYPES"
                  :key="option.value"
                  type="button"
                  :aria-pressed="account.type === option.value"
                  :disabled="isSaving(account.id)"
                  :title="option.hint"
                  class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                  :class="
                    account.type === option.value
                      ? 'bg-emerald-600 text-white'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
                  "
                  @click="setType(account, option.value)"
                >
                  {{ option.label }}
                </button>
              </div>
            </div>

            <!-- Divisor -->
            <div>
              <label
                class="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300"
                :for="`account-divisor-${account.id}`"
              >
                Diviseur des montants
              </label>
              <div class="flex items-center gap-3">
                <input
                  :id="`account-divisor-${account.id}`"
                  type="number"
                  min="1"
                  max="10"
                  :value="account.divisor"
                  :disabled="isSaving(account.id)"
                  class="w-20 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                  @change="
                    setDivisor(
                      account,
                      ($event.target as HTMLInputElement).value
                    )
                  "
                />
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Chaque montant de ce compte est divisé par cette valeur dans
                  le tableau de bord, le budget et les remboursements. Passer le
                  compte en joint le règle sur 2.
                </p>
              </div>
            </div>

            <!-- Exclusions -->
            <div class="space-y-3">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Compter dans les statistiques
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Décochez pour sortir ce compte du tableau de bord.
                  </p>
                </div>
                <ToggleSwitch
                  :checked="!account.isExcludedFromStats"
                  :loading="isSaving(account.id)"
                  :label="
                    account.isExcludedFromStats
                      ? `Compter ${account.name} dans les statistiques`
                      : `Retirer ${account.name} des statistiques`
                  "
                  @change="setExcludedFromStats(account, $event)"
                />
              </div>

              <div class="flex items-center justify-between gap-3">
                <div>
                  <p
                    class="text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Compter dans les budgets
                  </p>
                  <p class="text-xs text-gray-500 dark:text-gray-400">
                    Décochez pour sortir ce compte des budgets et des moyennes.
                  </p>
                </div>
                <ToggleSwitch
                  :checked="!account.isExcludedFromBudget"
                  :loading="isSaving(account.id)"
                  :label="
                    account.isExcludedFromBudget
                      ? `Compter ${account.name} dans les budgets`
                      : `Retirer ${account.name} des budgets`
                  "
                  @change="setExcludedFromBudget(account, $event)"
                />
              </div>
            </div>

            <div
              class="flex flex-wrap gap-2 border-t border-gray-100 pt-4 dark:border-slate-700/60"
            >
              <!-- Merging still needs a backend endpoint -->
              <button
                type="button"
                disabled
                :title="UNAVAILABLE_HINT"
                class="cursor-not-allowed rounded-md border border-gray-200 px-3 py-2 text-sm font-medium text-gray-400 dark:border-slate-700 dark:text-gray-500"
              >
                Fusionner avec un autre compte…
              </button>
              <button
                type="button"
                :disabled="isSaving(account.id)"
                class="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                data-testid="delete-account"
                @click="askDeletion(account)"
              >
                Supprimer le compte…
              </button>
            </div>
          </div>
        </li>
      </ul>

      <div
        class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
      >
        <strong>Doublons :</strong> la fusion de comptes n'est pas encore
        branchée, et renommer un compte avec le nom exact d'un autre échoue.
        Pour résorber un doublon, supprimez le compte en trop — ses transactions
        partiront avec lui, réimportez-les ensuite sur le bon compte.
      </div>
    </SettingsCard>

    <DeleteBankAccountModal
      :account="accountPendingDeletion"
      @close="accountPendingDeletion = null"
      @deleted="onDeleted"
    />
  </div>
</template>

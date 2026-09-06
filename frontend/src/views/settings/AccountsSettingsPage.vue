<script setup lang="ts">
  /**
   * Every account, wherever it comes from — one place instead of two.
   *
   * This used to be two tabs: "Comptes" for an account's own settings (name,
   * type, divisor, exclusions), "Banques" for which bank account feeds it and
   * whether to read from it. Both pages were already looking at the same
   * accounts — the bank tab only offered a bare dropdown of them — so managing
   * one meant visiting both. Here, an account linked to a bank shows its full
   * card grouped under the connection that reads it; an account no bank has
   * ever heard of shows the same card under "Comptes sans banque".
   *
   * Which account here a bank account corresponds to, and whether anything is
   * read from it, both start unanswered — an account arrives switched off,
   * because the alternative is a card account read beside the account it
   * settles onto, which counts every purchase twice.
   *
   * The synchronisation is a button, not a schedule. The server says what
   * pressing it would do right now, so a lapsed consent or an exhausted daily
   * quota is shown before it is met rather than as a failure afterwards.
   */
  import { computed, onMounted, ref } from 'vue'
  import { api } from '@/lib/api'
  import type {
    AccountDto,
    BankConnectionDto,
    DiscoveredAccountDto,
  } from '@/lib/api'
  import { useAccountsStore } from '@/stores/accounts'
  import { useToast } from '@/composables/useToast'
  import { useAsyncAction } from '@/composables/useAsyncAction'
  import SettingsCard from '@/components/settings/SettingsCard.vue'
  import AccountCard from '@/components/settings/AccountCard.vue'
  import BankAccountLink from '@/components/settings/BankAccountLink.vue'
  import DeleteBankAccountModal from '@/components/settings/DeleteBankAccountModal.vue'
  import ReassignAccountModal from '@/components/settings/ReassignAccountModal.vue'
  import type { PendingReassignment } from '@/components/settings/ReassignAccountModal.vue'

  const accountsStore = useAccountsStore()
  const toast = useToast()

  const configured = ref<boolean | null>(null)
  const connections = ref<BankConnectionDto[]>([])
  const banks = ref<{ name: string; beta: boolean; logo: string | null }[]>([])
  const chosenBank = ref('')
  const connecting = ref(false)
  const syncing = ref<string | null>(null)
  const savingLink = ref<string | null>(null)
  const needsReview = ref<
    { accountId: string; accountLabel: string; count: number }[]
  >([])

  const { isLoading, error, run } = useAsyncAction()

  async function load(): Promise<void> {
    await run(async () => {
      await accountsStore.load()
      const status = await api.getBankSyncStatus()
      configured.value = status.configured
      if (!status.configured) return
      connections.value = await api.getBankConnections()
      needsReview.value = await api.getBankSyncNeedsReview()
      // Only once: the list is long and does not change between two loads.
      if (banks.value.length === 0) banks.value = await api.getBanks()
    }, 'Impossible de charger les comptes')
  }

  onMounted(load)

  /** How many rows on this account are still waiting for the right one. */
  const needsReviewByAccount = computed(
    () => new Map(needsReview.value.map(r => [r.accountId, r.count]))
  )

  // ── Grouping: which account belongs under which bank, and which belongs to
  // none ────────────────────────────────────────────────────────────────────
  const accountById = computed(
    () => new Map(accountsStore.sortedAccounts.map(a => [a.id, a]))
  )
  const linkedAccountIds = computed(
    () =>
      new Set(
        connections.value
          .flatMap(c => c.accounts)
          .map(a => a.accountId)
          .filter((id): id is string => id !== null)
      )
  )
  const unlinkedAccounts = computed(() =>
    accountsStore.sortedAccounts.filter(a => !linkedAccountIds.value.has(a.id))
  )

  // ── Expand / collapse, shared by every card on the page ─────────────────────
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

  // ── Bank accounts: which local account they are, and whether to read them ──
  /** Read from a card account and every purchase is counted twice. */
  function isCard(account: DiscoveredAccountDto): boolean {
    return account.cashAccountType === 'CARD'
  }

  /**
   * A card account is always ignored — the toggle is disabled from the
   * moment it appears, since reading it counts every purchase twice, already
   * reported by the account it settles onto. Showing it inline the same way
   * as an account someone might actually act on overstates what needs
   * attention, so it starts folded under "Comptes masqués" instead.
   */
  function visibleAccounts(
    connection: BankConnectionDto
  ): DiscoveredAccountDto[] {
    return connection.accounts.filter(a => !isCard(a))
  }

  function hiddenAccounts(
    connection: BankConnectionDto
  ): DiscoveredAccountDto[] {
    return connection.accounts.filter(isCard)
  }

  const hiddenAccountsShown = ref<Set<string>>(new Set())

  function areHiddenAccountsShown(connectionId: string): boolean {
    return hiddenAccountsShown.value.has(connectionId)
  }

  function toggleHiddenAccounts(connectionId: string): void {
    const next = new Set(hiddenAccountsShown.value)
    if (next.has(connectionId)) next.delete(connectionId)
    else next.add(connectionId)
    hiddenAccountsShown.value = next
  }

  function consentLabel(connection: BankConnectionDto): string {
    if (connection.daysUntilConsentExpires === null)
      return 'Sans échéance connue'
    const days = connection.daysUntilConsentExpires
    if (days < 0) return `Expiré depuis ${-days} jours`
    return `Expire dans ${days} jours`
  }

  // ── Logos ─────────────────────────────────────────────────────────────────
  // `GET /aspsps` gives one per bank, already loaded for the picker — reused
  // here rather than fetched again. Public and CORS-open, confirmed by
  // fetching one directly rather than trusting the field description alone.
  const logoByBankName = computed(
    () => new Map(banks.value.map(b => [b.name, b.logo]))
  )

  /**
   * Resized through Uploadcare's suffix rather than shipped full-size — a
   * bank's logo can arrive well over a thousand pixels wide for a 32px icon.
   *
   * `preview`, not `resize`: measured against the real logos, `resize/64x64`
   * stretches to fill the exact box — CIC's, landscape, came back squashed
   * flat; Boursorama's, portrait, came back stretched tall. `preview` fits
   * within the box on the longest side instead, which is what `object-contain`
   * on the `<img>` already expects.
   */
  function logoUrl(aspspName: string): string | null {
    const logo = logoByBankName.value.get(aspspName)
    return logo ? `${logo}-/preview/64x64/` : null
  }

  const pendingReassignment = ref<PendingReassignment | null>(null)

  /**
   * Change which account a bank account is.
   *
   * A plain reassignment when nothing was ever written under the old one —
   * which is every first-time pick, and the common case. Previewed first
   * regardless, because that is the only way to know which case it is: a
   * link a sync has already touched needs a person to see what correcting it
   * would move, merge, unlink or leave alone before it happens.
   */
  async function assign(
    account: DiscoveredAccountDto,
    accountId: string
  ): Promise<void> {
    const targetAccountId = accountId === '' ? null : accountId
    savingLink.value = account.linkId
    try {
      const preview = await api.previewLinkReassignment(
        account.linkId,
        targetAccountId
      )
      const isTrivial = Object.values(preview).every(n => n === 0)
      if (isTrivial) {
        await api.reassignLink(account.linkId, targetAccountId)
        await load()
        return
      }
      pendingReassignment.value = {
        linkId: account.linkId,
        bankAccountName: account.accountName,
        currentAccountLabel: account.accountLabel,
        targetAccountId,
        targetAccountLabel:
          accountsStore.sortedAccounts.find(a => a.id === targetAccountId)
            ?.name ?? '— aucun —',
        preview,
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Association impossible')
    } finally {
      savingLink.value = null
    }
  }

  async function onReassigned(): Promise<void> {
    pendingReassignment.value = null
    toast.success('Compte corrigé')
    await load()
  }

  async function toggleIngestion(account: DiscoveredAccountDto): Promise<void> {
    savingLink.value = account.linkId
    try {
      await api.updateBankAccountLink(account.linkId, {
        isIngested: !account.isIngested,
      })
      await load()
    } catch (err) {
      // The server refuses a card account and an unidentified one, and says
      // why. Showing its words beats inventing our own.
      toast.error(
        err instanceof Error ? err.message : 'Modification impossible'
      )
    } finally {
      savingLink.value = null
    }
  }

  /**
   * Send the user to their bank.
   *
   * The redirect URL is this application's own callback, and it must already
   * be registered in the Enable Banking Control Panel — a bank refuses every
   * other, and says so without naming what it would accept.
   */
  async function connect(): Promise<void> {
    if (!chosenBank.value) return
    connecting.value = true
    try {
      const { url } = await api.startBankAuthorization({
        aspspName: chosenBank.value,
        redirectUrl: `${window.location.origin}/bank-callback`,
      })
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Connexion impossible')
      connecting.value = false
    }
  }

  async function synchronise(connection: BankConnectionDto): Promise<void> {
    syncing.value = connection.id
    try {
      const outcome = await api.syncBankConnection(connection.id)
      toast.success(
        `${outcome.inserted} nouvelle(s), ${outcome.claimed} déjà connue(s)` +
          (outcome.skippedAmbiguous > 0
            ? `, ${outcome.skippedAmbiguous} à trancher`
            : '') +
          (outcome.skippedTooOld > 0
            ? `, ${outcome.skippedTooOld} ignorée(s) (antérieure(s) à l'historique connu)`
            : '')
      )
      await load()
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Synchronisation impossible'
      )
    } finally {
      syncing.value = null
    }
  }

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
</script>

<template>
  <div class="space-y-8">
    <SettingsCard
      title="Comptes"
      description="Vos comptes, comment leurs montants sont comptés, et la banque qui les alimente."
    >
      <p v-if="isLoading" class="text-gray-500 dark:text-gray-400">
        Chargement…
      </p>

      <p
        v-else-if="error"
        class="rounded-lg bg-red-50 p-4 text-red-700 dark:bg-red-900/20 dark:text-red-300"
      >
        {{ error }}
      </p>

      <template v-else>
        <!-- Nothing bank-related is offered when the server cannot sync: a
             button that only produces a puzzling failure is worse than no
             button. The accounts themselves are still fully manageable. -->
        <div
          v-if="configured === false"
          class="mb-8 rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20"
          data-testid="bank-sync-unconfigured"
        >
          <p class="text-amber-800 dark:text-amber-200">
            La synchronisation bancaire n'est pas configurée sur ce serveur.
          </p>
          <p class="mt-2 text-sm text-amber-700 dark:text-amber-300">
            Il lui faut les identifiants d'une application Enable Banking (<code
              >ENABLE_BANKING_APP_ID</code
            >
            et <code>ENABLE_BANKING_PRIVATE_KEY_PATH</code>).
          </p>
        </div>

        <template v-if="configured">
          <div
            class="mb-8 flex flex-wrap items-end gap-3 rounded-xl bg-gray-50 p-4 dark:bg-slate-800"
          >
            <div class="min-w-56 flex-1">
              <label
                for="bank-picker"
                class="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Connecter une banque
              </label>
              <select
                id="bank-picker"
                v-model="chosenBank"
                data-testid="bank-picker"
                class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
              >
                <option value="">— choisir —</option>
                <option
                  v-for="bank in banks"
                  :key="bank.name"
                  :value="bank.name"
                >
                  {{ bank.name }}{{ bank.beta ? ' (beta)' : '' }}
                </option>
              </select>
            </div>
            <button
              type="button"
              data-testid="connect-button"
              :disabled="!chosenBank || connecting"
              class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700"
              @click="connect"
            >
              {{ connecting ? 'Redirection…' : 'Connecter' }}
            </button>
          </div>

          <p
            v-if="connections.length === 0"
            class="mb-8 text-gray-500 dark:text-gray-400"
            data-testid="bank-sync-empty"
          >
            Aucune banque connectée pour l'instant.
          </p>

          <div v-else class="mb-8 space-y-8">
            <section
              v-for="connection in connections"
              :key="connection.id"
              data-testid="bank-connection"
              class="rounded-xl border border-gray-200 p-5 dark:border-slate-700"
            >
              <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                  <img
                    v-if="logoUrl(connection.aspspName)"
                    :src="logoUrl(connection.aspspName)!"
                    :alt="`Logo ${connection.aspspName}`"
                    class="h-8 w-8 shrink-0 rounded-md object-contain"
                  />
                  <div>
                    <h3
                      class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                    >
                      {{ connection.aspspName }}
                    </h3>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {{ consentLabel(connection) }}
                      <span v-if="connection.lastSyncAt">
                        · dernière synchro
                        {{
                          new Date(connection.lastSyncAt).toLocaleDateString(
                            'fr-FR'
                          )
                        }}
                      </span>
                    </p>
                  </div>
                </div>

                <div class="text-right">
                  <button
                    type="button"
                    data-testid="sync-button"
                    :disabled="
                      connection.action !== 'fetch' || syncing === connection.id
                    "
                    class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700"
                    @click="synchronise(connection)"
                  >
                    {{
                      syncing === connection.id
                        ? 'Synchronisation…'
                        : 'Synchroniser'
                    }}
                  </button>
                  <!-- The server's own words for why the button is off: a
                     lapsed consent needs the user at their bank, an exhausted
                     quota needs tomorrow. -->
                  <p
                    v-if="connection.action !== 'fetch'"
                    class="mt-2 max-w-xs text-xs text-gray-500 dark:text-gray-400"
                    data-testid="sync-reason"
                  >
                    {{ connection.reason }}
                  </p>
                </div>
              </div>

              <ul class="mt-6 space-y-3">
                <BankAccountLink
                  v-for="discovered in visibleAccounts(connection)"
                  :key="discovered.linkId"
                  :discovered="discovered"
                  :account="
                    discovered.accountId
                      ? (accountById.get(discovered.accountId) ?? null)
                      : null
                  "
                  :bank-name="connection.aspspName"
                  :expanded="
                    discovered.accountId
                      ? isExpanded(discovered.accountId)
                      : false
                  "
                  :saving="savingLink === discovered.linkId"
                  :account-options="accountsStore.sortedAccounts"
                  :needs-review-count="
                    discovered.accountId
                      ? needsReviewByAccount.get(discovered.accountId)
                      : undefined
                  "
                  @toggle="
                    discovered.accountId && toggleExpanded(discovered.accountId)
                  "
                  @ask-delete="
                    discovered.accountId &&
                    askDeletion(accountById.get(discovered.accountId)!)
                  "
                  @assign="value => assign(discovered, value)"
                  @toggle-ingestion="toggleIngestion(discovered)"
                />
              </ul>

              <!-- A card account is always ignored, so folded here rather
                   than shown the same way as an account someone might act
                   on. -->
              <div v-if="hiddenAccounts(connection).length > 0" class="mt-4">
                <button
                  type="button"
                  data-testid="hidden-accounts-toggle"
                  class="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                  @click="toggleHiddenAccounts(connection.id)"
                >
                  {{
                    areHiddenAccountsShown(connection.id) ? 'Masquer' : 'Voir'
                  }}
                  les comptes masqués ({{ hiddenAccounts(connection).length }})
                </button>

                <ul
                  v-if="areHiddenAccountsShown(connection.id)"
                  data-testid="hidden-accounts"
                  class="mt-3 space-y-3"
                >
                  <BankAccountLink
                    v-for="discovered in hiddenAccounts(connection)"
                    :key="discovered.linkId"
                    :discovered="discovered"
                    :account="
                      discovered.accountId
                        ? (accountById.get(discovered.accountId) ?? null)
                        : null
                    "
                    :bank-name="connection.aspspName"
                    :expanded="
                      discovered.accountId
                        ? isExpanded(discovered.accountId)
                        : false
                    "
                    :saving="savingLink === discovered.linkId"
                    :account-options="accountsStore.sortedAccounts"
                    @toggle="
                      discovered.accountId &&
                      toggleExpanded(discovered.accountId)
                    "
                    @ask-delete="
                      discovered.accountId &&
                      askDeletion(accountById.get(discovered.accountId)!)
                    "
                    @assign="value => assign(discovered, value)"
                    @toggle-ingestion="toggleIngestion(discovered)"
                  />
                </ul>
              </div>
            </section>
          </div>
        </template>

        <!-- Every account not spoken for by a bank above — the whole list
             when there is no bank sync at all. -->
        <div>
          <h3
            v-if="configured"
            class="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
          >
            Comptes sans banque
          </h3>

          <p
            v-if="accountsStore.sortedAccounts.length === 0"
            class="rounded-lg bg-gray-50 p-4 text-sm italic text-gray-500 dark:bg-slate-800 dark:text-gray-400"
          >
            Aucun compte disponible. Importez des transactions pour voir vos
            comptes.
          </p>

          <ul
            v-else-if="!configured || unlinkedAccounts.length > 0"
            class="space-y-3"
          >
            <AccountCard
              v-for="account in configured
                ? unlinkedAccounts
                : accountsStore.sortedAccounts"
              :key="account.id"
              :account="account"
              :expanded="isExpanded(account.id)"
              :needs-review-count="needsReviewByAccount.get(account.id)"
              @toggle="toggleExpanded(account.id)"
              @ask-delete="askDeletion(account)"
            />
          </ul>
        </div>

        <div
          class="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
        >
          <strong>Doublons :</strong> la fusion de comptes n'est pas encore
          branchée, et renommer un compte avec le nom exact d'un autre échoue.
          Pour résorber un doublon, supprimez le compte en trop — ses
          transactions partiront avec lui, réimportez-les ensuite sur le bon
          compte.
        </div>
      </template>
    </SettingsCard>

    <DeleteBankAccountModal
      :account="accountPendingDeletion"
      @close="accountPendingDeletion = null"
      @deleted="onDeleted"
    />

    <ReassignAccountModal
      :pending="pendingReassignment"
      @close="pendingReassignment = null"
      @reassigned="onReassigned"
    />
  </div>
</template>

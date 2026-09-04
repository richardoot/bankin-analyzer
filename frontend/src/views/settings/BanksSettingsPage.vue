<script setup lang="ts">
  /**
   * The banks connected, and what each of their accounts is.
   *
   * Two decisions live here and nowhere else: which account here a bank
   * account corresponds to, and whether anything is read from it. Both start
   * unanswered — an account arrives switched off — because the alternative is
   * a card account read beside the account it settles onto, which counts every
   * purchase twice.
   *
   * The synchronisation is a button, not a schedule. The server says what
   * pressing it would do right now, so a lapsed consent or an exhausted daily
   * quota is shown before it is met rather than as a failure afterwards.
   */
  import { computed, onMounted, ref } from 'vue'
  import { api } from '@/lib/api'
  import type { BankConnectionDto, DiscoveredAccountDto } from '@/lib/api'
  import { useAccountsStore } from '@/stores/accounts'
  import { useToast } from '@/composables/useToast'
  import { useAsyncAction } from '@/composables/useAsyncAction'
  import SettingsCard from '@/components/settings/SettingsCard.vue'

  const accountsStore = useAccountsStore()
  const toast = useToast()

  const configured = ref<boolean | null>(null)
  const connections = ref<BankConnectionDto[]>([])
  const banks = ref<{ name: string; beta: boolean }[]>([])
  const chosenBank = ref('')
  const connecting = ref(false)
  const syncing = ref<string | null>(null)
  const savingLink = ref<string | null>(null)

  const { isLoading, error, run } = useAsyncAction()

  async function load(): Promise<void> {
    await run(async () => {
      const status = await api.getBankSyncStatus()
      configured.value = status.configured
      if (!status.configured) return
      connections.value = await api.getBankConnections()
      // Only once: the list is long and does not change between two views.
      if (banks.value.length === 0) banks.value = await api.getBanks()
    }, 'Impossible de charger les banques')
  }

  onMounted(async () => {
    await accountsStore.load()
    await load()
  })

  const accountOptions = computed(() => accountsStore.sortedAccounts)

  /** Read from a card account and every purchase is counted twice. */
  function isCard(account: DiscoveredAccountDto): boolean {
    return account.cashAccountType === 'CARD'
  }

  function consentLabel(connection: BankConnectionDto): string {
    if (connection.daysUntilConsentExpires === null)
      return 'Sans échéance connue'
    const days = connection.daysUntilConsentExpires
    if (days < 0) return `Expiré depuis ${-days} jours`
    return `Expire dans ${days} jours`
  }

  async function assign(
    account: DiscoveredAccountDto,
    accountId: string
  ): Promise<void> {
    savingLink.value = account.linkId
    try {
      await api.updateBankAccountLink(account.linkId, {
        accountId: accountId === '' ? null : accountId,
      })
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Association impossible')
    } finally {
      savingLink.value = null
    }
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
</script>

<template>
  <div class="space-y-6">
    <SettingsCard
      title="Banques"
      description="Les banques connectées, et ce que la synchronisation lit chez elles."
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

      <!-- Nothing is offered when the server cannot sync: a button that only
           produces a puzzling failure is worse than no button. -->
      <div
        v-else-if="configured === false"
        class="rounded-lg bg-amber-50 p-4 dark:bg-amber-900/20"
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

      <template v-else>
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
              <option v-for="bank in banks" :key="bank.name" :value="bank.name">
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
          class="text-gray-500 dark:text-gray-400"
          data-testid="bank-sync-empty"
        >
          Aucune banque connectée pour l'instant.
        </p>

        <div v-else class="space-y-8">
          <section
            v-for="connection in connections"
            :key="connection.id"
            data-testid="bank-connection"
            class="rounded-xl border border-gray-200 p-5 dark:border-slate-700"
          >
            <div class="flex flex-wrap items-start justify-between gap-4">
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
                <!-- The server's own words for why the button is off: a lapsed
                   consent needs the user at their bank, an exhausted quota
                   needs tomorrow. -->
                <p
                  v-if="connection.action !== 'fetch'"
                  class="mt-2 max-w-xs text-xs text-gray-500 dark:text-gray-400"
                  data-testid="sync-reason"
                >
                  {{ connection.reason }}
                </p>
              </div>
            </div>

            <ul class="mt-6 space-y-4">
              <li
                v-for="account in connection.accounts"
                :key="account.linkId"
                data-testid="bank-account"
                class="rounded-lg bg-gray-50 p-4 dark:bg-slate-800"
              >
                <div class="flex flex-wrap items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p
                      class="truncate font-medium text-gray-900 dark:text-gray-100"
                    >
                      {{ account.accountName }}
                      <span
                        v-if="account.cashAccountType"
                        class="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-xs font-normal text-gray-700 dark:bg-slate-700 dark:text-gray-300"
                      >
                        {{ account.cashAccountType }}
                      </span>
                    </p>
                    <p class="text-sm text-gray-500 dark:text-gray-400">
                      {{ account.product ?? '—' }}
                      <!-- The IBAN is what tells two identically named accounts
                         apart; Boursorama returns two cards with one name. -->
                      <span v-if="account.iban"> · {{ account.iban }}</span>
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid="ingest-toggle"
                    :disabled="savingLink === account.linkId || isCard(account)"
                    class="shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                    :class="
                      account.isIngested
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200'
                        : 'bg-gray-200 text-gray-700 dark:bg-slate-700 dark:text-gray-300'
                    "
                    @click="toggleIngestion(account)"
                  >
                    {{ account.isIngested ? 'Lu' : 'Ignoré' }}
                  </button>
                </div>

                <div class="mt-3">
                  <label
                    class="text-sm text-gray-600 dark:text-gray-400"
                    :for="`link-${account.linkId}`"
                  >
                    Correspond à
                  </label>
                  <select
                    :id="`link-${account.linkId}`"
                    data-testid="account-select"
                    :value="account.accountId ?? ''"
                    :disabled="savingLink === account.linkId"
                    class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
                    @change="
                      assign(
                        account,
                        ($event.target as HTMLSelectElement).value
                      )
                    "
                  >
                    <option value="">— aucun —</option>
                    <option
                      v-for="option in accountOptions"
                      :key="option.id"
                      :value="option.id"
                    >
                      {{ option.name }}
                    </option>
                  </select>

                  <!-- Stated against the evidence a person can judge, never as
                     "these look alike". -->
                  <p
                    v-if="account.suggestion && !account.accountId"
                    class="mt-2 text-sm text-gray-600 dark:text-gray-400"
                    data-testid="account-suggestion"
                  >
                    {{ account.suggestion.matches }} transactions correspondent
                    à
                    <strong>{{ account.suggestion.accountLabel }}</strong>
                    <button
                      type="button"
                      class="ml-2 font-medium text-emerald-600 hover:underline dark:text-emerald-400"
                      @click="assign(account, account.suggestion.accountId)"
                    >
                      associer
                    </button>
                  </p>
                </div>

                <p
                  v-if="account.warning"
                  class="mt-3 rounded bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
                  data-testid="account-warning"
                >
                  {{ account.warning }}
                </p>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </SettingsCard>
  </div>
</template>

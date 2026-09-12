<script setup lang="ts">
  /**
   * Les comptes, groupés par ce qui les alimente.
   *
   * C'est la source qui décide de la fraîcheur des données, donc la page
   * s'organise par source : une carte par banque connectée (état du
   * consentement, dernière synchro, bouton), une carte pour les comptes
   * alimentés à la main (import CSV). Un compte se consulte en cliquant —
   * la liste des transactions sait déjà se filtrer par compte via l'URL.
   *
   * Consulter se passe ici ; configurer (type, diviseur, liaison,
   * suppression, credentials) reste dans Réglages → Comptes.
   */
  import { computed, onMounted, ref } from 'vue'
  import { api } from '@/lib/api'
  import type { BankConnectionDto, SyncOutcomeDto } from '@/lib/api'
  import { useAccountsStore } from '@/stores/accounts'
  import { useToast } from '@/composables/useToast'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'

  const accountsStore = useAccountsStore()
  const toast = useToast()

  const configured = ref(false)
  const connections = ref<BankConnectionDto[]>([])
  const latestImportDate = ref<string | null>(null)
  const isLoading = ref(true)

  /** Connexion en cours de synchronisation (une seule à la fois). */
  const syncing = ref<string | null>(null)
  const isSyncingAll = ref(false)
  /** Le dernier résultat de synchro, affiché sur la carte concernée. */
  const outcomeById = ref<Map<string, SyncOutcomeDto>>(new Map())

  // ── Groupement : quel compte vit sous quelle banque ───────────────────────
  /** Les comptes locaux liés à cette connexion, dans l'ordre du store. */
  function linkedAccountsOf(connection: BankConnectionDto) {
    const ids = new Set(
      connection.accounts
        .map(a => a.accountId)
        .filter((id): id is string => id !== null)
    )
    return accountsStore.sortedAccounts.filter(a => ids.has(a.id))
  }

  const linkedAccountIds = computed(
    () =>
      new Set(
        connections.value
          .flatMap(c => c.accounts)
          .map(a => a.accountId)
          .filter((id): id is string => id !== null)
      )
  )
  const manualAccounts = computed(() =>
    accountsStore.sortedAccounts.filter(a => !linkedAccountIds.value.has(a.id))
  )

  // ── État par connexion, dérivé de ce que la policy backend a déjà décidé ──
  type BadgeTone = 'ok' | 'warn' | 'danger'
  function badgeOf(connection: BankConnectionDto): {
    tone: BadgeTone
    label: string
  } {
    if (connection.action === 'reconnect') {
      return { tone: 'danger', label: 'Reconnexion requise' }
    }
    const days = connection.daysUntilConsentExpires
    if (days !== null && days <= 14) {
      return { tone: 'warn', label: `Consentement expire dans ${days} j` }
    }
    if (connection.action === 'skip') {
      return { tone: 'warn', label: 'En attente' }
    }
    return { tone: 'ok', label: 'Active' }
  }

  const BADGE_CLASSES: Record<BadgeTone, string> = {
    ok: 'bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300',
    warn: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    danger: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  }

  const fetchableConnections = computed(() =>
    connections.value.filter(c => c.action === 'fetch')
  )

  // ── Logos ─────────────────────────────────────────────────────────────────
  // Un GET /aspsps par pays présent dans les connexions (un seul en
  // pratique). Absent ou en échec : l'initiale de la banque tient la tuile.
  const logoByBankName = ref<Map<string, string>>(new Map())

  async function loadLogos(): Promise<void> {
    const countries = [...new Set(connections.value.map(c => c.aspspCountry))]
    const lists = await Promise.allSettled(
      countries.map(country => api.getBanks(country))
    )
    const map = new Map<string, string>()
    for (const list of lists) {
      if (list.status !== 'fulfilled') continue
      for (const bank of list.value) {
        if (bank.logo) map.set(bank.name, bank.logo)
      }
    }
    logoByBankName.value = map
  }

  /**
   * Redimensionné via le suffixe Uploadcare — `preview`, pas `resize` : les
   * logos ont des ratios quelconques et `resize` les écrase dans la boîte.
   */
  function logoUrl(aspspName: string): string | null {
    const logo = logoByBankName.value.get(aspspName)
    return logo ? `${logo}-/preview/96x96/` : null
  }

  // ── Formats ───────────────────────────────────────────────────────────────
  function formatDateTime(value: string | null): string | null {
    if (!value) return null
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatDate(value: string | null): string | null {
    if (!value) return null
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  function outcomeLabel(outcome: SyncOutcomeDto): string {
    const parts = [
      `${outcome.inserted} nouvelle(s)`,
      `${outcome.claimed} déjà connue(s)`,
    ]
    if (outcome.skippedAmbiguous > 0) {
      parts.push(`${outcome.skippedAmbiguous} à trancher`)
    }
    if (outcome.skippedTooOld > 0) {
      parts.push(`${outcome.skippedTooOld} antérieure(s) à l'historique`)
    }
    return parts.join(', ')
  }

  // ── Actions ───────────────────────────────────────────────────────────────
  async function refresh(): Promise<void> {
    const status = await api.getBankSyncStatus().catch(() => null)
    configured.value = status?.configured ?? false
    if (configured.value) {
      connections.value = await api.getBankConnections().catch(() => [])
    }
  }

  async function synchronise(connection: BankConnectionDto): Promise<boolean> {
    syncing.value = connection.id
    try {
      const outcome = await api.syncBankConnection(connection.id)
      outcomeById.value = new Map(outcomeById.value).set(connection.id, outcome)
      return true
    } catch (err) {
      toast.error(
        err instanceof Error
          ? `${connection.aspspName} : ${err.message}`
          : `${connection.aspspName} : synchronisation impossible`
      )
      return false
    } finally {
      syncing.value = null
    }
  }

  async function synchroniseOne(connection: BankConnectionDto): Promise<void> {
    const ok = await synchronise(connection)
    if (ok) {
      const outcome = outcomeById.value.get(connection.id)
      if (outcome) toast.success(outcomeLabel(outcome))
      await refresh()
    }
  }

  /**
   * Toutes les banques synchronisables, l'une après l'autre. Séquentiel
   * exprès : le quota est par banque et la progression se lit carte par
   * carte. Une banque qui échoue n'arrête pas les suivantes ; celles que la
   * policy a mises en attente ne sont jamais forcées.
   */
  async function synchroniseAll(): Promise<void> {
    isSyncingAll.value = true
    let banks = 0
    let inserted = 0
    try {
      for (const connection of fetchableConnections.value) {
        const ok = await synchronise(connection)
        if (ok) {
          banks += 1
          inserted += outcomeById.value.get(connection.id)?.inserted ?? 0
        }
      }
      if (banks > 0) {
        toast.success(
          `${banks} banque(s) synchronisée(s) · ${inserted} nouvelle(s) transaction(s)`
        )
      }
      await refresh()
    } finally {
      isSyncingAll.value = false
    }
  }

  /** Repasser par l'autorisation de la banque, comme à la première connexion. */
  async function reconnect(connection: BankConnectionDto): Promise<void> {
    try {
      const { url } = await api.startBankAuthorization({
        aspspName: connection.aspspName,
        redirectUrl: `${window.location.origin}/bank-callback`,
      })
      window.location.href = url
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reconnexion impossible')
    }
  }

  onMounted(async () => {
    const [, importDate] = await Promise.allSettled([
      refresh(),
      api.getLatestImportDate(),
      accountsStore.load(),
    ])
    if (importDate.status === 'fulfilled') {
      latestImportDate.value = importDate.value.date
    }
    isLoading.value = false
    // Après le rendu : la page n'attend pas les logos.
    void loadLogos()
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 transition-colors dark:bg-slate-800">
    <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Comptes"
        subtitle="Vos comptes, groupés par ce qui les alimente"
      >
        <template #actions>
          <BaseButton
            v-if="fetchableConnections.length > 0"
            data-testid="sync-all-button"
            :loading="isSyncingAll"
            :disabled="syncing !== null && !isSyncingAll"
            @click="synchroniseAll"
          >
            {{ isSyncingAll ? 'Synchronisation…' : 'Tout synchroniser' }}
          </BaseButton>
          <RouterLink
            to="/settings/accounts"
            class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
          >
            Connecter une banque
          </RouterLink>
        </template>
      </PageHeader>

      <!-- Loading: the page's own shape -->
      <div v-if="isLoading" class="space-y-6" aria-busy="true">
        <SkeletonBlock class="h-40 rounded-xl" />
        <SkeletonBlock class="h-40 rounded-xl" />
      </div>

      <div v-else class="space-y-6">
        <!-- One card per bank connection -->
        <section
          v-for="connection in connections"
          :key="connection.id"
          :data-testid="`connection-${connection.id}`"
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="flex min-w-0 items-start gap-3">
              <!-- Fond blanc même en sombre : les logos de banque sont
                   dessinés pour un fond clair. -->
              <div
                class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1 ring-1 ring-gray-200 dark:ring-slate-600"
                data-testid="bank-logo-tile"
              >
                <img
                  v-if="logoUrl(connection.aspspName)"
                  :src="logoUrl(connection.aspspName)!"
                  :alt="`Logo ${connection.aspspName}`"
                  class="h-full w-full object-contain"
                />
                <span
                  v-else
                  aria-hidden="true"
                  class="text-sm font-semibold text-gray-400"
                >
                  {{ connection.aspspName.charAt(0).toUpperCase() }}
                </span>
              </div>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2
                    class="text-lg font-semibold text-gray-900 dark:text-gray-100"
                  >
                    {{ connection.aspspName }}
                  </h2>
                  <span
                    class="rounded-full px-2 py-0.5 text-[11px] font-medium"
                    :class="BADGE_CLASSES[badgeOf(connection).tone]"
                    data-testid="connection-badge"
                  >
                    {{ badgeOf(connection).label }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  <template v-if="connection.lastSyncAt">
                    Dernière synchro :
                    {{ formatDateTime(connection.lastSyncAt) }}
                  </template>
                  <template v-else>Jamais synchronisée</template>
                </p>
                <!-- La raison de la policy, jamais tue : quota, intervalle,
                   demande de la banque. -->
                <p
                  v-if="connection.action === 'skip'"
                  class="mt-1 text-xs text-amber-700 dark:text-amber-400"
                  data-testid="skip-reason"
                >
                  {{ connection.reason }}
                </p>
                <p
                  v-if="outcomeById.get(connection.id)"
                  class="mt-1 text-xs text-primary-700 dark:text-primary-400"
                  aria-live="polite"
                  data-testid="sync-outcome"
                >
                  {{ outcomeLabel(outcomeById.get(connection.id)!) }}
                </p>
              </div>
            </div>

            <BaseButton
              v-if="connection.action === 'fetch'"
              variant="secondary"
              size="sm"
              data-testid="sync-one-button"
              :loading="syncing === connection.id"
              :disabled="
                isSyncingAll || (syncing !== null && syncing !== connection.id)
              "
              @click="synchroniseOne(connection)"
            >
              Synchroniser
            </BaseButton>
            <BaseButton
              v-else-if="connection.action === 'reconnect'"
              variant="danger-outline"
              size="sm"
              data-testid="reconnect-button"
              @click="reconnect(connection)"
            >
              Reconnecter
            </BaseButton>
          </div>

          <!-- Les comptes de cette banque : un clic mène à leurs transactions -->
          <ul
            v-if="linkedAccountsOf(connection).length > 0"
            class="mt-4 divide-y divide-gray-100 border-t border-gray-100 dark:divide-slate-800 dark:border-slate-800"
          >
            <li
              v-for="account in linkedAccountsOf(connection)"
              :key="account.id"
            >
              <RouterLink
                :to="{
                  path: '/transactions',
                  query: { account: account.name },
                }"
                class="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
              >
                <span
                  class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  {{ account.name }}
                </span>
                <svg
                  class="h-4 w-4 shrink-0 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </RouterLink>
            </li>
          </ul>
          <p
            v-else
            class="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-slate-800 dark:text-gray-400"
          >
            Aucun compte relié pour l'instant —
            <RouterLink
              to="/settings/accounts"
              class="font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              choisissez lesquels lire
            </RouterLink>
            .
          </p>
        </section>

        <!-- Bank sync not configured at all -->
        <section
          v-if="!configured"
          class="rounded-xl bg-white shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <EmptyState
            title="Aucune banque connectée"
            description="Connectez votre banque pour synchroniser vos transactions automatiquement — ou continuez avec les imports CSV ci-dessous."
          >
            <template #action>
              <RouterLink
                to="/settings/accounts"
                class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
              >
                Connecter une banque
              </RouterLink>
            </template>
          </EmptyState>
        </section>

        <!-- CSV / manual accounts -->
        <section
          data-testid="manual-accounts"
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2
                class="text-lg font-semibold text-gray-900 dark:text-gray-100"
              >
                Comptes CSV / manuels
              </h2>
              <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
                <template v-if="latestImportDate">
                  Dernière transaction importée :
                  {{ formatDate(latestImportDate) }}
                </template>
                <template v-else>Aucun import pour l'instant.</template>
              </p>
            </div>
            <RouterLink
              to="/import"
              class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              Importer un CSV
            </RouterLink>
          </div>

          <ul
            v-if="manualAccounts.length > 0"
            class="mt-4 divide-y divide-gray-100 border-t border-gray-100 dark:divide-slate-800 dark:border-slate-800"
          >
            <li v-for="account in manualAccounts" :key="account.id">
              <RouterLink
                :to="{
                  path: '/transactions',
                  query: { account: account.name },
                }"
                class="flex items-center justify-between gap-3 py-3 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
              >
                <span
                  class="truncate text-sm font-medium text-gray-900 dark:text-gray-100"
                >
                  {{ account.name }}
                </span>
                <svg
                  class="h-4 w-4 shrink-0 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </RouterLink>
            </li>
          </ul>
          <p
            v-else
            class="mt-4 border-t border-gray-100 pt-3 text-sm text-gray-500 dark:border-slate-800 dark:text-gray-400"
          >
            Aucun compte alimenté à la main. Un import CSV en créera.
          </p>
        </section>

        <!-- Where the rest lives -->
        <nav
          class="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm"
          aria-label="Pages liées aux comptes"
        >
          <RouterLink
            to="/bank-sync/history"
            class="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Historique des synchronisations
          </RouterLink>
          <RouterLink
            to="/import/history"
            class="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Historique des imports
          </RouterLink>
          <RouterLink
            to="/settings/accounts"
            class="font-medium text-primary-600 hover:underline dark:text-primary-400"
          >
            Configurer les comptes
          </RouterLink>
        </nav>
      </div>
    </div>
  </div>
</template>

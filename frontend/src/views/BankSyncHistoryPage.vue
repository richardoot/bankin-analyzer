<script setup lang="ts">
  import PageShell from '@/components/ui/PageShell.vue'
  /**
   * Every sync this user has run, and a way back out of one — the same idea
   * as the CSV import history, applied to a run instead of an import, and
   * built to match its card style exactly: a run reads the same as an
   * import once undoing replaces deleting.
   *
   * Undoing is previewed first, the same discipline the account-correction
   * feature uses: a run's own numbers (inserted, claimed) only say what it
   * touched, not what undoing it would actually do once a blocked row — one
   * that has since gained a tag, a reimbursement, a settlement or a payment
   * — is taken into account.
   */
  import { ref, onMounted, computed } from 'vue'
  import { api } from '@/lib/api'
  import type { BankSyncRunDto, UndoRunOutcomeDto } from '@/lib/api'
  import { formatDateTime } from '@/lib/formatters'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconBolt from '@/components/icons/IconBolt.vue'
  import IconUndo from '@/components/icons/IconUndo.vue'
  import IconRefresh from '@/components/icons/IconRefresh.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import BackLink from '@/components/ui/BackLink.vue'

  const runs = ref<BankSyncRunDto[]>([])
  const isLoading = ref(true)
  const error = ref<string | null>(null)
  /** A preview or an undo that failed: said above the list, which stays. */
  const actionError = ref<string | null>(null)

  const hasRuns = computed(() => runs.value.length > 0)
  const latestSyncDate = computed(() => runs.value[0]?.fetchedAt ?? null)

  interface PendingUndo {
    runId: string
    preview: UndoRunOutcomeDto
  }
  const pendingUndo = ref<PendingUndo | null>(null)
  const previewingRunId = ref<string | null>(null)
  const isUndoing = ref(false)

  async function fetchData(): Promise<void> {
    try {
      isLoading.value = true
      error.value = null
      runs.value = await api.getBankSyncRuns()
    } catch (e) {
      error.value =
        e instanceof Error
          ? e.message
          : "Erreur lors du chargement de l'historique"
    } finally {
      isLoading.value = false
    }
  }

  onMounted(fetchData)

  const formatLatestSyncDate = computed(() => {
    if (!latestSyncDate.value) return null
    return formatDateTime(latestSyncDate.value)
  })

  const getStatusLabel = (run: BankSyncRunDto): string =>
    run.undoneAt ? 'Annulée' : 'Active'

  const getStatusClass = (
    run: BankSyncRunDto
  ): { bg: string; text: string; icon: string } =>
    run.undoneAt
      ? {
          bg: 'bg-gray-100 dark:bg-slate-700',
          text: 'text-gray-600 dark:text-gray-300',
          // Undo arrow: this run's writes have been taken back.
          icon: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
        }
      : {
          bg: 'bg-green-100 dark:bg-green-900/30',
          text: 'text-green-700 dark:text-green-300',
          icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        }

  async function askUndo(runId: string): Promise<void> {
    if (previewingRunId.value) return
    previewingRunId.value = runId
    actionError.value = null
    try {
      const preview = await api.previewUndoBankSyncRun(runId)
      pendingUndo.value = { runId, preview }
    } catch (e) {
      actionError.value =
        e instanceof Error ? e.message : 'Prévisualisation impossible'
    } finally {
      previewingRunId.value = null
    }
  }

  function cancelUndo(): void {
    pendingUndo.value = null
  }

  async function confirmUndo(): Promise<void> {
    if (!pendingUndo.value || isUndoing.value) return
    try {
      isUndoing.value = true
      actionError.value = null
      await api.undoBankSyncRun(pendingUndo.value.runId)
      pendingUndo.value = null
      await fetchData()
    } catch (e) {
      actionError.value =
        e instanceof Error ? e.message : "Erreur lors de l'annulation"
    } finally {
      isUndoing.value = false
    }
  }
</script>

<template>
  <PageShell>
    <BackLink to="/accounts" class="mb-4">Comptes</BackLink>
    <PageHeader
      title="Historique des synchronisations"
      :subtitle="
        formatLatestSyncDate
          ? `Dernière synchronisation : ${formatLatestSyncDate}`
          : isLoading
            ? undefined
            : 'Aucune synchronisation effectuée pour le moment'
      "
    >
      <template v-if="hasRuns" #actions>
        <BaseButton
          to="/settings/accounts"
          variant="secondary"
          class="w-full sm:w-auto"
        >
          <IconRefresh class="h-5 w-5" />
          Gérer mes banques
        </BaseButton>
      </template>
    </PageHeader>

    <InlineAlert
      v-if="actionError"
      class="mb-4"
      data-testid="bank-sync-action-error"
    >
      {{ actionError }}
    </InlineAlert>

    <!-- Loading State -->
    <BaseCard
      v-if="isLoading"
      variant="raised"
      padding="none"
      class="flex items-center justify-center p-12"
    >
      <div class="text-center">
        <div
          class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 dark:border-t-primary-500"
        ></div>
        <p class="mt-4 text-gray-600 dark:text-gray-400">
          Chargement de l'historique…
        </p>
      </div>
    </BaseCard>

    <!-- Error State -->
    <InlineAlert v-else-if="error" retry-label="Réessayer" @retry="fetchData">
      {{ error }}
    </InlineAlert>

    <!-- Empty State -->
    <BaseCard
      v-else-if="!hasRuns"
      variant="raised"
      padding="none"
      class="p-12 text-center"
      data-testid="bank-sync-history-empty"
    >
      <svg
        class="mx-auto h-16 w-16 text-gray-500 dark:text-gray-400"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
        />
      </svg>
      <h3 class="mt-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Aucune synchronisation effectuée
      </h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Connectez une banque depuis les réglages pour commencer.
      </p>
      <BaseButton to="/settings/accounts" class="mt-6">
        <IconBolt class="h-5 w-5" />
        Connecter une banque
      </BaseButton>
    </BaseCard>

    <!-- History List -->
    <div v-else class="space-y-4">
      <BaseCard
        v-for="run in runs"
        :key="run.id"
        variant="raised"
        class="transition-shadow hover:shadow-xl dark:hover:shadow-slate-900/40"
        data-testid="bank-sync-run"
      >
        <!-- Date Header -->
        <div
          class="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 dark:border-slate-700 pb-4"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full"
              :class="getStatusClass(run).bg"
            >
              <svg
                class="h-5 w-5"
                :class="getStatusClass(run).text"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  :d="getStatusClass(run).icon"
                />
              </svg>
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-semibold text-gray-900 dark:text-gray-100">
                  {{ formatDateTime(run.fetchedAt) }}
                </p>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="[getStatusClass(run).bg, getStatusClass(run).text]"
                  data-testid="run-status-badge"
                >
                  {{ getStatusLabel(run) }}
                </span>
                <!-- Une synchro que personne n'a lancée le dit. -->
                <span
                  v-if="run.trigger === 'SCHEDULED'"
                  data-testid="run-auto-badge"
                  class="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  title="Synchronisation quotidienne automatique"
                >
                  Auto
                </span>
              </div>
              <p class="text-sm text-gray-500 dark:text-gray-400">
                {{ run.aspspName }}
              </p>
            </div>
          </div>
          <!-- Undo Button -->
          <BaseIconButton
            v-if="!run.undoneAt && pendingUndo?.runId !== run.id"
            variant="danger"
            data-testid="ask-undo"
            label="Annuler cette synchronisation"
            :loading="previewingRunId === run.id"
            @click="askUndo(run.id)"
          >
            <IconUndo />
          </BaseIconButton>
          <!-- Undo Confirmation -->
          <div
            v-else-if="pendingUndo?.runId === run.id"
            class="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto"
            data-testid="undo-confirmation"
          >
            <span class="text-sm text-red-600 dark:text-red-400">
              Annuler ? {{ pendingUndo.preview.deleted }} supprimée(s),
              {{ pendingUndo.preview.unlinked }} dissociée(s)
              <template v-if="pendingUndo.preview.blocked > 0">
                ,
                <strong data-testid="undo-blocked-note"
                  >{{ pendingUndo.preview.blocked }} laissée(s) de côté</strong
                >
              </template>
            </span>
            <BaseButton
              variant="danger"
              size="sm"
              data-testid="confirm-undo"
              :loading="isUndoing"
              @click="confirmUndo"
            >
              {{ isUndoing ? 'Annulation…' : 'Oui' }}
            </BaseButton>
            <BaseButton
              variant="secondary"
              size="sm"
              data-testid="cancel-undo"
              :disabled="isUndoing"
              @click="cancelUndo"
            >
              Non
            </BaseButton>
          </div>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-4">
          <!-- Inserted -->
          <div class="rounded-lg bg-green-50 dark:bg-green-900/30 p-3">
            <p class="text-2xl font-bold text-green-700 dark:text-green-400">
              {{ run.inserted.toLocaleString('fr-FR') }}
            </p>
            <p class="text-sm text-green-700 dark:text-green-300">
              nouvelles transactions
            </p>
          </div>

          <!-- Claimed -->
          <div class="rounded-lg bg-gray-50 dark:bg-slate-800 p-3">
            <p class="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {{ run.claimed.toLocaleString('fr-FR') }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              transactions CSV reconnues
            </p>
          </div>
        </div>
      </BaseCard>
    </div>
  </PageShell>
</template>

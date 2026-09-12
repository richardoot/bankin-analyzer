<script setup lang="ts">
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

  const runs = ref<BankSyncRunDto[]>([])
  const isLoading = ref(true)
  const error = ref<string | null>(null)

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

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

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
          bg: 'bg-gray-100',
          text: 'text-gray-600',
          // Undo arrow: this run's writes have been taken back.
          icon: 'M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3',
        }
      : {
          bg: 'bg-primary-100',
          text: 'text-primary-600',
          icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        }

  async function askUndo(runId: string): Promise<void> {
    previewingRunId.value = runId
    try {
      const preview = await api.previewUndoBankSyncRun(runId)
      pendingUndo.value = { runId, preview }
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : 'Previsualisation impossible'
    } finally {
      previewingRunId.value = null
    }
  }

  function cancelUndo(): void {
    pendingUndo.value = null
  }

  async function confirmUndo(): Promise<void> {
    if (!pendingUndo.value) return
    try {
      isUndoing.value = true
      await api.undoBankSyncRun(pendingUndo.value.runId)
      pendingUndo.value = null
      await fetchData()
    } catch (e) {
      error.value =
        e instanceof Error ? e.message : "Erreur lors de l'annulation"
    } finally {
      isUndoing.value = false
    }
  }
</script>

<template>
  <div
    class="min-h-[calc(100vh-4rem)] bg-gray-50 dark:bg-slate-800 py-12 transition-colors"
  >
    <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1
          class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
        >
          Historique des synchronisations
        </h1>
        <p
          v-if="formatLatestSyncDate"
          class="mt-2 text-gray-600 dark:text-gray-400"
        >
          Dernière synchronisation : {{ formatLatestSyncDate }}
        </p>
        <p v-else-if="!isLoading" class="mt-2 text-gray-600 dark:text-gray-400">
          Aucune synchronisation effectuée pour le moment
        </p>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="flex items-center justify-center rounded-2xl bg-white dark:bg-slate-900 p-12 shadow-lg dark:shadow-slate-900/20"
      >
        <div class="text-center">
          <div
            class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-primary-200 dark:border-primary-800 border-t-primary-600 dark:border-t-primary-500"
          ></div>
          <p class="mt-4 text-gray-600 dark:text-gray-400">
            Chargement de l'historique...
          </p>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="error"
        class="rounded-2xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-8 text-center"
      >
        <svg
          class="mx-auto h-12 w-12 text-red-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <p class="mt-4 text-red-700 dark:text-red-400">{{ error }}</p>
        <button
          class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          @click="fetchData"
        >
          Reessayer
        </button>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!hasRuns"
        class="rounded-2xl bg-white dark:bg-slate-900 p-12 text-center shadow-lg dark:shadow-slate-900/20"
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
          Connectez une banque depuis les reglages pour commencer.
        </p>
        <RouterLink
          to="/settings/accounts"
          class="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-white transition-colors hover:bg-primary-700"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Connecter une banque
        </RouterLink>
      </div>

      <!-- History List -->
      <div v-else class="space-y-4">
        <div
          v-for="run in runs"
          :key="run.id"
          class="rounded-2xl bg-white dark:bg-slate-900 p-6 shadow-lg dark:shadow-slate-900/20 transition-shadow hover:shadow-xl dark:hover:shadow-slate-900/40"
          data-testid="bank-sync-run"
        >
          <!-- Date Header -->
          <div
            class="mb-4 flex items-center justify-between border-b border-gray-100 dark:border-slate-700 pb-4"
          >
            <div class="flex items-center gap-3">
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
              <div>
                <div class="flex items-center gap-2">
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
                </div>
                <p class="text-sm text-gray-500 dark:text-gray-400">
                  {{ run.aspspName }}
                </p>
              </div>
            </div>
            <!-- Undo Button -->
            <button
              v-if="!run.undoneAt && pendingUndo?.runId !== run.id"
              type="button"
              data-testid="ask-undo"
              class="rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              title="Annuler cette synchronisation"
              :disabled="previewingRunId === run.id"
              @click="askUndo(run.id)"
            >
              <svg
                class="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                />
              </svg>
            </button>
            <!-- Undo Confirmation -->
            <div
              v-else-if="pendingUndo?.runId === run.id"
              class="flex flex-wrap items-center justify-end gap-2"
              data-testid="undo-confirmation"
            >
              <span class="text-sm text-red-600 dark:text-red-400">
                Annuler ? {{ pendingUndo.preview.deleted }} supprimee(s),
                {{ pendingUndo.preview.unlinked }} dissociee(s)
                <template v-if="pendingUndo.preview.blocked > 0">
                  ,
                  <strong data-testid="undo-blocked-note"
                    >{{ pendingUndo.preview.blocked }} laissee(s) de
                    cote</strong
                  >
                </template>
              </span>
              <button
                class="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                data-testid="confirm-undo"
                :disabled="isUndoing"
                @click="confirmUndo"
              >
                {{ isUndoing ? 'Annulation...' : 'Oui' }}
              </button>
              <button
                class="rounded-lg bg-gray-200 dark:bg-slate-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 transition-colors hover:bg-gray-300 dark:hover:bg-slate-600"
                data-testid="cancel-undo"
                :disabled="isUndoing"
                @click="cancelUndo"
              >
                Non
              </button>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-2 gap-4">
            <!-- Inserted -->
            <div class="rounded-lg bg-primary-50 dark:bg-primary-900/30 p-3">
              <p
                class="text-2xl font-bold text-primary-700 dark:text-primary-400"
              >
                {{ run.inserted.toLocaleString('fr-FR') }}
              </p>
              <p class="text-sm text-primary-600 dark:text-primary-500">
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
        </div>
      </div>

      <!-- Quick Actions -->
      <div v-if="hasRuns" class="mt-8 text-center">
        <RouterLink
          to="/settings/accounts"
          class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-3 text-white transition-colors hover:bg-primary-700"
        >
          <svg
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Gerer mes banques
        </RouterLink>
      </div>
    </div>
  </div>
</template>

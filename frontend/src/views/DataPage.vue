<script setup lang="ts">
  /**
   * The one answer to « d'où viennent mes données, et jusqu'à quand ? ».
   *
   * The two feeding modes lived in unrelated places — CSV import as a
   * top-level page, bank sync buried in Réglages → Comptes, the two
   * histories in the user dropdown next to the sign-out button. This page
   * puts them under one roof: each source says when it last brought data,
   * and carries its own actions.
   */
  import { onMounted, ref } from 'vue'
  import { api } from '@/lib/api'
  import PageHeader from '@/components/ui/PageHeader.vue'

  const latestImportDate = ref<string | null>(null)
  const latestSyncDate = ref<string | null>(null)
  const isLoading = ref(true)

  function formatDate(value: string | null): string | null {
    if (!value) return null
    return new Date(value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  }

  onMounted(async () => {
    // Each source answers independently; one failing must not blank the
    // other's date.
    const [importDate, syncRuns] = await Promise.allSettled([
      api.getLatestImportDate(),
      api.getBankSyncRuns(),
    ])
    if (importDate.status === 'fulfilled') {
      latestImportDate.value = importDate.value.date
    }
    if (syncRuns.status === 'fulfilled') {
      const active = syncRuns.value.filter(run => !run.undoneAt)
      latestSyncDate.value =
        active.length > 0 ? (active[0]?.fetchedAt ?? null) : null
    }
    isLoading.value = false
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 transition-colors dark:bg-slate-800">
    <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Données"
        subtitle="D'où viennent vos transactions, et jusqu'à quand"
      />

      <div class="grid gap-6 md:grid-cols-2">
        <!-- Bank sync -->
        <section
          data-testid="data-source-bank"
          class="flex flex-col rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30"
            >
              <svg
                class="h-5 w-5 text-primary-600 dark:text-primary-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Synchronisation bancaire
            </h2>
          </div>

          <p class="text-sm text-gray-600 dark:text-gray-400">
            Vos comptes connectés se mettent à jour depuis la banque.
          </p>
          <p
            class="mt-2 text-sm text-gray-500 dark:text-gray-400"
            data-testid="last-sync-date"
          >
            <template v-if="isLoading">…</template>
            <template v-else-if="latestSyncDate">
              Dernière synchronisation :
              <strong class="text-gray-900 dark:text-gray-100">
                {{ formatDate(latestSyncDate) }}
              </strong>
            </template>
            <template v-else>Aucune synchronisation pour l'instant.</template>
          </p>

          <div class="mt-auto flex flex-wrap gap-3 pt-5">
            <RouterLink
              to="/settings/accounts"
              class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              Gérer les banques
            </RouterLink>
            <RouterLink
              to="/bank-sync/history"
              class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              Historique
            </RouterLink>
          </div>
        </section>

        <!-- CSV import -->
        <section
          data-testid="data-source-csv"
          class="flex flex-col rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <div class="mb-4 flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30"
            >
              <svg
                class="h-5 w-5 text-blue-600 dark:text-blue-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
            </div>
            <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Import CSV
            </h2>
          </div>

          <p class="text-sm text-gray-600 dark:text-gray-400">
            Un export Bankin déposé à la main, doublons détectés
            automatiquement.
          </p>
          <p
            class="mt-2 text-sm text-gray-500 dark:text-gray-400"
            data-testid="last-import-date"
          >
            <template v-if="isLoading">…</template>
            <template v-else-if="latestImportDate">
              Dernière transaction importée :
              <strong class="text-gray-900 dark:text-gray-100">
                {{ formatDate(latestImportDate) }}
              </strong>
            </template>
            <template v-else>Aucun import pour l'instant.</template>
          </p>

          <div class="mt-auto flex flex-wrap gap-3 pt-5">
            <RouterLink
              to="/import"
              class="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700 dark:bg-primary-500 dark:hover:bg-primary-600"
            >
              Importer un CSV
            </RouterLink>
            <RouterLink
              to="/import/history"
              class="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-300 dark:hover:bg-slate-700"
            >
              Historique
            </RouterLink>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

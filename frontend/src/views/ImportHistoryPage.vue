<script setup lang="ts">
  import { ref, onMounted, computed } from 'vue'
  import { api, type ImportHistoryDto } from '@/lib/api'

  const histories = ref<ImportHistoryDto[]>([])
  const latestDate = ref<string | null>(null)
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  const hasHistories = computed(() => histories.value.length > 0)

  const formatDateTime = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    })
  }

  const formatLatestDate = computed(() => {
    if (!latestDate.value) return null
    return new Date(latestDate.value).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
  })

  const fetchData = async (): Promise<void> => {
    try {
      isLoading.value = true
      error.value = null

      const [historiesData, latestDateData] = await Promise.all([
        api.getImportHistories(),
        api.getLatestImportDate(),
      ])

      histories.value = historiesData
      latestDate.value = latestDateData.date
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
</script>

<template>
  <div class="min-h-[calc(100vh-4rem)] bg-gray-50 py-12">
    <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-8">
        <h1 class="text-3xl font-bold text-gray-900">Historique des imports</h1>
        <p v-if="formatLatestDate" class="mt-2 text-gray-600">
          Derniere transaction importee : {{ formatLatestDate }}
        </p>
        <p v-else-if="!isLoading" class="mt-2 text-gray-600">
          Aucun import effectue pour le moment
        </p>
      </div>

      <!-- Loading State -->
      <div
        v-if="isLoading"
        class="flex items-center justify-center rounded-2xl bg-white p-12 shadow-lg"
      >
        <div class="text-center">
          <div
            class="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-emerald-200 border-t-emerald-600"
          ></div>
          <p class="mt-4 text-gray-600">Chargement de l'historique...</p>
        </div>
      </div>

      <!-- Error State -->
      <div
        v-else-if="error"
        class="rounded-2xl border-2 border-red-200 bg-red-50 p-8 text-center"
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
        <p class="mt-4 text-red-700">{{ error }}</p>
        <button
          class="mt-4 rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
          @click="fetchData"
        >
          Reessayer
        </button>
      </div>

      <!-- Empty State -->
      <div
        v-else-if="!hasHistories"
        class="rounded-2xl bg-white p-12 text-center shadow-lg"
      >
        <svg
          class="mx-auto h-16 w-16 text-gray-400"
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
        <h3 class="mt-4 text-lg font-semibold text-gray-900">
          Aucun import effectue
        </h3>
        <p class="mt-2 text-gray-600">
          Commencez par importer vos transactions depuis un fichier CSV.
        </p>
        <RouterLink
          to="/import"
          class="mt-6 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-white transition-colors hover:bg-emerald-700"
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
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
            />
          </svg>
          Importer un CSV
        </RouterLink>
      </div>

      <!-- History List -->
      <div v-else class="space-y-4">
        <div
          v-for="history in histories"
          :key="history.id"
          class="rounded-2xl bg-white p-6 shadow-lg transition-shadow hover:shadow-xl"
        >
          <!-- Date Header -->
          <div
            class="mb-4 flex items-center justify-between border-b border-gray-100 pb-4"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100"
              >
                <svg
                  class="h-5 w-5 text-emerald-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <p class="font-semibold text-gray-900">
                  {{ formatDateTime(history.createdAt) }}
                </p>
                <p v-if="history.fileName" class="text-sm text-gray-500">
                  {{ history.fileName }}
                </p>
              </div>
            </div>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <!-- Transactions Imported -->
            <div class="rounded-lg bg-emerald-50 p-3">
              <p class="text-2xl font-bold text-emerald-700">
                {{ history.transactionsImported.toLocaleString('fr-FR') }}
              </p>
              <p class="text-sm text-emerald-600">transactions importees</p>
            </div>

            <!-- Total in File -->
            <div class="rounded-lg bg-gray-50 p-3">
              <p class="text-2xl font-bold text-gray-700">
                {{ history.totalInFile.toLocaleString('fr-FR') }}
              </p>
              <p class="text-sm text-gray-600">dans le fichier</p>
            </div>

            <!-- Duplicates Skipped -->
            <div class="rounded-lg bg-amber-50 p-3">
              <p class="text-2xl font-bold text-amber-700">
                {{ history.duplicatesSkipped.toLocaleString('fr-FR') }}
              </p>
              <p class="text-sm text-amber-600">doublons ignores</p>
            </div>

            <!-- Categories Created -->
            <div class="rounded-lg bg-indigo-50 p-3">
              <p class="text-2xl font-bold text-indigo-700">
                {{ history.categoriesCreated.toLocaleString('fr-FR') }}
              </p>
              <p class="text-sm text-indigo-600">nouvelles categories</p>
            </div>
          </div>

          <!-- Period and Accounts -->
          <div
            class="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600"
          >
            <!-- Date Range -->
            <div class="flex items-center gap-2">
              <svg
                class="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <span>
                Du {{ formatDate(history.dateRangeStart) }} au
                {{ formatDate(history.dateRangeEnd) }}
              </span>
            </div>

            <!-- Accounts -->
            <div
              v-if="history.accounts.length > 0"
              class="flex items-center gap-2"
            >
              <svg
                class="h-4 w-4 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                />
              </svg>
              <div class="flex flex-wrap gap-1">
                <span
                  v-for="account in history.accounts"
                  :key="account"
                  class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700"
                >
                  {{ account }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Quick Actions -->
      <div v-if="hasHistories" class="mt-8 text-center">
        <RouterLink
          to="/import"
          class="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-white transition-colors hover:bg-emerald-700"
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
              d="M12 6v6m0 0v6m0-6h6m-6 0H6"
            />
          </svg>
          Nouvel import
        </RouterLink>
      </div>
    </div>
  </div>
</template>

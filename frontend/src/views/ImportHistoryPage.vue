<script setup lang="ts">
  import PageShell from '@/components/ui/PageShell.vue'
  import { ref, onMounted, computed } from 'vue'
  import { api, type ImportHistoryDto } from '@/lib/api'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import { useToast } from '@/composables/useToast'
  import { formatDate, formatDateTime } from '@/lib/formatters'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconUpload from '@/components/icons/IconUpload.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'

  const toast = useToast()

  const histories = ref<ImportHistoryDto[]>([])
  const latestDate = ref<string | null>(null)
  const isLoading = ref(true)
  const error = ref<string | null>(null)
  const deleteConfirmId = ref<string | null>(null)
  const isDeleting = ref(false)

  const hasHistories = computed(() => histories.value.length > 0)

  /** The import the dialog is asking about. */
  const importToDelete = computed(
    () => histories.value.find(h => h.id === deleteConfirmId.value) ?? null
  )

  const formatLatestDate = computed(() =>
    latestDate.value ? formatDate(latestDate.value, 'long') : null
  )

  const getStatusLabel = (status: string): string => {
    switch (status) {
      case 'COMPLETED':
        return 'Terminé'
      case 'IN_PROGRESS':
        return 'En cours'
      case 'FAILED':
        return 'Échoué'
      default:
        return status
    }
  }

  const getStatusClass = (
    status: string
  ): { bg: string; text: string; icon: string } => {
    switch (status) {
      case 'COMPLETED':
        return {
          bg: 'bg-primary-100',
          text: 'text-primary-600',
          icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
        }
      case 'IN_PROGRESS':
        return {
          bg: 'bg-amber-100',
          text: 'text-amber-600',
          icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
        }
      case 'FAILED':
        return {
          bg: 'bg-red-100',
          text: 'text-red-600',
          icon: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z',
        }
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-600',
          icon: 'M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
        }
    }
  }

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

  const confirmDelete = (id: string): void => {
    deleteConfirmId.value = id
  }

  const cancelDelete = (): void => {
    if (isDeleting.value) return
    deleteConfirmId.value = null
  }

  // The backend deletes every transaction of the import along with it; the
  // dialog says so, with the count, before anything goes.
  const deleteImport = async (): Promise<void> => {
    const id = deleteConfirmId.value
    if (!id) return
    try {
      isDeleting.value = true
      await api.deleteImport(id)
      deleteConfirmId.value = null
      toast.success('Import supprimé, avec ses transactions')
      await fetchData()
    } catch (e) {
      // A toast, not the page's error block: the list stays as it was.
      toast.error(
        e instanceof Error ? e.message : "Impossible de supprimer l'import"
      )
    } finally {
      isDeleting.value = false
    }
  }

  onMounted(fetchData)
</script>

<template>
  <PageShell>
    <!-- Header -->
    <div class="mb-8">
      <h1
        class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
      >
        Historique des imports
      </h1>
      <p v-if="formatLatestDate" class="mt-2 text-gray-600 dark:text-gray-400">
        Dernière transaction importée : {{ formatLatestDate }}
      </p>
      <p v-else-if="!isLoading" class="mt-2 text-gray-600 dark:text-gray-400">
        Aucun import effectué pour le moment
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
    <InlineAlert v-else-if="error" retry-label="Réessayer" @retry="fetchData">
      {{ error }}
    </InlineAlert>

    <!-- Empty State -->
    <div
      v-else-if="!hasHistories"
      class="rounded-2xl bg-white dark:bg-slate-900 p-12 text-center shadow-lg dark:shadow-slate-900/20"
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
        Aucun import effectué
      </h3>
      <p class="mt-2 text-gray-600 dark:text-gray-400">
        Commencez par importer vos transactions depuis un fichier CSV.
      </p>
      <BaseButton to="/import" class="mt-6">
        <IconUpload class="h-5 w-5" />
        Importer un CSV
      </BaseButton>
    </div>

    <!-- History List -->
    <div v-else class="space-y-4">
      <div
        v-for="history in histories"
        :key="history.id"
        class="rounded-2xl bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-lg dark:shadow-slate-900/20 transition-shadow hover:shadow-xl dark:hover:shadow-slate-900/40"
      >
        <!-- Date Header -->
        <div
          class="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-gray-100 dark:border-slate-700 pb-4"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-full"
              :class="getStatusClass(history.status).bg"
            >
              <svg
                class="h-5 w-5"
                :class="getStatusClass(history.status).text"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  :d="getStatusClass(history.status).icon"
                />
              </svg>
            </div>
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <p class="font-semibold text-gray-900 dark:text-gray-100">
                  {{ formatDateTime(history.createdAt) }}
                </p>
                <span
                  class="rounded-full px-2 py-0.5 text-xs font-medium"
                  :class="[
                    getStatusClass(history.status).bg,
                    getStatusClass(history.status).text,
                  ]"
                >
                  {{ getStatusLabel(history.status) }}
                </span>
              </div>
              <p
                v-if="history.fileName"
                class="truncate text-sm text-gray-500 dark:text-gray-400"
              >
                {{ history.fileName }}
              </p>
            </div>
          </div>
          <!-- Delete Button -->
          <BaseIconButton
            variant="danger"
            data-testid="delete-import-button"
            :label="`Supprimer l'import du ${formatDateTime(history.createdAt)}`"
            @click="confirmDelete(history.id)"
          >
            <IconTrash />
          </BaseIconButton>
        </div>

        <!-- Stats Grid -->
        <div class="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <!-- Transactions Imported -->
          <div class="rounded-lg bg-primary-50 dark:bg-primary-900/30 p-3">
            <p
              class="text-2xl font-bold text-primary-700 dark:text-primary-400"
            >
              {{ history.transactionsImported.toLocaleString('fr-FR') }}
            </p>
            <p class="text-sm text-primary-600 dark:text-primary-500">
              transactions importées
            </p>
          </div>

          <!-- Total in File -->
          <div class="rounded-lg bg-gray-50 dark:bg-slate-800 p-3">
            <p class="text-2xl font-bold text-gray-700 dark:text-gray-300">
              {{ history.totalInFile.toLocaleString('fr-FR') }}
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              dans le fichier
            </p>
          </div>

          <!-- Duplicates Skipped -->
          <div class="rounded-lg bg-amber-50 dark:bg-amber-900/30 p-3">
            <p class="text-2xl font-bold text-amber-700 dark:text-amber-400">
              {{ history.duplicatesSkipped.toLocaleString('fr-FR') }}
            </p>
            <p class="text-sm text-amber-600 dark:text-amber-500">
              doublons ignorés
            </p>
          </div>

          <!-- Categories Created -->
          <div class="rounded-lg bg-primary-50 dark:bg-primary-900/30 p-3">
            <p
              class="text-2xl font-bold text-primary-700 dark:text-primary-400"
            >
              {{ history.categoriesCreated.toLocaleString('fr-FR') }}
            </p>
            <p class="text-sm text-primary-600 dark:text-primary-500">
              nouvelles catégories
            </p>
          </div>
        </div>

        <!-- Period and Accounts -->
        <div
          class="mt-4 flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400"
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
                class="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300"
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
      <BaseButton to="/import">
        <IconPlus class="h-5 w-5" />
        Nouvel import
      </BaseButton>
    </div>

    <ConfirmDialog
      :open="importToDelete !== null"
      title="Supprimer cet import ?"
      :confirm-label="
        importToDelete && importToDelete.transactionsImported > 0
          ? 'Tout supprimer'
          : 'Supprimer'
      "
      :loading="isDeleting"
      @confirm="deleteImport"
      @cancel="cancelDelete"
    >
      <template
        v-if="importToDelete && importToDelete.transactionsImported > 0"
      >
        Les
        <span class="font-medium text-gray-900 dark:text-gray-100"
          >{{ importToDelete.transactionsImported }} transactions</span
        >
        importées par cet import seront supprimées aussi, avec leurs catégories,
        notes et étiquettes. Vos comptes et catégories restent. Cette action est
        irréversible.
      </template>
      <template v-else>
        Cet import n'a ajouté aucune transaction ; seule sa trace dans
        l'historique disparaîtra.
      </template>
    </ConfirmDialog>
  </PageShell>
</template>

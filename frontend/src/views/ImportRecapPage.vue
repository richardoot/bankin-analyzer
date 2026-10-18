<script setup lang="ts">
  /**
   * The end of an import, read back from the history rather than from the
   * numbers the previous page happened to carry: the page can be reopened,
   * bookmarked, or reached from the history, and shows the same thing each
   * time. It is also where the flow closes — back to the accounts, on to
   * the transactions it brought in, or into the history.
   */
  import { computed, onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { api, type ImportHistoryDto } from '@/lib/api'
  import { formatDate, formatDateTime } from '@/lib/formatters'
  import PageShell from '@/components/ui/PageShell.vue'
  import StepIndicator from '@/components/ui/StepIndicator.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BackLink from '@/components/ui/BackLink.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import IconCheckCircle from '@/components/icons/IconCheckCircle.vue'

  const route = useRoute()

  const history = ref<ImportHistoryDto | null>(null)
  const isLoading = ref(true)
  const error = ref<string | null>(null)

  const importId = computed(() => String(route.params.id ?? ''))

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      history.value = await api.getImportHistory(importId.value)
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : "Impossible de charger le récapitulatif de l'import"
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  /** The imported transactions, by the window the import covered. */
  const transactionsLink = computed(() => {
    const h = history.value
    if (!h?.dateRangeStart || !h.dateRangeEnd) return { path: '/transactions' }
    const query: Record<string, string> = {
      from: h.dateRangeStart.slice(0, 10),
      to: h.dateRangeEnd.slice(0, 10),
    }
    const [account] = h.accounts
    if (h.accounts.length === 1 && account) query.account = account
    return { path: '/transactions', query }
  })

  const isStillRunning = computed(() => history.value?.status === 'IN_PROGRESS')
</script>

<template>
  <PageShell width="narrow">
    <BackLink to="/accounts" class="mb-4">Comptes</BackLink>
    <StepIndicator
      class="mb-8"
      :steps="['Dépôt', 'Aperçu', 'Doublons', 'Récapitulatif']"
      :current="4"
    />

    <BaseCard v-if="isLoading" padding="lg" data-testid="recap-loading">
      <SkeletonBlock class="mx-auto mb-6 h-16 w-16 rounded-full" />
      <SkeletonBlock class="mx-auto mb-8 h-7 w-48" />
      <div class="grid grid-cols-2 gap-4">
        <SkeletonBlock v-for="n in 4" :key="n" class="h-28 rounded-xl" />
      </div>
    </BaseCard>

    <InlineAlert
      v-else-if="error"
      data-testid="recap-error"
      title="Le récapitulatif n'a pas pu être chargé."
      retry-label="Réessayer"
      retry-test-id="recap-retry"
      @retry="load"
    >
      {{ error }}
      <RouterLink
        to="/import/history"
        class="mt-1 block font-medium underline underline-offset-2"
      >
        Ouvrir l'historique des imports
      </RouterLink>
    </InlineAlert>

    <BaseCard v-else-if="history" padding="lg" data-testid="recap-card">
      <div class="flex justify-center mb-6">
        <div
          class="flex h-16 w-16 items-center justify-center rounded-full"
          :class="
            isStillRunning
              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400'
              : 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
          "
        >
          <IconCheckCircle class="h-8 w-8" />
        </div>
      </div>

      <h1
        class="text-2xl font-bold text-gray-900 dark:text-gray-100 text-center mb-2"
      >
        {{ isStillRunning ? 'Import en cours' : 'Import terminé' }}
      </h1>
      <p class="text-gray-600 dark:text-gray-400 text-center mb-8">
        {{ formatDateTime(history.createdAt) }}
        <template v-if="history.fileName"> · {{ history.fileName }}</template>
      </p>

      <div class="grid grid-cols-2 gap-4 mb-6">
        <div
          class="bg-green-50 dark:bg-green-900/20 rounded-xl p-6 text-center"
        >
          <div
            class="text-4xl font-bold text-green-700 dark:text-green-400 mb-1"
            data-testid="recap-imported"
          >
            {{ history.transactionsImported }}
          </div>
          <div class="text-sm font-medium text-green-800 dark:text-green-300">
            Transactions importées
          </div>
        </div>

        <div
          class="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-6 text-center"
        >
          <div
            class="text-4xl font-bold text-amber-700 dark:text-amber-400 mb-1"
            data-testid="recap-duplicates"
          >
            {{ history.duplicatesSkipped }}
          </div>
          <div class="text-sm font-medium text-amber-800 dark:text-amber-300">
            Doublons ignorés
          </div>
        </div>

        <div class="bg-gray-100 dark:bg-slate-800 rounded-xl p-6 text-center">
          <div
            class="text-4xl font-bold text-gray-600 dark:text-gray-300 mb-1"
            data-testid="recap-total"
          >
            {{ history.totalInFile }}
          </div>
          <div class="text-sm font-medium text-gray-700 dark:text-gray-400">
            Lignes dans le fichier
          </div>
        </div>

        <div class="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-6 text-center">
          <div
            class="text-4xl font-bold text-blue-600 dark:text-blue-400 mb-1"
            data-testid="recap-accounts"
          >
            {{ history.accounts.length }}
          </div>
          <div class="text-sm font-medium text-blue-800 dark:text-blue-300">
            {{
              history.accounts.length > 1
                ? 'Comptes concernés'
                : 'Compte concerné'
            }}
          </div>
        </div>
      </div>

      <p
        v-if="history.dateRangeStart && history.dateRangeEnd"
        class="mb-6 text-center text-sm text-gray-600 dark:text-gray-400"
        data-testid="recap-range"
      >
        Du {{ formatDate(history.dateRangeStart) }} au
        {{ formatDate(history.dateRangeEnd) }}
        <template v-if="history.accounts.length > 0">
          · {{ history.accounts.join(', ') }}
        </template>
      </p>

      <InlineAlert
        v-if="history.duplicatesSkipped > 0"
        variant="info"
        class="mb-6"
      >
        Les {{ history.duplicatesSkipped }} transactions en doublon ont été
        automatiquement ignorées pour éviter les doublons dans votre historique.
      </InlineAlert>

      <!-- Where to go from here: the flow closes, it does not end. -->
      <div class="flex flex-col gap-3 sm:flex-row">
        <BaseButton
          :to="transactionsLink"
          class="flex-1"
          data-testid="recap-transactions"
        >
          Voir les transactions importées
        </BaseButton>
        <BaseButton
          to="/import"
          variant="secondary"
          class="flex-1"
          data-testid="recap-new-import"
        >
          Nouvel import
        </BaseButton>
      </div>
      <nav
        class="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm"
        aria-label="Suite de l'import"
      >
        <RouterLink
          to="/accounts"
          class="inline-flex min-h-[44px] items-center font-medium text-primary-700 hover:underline sm:min-h-0 dark:text-primary-400"
        >
          Retour aux comptes
        </RouterLink>
        <RouterLink
          to="/import/history"
          class="inline-flex min-h-[44px] items-center font-medium text-primary-700 hover:underline sm:min-h-0 dark:text-primary-400"
          data-testid="recap-history"
        >
          Historique des imports
        </RouterLink>
      </nav>
    </BaseCard>
  </PageShell>
</template>

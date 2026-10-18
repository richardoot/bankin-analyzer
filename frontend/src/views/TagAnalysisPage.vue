<script setup lang="ts">
  import PageShell from '@/components/ui/PageShell.vue'
  import { computed, onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import { api } from '@/lib/api'
  import type { TagAnalysisDto, TransactionDto } from '@/lib/api'
  import { formatCurrency, formatDate, formatMonth } from '@/lib/formatters'
  import { useToast } from '@/composables/useToast'
  import CategoryPieChart from '@/components/charts/CategoryPieChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconChevronLeft from '@/components/icons/IconChevronLeft.vue'
  import IconClose from '@/components/icons/IconClose.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'

  const route = useRoute()
  const toast = useToast()

  const tagId = computed(() => String(route.params.id))

  const analysis = ref<TagAnalysisDto | null>(null)
  const transactions = ref<TransactionDto[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)
  const removingId = ref<string | null>(null)

  const period = computed(() => {
    if (!analysis.value?.firstDate || !analysis.value?.lastDate) return '—'
    const start = formatDate(analysis.value.firstDate)
    const end = formatDate(analysis.value.lastDate)
    return start === end ? start : `${start} – ${end}`
  })

  /** Expense categories only, for the donut breakdown. */
  const expensePie = computed(() => {
    const rows = (analysis.value?.byCategory ?? []).filter(
      c => c.type === 'EXPENSE'
    )
    return {
      labels: rows.map(c => c.categoryName),
      values: rows.map(c => c.amount),
    }
  })

  const monthlyExpenses = computed(() => {
    const rows = analysis.value?.byMonth ?? []
    return {
      labels: rows.map(r => formatMonth(r.month)),
      values: rows.map(r => r.expenses),
    }
  })

  const hasMonthlyBreakdown = computed(
    () => (analysis.value?.byMonth.length ?? 0) > 1
  )

  /** What an ordinary stretch of the same length would have cost. */
  const baselineTotal = computed(() =>
    (analysis.value?.byCategory ?? []).reduce(
      (sum, cat) => sum + (cat.baselineAmount ?? 0),
      0
    )
  )

  /**
   * How much of the envelope the spend has consumed. Compared against what was
   * actually spent, not the surplus: the envelope was decided on the money
   * leaving the account, and it is that money the user has to find.
   */
  const envelopeRatio = computed(() => {
    const budget = analysis.value?.tag.budgetAmount ?? null
    if (!budget || budget <= 0) return 0
    return (analysis.value?.totalExpenses ?? 0) / budget
  })

  /** Envelope minus spend. Negative means the project has overrun. */
  const envelopeRemaining = computed<number | null>(() => {
    const budget = analysis.value?.tag.budgetAmount ?? null
    if (budget === null) return null
    return budget - (analysis.value?.totalExpenses ?? 0)
  })

  async function load(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      const [a, txs] = await Promise.all([
        api.getTagAnalysis(tagId.value),
        api.getTransactions({ tagId: tagId.value, limit: 100 }),
      ])
      analysis.value = a
      transactions.value = txs.data
    } catch (err) {
      error.value =
        err instanceof Error ? err.message : "Échec du chargement de l'analyse"
    } finally {
      isLoading.value = false
    }
  }

  /** Remove the tag from a transaction (keeps the transaction). */
  async function detach(tx: TransactionDto): Promise<void> {
    if (removingId.value) return
    removingId.value = tx.id
    try {
      await api.detachTagFromTransaction(tagId.value, tx.id)
      transactions.value = transactions.value.filter(t => t.id !== tx.id)
      // Refresh aggregates (totals, charts) without a full-page spinner.
      analysis.value = await api.getTagAnalysis(tagId.value)
      toast.success('Étiquette retirée de la transaction')
    } catch {
      toast.error("Échec du retrait de l'étiquette")
    } finally {
      removingId.value = null
    }
  }

  onMounted(load)
</script>

<template>
  <PageShell>
    <!-- Back -->
    <BaseButton
      :to="{ name: 'tags' }"
      variant="ghost"
      size="sm"
      class="-ml-3 mb-4"
    >
      <IconChevronLeft class="h-4 w-4" />
      Étiquettes
    </BaseButton>

    <!-- Loading -->
    <div
      v-if="isLoading"
      class="py-12 text-center text-gray-500 dark:text-gray-400"
    >
      Chargement de l'analyse…
    </div>

    <!-- Error -->
    <InlineAlert
      v-else-if="error"
      data-testid="tag-analysis-error"
      retry-label="Réessayer"
      retry-test-id="tag-analysis-retry"
      @retry="load"
    >
      {{ error }}
    </InlineAlert>

    <template v-else-if="analysis">
      <!-- Header -->
      <div class="mb-6 flex items-center gap-3">
        <span
          class="inline-block h-4 w-4 rounded-full shrink-0"
          :style="{ backgroundColor: analysis.tag.color ?? '#9ca3af' }"
        ></span>
        <h1
          class="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100"
        >
          {{ analysis.tag.name }}
        </h1>
      </div>

      <!-- Summary cards -->
      <div class="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        <BaseCard padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Dépenses</p>
          <p class="mt-1 text-xl font-bold text-red-600 dark:text-red-400">
            {{ formatCurrency(analysis.totalExpenses) }}
          </p>
        </BaseCard>
        <BaseCard padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Revenus</p>
          <p class="mt-1 text-xl font-bold text-green-700 dark:text-green-400">
            {{ formatCurrency(analysis.totalIncome) }}
          </p>
        </BaseCard>
        <BaseCard padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Solde net</p>
          <p
            class="mt-1 text-xl font-bold"
            :class="
              analysis.net >= 0
                ? 'text-green-700 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            "
          >
            {{ formatCurrency(analysis.net) }}
          </p>
        </BaseCard>
        <BaseCard padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Transactions</p>
          <p class="mt-1 text-xl font-bold text-gray-900 dark:text-gray-100">
            {{ analysis.transactionCount }}
          </p>
          <p class="mt-1 text-[11px] text-gray-400">{{ period }}</p>
        </BaseCard>
      </div>

      <!-- Real surplus -->
      <div
        v-if="analysis.baseline && analysis.totalSurplus !== null"
        class="mb-6 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4"
      >
        <div
          class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
        >
          <div>
            <p
              class="text-xs font-medium text-amber-800 dark:text-amber-300 uppercase tracking-wide"
            >
              Surcoût réel
            </p>
            <p
              class="mt-1 text-3xl font-bold text-amber-900 dark:text-amber-200"
            >
              {{ formatCurrency(analysis.totalSurplus) }}
            </p>
            <p class="mt-1 text-xs text-amber-700 dark:text-amber-400">
              Dépensé {{ formatCurrency(analysis.totalExpenses) }} sur
              {{ analysis.baseline.eventDays }} jour(s), contre
              {{ formatCurrency(baselineTotal) }} en temps normal.
            </p>
          </div>
          <p
            class="text-[11px] leading-relaxed text-amber-700 dark:text-amber-400 sm:max-w-[16rem] sm:text-right"
          >
            Référence : {{ formatDate(analysis.baseline.startDate) }} →
            {{ formatDate(analysis.baseline.endDate) }}, soit
            {{ analysis.baseline.everydayDays }} jours de vie quotidienne hors
            événements.
          </p>
        </div>
      </div>

      <!-- Envelope: what the project was allowed to cost -->
      <div
        v-if="analysis.tag.budgetAmount !== null"
        data-testid="tag-envelope"
        class="mb-6 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-4"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <p
            class="text-xs font-medium text-primary-800 dark:text-primary-300 uppercase tracking-wide"
          >
            Enveloppe du projet
          </p>
          <p
            class="text-xs tabular-nums"
            :class="
              envelopeRemaining !== null && envelopeRemaining < 0
                ? 'text-red-600 dark:text-red-400 font-semibold'
                : 'text-primary-700 dark:text-primary-400'
            "
          >
            <template
              v-if="envelopeRemaining !== null && envelopeRemaining < 0"
            >
              Dépassement de {{ formatCurrency(-envelopeRemaining) }}
            </template>
            <template v-else>
              Reste {{ formatCurrency(envelopeRemaining ?? 0) }}
            </template>
          </p>
        </div>

        <div
          class="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-100 dark:bg-primary-950"
        >
          <div
            class="h-full rounded-full transition-all"
            :class="
              envelopeRatio > 1
                ? 'bg-red-500'
                : 'bg-primary-500 dark:bg-primary-400'
            "
            :style="{ width: `${Math.min(envelopeRatio, 1) * 100}%` }"
          ></div>
        </div>

        <p class="mt-2 text-xs text-primary-700 dark:text-primary-400">
          Dépensé
          <strong class="tabular-nums">
            {{ formatCurrency(analysis.totalExpenses) }}
          </strong>
          <template v-if="analysis.totalSurplus !== null">
            · surcoût réel
            <strong class="tabular-nums">
              {{ formatCurrency(analysis.totalSurplus) }}
            </strong>
          </template>
          · enveloppe
          <strong class="tabular-nums">
            {{ formatCurrency(analysis.tag.budgetAmount) }}
          </strong>
        </p>
        <p
          v-if="analysis.totalSurplus !== null"
          class="mt-1 text-[11px] leading-relaxed text-primary-700 dark:text-primary-400"
        >
          L'enveloppe est comparée au montant dépensé. Le surcoût réel est plus
          bas : pendant l'événement, vos dépenses habituelles n'ont pas eu lieu
          — c'est lui qui pèse sur le budget de l'année.
        </p>
      </div>

      <!-- Nudge towards a period when the surplus cannot be computed.
             Standalone condition: the envelope block above broke the chain. -->
      <BaseCard
        v-if="
          analysis.tag.isExceptional &&
          !(analysis.baseline && analysis.totalSurplus !== null)
        "
        bordered
        padding="sm"
        class="mb-6 text-xs text-gray-500 dark:text-gray-400"
      >
        Renseignez une période d'absence sur cette étiquette pour calculer le
        surcoût réel — ce que l'événement a coûté <em>en plus</em> d'une période
        ordinaire de même durée.
      </BaseCard>

      <!-- Charts -->
      <div
        class="grid gap-4 mb-6"
        :class="hasMonthlyBreakdown ? 'lg:grid-cols-2' : ''"
      >
        <!-- Expenses by category -->
        <BaseCard padding="sm">
          <h2
            class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3"
          >
            Dépenses par catégorie
          </h2>
          <div class="h-64">
            <CategoryPieChart
              :data="expensePie"
              title="Dépenses par catégorie"
            />
          </div>
        </BaseCard>

        <!-- Monthly breakdown -->
        <BaseCard v-if="hasMonthlyBreakdown" padding="sm">
          <h2
            class="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3"
          >
            Dépenses par mois
          </h2>
          <div class="h-64">
            <MonthlyBarChart
              :data="monthlyExpenses"
              title="Dépenses par mois"
              color="#ef4444"
            />
          </div>
        </BaseCard>
      </div>

      <!-- Per-category detail, with the everyday reference and the surplus -->
      <BaseCard padding="none" class="overflow-hidden mb-6">
        <div
          class="px-4 py-3 border-b border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
        >
          Détail par catégorie
        </div>
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr
                class="text-left text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700"
              >
                <th class="px-4 py-2 font-medium">Catégorie</th>
                <th class="px-4 py-2 font-medium text-right">Dépensé</th>
                <template v-if="analysis.baseline">
                  <th
                    class="px-4 py-2 font-medium text-right whitespace-nowrap"
                    :title="`Ce que vous dépensez habituellement dans cette catégorie sur ${analysis.baseline.eventDays} jour(s)`"
                  >
                    En temps normal
                  </th>
                  <th class="px-4 py-2 font-medium text-right">Surcoût</th>
                </template>
              </tr>
            </thead>
            <tbody class="divide-y dark:divide-slate-700">
              <tr
                v-for="cat in analysis.byCategory"
                :key="`${cat.categoryId}-${cat.type}`"
              >
                <td class="px-4 py-2">
                  <span
                    class="flex items-center gap-2 text-gray-700 dark:text-gray-300"
                  >
                    <span v-if="cat.categoryIcon">{{ cat.categoryIcon }}</span>
                    {{ cat.categoryName }}
                    <span class="text-xs text-gray-400"
                      >({{ cat.transactionCount }})</span
                    >
                  </span>
                </td>
                <td
                  class="px-4 py-2 text-right font-medium whitespace-nowrap"
                  :class="
                    cat.type === 'EXPENSE'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-700 dark:text-green-400'
                  "
                >
                  {{ formatCurrency(cat.amount) }}
                </td>
                <template v-if="analysis.baseline">
                  <td
                    class="px-4 py-2 text-right text-gray-400 whitespace-nowrap"
                  >
                    {{
                      cat.baselineAmount === undefined
                        ? '—'
                        : formatCurrency(cat.baselineAmount)
                    }}
                  </td>
                  <td
                    class="px-4 py-2 text-right font-semibold whitespace-nowrap"
                    :class="
                      cat.surplusAmount === undefined
                        ? 'text-gray-500 dark:text-gray-400'
                        : cat.surplusAmount >= 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-green-700 dark:text-green-400'
                    "
                  >
                    {{
                      cat.surplusAmount === undefined
                        ? '—'
                        : `${cat.surplusAmount >= 0 ? '+' : ''}${formatCurrency(cat.surplusAmount)}`
                    }}
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
        <p
          v-if="analysis.baseline"
          class="px-4 py-2.5 border-t border-gray-100 dark:border-slate-700 text-[11px] text-gray-400"
        >
          « En temps normal » projette votre rythme de dépense habituel sur la
          durée de l'événement. Les charges fixes de la catégorie (assurance,
          abonnements) y sont incluses alors qu'elles continuent d'être
          prélevées : sur ces catégories le surcoût est donc légèrement
          sous-estimé.
        </p>
      </BaseCard>

      <!-- Transactions list -->
      <BaseCard padding="none" class="overflow-hidden">
        <div
          class="px-4 py-3 border-b border-gray-200 dark:border-slate-700 text-sm font-semibold text-gray-700 dark:text-gray-300"
        >
          Transactions étiquetées
        </div>
        <div
          v-if="transactions.length === 0"
          class="py-8 text-center text-gray-500 dark:text-gray-400"
        >
          Aucune transaction associée.
        </div>
        <div v-else class="divide-y dark:divide-slate-700">
          <div
            v-for="tx in transactions"
            :key="tx.id"
            class="flex items-center justify-between gap-3 px-4 py-2.5"
          >
            <div class="min-w-0">
              <p
                class="text-sm font-medium text-gray-900 dark:text-gray-100 truncate"
              >
                {{ tx.description }}
              </p>
              <p class="text-xs text-gray-500 dark:text-gray-400">
                {{ formatDate(tx.date) }} ·
                {{ tx.categoryName || 'Sans catégorie' }}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <span
                class="text-sm font-semibold"
                :class="
                  tx.type === 'EXPENSE'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-green-700 dark:text-green-400'
                "
              >
                {{ formatCurrency(tx.amount) }}
              </span>
              <BaseIconButton
                size="sm"
                variant="danger"
                :label="`Retirer l'étiquette de ${tx.description}`"
                :loading="removingId === tx.id"
                @click="detach(tx)"
              >
                <IconClose />
              </BaseIconButton>
            </div>
          </div>
        </div>
      </BaseCard>
    </template>
  </PageShell>
</template>

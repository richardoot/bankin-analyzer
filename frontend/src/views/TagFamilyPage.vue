<script setup lang="ts">
  import { computed, onMounted, ref, watch } from 'vue'
  import { RouterLink, useRoute } from 'vue-router'
  import PageShell from '@/components/ui/PageShell.vue'
  import BackLink from '@/components/ui/BackLink.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import type { SegmentedOption } from '@/components/ui/SegmentedControl.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import CategoryPieChart from '@/components/charts/CategoryPieChart.vue'
  import TagStatusBadge from '@/components/tags/TagStatusBadge.vue'
  import { api } from '@/lib/api'
  import type {
    TagAnalysisCategoryDto,
    TagFamilyAnalysisBasis,
    TagFamilyAnalysisDto,
    TagFamilyAnalysisTagDto,
  } from '@/lib/api'
  import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'
  import type { TransactionsLinkFilters } from '@/lib/transactionsLink'
  import { formatCurrency, formatDate } from '@/lib/formatters'

  /**
   * A family of tags read as one: what its editions cost, by category and by
   * year, side by side. Each transaction counts once, however many of the
   * family's tags it carries.
   */
  const route = useRoute()
  const familyId = computed(() => String(route.params.id))

  const analysis = ref<TagFamilyAnalysisDto | null>(null)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  /** null reads the whole family. */
  const year = ref<number | null>(null)
  const basis = ref<TagFamilyAnalysisBasis>('event')

  const basisOptions: SegmentedOption<TagFamilyAnalysisBasis>[] = [
    {
      value: 'event',
      label: 'Année de l’événement',
      shortLabel: 'Événement',
      testId: 'family-basis-event',
    },
    { value: 'cash', label: 'Trésorerie', testId: 'family-basis-cash' },
  ]

  /**
   * The years the family touches in the chosen reading, latest first. A year
   * picked in the other reading stays offered, even empty in this one, so
   * the selection never vanishes from under the user.
   */
  const yearOptions = computed<SegmentedOption<number | null>[]>(() => {
    const years = new Set(analysis.value?.availableYears ?? [])
    if (year.value !== null) years.add(year.value)
    return [
      { value: null, label: 'Toutes', testId: 'family-year-all' },
      ...[...years]
        .sort((a, b) => b - a)
        .map(y => ({
          value: y,
          label: String(y),
          testId: `family-year-${y}`,
        })),
    ]
  })

  /** The chosen year as the list filters it: by payment date. */
  const yearWindow = computed<Pick<TransactionsLinkFilters, 'from' | 'to'>>(
    () =>
      year.value === null
        ? {}
        : { from: `${year.value}-01-01`, to: `${year.value}-12-31` }
  )

  const scopeLabel = computed(() => {
    const name = analysis.value?.family.name ?? 'Famille'
    return year.value === null ? name : `${name} · ${year.value}`
  })

  /**
   * The list can only read payment dates: in event reading, a trip paid in
   * November for January sits in the list of the other year.
   */
  const listFollowsCash = computed(
    () => basis.value === 'event' && year.value !== null
  )

  const familyLink = computed(() =>
    transactionsLink({
      tagFamilyId: familyId.value,
      ...yearWindow.value,
      gross: true,
      label: scopeLabel.value,
    })
  )

  function categoryLink(cat: TagAnalysisCategoryDto) {
    return transactionsLink({
      tagFamilyId: familyId.value,
      type: cat.type,
      categoryId: cat.categoryId ?? NO_CATEGORY,
      ...yearWindow.value,
      gross: true,
      label: `${scopeLabel.value} · ${cat.categoryName}`,
    })
  }

  function editionLink(tag: TagFamilyAnalysisTagDto) {
    return transactionsLink({ tagId: tag.id, gross: true, label: tag.name })
  }

  const expensePie = computed(() => {
    const rows = (analysis.value?.byCategory ?? []).filter(
      c => c.type === 'EXPENSE'
    )
    return {
      labels: rows.map(c => c.categoryName),
      values: rows.map(c => c.amount),
    }
  })

  /**
   * The annual envelope, weighed against the chosen year in event basis
   * whatever the reading shown: the server reads it that way, so a trip
   * paid in November for January draws on January's envelope. `year` is
   * null until a year is chosen.
   */
  const envelope = computed(() => {
    const budget = analysis.value?.family.annualBudget ?? null
    if (budget === null) return null
    const weighed = analysis.value?.envelope ?? null
    if (!weighed) return { budget, year: null }
    return {
      budget,
      year: weighed.year,
      spent: weighed.spentEventBasis,
      ratio: budget > 0 ? weighed.spentEventBasis / budget : 0,
      remaining: weighed.remaining,
    }
  })

  const hasEditions = computed(() =>
    (analysis.value?.tags ?? []).some(t => t.days !== null)
  )

  function period(tag: TagFamilyAnalysisTagDto): string {
    if (!tag.eventStartDate || !tag.eventEndDate) return '—'
    const start = formatDate(tag.eventStartDate, 'medium')
    const end = formatDate(tag.eventEndDate, 'medium')
    return start === end ? start : `${start} – ${end}`
  }

  function signed(value: number): string {
    return `${value >= 0 ? '+' : ''}${formatCurrency(value)}`
  }

  async function load(): Promise<void> {
    // The first load fills the page; a change of year or reading keeps the
    // figures on screen until the new ones arrive.
    if (!analysis.value) isLoading.value = true
    error.value = null
    try {
      analysis.value = await api.getTagFamilyAnalysis(familyId.value, {
        year: year.value,
        basis: basis.value,
      })
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : "Échec du chargement de l'analyse de la famille"
    } finally {
      isLoading.value = false
    }
  }

  watch([year, basis], () => void load())
  onMounted(load)
</script>

<template>
  <PageShell>
    <BackLink :to="{ name: 'tags' }" class="mb-4">Étiquettes</BackLink>

    <div
      v-if="isLoading"
      class="py-12 text-center text-gray-500 dark:text-gray-400"
    >
      Chargement de la famille…
    </div>

    <InlineAlert
      v-else-if="error && !analysis"
      data-testid="family-analysis-error"
      retry-label="Réessayer"
      retry-test-id="family-analysis-retry"
      @retry="load"
    >
      {{ error }}
    </InlineAlert>

    <template v-else-if="analysis">
      <!-- Header -->
      <div class="mb-4 flex items-center gap-3">
        <span
          class="inline-block h-4 w-4 shrink-0 rounded-full"
          :style="{ backgroundColor: analysis.family.color ?? '#9ca3af' }"
          aria-hidden="true"
        ></span>
        <h1
          class="text-2xl font-bold text-gray-900 sm:text-3xl dark:text-gray-100"
          data-testid="family-name"
        >
          {{ analysis.family.name }}
        </h1>
      </div>

      <InlineAlert v-if="error" class="mb-4" data-testid="family-refresh-error">
        {{ error }}
      </InlineAlert>

      <!-- Annual envelope: only when the family has one -->
      <div
        v-if="envelope"
        data-testid="family-envelope"
        class="mb-4 rounded-xl border border-primary-200 bg-primary-50 p-4 dark:border-primary-800 dark:bg-primary-900/20"
      >
        <p
          class="text-xs font-medium uppercase tracking-wide text-primary-800 dark:text-primary-300"
        >
          Enveloppe annuelle
          <strong class="tabular-nums">{{
            formatCurrency(envelope.budget)
          }}</strong>
        </p>
        <template v-if="envelope.year !== null">
          <div
            class="mt-2 h-2 w-full overflow-hidden rounded-full bg-primary-100 dark:bg-primary-950"
          >
            <div
              class="h-full rounded-full"
              :class="envelope.ratio > 1 ? 'bg-red-500' : 'bg-primary-600'"
              :style="{ width: `${Math.min(envelope.ratio, 1) * 100}%` }"
            ></div>
          </div>
          <p class="mt-2 text-xs text-primary-700 dark:text-primary-400">
            {{ envelope.year }} :
            <strong class="tabular-nums">{{
              formatCurrency(envelope.spent)
            }}</strong>
            dépensés ·
            <span
              v-if="envelope.remaining < 0"
              class="font-semibold text-red-600 dark:text-red-400"
            >
              dépassement de {{ formatCurrency(-envelope.remaining) }}
            </span>
            <span v-else>reste {{ formatCurrency(envelope.remaining) }}</span>
          </p>
          <p
            v-if="basis === 'cash'"
            data-testid="family-envelope-event-note"
            class="mt-1 text-xs text-primary-700 dark:text-primary-400"
          >
            L’enveloppe se lit par année d’événement : un voyage payé l’année
            d’avant compte dans l’année du voyage.
          </p>
        </template>
        <p v-else class="mt-1 text-xs text-primary-700 dark:text-primary-400">
          Choisissez une année pour lire sa consommation.
        </p>
      </div>

      <!-- Scope: a year, and how a year is read -->
      <div class="mb-6 flex flex-col gap-2">
        <SegmentedControl
          v-model="year"
          :options="yearOptions"
          label="Année"
          size="sm"
          scrollable
          data-testid="family-year-filter"
        />
        <SegmentedControl
          v-model="basis"
          :options="basisOptions"
          label="Lecture de l’année"
          size="sm"
          data-testid="family-basis"
        />
        <p class="text-xs text-gray-500 dark:text-gray-400">
          <template v-if="basis === 'event'">
            Une dépense compte pour l’année où son événement commence, même
            payée avant.
          </template>
          <template v-else>
            Une dépense compte pour l’année où elle a été payée.
          </template>
        </p>
      </div>

      <!-- Totals -->
      <div class="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <BaseCard padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Dépensé</p>
          <p
            class="mt-1 text-xl font-bold tabular-nums text-red-600 dark:text-red-400"
            data-testid="family-total"
          >
            {{ formatCurrency(analysis.totalExpenses) }}
          </p>
        </BaseCard>
        <BaseCard padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Transactions</p>
          <p
            class="mt-1 text-xl font-bold tabular-nums text-gray-900 dark:text-gray-100"
          >
            {{ analysis.transactionCount }}
          </p>
        </BaseCard>
        <BaseCard v-if="analysis.totalSurplus !== null" padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Surcoût réel</p>
          <p
            class="mt-1 text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400"
            data-testid="family-surplus"
          >
            {{ formatCurrency(analysis.totalSurplus) }}
          </p>
        </BaseCard>
        <BaseCard v-if="analysis.totalIncome > 0" padding="sm">
          <p class="text-xs text-gray-500 dark:text-gray-400">Revenus</p>
          <p
            class="mt-1 text-xl font-bold tabular-nums text-green-700 dark:text-green-400"
          >
            {{ formatCurrency(analysis.totalIncome) }}
          </p>
        </BaseCard>
      </div>
      <div class="mb-6">
        <TransactionsLink
          :to="familyLink"
          :subject="scopeLabel"
          size="md"
          data-testid="family-transactions-link"
        >
          Voir les transactions
        </TransactionsLink>
        <p
          v-if="listFollowsCash"
          class="mt-1 text-xs text-gray-500 dark:text-gray-400"
          data-testid="family-transactions-cash-note"
        >
          La liste suit la date de paiement : une dépense payée une autre année
          que son événement n’y figure pas.
        </p>
      </div>

      <p
        v-if="analysis.tags.length === 0"
        class="mb-6 text-sm text-gray-500 dark:text-gray-400"
        data-testid="family-empty"
      >
        Aucune étiquette de cette famille sur cette période.
      </p>

      <!-- Editions -->
      <section
        v-if="analysis.tags.length > 0"
        aria-labelledby="family-editions-heading"
        class="mb-6"
      >
        <SectionLabel id="family-editions-heading" as="h2" class="mb-3">
          {{ hasEditions ? 'Éditions' : 'Étiquettes' }}
        </SectionLabel>

        <!-- Comparison of the editions -->
        <BaseCard
          v-if="analysis.comparison"
          padding="sm"
          class="mb-3"
          data-testid="family-comparison"
        >
          <dl class="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-4">
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">
                Moyenne par édition
              </dt>
              <dd class="font-semibold tabular-nums">
                {{ formatCurrency(analysis.comparison.averageSpent) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">Médiane</dt>
              <dd class="font-semibold tabular-nums">
                {{ formatCurrency(analysis.comparison.medianSpent) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">
                Par jour d’événement
              </dt>
              <dd class="font-semibold tabular-nums">
                {{ formatCurrency(analysis.comparison.averagePerDay) }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-gray-500 dark:text-gray-400">Éditions</dt>
              <dd class="font-semibold tabular-nums">
                {{ analysis.comparison.editionCount }}
              </dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs text-gray-500 dark:text-gray-400">
                La plus chère
              </dt>
              <dd class="truncate">
                {{ analysis.comparison.mostExpensive.name }} ·
                <span class="font-semibold tabular-nums">{{
                  formatCurrency(analysis.comparison.mostExpensive.spent)
                }}</span>
              </dd>
            </div>
            <div class="col-span-2">
              <dt class="text-xs text-gray-500 dark:text-gray-400">
                La moins chère
              </dt>
              <dd class="truncate">
                {{ analysis.comparison.leastExpensive.name }} ·
                <span class="font-semibold tabular-nums">{{
                  formatCurrency(analysis.comparison.leastExpensive.spent)
                }}</span>
              </dd>
            </div>
          </dl>
        </BaseCard>

        <BaseCard padding="none" class="overflow-hidden">
          <!-- Under md, one card per edition: a seven-column table scrolled
               sideways is not a reading. -->
          <ul
            class="divide-y divide-gray-100 md:hidden dark:divide-slate-700"
            data-testid="family-edition-cards"
          >
            <li
              v-for="tag in analysis.tags"
              :key="`card-${tag.id}`"
              class="px-4 py-3"
            >
              <div class="flex items-center justify-between gap-3">
                <span class="flex min-w-0 items-center gap-2">
                  <RouterLink
                    :to="{ name: 'tag-analysis', params: { id: tag.id } }"
                    class="truncate text-sm font-medium text-primary-700 hover:underline dark:text-primary-400"
                  >
                    {{ tag.name }}
                  </RouterLink>
                  <TagStatusBadge v-if="tag.status" :status="tag.status" />
                </span>
                <span
                  class="shrink-0 text-sm font-semibold tabular-nums text-gray-900 dark:text-gray-100"
                >
                  {{ formatCurrency(tag.spent) }}
                </span>
              </div>
              <div
                class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500 dark:text-gray-400"
              >
                <span v-if="tag.days !== null"
                  >{{ period(tag) }} · {{ tag.days }} j</span
                >
                <span v-if="tag.spentPerDay !== null" class="tabular-nums"
                  >{{ formatCurrency(tag.spentPerDay) }}/j</span
                >
                <span v-if="tag.surplus !== null" class="tabular-nums"
                  >surcoût {{ signed(tag.surplus) }}</span
                >
                <span v-if="tag.isPartial">en partie sur l’année</span>
                <TransactionsLink
                  :to="editionLink(tag)"
                  :subject="tag.name"
                  icon-only
                  class="h-6 w-6"
                />
              </div>
            </li>
          </ul>

          <div class="overflow-x-auto max-md:hidden">
            <table class="w-full text-sm" data-testid="family-editions-table">
              <thead>
                <tr
                  class="border-b border-gray-100 text-left text-xs text-gray-500 dark:border-slate-700 dark:text-gray-400"
                >
                  <th class="px-4 py-2 font-medium">Nom</th>
                  <th class="px-4 py-2 font-medium">Période</th>
                  <th class="px-4 py-2 text-right font-medium">Jours</th>
                  <th class="px-4 py-2 text-right font-medium">Dépensé</th>
                  <th class="px-4 py-2 text-right font-medium">Par jour</th>
                  <th class="px-4 py-2 text-right font-medium">Surcoût</th>
                  <th class="px-4 py-2">
                    <span class="sr-only">Transactions</span>
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-slate-700">
                <tr
                  v-for="tag in analysis.tags"
                  :key="tag.id"
                  :data-testid="`family-edition-${tag.id}`"
                >
                  <td class="px-4 py-2">
                    <span class="flex items-center gap-2">
                      <RouterLink
                        :to="{ name: 'tag-analysis', params: { id: tag.id } }"
                        class="font-medium text-primary-700 hover:underline dark:text-primary-400"
                        :data-testid="`family-edition-link-${tag.id}`"
                      >
                        {{ tag.name }}
                      </RouterLink>
                      <TagStatusBadge v-if="tag.status" :status="tag.status" />
                    </span>
                    <span
                      v-if="tag.isPartial"
                      class="block text-[11px] text-gray-400"
                      >En partie sur l’année</span
                    >
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-2 text-gray-600 dark:text-gray-300"
                  >
                    {{ period(tag) }}
                  </td>
                  <td class="px-4 py-2 text-right tabular-nums">
                    {{ tag.days ?? '—' }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-2 text-right font-medium tabular-nums"
                  >
                    {{ formatCurrency(tag.spent) }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-2 text-right tabular-nums"
                  >
                    {{
                      tag.spentPerDay === null
                        ? '—'
                        : formatCurrency(tag.spentPerDay)
                    }}
                  </td>
                  <td
                    class="whitespace-nowrap px-4 py-2 text-right tabular-nums"
                    :class="
                      tag.surplus === null
                        ? 'text-gray-400'
                        : 'font-semibold text-amber-700 dark:text-amber-400'
                    "
                  >
                    {{ tag.surplus === null ? '—' : signed(tag.surplus) }}
                  </td>
                  <td class="px-4 py-2 text-right">
                    <TransactionsLink
                      :to="editionLink(tag)"
                      :subject="tag.name"
                      icon-only
                      :data-testid="`family-edition-transactions-${tag.id}`"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </BaseCard>
      </section>

      <!-- Categories -->
      <section
        v-if="analysis.byCategory.length > 0"
        aria-labelledby="family-categories-heading"
        class="mb-6"
      >
        <SectionLabel id="family-categories-heading" as="h2" class="mb-3">
          Par catégorie
        </SectionLabel>
        <div class="grid gap-4 lg:grid-cols-2">
          <BaseCard padding="sm">
            <div class="h-64">
              <CategoryPieChart
                :data="expensePie"
                title="Dépenses par catégorie"
              />
            </div>
          </BaseCard>
          <BaseCard padding="none">
            <ul
              class="divide-y divide-gray-100 dark:divide-slate-700"
              data-testid="family-categories"
            >
              <li
                v-for="cat in analysis.byCategory"
                :key="`${cat.categoryId}-${cat.type}`"
                class="flex items-center justify-between gap-3 px-4 py-2.5"
              >
                <span
                  class="flex min-w-0 items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <span v-if="cat.categoryIcon">{{ cat.categoryIcon }}</span>
                  <span class="truncate">{{ cat.categoryName }}</span>
                  <span class="shrink-0 text-xs text-gray-400"
                    >({{ cat.transactionCount }})</span
                  >
                  <TransactionsLink
                    :to="categoryLink(cat)"
                    :subject="cat.categoryName"
                    icon-only
                    class="h-6 w-6"
                  />
                </span>
                <span
                  class="shrink-0 text-sm font-medium tabular-nums"
                  :class="
                    cat.type === 'EXPENSE'
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-700 dark:text-green-400'
                  "
                >
                  {{ formatCurrency(cat.amount) }}
                </span>
              </li>
            </ul>
          </BaseCard>
        </div>
      </section>

      <!-- Years, for the whole family: each opens its year -->
      <section
        v-if="year === null && analysis.byYear.length > 1"
        aria-labelledby="family-years-heading"
      >
        <SectionLabel id="family-years-heading" as="h2" class="mb-3">
          Par année
        </SectionLabel>
        <BaseCard padding="none">
          <ul class="divide-y divide-gray-100 dark:divide-slate-700">
            <li v-for="row in analysis.byYear" :key="row.year">
              <button
                type="button"
                class="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500 dark:hover:bg-slate-700/50"
                :data-testid="`family-year-row-${row.year}`"
                @click="year = row.year"
              >
                <span class="font-medium text-gray-900 dark:text-gray-100">
                  {{ row.year }}
                  <span class="text-xs font-normal text-gray-400"
                    >({{ row.transactionCount }})</span
                  >
                </span>
                <span class="tabular-nums text-gray-700 dark:text-gray-300">
                  {{ formatCurrency(row.expenses) }}
                </span>
              </button>
            </li>
          </ul>
        </BaseCard>
      </section>
    </template>
  </PageShell>
</template>

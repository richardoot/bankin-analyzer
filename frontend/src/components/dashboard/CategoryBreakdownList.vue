<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import {
    UNCATEGORIZED_CATEGORY_ID,
    type CategoryDataDto,
    type SubcategoryDataDto,
  } from '@/lib/api'
  import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'
  import { isAmortizationCarrier } from '@/lib/amortization'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import MonthlyBarChart from '@/components/charts/MonthlyBarChart.vue'
  import {
    formatCompactCurrency,
    formatCurrency,
    formatMonth,
  } from '@/lib/formatters'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import { useChartTheme } from '@/composables/useChartTheme'

  const props = withDefaults(
    defineProps<{
      categories: CategoryDataDto[]
      monthLabels: string[]
      total: number
      /**
       * Color of the drill-down chart; the row's trend line is neutral. Defaults
       * to the bars' blue (`BAR_COLOR`), so the expanded row reads as one.
       */
      color?: string
      /**
       * 'everyday' strips the share carried by exceptional events (holidays,
       * birthdays) from the headline figures, leaving the recurring lifestyle.
       */
      mode?: 'real' | 'everyday'
      /**
       * The period the figures cover, for the links to the Transactions
       * page: a row opens its category over that window, a bar of the
       * drill-down chart opens its month.
       */
      window?:
        { from?: string | undefined; to?: string | undefined } | undefined
    }>(),
    {
      color: '#60a5fa',
      mode: 'real',
      window: undefined,
    }
  )

  const router = useRouter()

  /** The id a link names: the unfiled rows have a word for it, not an id. */
  function linkCategoryId(cat: CategoryDataDto): string {
    return cat.categoryId === UNCATEGORIZED_CATEGORY_ID
      ? NO_CATEGORY
      : cat.categoryId
  }

  /**
   * The figures here are netted and shared; the list is not. `gross` makes
   * the Transactions page say so.
   */
  function rowLink(cat: CategoryDataDto) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: linkCategoryId(cat),
      from: props.window?.from,
      to: props.window?.to,
      exceptional: everydayFilter.value,
      gross: true,
      label: cat.category,
    })
  }

  /**
   * In « Vie courante » the row's figure leaves the events out; its link
   * does the same. The real reading counts everything, and filters nothing.
   */
  const everydayFilter = computed(() =>
    props.mode === 'everyday' ? ('exclude' as const) : undefined
  )

  /** The share the events carry, on its own: what « dont / hors » names. */
  function exceptionalLink(cat: CategoryDataDto) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: linkCategoryId(cat),
      from: props.window?.from,
      to: props.window?.to,
      exceptional: 'only',
      gross: true,
      label: `${cat.category} · événements exceptionnels`,
    })
  }

  /**
   * A subcategory line opens the rows it sums — by the subcategory's id,
   * `none` for the line of the rows filed under none. Its figure counts
   * every row, events included, so the link never narrows on them.
   */
  function subcategoryLink(cat: CategoryDataDto, sub: SubcategoryDataDto) {
    return transactionsLink({
      type: 'EXPENSE',
      categoryId: linkCategoryId(cat),
      subcategoryId: sub.subcategoryId ?? NO_CATEGORY,
      from: props.window?.from,
      to: props.window?.to,
      gross: true,
      label: `${cat.category} · ${subcategoryName(sub)}`,
    })
  }

  function subcategoryName(sub: SubcategoryDataDto): string {
    return sub.subcategory || 'sans sous-catégorie'
  }

  function openMonth(cat: CategoryDataDto, month: string): void {
    void router.push(
      transactionsLink({
        type: 'EXPENSE',
        categoryId: linkCategoryId(cat),
        month,
        exceptional: everydayFilter.value,
        gross: true,
        label: `${cat.category} · ${formatMonth(month, { capitalize: false })}`,
      })
    )
  }

  const expanded = ref<Set<string>>(new Set())

  function toggleExpanded(key: string) {
    if (expanded.value.has(key)) {
      expanded.value.delete(key)
    } else {
      expanded.value.add(key)
    }
  }

  function isExpanded(key: string): boolean {
    return expanded.value.has(key)
  }

  // Display labels (Jan 2025 etc.) for the bar chart x-axis
  const displayLabels = computed(() =>
    props.monthLabels.map(ym => formatMonth(ym, { year: false }))
  )

  function rowKey(cat: CategoryDataDto): string {
    return cat.categoryId
  }

  const isEveryday = computed(() => props.mode === 'everyday')

  /**
   * The breakdown lines shown. The real reading must look as it did before
   * smoothing: a line only slices of smoothed purchases reach is left out.
   */
  function subcategoryLines(cat: CategoryDataDto): SubcategoryDataDto[] {
    const lines = cat.subcategories ?? []
    return isEveryday.value
      ? lines
      : lines.filter(sub => !isAmortizationCarrier(sub))
  }

  /**
   * A line's figure in the active reading. Only a line a smoothed purchase
   * touches carries its own everyday figures; every other line keeps the
   * one it always had.
   */
  function subcategoryAmount(sub: SubcategoryDataDto): number {
    return isEveryday.value && sub.everydayAmount !== undefined
      ? sub.everydayAmount
      : sub.amount
  }

  function subcategoryAverage(sub: SubcategoryDataDto): number {
    return isEveryday.value && sub.everydayAveragePerMonth !== undefined
      ? sub.everydayAveragePerMonth
      : sub.averagePerMonth
  }

  /** Amount over the period, in the active mode. */
  function displayedAmount(cat: CategoryDataDto): number {
    if (isEveryday.value && cat.everydayAmount !== undefined) {
      return cat.everydayAmount
    }
    return cat.amount
  }

  /** Monthly average, in the active mode. Undefined without a breakdown. */
  function displayedAverage(cat: CategoryDataDto): number | undefined {
    if (isEveryday.value && cat.everydayAveragePerMonth !== undefined) {
      return cat.everydayAveragePerMonth
    }
    return cat.averagePerMonth
  }

  function getPercent(cat: CategoryDataDto): number {
    if (props.total <= 0) return 0
    return (displayedAmount(cat) / props.total) * 100
  }

  const percentFormat = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })

  /** « 12,3 % », the way a bar's end and its name say it. */
  function formatPercent(value: number): string {
    return `${percentFormat.format(value)}\u202f%`
  }

  function percentLabel(cat: CategoryDataDto): string {
    return formatPercent(getPercent(cat))
  }

  /**
   * What a subcategory line weighs in its category, in %. Measured against
   * the sum of the lines shown, which is the category's displayed amount
   * in the real reading; in « Vie courante » a line keeps the events the
   * category's figure leaves out, and the lines must still make one whole.
   */
  function subcategoryPercent(
    cat: CategoryDataDto,
    sub: SubcategoryDataDto
  ): number {
    const whole = subcategoryLines(cat).reduce(
      (sum, line) => sum + Math.max(0, subcategoryAmount(line)),
      0
    )
    if (whole <= 0) return 0
    return (Math.max(0, subcategoryAmount(sub)) / whole) * 100
  }

  function subcategoryBarWidth(
    cat: CategoryDataDto,
    sub: SubcategoryDataDto
  ): number {
    return Math.min(100, subcategoryPercent(cat, sub))
  }

  function subcategoryBarLabel(
    cat: CategoryDataDto,
    sub: SubcategoryDataDto
  ): string {
    return `${formatPercent(subcategoryPercent(cat, sub))} de ${cat.category}`
  }

  /** « 12 transactions », « 1 transaction ». */
  function transactionCountLabel(count: number): string {
    return `${count} transaction${count > 1 ? 's' : ''}`
  }

  /**
   * The bar's length, in % of its track: the category's share of the
   * period's total, so the bars of the list add up to one full track.
   */
  function barWidth(cat: CategoryDataDto): number {
    return Math.min(100, Math.max(0, getPercent(cat)))
  }

  /**
   * A category with any spending keeps a sliver of bar, so a 0,1 % line
   * still shows it exists.
   */
  function barMinWidth(cat: CategoryDataDto): string | undefined {
    return displayedAmount(cat) > 0 ? '3px' : undefined
  }

  /** The period's total, in whole euros, for the column's header. */
  const totalLabelShort = computed(() => formatCompactCurrency(props.total))

  /**
   * The share of the bar the events carry, in % of the bar. Only in the
   * real reading: in « Vie courante » they are out of the figure, so out
   * of the bar too — the expanded line still names them.
   */
  function eventsWidth(cat: CategoryDataDto): number {
    if (isEveryday.value) return 0
    const amount = displayedAmount(cat)
    const events = cat.exceptionalAmount ?? 0
    if (amount <= 0 || events <= 0) return 0
    return Math.min(100, (events / amount) * 100)
  }

  const { isDark, labelColor, donutValueColor } = useChartTheme()

  /**
   * One hue for every bar: the length carries the amount, the emoji and
   * the name carry the category. blue-400 reads on both themes.
   */
  const BAR_COLOR = '#60a5fa'

  /** Stripes over the bar's blue, in the color of the card. */
  const hatch = computed(() => {
    const stripe = isDark.value
      ? 'rgb(15 23 42 / 0.55)' // slate-900
      : 'rgb(255 255 255 / 0.6)'
    return `repeating-linear-gradient(-45deg, ${stripe} 0 2px, transparent 2px 4px)`
  })

  /** What a screen reader hears, and what the pointer shows, for a bar. */
  function barLabel(cat: CategoryDataDto): string {
    const share = `${percentLabel(cat)} des dépenses`
    if (eventsWidth(cat) === 0 || !cat.exceptionalAmount) return share
    return `${share}, dont ${formatCurrency(cat.exceptionalAmount)} d’événements exceptionnels`
  }

  const monthCount = computed(() => props.monthLabels.length)

  /** A trend needs two months; a one-month period has no column for it. */
  const showTrend = computed(() => monthCount.value >= 2)

  /** « Moyenne par mois », or the plain amount over a single month. */
  const hasAverages = computed(() =>
    props.categories.some(cat => displayedAverage(cat) !== undefined)
  )

  /**
   * One grid for the whole list: the header and every row are subgrids of
   * it, so each `auto` track is sized over all the rows and a column falls
   * on one vertical. Name · share · [trend] · figure · link.
   */
  const gridTemplate = computed(() =>
    [
      'minmax(0, 1fr)',
      'minmax(6rem, 15rem)',
      ...(showTrend.value ? ['auto'] : []),
      'auto',
      'auto',
    ].join(' ')
  )

  /** The sparkline in words: its span, its ends, the dashed average. */
  function sparklineLabel(cat: CategoryDataDto): string {
    const data = getSparklineData(cat)
    const first = data[0] ?? 0
    const last = data.at(-1) ?? 0
    const average = displayedAverage(cat)
    const parts = [
      `${cat.category} sur ${data.length} mois : de ${formatCurrency(first)} à ${formatCurrency(last)}`,
      `au plus ${formatCurrency(Math.max(...data))}`,
    ]
    if (average !== undefined) {
      parts.push(`moyenne ${formatCurrency(average)} par mois`)
    }
    return parts.join(', ')
  }

  /** « Total sur 3 mois », or « Total » over a single month. */
  const totalLabel = computed(() =>
    monthCount.value >= 2 ? `Total sur ${monthCount.value} mois` : 'Total'
  )

  // Each category may not have monthlyAmounts (legacy/empty); guard.
  function getSparklineData(cat: CategoryDataDto): number[] {
    if (isEveryday.value && cat.everydayMonthlyAmounts) {
      return cat.everydayMonthlyAmounts
    }
    return cat.monthlyAmounts ?? []
  }

  /**
   * The events' part of each month, stacked hatched on the drill-down
   * chart — in the real reading only, and only when a month carries any.
   */
  function chartOverlay(
    cat: CategoryDataDto
  ): { values: number[]; label: string } | undefined {
    if (isEveryday.value || !cat.monthlyAmounts) return undefined
    const events = cat.exceptionalMonthlyAmounts
    if (!events || !events.some(value => value !== 0)) return undefined
    return { values: events, label: 'événements' }
  }

  const roundCents = (value: number) => Math.round(value * 100) / 100

  /**
   * The bars under the overlay: the month's real total less its events, so
   * the stack adds up to the real total. Not `everydayMonthlyAmounts`: that
   * one trades a smoothed purchase's month for its slices, and the stack
   * would no longer be the month the real reading shows.
   */
  function chartDataFor(cat: CategoryDataDto) {
    const overlay = chartOverlay(cat)
    const values = overlay
      ? (cat.monthlyAmounts ?? []).map((amount, i) =>
          roundCents(amount - (overlay.values[i] ?? 0))
        )
      : getSparklineData(cat)
    return { labels: displayLabels.value, values }
  }
</script>

<template>
  <div data-testid="category-breakdown-list">
    <div
      v-if="categories.length === 0"
      class="py-8 text-center text-sm text-gray-500 dark:text-gray-400"
    >
      Aucune catégorie à afficher
    </div>

    <!-- One grid for the whole list from `sm`: the header and every row are
         subgrids of it, so a column falls on one vertical. Below `sm` each
         row keeps its own grid: name and figure, the bar under them. -->
    <div
      v-else
      data-testid="category-table"
      class="sm:grid sm:gap-x-4 sm:[grid-template-columns:var(--row-grid)]"
      :style="{ '--row-grid': gridTemplate }"
    >
      <div
        data-testid="category-table-header"
        class="hidden sm:grid sm:col-span-full sm:grid-cols-subgrid items-end px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-slate-700"
      >
        <span>Catégorie</span>
        <span>
          Part des dépenses<template v-if="total > 0">
            · sur {{ totalLabelShort }}</template
          >
        </span>
        <!-- A short title over a 130px sparkline, the dashed line's key
             under it in small type: the column stays as narrow as the
             chart, which sits centered on the same vertical. -->
        <span v-if="showTrend" class="whitespace-nowrap text-center">
          <span class="block">Tendance · {{ monthCount }} mois</span>
          <span class="block font-normal normal-case tracking-normal">
            <span
              class="inline-block w-3 border-t border-dashed border-current align-middle"
              aria-hidden="true"
            />
            <span class="sr-only">pointillé :</span>
            moyenne
          </span>
        </span>
        <span class="text-right">
          {{ hasAverages ? 'Moyenne par mois' : 'Montant' }}
        </span>
        <span aria-hidden="true" />
      </div>

      <div
        class="divide-y divide-gray-100 sm:col-span-full sm:grid sm:grid-cols-subgrid dark:divide-slate-700"
      >
        <div
          v-for="cat in categories"
          :key="rowKey(cat)"
          class="sm:col-span-full sm:grid sm:grid-cols-subgrid"
        >
          <!-- Row: the toggle on the name, then share, trend, figure, and
               the link to its transactions — never inside the toggle, a
               link in a button is two gestures in one. -->
          <div
            class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1.5 px-2 py-2.5 transition-colors hover:bg-gray-50 sm:col-span-full sm:grid-cols-subgrid sm:gap-x-4 sm:gap-y-0 dark:hover:bg-slate-800/60"
          >
            <button
              type="button"
              :data-testid="`category-row-${cat.category}`"
              class="col-start-1 row-start-1 flex min-w-0 items-center gap-2 rounded py-1 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 sm:col-start-auto sm:row-start-auto"
              :aria-expanded="isExpanded(rowKey(cat))"
              @click="toggleExpanded(rowKey(cat))"
            >
              <IconChevronRight
                class="h-4 w-4 text-gray-500 dark:text-gray-400 shrink-0 transition-transform"
                :class="{ 'rotate-90': isExpanded(rowKey(cat)) }"
              />
              <span v-if="cat.icon" class="text-lg shrink-0">{{
                cat.icon
              }}</span>
              <span
                class="min-w-0 truncate font-medium text-gray-900 dark:text-gray-100"
              >
                {{ cat.category }}
              </span>
            </button>

            <!-- Share: the bar is the category's part of the total, its
                 figure written at the end, the events hatched. On a phone
                 it takes the second line, the figure on the right. -->
            <div
              class="col-span-3 row-start-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto"
            >
              <div
                :data-testid="`category-share-${cat.category}`"
                role="img"
                :aria-label="barLabel(cat)"
                :title="barLabel(cat)"
                class="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
              >
                <div
                  :data-testid="`category-share-fill-${cat.category}`"
                  class="flex h-full justify-end rounded-full"
                  :style="{
                    width: `${barWidth(cat)}%`,
                    minWidth: barMinWidth(cat),
                    backgroundColor: BAR_COLOR,
                  }"
                >
                  <div
                    v-if="eventsWidth(cat) > 0"
                    :data-testid="`category-share-events-${cat.category}`"
                    class="h-full"
                    :style="{
                      width: `${eventsWidth(cat)}%`,
                      backgroundImage: hatch,
                    }"
                  />
                </div>
              </div>
              <!-- The bar's label, already in its name: heard once. -->
              <span
                :data-testid="`category-share-pct-${cat.category}`"
                class="w-[46px] shrink-0 text-right text-xs text-gray-500 tabular-nums dark:text-gray-400"
                aria-hidden="true"
              >
                {{ percentLabel(cat) }}
              </span>
            </div>

            <!-- Trend: measured from zero, the dashed line is the figure. -->
            <div
              v-if="showTrend"
              :data-testid="`category-trend-${cat.category}`"
              class="hidden sm:flex sm:justify-center"
            >
              <SparklineChart
                v-if="getSparklineData(cat).length >= 2"
                :data="getSparklineData(cat)"
                :width="130"
                baseline="zero"
                :reference="displayedAverage(cat)"
                :color="labelColor"
                :end-color="donutValueColor"
                :label="sparklineLabel(cat)"
              />
            </div>

            <!-- The figure: the monthly average, or the amount over one
                 month. -->
            <div
              :data-testid="`category-average-${cat.category}`"
              class="col-start-2 row-start-1 whitespace-nowrap text-right font-semibold text-gray-900 tabular-nums sm:col-start-auto sm:row-start-auto dark:text-gray-100"
            >
              {{ formatCurrency(displayedAverage(cat) ?? displayedAmount(cat))
              }}<span
                v-if="displayedAverage(cat) !== undefined"
                class="text-xs font-normal text-gray-500 dark:text-gray-400"
              >
                /mois</span
              >
            </div>

            <TransactionsLink
              :to="rowLink(cat)"
              :subject="cat.category"
              icon-only
              class="col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
              :data-testid="`category-link-${cat.category}`"
            />
          </div>

          <!-- Drill-down panel -->
          <div
            v-if="isExpanded(rowKey(cat))"
            :data-testid="`category-panel-${cat.category}`"
            class="col-span-full min-w-0 border-t border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/40 px-4 py-4"
          >
            <!-- The facts the row leaves out: the total, the count, and
                 the events' part with the rows behind it. The share is
                 written on the bar. -->
            <div
              :data-testid="`category-facts-${cat.category}`"
              class="mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500 tabular-nums dark:text-gray-400"
            >
              <span>
                {{ totalLabel }} :
                <strong
                  class="font-semibold text-gray-900 dark:text-gray-100"
                  >{{ formatCurrency(displayedAmount(cat)) }}</strong
                >
              </span>
              <template v-if="cat.transactionCount !== undefined">
                <span aria-hidden="true">·</span>
                <span>{{ transactionCountLabel(cat.transactionCount) }}</span>
              </template>
              <template
                v-if="cat.exceptionalAmount && cat.exceptionalAmount > 0"
              >
                <span aria-hidden="true">·</span>
                <span>
                  Événements :
                  <strong
                    class="font-semibold text-gray-900 dark:text-gray-100"
                    >{{ formatCurrency(cat.exceptionalAmount) }}</strong
                  >
                  {{ isEveryday ? '(exclus de la moyenne)' : '(inclus)' }}
                </span>
                <TransactionsLink
                  :to="exceptionalLink(cat)"
                  :subject="`${cat.category} · événements exceptionnels`"
                  :data-testid="`category-exceptional-link-${cat.category}`"
                >
                  Voir
                </TransactionsLink>
              </template>
            </div>

            <!-- Subcategories: one grid, each line a subgrid of it, so the
                 columns fall on one vertical. Name · share of the category ·
                 count · amount · per month · link; on a phone the count and
                 the per month step out. -->
            <div v-if="subcategoryLines(cat).length > 0" class="mb-4">
              <SectionLabel as="h4" class="mb-2">
                Sous-catégories · part de la catégorie
              </SectionLabel>
              <div
                class="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_minmax(6rem,12rem)_auto_auto_auto_auto]"
              >
                <div
                  v-for="sub in subcategoryLines(cat)"
                  :key="sub.subcategoryId ?? '(sans sous-catégorie)'"
                  class="col-span-full grid grid-cols-subgrid items-center gap-y-1.5 py-1.5 pl-3 pr-1 rounded text-sm bg-white sm:gap-y-0 dark:bg-slate-900"
                  :data-testid="`subcategory-line-${cat.category}-${sub.subcategory || 'none'}`"
                >
                  <span
                    class="col-start-1 row-start-1 flex min-w-0 items-center gap-3 sm:col-start-auto sm:row-start-auto"
                  >
                    <span
                      v-if="sub.icon"
                      class="text-base shrink-0 leading-none"
                      aria-hidden="true"
                    >
                      {{ sub.icon }}
                    </span>
                    <span class="truncate text-gray-700 dark:text-gray-300">
                      {{ sub.subcategory || '(sans sous-catégorie)' }}
                    </span>
                  </span>
                  <!-- On a phone the bar takes its own line under the name. -->
                  <span
                    class="col-span-full row-start-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto"
                  >
                    <span
                      :data-testid="`subcategory-share-${cat.category}-${sub.subcategory || 'none'}`"
                      role="img"
                      :aria-label="subcategoryBarLabel(cat, sub)"
                      :title="subcategoryBarLabel(cat, sub)"
                      class="h-2.5 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
                    >
                      <span
                        class="block h-full rounded-full"
                        :style="{
                          width: `${subcategoryBarWidth(cat, sub)}%`,
                          minWidth:
                            subcategoryAmount(sub) > 0 ? '3px' : undefined,
                          backgroundColor: BAR_COLOR,
                        }"
                      />
                    </span>
                    <span
                      :data-testid="`subcategory-share-pct-${cat.category}-${sub.subcategory || 'none'}`"
                      class="w-[46px] shrink-0 text-right text-xs text-gray-500 tabular-nums dark:text-gray-400"
                      aria-hidden="true"
                    >
                      {{ formatPercent(subcategoryPercent(cat, sub)) }}
                    </span>
                  </span>
                  <span
                    class="hidden text-right text-xs text-gray-500 tabular-nums sm:inline dark:text-gray-400"
                  >
                    {{ sub.transactionCount }} tx
                  </span>
                  <span
                    class="col-start-2 row-start-1 text-right font-medium text-gray-900 tabular-nums sm:col-start-auto sm:row-start-auto dark:text-gray-100"
                  >
                    {{ formatCurrency(subcategoryAmount(sub)) }}
                  </span>
                  <span
                    class="hidden text-right text-xs text-gray-500 dark:text-gray-400 tabular-nums sm:inline"
                  >
                    {{ formatCurrency(subcategoryAverage(sub)) }}/mois
                  </span>
                  <TransactionsLink
                    :to="subcategoryLink(cat, sub)"
                    :subject="`${cat.category} · ${subcategoryName(sub)}`"
                    icon-only
                    class="-my-1 col-start-3 row-start-1 sm:col-start-auto sm:row-start-auto"
                    :data-testid="`subcategory-link-${cat.category}-${sub.subcategory || 'none'}`"
                  />
                </div>
              </div>
            </div>

            <!-- Monthly evolution chart -->
            <div v-if="getSparklineData(cat).length >= 2">
              <SectionLabel as="h4" class="mb-2">
                Évolution mensuelle
              </SectionLabel>
              <!-- A bar opens its month; the link above is the keyboard way.
                   The dashed line is the row's average; in the real reading
                   the events stack hatched on the rest of each month. -->
              <MonthlyBarChart
                :data="chartDataFor(cat)"
                :title="cat.category"
                :color="props.color"
                :months="monthLabels"
                :reference="displayedAverage(cat)"
                :overlay="chartOverlay(cat)"
                @select-month="month => openMonth(cat, month)"
              />
            </div>

            <!-- Reimbursement info -->
            <div
              v-if="cat.reimbursement || cat.pendingReimbursement"
              class="mt-3 flex flex-wrap gap-3 text-xs text-gray-500 dark:text-gray-400"
            >
              <span v-if="cat.reimbursement">
                Remboursements reçus déduits :
                <strong class="text-gray-700 dark:text-gray-300">{{
                  formatCurrency(cat.reimbursement)
                }}</strong>
              </span>
              <span v-if="cat.pendingReimbursement">
                En attente déduits :
                <strong class="text-gray-700 dark:text-gray-300">{{
                  formatCurrency(cat.pendingReimbursement)
                }}</strong>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

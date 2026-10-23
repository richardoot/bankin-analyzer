<script setup lang="ts">
  /**
   * A structure segment unfolded in place (« Où part l'argent », agent-os/
   * product/dashboard-refonte.md, lot 5): what Plaisir is made of, category
   * by category, and how its share of each month moved against the habit.
   * Opened from a label of `StructureLines`, one panel per line; the second
   * level of detail, the last before a page — each row links out to its
   * transactions, nothing unfolds further.
   *
   * The header says the segment in both readings: per month in the
   * everyday reading, the period's total in the reading shown, per month
   * all in, events included. The composition and the share follow the
   * reading. The share is the segment over the month's spending — the
   * series the share trend reads — and the habit the trends' own: the
   * median of the closed months before the one read.
   */
  import { computed } from 'vue'
  import type { StructureCategoryDto } from '@/lib/api'
  import { formatCompactCurrency, formatMonth } from '@/lib/formatters'
  import { shareReading, currentMonthKey } from '@/lib/shareHabit'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import {
    transactionsLink,
    type NatureFilter,
    type RhythmFilter,
  } from '@/lib/transactionsLink'

  const props = withDefaults(
    defineProps<{
      /** The segment's key, for the identifiers. */
      segment: string
      /** « Plaisir ». */
      label: string
      /** The segment as the Transactions page filters it. */
      filter: { nature: NatureFilter } | { rhythm: RhythmFilter }
      /** Which reading the composition and the share follow. */
      reading: 'everyday' | 'real'
      /** The segment's categories in the everyday reading, heaviest first. */
      everydayCategories: StructureCategoryDto[]
      /** The same, every expense counted. */
      realCategories: StructureCategoryDto[]
      /** The segment's share of each month, in the reading; null when unknown. */
      share?: (number | null)[] | null
      /** The months of the period, `YYYY-MM`, the share aligned on them. */
      monthLabels?: string[]
      /** The period, for the links. */
      window?:
        { from?: string | undefined; to?: string | undefined } | undefined
    }>(),
    { share: null, monthLabels: () => [], window: undefined }
  )

  const emit = defineEmits<{ close: [] }>()

  const sum = (
    rows: StructureCategoryDto[],
    pick: 'amount' | 'averagePerMonth'
  ) => rows.reduce((total, row) => total + row[pick], 0)

  const categories = computed(() =>
    props.reading === 'everyday'
      ? props.everydayCategories
      : props.realCategories
  )
  const total = computed(() => sum(categories.value, 'amount'))
  const everydayPerMonth = computed(() =>
    sum(props.everydayCategories, 'averagePerMonth')
  )
  const realPerMonth = computed(() =>
    sum(props.realCategories, 'averagePerMonth')
  )
  const monthCount = computed(() => props.monthLabels.length)

  const euros = (value: number) => formatCompactCurrency(value)

  function percent(value: number): string {
    if (value > 0 && value < 1) return '<\u202f1\u202f%'
    return `${Math.round(value)}\u202f%`
  }

  /** A row's part of the segment, 0 to 1, for its bar. */
  function shareOf(row: StructureCategoryDto): number {
    return total.value > 0 ? Math.max(0, row.amount) / total.value : 0
  }

  /** Every expense of the segment over the period, events included. */
  const segmentLink = computed(() =>
    transactionsLink({
      type: 'EXPENSE',
      ...props.filter,
      from: props.window?.from,
      to: props.window?.to,
      gross: true,
      label: `Dépenses · ${props.label}`,
    })
  )

  /** A category's expenses inside the segment, in the reading. */
  function rowLink(row: StructureCategoryDto) {
    return transactionsLink({
      type: 'EXPENSE',
      ...props.filter,
      categoryId: row.categoryId,
      from: props.window?.from,
      to: props.window?.to,
      exceptional: props.reading === 'everyday' ? 'exclude' : undefined,
      gross: true,
      label: `${props.label} · ${row.category}`,
    })
  }

  // --- The share, month by month -----------------------------------------

  const currentMonth = currentMonthKey()

  /** The closed months with a share: the points drawn. */
  const points = computed(() => {
    const series = props.share ?? []
    return props.monthLabels.flatMap((month, i) => {
      const value = series[i]
      return month < currentMonth && value !== null && value !== undefined
        ? [{ month, index: i, value }]
        : []
    })
  })

  const reading = computed(() =>
    props.share
      ? shareReading(props.share, props.monthLabels, currentMonth)
      : null
  )

  const monthName = (month: string) =>
    formatMonth(month, { style: 'long', capitalize: false, year: false })

  /** « 31 % en septembre, contre 38 % d'habitude ». */
  const shareSentence = computed(() => {
    const r = reading.value
    if (!r) return null
    const head = `${percent(r.share)} en ${monthName(r.month)}`
    return r.habit === null
      ? head
      : `${head}, contre ${percent(r.habit)} d'habitude`
  })

  const CHART = {
    width: 320,
    height: 110,
    left: 32,
    right: 8,
    top: 8,
    bottom: 20,
  }

  /** Tens of percent around the points and the habit: « 30 % », « 50 % ». */
  const axis = computed(() => {
    const values = points.value.map(p => p.value)
    if (reading.value?.habit != null) values.push(reading.value.habit)
    const low = Math.floor(Math.min(...values) / 10) * 10
    let high = Math.ceil(Math.max(...values) / 10) * 10
    if (high <= low) high = low + 10
    return {
      low: Math.max(0, low),
      high: Math.min(100, Math.max(high, low + 10)),
    }
  })

  function yOf(value: number): number {
    const { low, high } = axis.value
    const inner = CHART.height - CHART.top - CHART.bottom
    return +(
      CHART.top +
      inner -
      ((value - low) / (high - low)) * inner
    ).toFixed(1)
  }

  function xOf(index: number): number {
    const inner = CHART.width - CHART.left - CHART.right
    const span = Math.max(1, monthCount.value - 1)
    return +(CHART.left + (index / span) * inner).toFixed(1)
  }

  const polyline = computed(() =>
    points.value.map(p => `${xOf(p.index)},${yOf(p.value)}`).join(' ')
  )

  const habitY = computed(() =>
    reading.value?.habit != null ? yOf(reading.value.habit) : null
  )

  const lastPoint = computed(() => points.value.at(-1) ?? null)

  const chartLabel = computed(() => {
    const parts = points.value.map(
      p => `${monthName(p.month)} ${percent(p.value)}`
    )
    return `Part ${props.label.toLowerCase()} par mois : ${parts.join(', ')}`
  })

  const firstLabel = computed(() => {
    const first = points.value[0]
    return first ? formatMonth(first.month, { year: false }) : ''
  })
  const lastLabel = computed(() =>
    lastPoint.value ? formatMonth(lastPoint.value.month, { year: false }) : ''
  )
</script>

<template>
  <div
    :data-testid="`structure-panel-${segment}`"
    class="rounded-lg bg-gray-50 p-4 text-[13px] text-gray-600 dark:bg-slate-800/50 dark:text-gray-400"
    @keydown.esc.stop="emit('close')"
  >
    <div
      class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
    >
      <p
        :data-testid="`structure-panel-header-${segment}`"
        class="min-w-0 flex-1 tabular-nums"
      >
        <span class="font-semibold text-gray-900 dark:text-gray-100">{{
          label
        }}</span>
        ·
        <span class="font-semibold text-gray-900 dark:text-gray-100">{{
          euros(everydayPerMonth)
        }}</span>
        par mois en vie courante ·
        <span class="font-medium text-gray-900 dark:text-gray-100">{{
          euros(total)
        }}</span>
        sur {{ monthCount }} mois ·
        <span class="font-medium text-gray-900 dark:text-gray-100">{{
          euros(realPerMonth)
        }}</span>
        par mois tout compris, événements inclus
      </p>
      <TransactionsLink
        :to="segmentLink"
        :subject="`Dépenses · ${label}`"
        :data-testid="`structure-panel-link-${segment}`"
      >
        Toutes les transactions {{ label }}
      </TransactionsLink>
    </div>

    <div class="grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
      <!-- What the segment is made of: one row a category, its part of the
           segment, its monthly average, the way to its transactions. -->
      <div>
        <h4
          class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
        >
          Composition · moyenne par mois
        </h4>
        <p
          v-if="categories.length === 0"
          :data-testid="`structure-panel-empty-${segment}`"
          class="py-2"
        >
          Aucune dépense {{ label }} sur la période.
        </p>
        <ul v-else class="divide-y divide-gray-200/70 dark:divide-slate-700/70">
          <li
            v-for="row in categories"
            :key="row.categoryId"
            :data-testid="`structure-panel-row-${row.categoryId}`"
            class="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-1 py-1.5 sm:grid-cols-[minmax(0,10rem)_minmax(3rem,1fr)_auto_auto]"
          >
            <span
              class="flex min-w-0 items-center gap-1.5 text-gray-900 dark:text-gray-100"
            >
              <span v-if="row.icon" class="shrink-0" aria-hidden="true">{{
                row.icon
              }}</span>
              <span class="truncate">{{ row.category }}</span>
            </span>
            <span
              class="col-span-3 row-start-2 flex min-w-0 items-center gap-2 sm:col-span-1 sm:row-start-auto"
            >
              <span
                role="img"
                :aria-label="`${row.category} : ${percent(shareOf(row) * 100)} de ${label}`"
                class="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-gray-200/80 dark:bg-slate-700"
              >
                <span
                  :data-testid="`structure-panel-fill-${row.categoryId}`"
                  class="block h-full rounded-full bg-blue-400"
                  :style="{ width: `${shareOf(row) * 100}%` }"
                />
              </span>
              <span
                class="w-10 shrink-0 text-right text-xs tabular-nums"
                aria-hidden="true"
                >{{ percent(shareOf(row) * 100) }}</span
              >
            </span>
            <span
              :data-testid="`structure-panel-average-${row.categoryId}`"
              class="whitespace-nowrap text-right font-medium text-gray-900 tabular-nums dark:text-gray-100"
            >
              {{ euros(row.averagePerMonth)
              }}<span
                class="text-xs font-normal text-gray-500 dark:text-gray-400"
                >/mois</span
              >
            </span>
            <TransactionsLink
              :to="rowLink(row)"
              :subject="`${label} · ${row.category}`"
              icon-only
              class="-my-1 h-6 w-6"
              :data-testid="`structure-panel-link-${row.categoryId}`"
            />
          </li>
        </ul>
      </div>

      <!-- The share of each closed month, the habit dashed. -->
      <div
        v-if="points.length >= 2"
        :data-testid="`structure-panel-share-${segment}`"
      >
        <h4
          class="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400"
        >
          Part des dépenses par mois
        </h4>
        <svg
          :viewBox="`0 0 ${CHART.width} ${CHART.height}`"
          :width="CHART.width"
          :height="CHART.height"
          class="block h-auto max-w-full overflow-visible"
          role="img"
          :aria-label="chartLabel"
        >
          <g class="text-gray-200 dark:text-slate-700" stroke="currentColor">
            <line
              :x1="CHART.left"
              :x2="CHART.width - CHART.right"
              :y1="yOf(axis.high)"
              :y2="yOf(axis.high)"
            />
            <line
              :x1="CHART.left"
              :x2="CHART.width - CHART.right"
              :y1="yOf(axis.low)"
              :y2="yOf(axis.low)"
            />
          </g>
          <g
            class="fill-gray-500 text-[10px] tabular-nums dark:fill-gray-400"
            text-anchor="end"
          >
            <text :x="CHART.left - 6" :y="yOf(axis.high) + 3">
              {{ axis.high }}&#8239;%
            </text>
            <text :x="CHART.left - 6" :y="yOf(axis.low) + 3">
              {{ axis.low }}&#8239;%
            </text>
          </g>
          <line
            v-if="habitY !== null"
            :data-testid="`structure-panel-share-habit-${segment}`"
            :x1="CHART.left"
            :x2="CHART.width - CHART.right"
            :y1="habitY"
            :y2="habitY"
            class="text-gray-400 dark:text-gray-500"
            stroke="currentColor"
            stroke-dasharray="3 3"
          />
          <polyline
            :points="polyline"
            fill="none"
            stroke="#60a5fa"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <circle
            v-if="lastPoint"
            :cx="xOf(lastPoint.index)"
            :cy="yOf(lastPoint.value)"
            r="3"
            fill="#60a5fa"
          />
          <g class="fill-gray-500 text-[10px] dark:fill-gray-400">
            <text :x="CHART.left" :y="CHART.height - 4">{{ firstLabel }}</text>
            <text
              v-if="lastPoint"
              :x="xOf(lastPoint.index)"
              :y="CHART.height - 4"
              text-anchor="end"
            >
              {{ lastLabel }}
            </text>
          </g>
        </svg>
        <p
          v-if="shareSentence"
          :data-testid="`structure-panel-share-sentence-${segment}`"
          class="mt-1 tabular-nums"
        >
          {{ shareSentence }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed, nextTick, onMounted, ref } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { TrendReading, TrendWindow } from '@/lib/api'
  import {
    useSpendingTrends,
    type TrendTab,
  } from '@/composables/useSpendingTrends'
  import { modelName, useTrendDigest } from '@/composables/useTrendDigest'
  import { TREND_WINDOWS, trendMonthLink } from '@/lib/trends'
  import { formatDate, formatMonth } from '@/lib/formatters'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import SpendingTrendTile from './SpendingTrendTile.vue'

  /**
   * « Ce qui change »: what moved in a closed month against the habit of
   * the months before it (agent-os/product/spending-trends.md).
   *
   * Follows the dashboard's reading and reimbursement switches, never its
   * period: the header says which month it reads and against what. Tabs
   * sort the trends: « L'essentiel », the five largest gaps under a
   * sentence that tells the two first in words, then one tab per group with
   * its count. Each trend is a tile (`SpendingTrendTile`): its figure, the
   * habit, the gap, the month's transactions; its full sentence and second
   * links behind « Détails ». The lines to file are an alert beside the
   * tabs, not a trend. The paragraph Claude writes is folded behind « Lire
   * le résumé du mois ».
   */
  const props = defineProps<{
    reading: TrendReading
    deductReimbursements: boolean
    deductPendingReimbursements: boolean
    /** Category names by id, for a subcategory tile's parent; optional. */
    categoryNames?: Record<string, string> | undefined
  }>()

  const {
    data,
    isLoading,
    error,
    referenceWindow,
    toFile,
    habits,
    otherCount,
    groups,
    busiestGroup,
    activeTab,
    activeInsights,
    missingMonths,
    horizonsLine,
    isWindowShortened,
    fetchTrends,
    setMonth,
    setWindow,
    setTab,
  } = useSpendingTrends({
    reading: () => props.reading,
    deductReimbursements: () => props.deductReimbursements,
    deductPendingReimbursements: () => props.deductPendingReimbursements,
  })

  onMounted(() => {
    void fetchTrends()
  })

  // The written paragraph (lot 5): asked once the list is here, never before.
  const {
    digest,
    isRegenerating,
    regenerate: regenerateDigest,
  } = useTrendDigest({
    trends: data,
    window: referenceWindow,
    deductReimbursements: () => props.deductReimbursements,
    deductPendingReimbursements: () => props.deductPendingReimbursements,
  })

  const windowOptions = TREND_WINDOWS.map(value => ({
    value,
    label: `${value} mois`,
    testId: `trends-window-${value}`,
  }))

  const monthLabel = (month: string): string =>
    formatMonth(`${month}-01`, { style: 'long' })

  const READING_LABEL: Record<TrendReading, string> = {
    everyday: 'vie courante',
    real: 'toutes les dépenses',
  }

  /** « Septembre 2026, vie courante · par rapport aux 6 mois précédents ». */
  const heading = computed(() => {
    if (!data.value) return null
    const head = `${monthLabel(data.value.month)}, ${READING_LABEL[data.value.reading]}`
    return missingMonths.value === 0
      ? `${head} · par rapport aux ${data.value.window} mois précédents`
      : head
  })

  const reading = computed<TrendReading>(
    () => data.value?.reading ?? props.reading
  )

  const categoryName = (id: string): string | undefined =>
    props.categoryNames?.[id]

  /* ---------------------------------------------------------------- */
  /* The tabs                                                          */
  /* ---------------------------------------------------------------- */

  interface Tab {
    key: TrendTab
    label: string
    count: number
  }

  const tabs = computed<Tab[]>(() => [
    {
      key: 'essential',
      label: "L'essentiel",
      count: Math.min(habits.value.length, 5),
    },
    ...groups.value.map(group => ({
      key: group.key,
      label: group.tab,
      count: group.insights.length,
    })),
  ])

  const showTabs = computed(
    () => missingMonths.value === 0 && habits.value.length > 0
  )

  const tabId = (key: TrendTab): string => `spending-trends-tab-${key}`
  const PANEL_ID = 'spending-trends-panel'

  const tablistRef = ref<HTMLElement | null>(null)

  async function selectTab(key: TrendTab, focus = false): Promise<void> {
    setTab(key)
    await nextTick()
    const tab = tablistRef.value?.querySelector<HTMLButtonElement>(
      `#${tabId(key)}`
    )
    // On a phone the chips scroll: the one picked comes into view.
    tab?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
    if (focus) tab?.focus()
  }

  /** Arrows move along the tabs, Home and End to either end; the tab follows the focus. */
  function onTabKeydown(event: KeyboardEvent, index: number): void {
    const count = tabs.value.length
    const target: Record<string, number> = {
      ArrowRight: (index + 1) % count,
      ArrowLeft: (index - 1 + count) % count,
      Home: 0,
      End: count - 1,
    }
    const next = target[event.key]
    if (next === undefined) return
    event.preventDefault()
    const tab = tabs.value[next]
    if (tab) void selectTab(tab.key, true)
  }

  /** « Voir par groupe »: the group with the most trends. */
  function showBusiestGroup(): void {
    if (busiestGroup.value) void selectTab(busiestGroup.value, true)
  }

  /** The lines to file, as the alert links them: the month, events included. */
  const toFileLink = computed(() =>
    toFile.value ? trendMonthLink(toFile.value, reading.value) : null
  )
  const toFileText = computed(() => {
    const n = toFile.value?.current ?? 0
    return `${n} ${n >= 2 ? 'dépenses' : 'dépense'} à classer`
  })

  const showSkeleton = computed(() => !data.value && isLoading.value)
</script>

<template>
  <BaseCard
    as="section"
    data-testid="spending-trends"
    aria-labelledby="spending-trends-title"
  >
    <div
      class="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"
    >
      <div class="min-w-0">
        <h2
          id="spending-trends-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100"
        >
          Ce qui change
        </h2>
        <p
          v-if="heading"
          class="text-sm text-gray-600 dark:text-gray-300"
          data-testid="trends-heading"
        >
          {{ heading }}
          <span
            v-if="isWindowShortened"
            class="text-gray-500 dark:text-gray-400"
            data-testid="trends-window-shortened"
          >
            (l'historique ne couvre pas encore {{ referenceWindow }} mois)
          </span>
        </p>
      </div>

      <div
        v-if="data"
        class="flex flex-wrap items-center gap-2 sm:shrink-0 sm:justify-end"
      >
        <BaseField
          v-if="data.availableMonths.length > 1"
          as="select"
          size="sm"
          label="Mois lu"
          label-hidden
          data-testid="trends-month"
          :model-value="data.month"
          @update:model-value="setMonth(String($event))"
        >
          <option
            v-for="option in data.availableMonths"
            :key="option"
            :value="option"
          >
            {{ monthLabel(option) }}
          </option>
        </BaseField>
        <SegmentedControl
          :model-value="referenceWindow"
          size="sm"
          label="Fenêtre de référence"
          :options="windowOptions"
          @update:model-value="setWindow($event as TrendWindow)"
        />
      </div>
    </div>

    <!-- First load: the card's shape, never the dashboard's. -->
    <div v-if="showSkeleton" aria-busy="true" data-testid="trends-loading">
      <SkeletonBlock :lines="3" />
    </div>

    <!-- A failure stays in the card, quiet: the figures above are intact. -->
    <p
      v-if="error"
      class="text-sm text-gray-500 dark:text-gray-400"
      role="status"
      data-testid="trends-error"
    >
      Les tendances n'ont pas pu être chargées.
      <button
        type="button"
        class="ml-1 font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
        data-testid="trends-retry"
        @click="fetchTrends()"
      >
        Réessayer
      </button>
    </p>

    <div
      v-if="data"
      class="transition-opacity duration-200"
      :class="isLoading ? 'opacity-60' : 'opacity-100'"
      :aria-busy="isLoading"
    >
      <p
        v-if="missingMonths > 0"
        class="text-sm text-gray-700 dark:text-gray-300"
        data-testid="trends-short-history"
      >
        Encore {{ missingMonths }} mois de transactions et les tendances
        apparaîtront.
      </p>

      <template v-if="showTabs">
        <!-- The tabs: underlined from a tablet up, chips that scroll on a phone. -->
        <div
          class="flex items-center gap-2 sm:border-b sm:border-gray-200 sm:dark:border-slate-700"
        >
          <div
            ref="tablistRef"
            role="tablist"
            aria-label="Tendances par groupe"
            class="-mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden"
            data-testid="trends-tabs"
          >
            <button
              v-for="(tab, index) in tabs"
              :id="tabId(tab.key)"
              :key="tab.key"
              type="button"
              role="tab"
              :aria-selected="activeTab === tab.key"
              :aria-controls="PANEL_ID"
              :tabindex="activeTab === tab.key ? 0 : -1"
              class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:-mb-px sm:h-10 sm:rounded-none sm:border-0 sm:border-b-2 sm:px-3.5"
              :class="
                activeTab === tab.key
                  ? 'border-primary-600 bg-primary-600 font-semibold text-white sm:border-primary-600 sm:bg-transparent sm:text-primary-700 dark:sm:bg-transparent dark:sm:text-primary-400'
                  : 'border-gray-300 bg-white font-medium text-gray-700 hover:text-gray-900 sm:border-transparent sm:bg-transparent sm:text-gray-600 dark:border-slate-600 dark:bg-slate-900 dark:text-gray-300 dark:hover:text-gray-100 dark:sm:bg-transparent'
              "
              :data-testid="`trends-tab-${tab.key}`"
              @click="selectTab(tab.key)"
              @keydown="onTabKeydown($event, index)"
            >
              {{ tab.label }}
              <span
                class="rounded-full px-1.5 text-xs font-semibold tabular-nums"
                :class="
                  activeTab === tab.key
                    ? 'bg-white/20 text-white sm:bg-primary-100 sm:text-primary-800 dark:sm:bg-primary-900/40 dark:sm:text-primary-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-gray-300'
                "
                data-testid="trends-tab-count"
                >{{ tab.count }}</span
              >
            </button>
          </div>
          <RouterLink
            v-if="toFile && toFileLink"
            :to="toFileLink"
            class="ml-auto hidden h-10 shrink-0 items-center gap-1.5 rounded text-[13px] font-semibold text-amber-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 lg:inline-flex dark:text-amber-400"
            :aria-label="`${toFileText} : voir les transactions`"
            data-testid="trends-to-file"
          >
            <span aria-hidden="true">⚠</span>
            {{ toFileText }}
          </RouterLink>
        </div>

        <!-- A phone or a tablet: the lines to file as a band under the tabs. -->
        <RouterLink
          v-if="toFile && toFileLink"
          :to="toFileLink"
          class="mt-2 flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[13px] font-semibold text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 lg:hidden dark:bg-amber-900/30 dark:text-amber-300"
          :aria-label="`${toFileText} : voir les transactions`"
          data-testid="trends-to-file-compact"
        >
          <span aria-hidden="true">⚠</span>
          {{ toFileText }}
        </RouterLink>

        <div
          :id="PANEL_ID"
          role="tabpanel"
          :aria-labelledby="tabId(activeTab)"
          tabindex="0"
          class="mt-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
          data-testid="trends-list"
        >
          <p
            v-if="activeTab === 'essential'"
            class="mb-4 text-lg leading-snug font-semibold text-gray-900 sm:text-xl dark:text-gray-100"
            data-testid="trends-headline"
          >
            {{ data.headline ?? data.quietSentence }}
          </p>

          <div
            class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
          >
            <SpendingTrendTile
              v-for="insight in activeInsights"
              :key="`${insight.kind}-${insight.unit.type}-${insight.unit.id}`"
              :insight="insight"
              :reading="reading"
              :window="data.window"
              :category-name="categoryName"
            />
            <div
              v-if="activeTab === 'essential' && otherCount > 0"
              class="flex items-center justify-between gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 sm:flex-col sm:justify-center sm:p-4 dark:border-slate-600 dark:bg-slate-800/40"
              data-testid="trends-more"
            >
              <p
                class="text-[13px] text-gray-600 sm:text-center dark:text-gray-400"
              >
                {{ otherCount }}
                {{
                  otherCount >= 2
                    ? 'autres tendances ce mois-ci'
                    : 'autre tendance ce mois-ci'
                }}
              </p>
              <button
                type="button"
                class="inline-flex h-9 shrink-0 items-center rounded-lg border border-gray-300 bg-white px-3.5 text-sm font-semibold text-primary-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 pointer-coarse:h-11 dark:border-slate-600 dark:bg-slate-900 dark:text-primary-400 dark:hover:bg-slate-800"
                data-testid="trends-more-button"
                @click="showBusiestGroup"
              >
                Voir par groupe
              </button>
            </div>
          </div>
        </div>
      </template>

      <template v-else-if="missingMonths === 0">
        <!-- Nothing moved: the sentence alone, the lines to file beside it. -->
        <RouterLink
          v-if="toFile && toFileLink"
          :to="toFileLink"
          class="mb-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[13px] font-semibold text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-900/30 dark:text-amber-300"
          :aria-label="`${toFileText} : voir les transactions`"
          data-testid="trends-to-file"
        >
          <span aria-hidden="true">⚠</span>
          {{ toFileText }}
        </RouterLink>
        <p
          v-if="data.quietSentence"
          class="text-sm text-gray-700 dark:text-gray-300"
          data-testid="trends-quiet"
        >
          {{ data.quietSentence }}
        </p>
      </template>

      <!-- A short history still shows the lines to file. -->
      <RouterLink
        v-if="missingMonths > 0 && toFile && toFileLink"
        :to="toFileLink"
        class="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[13px] font-semibold text-amber-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:bg-amber-900/30 dark:text-amber-300"
        :aria-label="`${toFileText} : voir les transactions`"
        data-testid="trends-to-file"
      >
        <span aria-hidden="true">⚠</span>
        {{ toFileText }}
      </RouterLink>

      <!-- What the history is still too short to compare: said, not an error. -->
      <p
        v-if="horizonsLine"
        class="mt-3 text-xs text-gray-500 dark:text-gray-400"
        data-testid="trends-horizons"
      >
        {{ horizonsLine }}
      </p>

      <div
        class="mt-4 flex flex-col gap-2 border-t border-gray-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-700"
      >
        <p
          class="text-xs text-gray-400 sm:ml-auto sm:text-right dark:text-gray-500"
          data-testid="trends-scope"
        >
          Un mois clos, quelle que soit la période choisie plus haut
        </p>
      </div>

      <!-- Under the tiles, the month told in a few sentences. -->
      <div v-if="showTabs" class="mt-3" data-testid="trends-digest-region">
        <figure v-if="digest" data-testid="trends-digest">
          <blockquote
            class="text-sm leading-relaxed text-gray-800 dark:text-gray-200"
            data-testid="trends-digest-text"
          >
            {{ digest.text }}
          </blockquote>
          <figcaption
            class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 dark:text-gray-400"
          >
            <span data-testid="trends-digest-mention">
              Rédigé par l'IA à partir des tendances ci-dessus ·
              {{ modelName(digest.model) }} · le
              {{ formatDate(digest.generatedAt, 'long') }}
            </span>
            <button
              type="button"
              class="min-h-[44px] font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-wait disabled:opacity-60 sm:min-h-0 dark:text-primary-400"
              :disabled="isRegenerating"
              :aria-busy="isRegenerating"
              data-testid="trends-digest-regenerate"
              @click="regenerateDigest()"
            >
              {{ isRegenerating ? 'Rédaction…' : 'Régénérer' }}
            </button>
          </figcaption>
        </figure>
      </div>
    </div>
  </BaseCard>
</template>

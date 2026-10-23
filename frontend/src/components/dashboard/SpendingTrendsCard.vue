<script setup lang="ts">
  import { computed, nextTick, onMounted, ref, watch } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { TrendReading, TrendWindow, TrendsResponseDto } from '@/lib/api'
  import {
    useSpendingTrends,
    type TrendTab,
  } from '@/composables/useSpendingTrends'
  import {
    modelName,
    rememberedTrendDigest,
    useTrendDigest,
  } from '@/composables/useTrendDigest'
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
   * le résumé du mois », and asked only when unfolded.
   *
   * `compact` is the dashboard's reading (agent-os/product/dashboard-refonte.md,
   * lot 2): the month and its window in the title, a link to the trends
   * page with their count, the lead sentence, the three largest gaps. The
   * lines to file are « À faire »'s (lot 3), not this card's. No selector, no tab, no
   * « Voir par groupe », no paragraph to unfold, no horizons, no scope note:
   * the full card lives on /trends.
   */
  const props = defineProps<{
    reading: TrendReading
    deductReimbursements: boolean
    deductPendingReimbursements: boolean
    /** Category names by id, for a subcategory tile's parent; optional. */
    categoryNames?: Record<string, string> | undefined
    /** The dashboard's short reading; the full card otherwise. */
    compact?: boolean | undefined
  }>()
  /**
   * The trends as loaded, for the page around the card: the dashboard
   * composes « À faire » from them without a second request.
   */
  const emit = defineEmits<{ loaded: [data: TrendsResponseDto | null] }>()

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

  // The trends as loaded, handed to the page around the card.
  watch(data, value => emit('loaded', value), { immediate: true })

  // The written paragraph (lot 5): folded, and asked at its first unfolding.
  const {
    digest,
    isLoading: isDigestLoading,
    isRegenerating,
    isOpen: isDigestOpen,
    hasAnswered: hasDigestAnswered,
    toggle: toggleDigest,
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

  /* ---------------------------------------------------------------- */
  /* The compact reading (the dashboard)                               */
  /* ---------------------------------------------------------------- */

  /** How many tiles the dashboard shows: the largest gaps, by score. */
  const COMPACT_SHOWN = 3

  /** The three largest gaps, the lines to file left out. */
  const compactInsights = computed(() => habits.value.slice(0, COMPACT_SHOWN))

  /** « septembre, contre les 6 mois précédents »; the month alone on a short history. */
  const compactHeading = computed(() => {
    if (!data.value) return null
    const month = formatMonth(`${data.value.month}-01`, {
      style: 'long',
      year: false,
      capitalize: false,
    })
    return missingMonths.value === 0
      ? `${month}, contre les ${data.value.window} mois précédents`
      : month
  })

  /** « Les 16 tendances → », « 1 tendance → »; nothing to open when none moved. */
  const allTrendsLabel = computed(() => {
    const n = habits.value.length
    if (missingMonths.value > 0 || n === 0) return null
    return n >= 2 ? `Les ${n} tendances` : '1 tendance'
  })

  /**
   * The paragraph Claude wrote for this very view, when the trends page
   * already read it in this session and its figures still hold: the best
   * sentence of the page. Never asked from here.
   */
  const compactDigest = computed(() => {
    if (!props.compact || !data.value) return null
    const remembered = rememberedTrendDigest({
      month: data.value.month,
      reading: data.value.reading,
      window: referenceWindow.value,
      deductReimbursements: props.deductReimbursements,
      deductPendingReimbursements: props.deductPendingReimbursements,
    })
    return remembered && !remembered.stale ? remembered : null
  })
</script>

<template>
  <BaseCard
    as="section"
    data-testid="spending-trends"
    aria-labelledby="spending-trends-title"
  >
    <!-- The dashboard's reading: one line of title, the way to the page. -->
    <div
      v-if="compact"
      class="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1"
    >
      <h2
        id="spending-trends-title"
        class="min-w-0 text-lg font-semibold text-gray-900 dark:text-gray-100"
      >
        Ce qui change<span
          v-if="compactHeading"
          class="font-normal text-gray-600 dark:text-gray-300"
          data-testid="trends-heading"
        >
          · {{ compactHeading }}</span
        >
      </h2>
      <RouterLink
        v-if="allTrendsLabel"
        to="/trends"
        class="inline-flex min-h-[44px] shrink-0 items-center gap-1 rounded text-sm font-medium text-primary-700 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:min-h-0 dark:text-primary-400"
        data-testid="trends-all-link"
      >
        {{ allTrendsLabel }} <span aria-hidden="true">→</span>
      </RouterLink>
    </div>

    <div
      v-else
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

    <!-- The dashboard's reading: the lead sentence, three tiles, nothing else. -->
    <div
      v-if="compact && data"
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

      <template v-else-if="compactInsights.length > 0">
        <figure v-if="compactDigest" class="mb-4" data-testid="trends-lead">
          <blockquote
            class="text-sm leading-relaxed text-gray-800 dark:text-gray-200"
            data-testid="trends-digest-text"
          >
            {{ compactDigest.text }}
          </blockquote>
          <figcaption
            class="mt-1 text-xs text-gray-500 dark:text-gray-400"
            data-testid="trends-digest-mention"
          >
            Rédigé par l'IA · {{ modelName(compactDigest.model) }}
          </figcaption>
        </figure>
        <p
          v-else-if="data.headline ?? data.quietSentence"
          class="mb-4 text-base leading-snug font-semibold text-gray-900 sm:text-lg dark:text-gray-100"
          data-testid="trends-headline"
        >
          {{ data.headline ?? data.quietSentence }}
        </p>

        <div
          class="grid grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3"
          data-testid="trends-list"
        >
          <SpendingTrendTile
            v-for="insight in compactInsights"
            :key="`${insight.kind}-${insight.unit.type}-${insight.unit.id}`"
            :insight="insight"
            :reading="reading"
            :window="data.window"
            :category-name="categoryName"
          />
        </div>
      </template>

      <p
        v-else-if="data.quietSentence"
        class="text-sm text-gray-700 dark:text-gray-300"
        data-testid="trends-quiet"
      >
        {{ data.quietSentence }}
      </p>
    </div>

    <div
      v-else-if="data"
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
        <button
          v-if="showTabs"
          type="button"
          class="inline-flex min-h-[44px] items-center gap-2 self-start rounded-md text-sm font-medium text-gray-700 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:min-h-9 dark:text-gray-300 dark:hover:text-gray-100"
          :aria-expanded="isDigestOpen"
          aria-controls="spending-trends-digest"
          data-testid="trends-digest-toggle"
          @click="toggleDigest()"
        >
          <span
            aria-hidden="true"
            class="text-xs transition-transform"
            :class="isDigestOpen ? 'rotate-90' : ''"
            >▸</span
          >
          Lire le résumé du mois
          <span class="text-xs font-normal text-gray-400 dark:text-gray-500"
            >rédigé par l'IA</span
          >
        </button>
        <p
          class="text-xs text-gray-400 sm:ml-auto sm:text-right dark:text-gray-500"
          data-testid="trends-scope"
        >
          Un mois clos, quelle que soit la période choisie plus haut
        </p>
      </div>

      <!-- Unfolded in place: the month told in a few sentences. -->
      <div
        v-if="showTabs && isDigestOpen"
        id="spending-trends-digest"
        class="mt-3"
        data-testid="trends-digest-region"
      >
        <div
          v-if="isDigestLoading"
          aria-busy="true"
          data-testid="trends-digest-loading"
        >
          <SkeletonBlock :lines="2" />
        </div>
        <figure v-else-if="digest" data-testid="trends-digest">
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
            <span
              v-if="digest.stale"
              class="text-amber-700 dark:text-amber-400"
              data-testid="trends-digest-stale"
            >
              figures qui ont changé depuis
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
        <p
          v-else-if="hasDigestAnswered"
          class="text-sm text-gray-500 dark:text-gray-400"
          role="status"
          data-testid="trends-digest-empty"
        >
          Le résumé n'est pas disponible pour le moment.
        </p>
      </div>
    </div>
  </BaseCard>
</template>

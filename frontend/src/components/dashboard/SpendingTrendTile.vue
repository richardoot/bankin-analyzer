<script setup lang="ts">
  import { computed, ref } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { TrendInsightDto, TrendReading } from '@/lib/api'
  import {
    BADGE_CLASSES,
    SPARK_COLORS,
    arrowOf,
    badgeLabel,
    badgeText,
    fallbackIcon,
    hasTrendReference,
    hueOf,
    tileOf,
    trendMonthLink,
    trendPartLink,
    trendReferenceLink,
  } from '@/lib/trends'
  import { formatMonth } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import SparklineChart from '@/components/budget/SparklineChart.vue'
  import CategoryIcon from '@/components/CategoryIcon.vue'

  /**
   * One trend of « Ce qui change » as a tile: the unit, the month's figure
   * large, the habit beside it, the seven months drawn, the gap's badge and
   * the month's transactions.
   *
   * On a phone it folds into one row (icon, name and figure, badge). The
   * server's full sentence and the second links (the reference, a shift's
   * two subcategories, the recurrences screen) sit behind « Détails », a
   * disclosure button that unfolds them inside the tile: a plain button and
   * its panel, reachable by keyboard and read in place, no floating layer to
   * manage. The sentence also describes the tile for a screen reader while
   * folded.
   */
  const props = defineProps<{
    insight: TrendInsightDto
    reading: TrendReading
    /** The window read, for the reference link's label. */
    window: number
    categoryName?: ((id: string) => string | undefined) | undefined
  }>()

  const open = ref(false)

  const key = computed(() =>
    `${props.insight.kind}-${props.insight.unit.type}-${props.insight.unit.id}`
      .replace(/[^a-zA-Z0-9_-]/g, '-')
      .toLowerCase()
  )
  const sentenceId = computed(() => `trend-sentence-${key.value}`)
  const detailsId = computed(() => `trend-details-${key.value}`)

  const tile = computed(() =>
    tileOf(props.insight, {
      reading: props.reading,
      categoryName: props.categoryName,
    })
  )
  const hue = computed(() => hueOf(props.insight))
  const monthName = computed(() =>
    formatMonth(props.insight.windows.current.start, {
      style: 'long',
      capitalize: false,
      year: false,
    })
  )
  const monthLink = computed(() => trendMonthLink(props.insight, props.reading))
</script>

<template>
  <article
    class="flex flex-col gap-2.5 rounded-xl border border-gray-200 bg-white p-3 sm:p-4 dark:border-slate-700 dark:bg-slate-900"
    :aria-labelledby="`trend-title-${key}`"
    :aria-describedby="sentenceId"
    :data-testid="`trend-${insight.kind}`"
  >
    <div class="flex items-center gap-3">
      <span
        class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-100 text-base dark:bg-slate-800"
        aria-hidden="true"
        data-testid="trend-icon"
      >
        <CategoryIcon
          v-if="insight.unit.icon"
          :icon="insight.unit.icon"
          :name="insight.unit.name"
        />
        <template v-else>{{ fallbackIcon(insight) }}</template>
      </span>
      <div class="min-w-0 flex-1">
        <h4
          :id="`trend-title-${key}`"
          class="truncate text-sm font-semibold text-gray-900 dark:text-gray-100"
          data-testid="trend-title"
        >
          {{ tile.title }}
        </h4>
        <p
          class="hidden truncate text-xs text-gray-500 sm:block dark:text-gray-400"
          data-testid="trend-subtitle"
        >
          {{ tile.subtitle }}
        </p>
        <!-- A phone: the figure and the habit in one line under the name. -->
        <p
          class="line-clamp-2 text-xs text-gray-500 sm:hidden dark:text-gray-400"
          data-testid="trend-compact"
        >
          {{ tile.compact }}
        </p>
      </div>
      <span
        class="inline-flex shrink-0 items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums sm:hidden"
        :class="BADGE_CLASSES[hue]"
        :aria-label="badgeLabel(insight)"
        data-testid="trend-badge-compact"
      >
        <span v-if="arrowOf(insight)" aria-hidden="true">{{
          arrowOf(insight)
        }}</span>
        {{ badgeText(insight) }}
      </span>
      <button
        type="button"
        class="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center self-start rounded-md text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 pointer-coarse:h-11 pointer-coarse:w-11 sm:self-auto dark:hover:bg-slate-800 dark:hover:text-gray-200"
        :aria-expanded="open"
        :aria-controls="detailsId"
        :aria-label="`Détails : ${insight.unit.name}`"
        :title="open ? 'Masquer le détail' : 'Voir le détail'"
        data-testid="trend-details-toggle"
        @click="open = !open"
      >
        <span aria-hidden="true" class="text-lg leading-none">…</span>
      </button>
    </div>

    <div
      class="hidden items-end justify-between gap-2 sm:flex"
      data-testid="trend-figures"
    >
      <div class="min-w-0">
        <p
          class="text-[26px] leading-tight font-bold text-gray-900 tabular-nums dark:text-gray-100"
          data-testid="trend-figure"
        >
          {{ tile.figure
          }}<span
            v-if="tile.figureUnit"
            class="text-sm font-medium text-gray-500 dark:text-gray-400"
            >{{ `\u00a0${tile.figureUnit}` }}</span
          >
        </p>
        <p
          class="truncate text-[13px] text-gray-500 dark:text-gray-400"
          data-testid="trend-usual"
          :title="tile.usual"
        >
          {{ tile.usual }}
        </p>
      </div>
      <div class="shrink-0" data-testid="trend-sparkline">
        <SparklineChart
          :data="insight.series"
          :width="72"
          :height="28"
          :color="SPARK_COLORS[hue]"
        />
      </div>
    </div>

    <div
      class="hidden flex-wrap items-center justify-between gap-2 sm:flex"
      data-testid="trend-footer"
    >
      <span
        class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap tabular-nums"
        :class="BADGE_CLASSES[hue]"
        :aria-label="badgeLabel(insight)"
        data-testid="trend-badge"
      >
        <span v-if="arrowOf(insight)" aria-hidden="true">{{
          arrowOf(insight)
        }}</span>
        {{ badgeText(insight) }}
      </span>
      <TransactionsLink
        :to="monthLink"
        :subject="`${insight.unit.name} en ${monthName}`"
        data-testid="trend-month-link"
      >
        {{ tile.linkLabel }}
      </TransactionsLink>
    </div>

    <!-- Folded, out of the layout but read: the sentence describes the tile. -->
    <div
      :id="detailsId"
      :class="
        open
          ? 'border-t border-gray-100 pt-2.5 dark:border-slate-800'
          : 'sr-only'
      "
      data-testid="trend-details"
    >
      <p
        :id="sentenceId"
        class="text-sm text-gray-800 dark:text-gray-200"
        data-testid="trend-sentence"
      >
        {{ insight.sentence }}
      </p>
      <div
        v-if="open"
        class="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1"
        data-testid="trend-details-links"
      >
        <!-- A phone has no footer: the month's link is here. -->
        <TransactionsLink
          class="sm:hidden"
          :to="monthLink"
          :subject="`${insight.unit.name} en ${monthName}`"
          data-testid="trend-month-link-compact"
        >
          {{ tile.linkLabel }}
        </TransactionsLink>
        <TransactionsLink
          v-for="part in insight.parts ?? []"
          :key="part.unit.id"
          :to="trendPartLink(insight, part, reading)"
          :subject="`${part.unit.name} en ${monthName}`"
          data-testid="trend-part-link"
        >
          {{ part.unit.name }}
        </TransactionsLink>
        <TransactionsLink
          v-if="hasTrendReference(insight)"
          :to="trendReferenceLink(insight, reading, window)"
          :subject="`${insight.unit.name} sur la référence`"
          data-testid="trend-reference-link"
        >
          La référence
        </TransactionsLink>
        <RouterLink
          v-if="insight.unit.type === 'recurrence'"
          to="/recurrences"
          class="text-xs font-medium text-primary-700 underline-offset-2 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-primary-400"
          :aria-label="`Voir ${insight.unit.name} dans les récurrences`"
          data-testid="trend-recurrences-link"
        >
          Les récurrences
        </RouterLink>
      </div>
    </div>
  </article>
</template>

<script setup lang="ts">
  /**
   * The structure of the period's spending in two lines (« Où part
   * l'argent », agent-os/product/dashboard-refonte.md, lot 4): constrained
   * or chosen — « Essentiel N % ▬▬▬ Plaisir N % » — and running on its own
   * or following the user — « Engagé N % ▬▬▬ Variable N % ». One hue, the
   * share bars' blue-400: the fill is the left share, the track the right
   * one, the labels say both.
   *
   * Each label is a button that unfolds its segment in place, under its
   * line (lot 5): one panel open per line, folded on load, the state kept
   * nowhere. The arrow beside it opens the segment's expenses on the
   * Transactions page. The rows predating the catalogue carry no
   * attribute: they stay out of both shares, and a note says how much.
   */
  import { computed, nextTick, ref } from 'vue'
  import { RouterLink } from 'vue-router'
  import type {
    SpendingStructureDto,
    StructureBreakdownDto,
    StructureReadings,
    StructureSegment,
    StructureShareDto,
  } from '@/lib/api'
  import { formatCompactCurrency } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import StructurePanel from './StructurePanel.vue'
  import {
    transactionsLink,
    type NatureFilter,
    type RhythmFilter,
  } from '@/lib/transactionsLink'

  const props = defineProps<{
    /** The period as it was: every expense, events included. */
    actual: SpendingStructureDto
    /** The lifestyle: the same, the events set aside. */
    everyday: SpendingStructureDto
    /** Which of the two the lines read. */
    reading: 'everyday' | 'real'
    /** The closed months the per-month figures divide by. */
    periodMonths: number
    /** The period, for the links to the Transactions page. */
    window?: { from?: string | undefined; to?: string | undefined } | undefined
    /** Each segment's categories, on both readings: what a panel lists. */
    breakdown?: StructureReadings<StructureBreakdownDto> | null | undefined
    /** Each segment's share month by month, on both readings. */
    shareByMonth?: StructureReadings<StructureShareDto> | null | undefined
    /** The months of the period, `YYYY-MM`, the shares aligned on them. */
    monthLabels?: string[] | undefined
  }>()

  const structure = computed(() =>
    props.reading === 'everyday' ? props.everyday : props.actual
  )

  interface Side {
    key: StructureSegment
    label: string
    amount: number
    filter: { nature: NatureFilter } | { rhythm: RhythmFilter }
  }

  interface Line {
    key: 'nature' | 'rhythm'
    left: Side & { share: number }
    right: Side & { share: number }
  }

  /** Two sides of one whole: the shares add up to 100 %. */
  function line(key: Line['key'], left: Side, right: Side): Line {
    const known = Math.max(0, left.amount) + Math.max(0, right.amount)
    const shareOf = (side: Side) =>
      known > 0 ? Math.max(0, side.amount) / known : 0
    return {
      key,
      left: { ...left, share: shareOf(left) },
      right: { ...right, share: shareOf(right) },
    }
  }

  const lines = computed<Line[]>(() => [
    line(
      'nature',
      {
        key: 'essential',
        label: 'Essentiel',
        amount: structure.value.essential,
        filter: { nature: 'ESSENTIAL' },
      },
      {
        key: 'pleasure',
        label: 'Plaisir',
        amount: structure.value.pleasure,
        filter: { nature: 'PLEASURE' },
      }
    ),
    line(
      'rhythm',
      {
        key: 'committed',
        label: 'Engagé',
        amount: structure.value.committed,
        filter: { rhythm: 'COMMITTED' },
      },
      {
        key: 'variable',
        label: 'Variable',
        amount: structure.value.variable,
        filter: { rhythm: 'VARIABLE' },
      }
    ),
  ])

  /**
   * A segment's expenses over the period, by the Dashboard's own rule for
   * nature and rhythm. The figures are netted and shared — gross; read
   * « vie courante », they leave the events out — so does the link.
   */
  function segmentLink(side: Side) {
    return transactionsLink({
      type: 'EXPENSE',
      ...side.filter,
      from: props.window?.from,
      to: props.window?.to,
      exceptional: props.reading === 'everyday' ? 'exclude' : undefined,
      gross: true,
      label: `Dépenses · ${side.label}`,
    })
  }

  /** The segment unfolded under each line, if any: one at a time. */
  const open = ref<Record<Line['key'], StructureSegment | null>>({
    nature: null,
    rhythm: null,
  })

  function toggle(line: Line['key'], side: Side): void {
    open.value[line] = open.value[line] === side.key ? null : side.key
  }

  /** Échap folds the panel and gives the focus back to its label. */
  async function close(line: Line['key']): Promise<void> {
    const segment = open.value[line]
    open.value[line] = null
    if (!segment) return
    await nextTick()
    document.getElementById(toggleId(segment))?.focus()
  }

  const panelId = (line: Line['key']) => `structure-panel-region-${line}`
  const toggleId = (segment: StructureSegment) => `structure-toggle-${segment}`

  /** The side unfolded under a line: none, or one. */
  function openSides(item: Line): Side[] {
    const segment = open.value[item.key]
    return [item.left, item.right].filter(side => side.key === segment)
  }

  const percent = (share: number) => `${Math.round(share * 100)}\u202f%`
  const perMonth = (amount: number) =>
    formatCompactCurrency(amount / Math.max(1, props.periodMonths))

  const unknownAmount = computed(() =>
    Math.max(structure.value.unknownNature, structure.value.unknownRhythm)
  )
</script>

<template>
  <div data-testid="structure-lines" class="space-y-3">
    <template v-for="item in lines" :key="item.key">
      <div
        :data-testid="`structure-line-${item.key}`"
        class="grid grid-cols-2 items-center gap-x-3 gap-y-0.5 sm:grid-cols-[150px_minmax(0,1fr)_150px] sm:gap-y-0"
      >
        <!-- A phone: both labels on one line, the bar the full width
             under them — between two labels it was 50px long. -->
        <span class="col-start-1 row-start-1 flex min-w-0 items-center gap-1">
          <button
            :id="toggleId(item.left.key)"
            type="button"
            class="flex min-w-0 items-baseline gap-1.5 rounded py-1 text-left text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:text-gray-100"
            :aria-expanded="open[item.key] === item.left.key"
            :aria-controls="panelId(item.key)"
            :data-testid="`structure-toggle-${item.left.key}`"
            @click="toggle(item.key, item.left)"
          >
            <span class="truncate">{{ item.left.label }}</span>
            <span
              class="font-semibold text-gray-900 tabular-nums dark:text-gray-100"
              >{{ percent(item.left.share) }}</span
            >
          </button>
          <TransactionsLink
            :to="segmentLink(item.left)"
            :subject="`Dépenses · ${item.left.label}`"
            icon-only
            class="-my-1 h-6 w-6"
            :data-testid="`structure-link-${item.key}-${item.left.key}`"
          />
        </span>

        <div
          role="img"
          :aria-label="`${item.left.label} ${percent(item.left.share)}, ${item.right.label} ${percent(item.right.share)}`"
          class="col-span-2 row-start-2 h-2.5 overflow-hidden rounded-full bg-gray-100 sm:col-span-1 sm:col-start-2 sm:row-start-1 dark:bg-slate-800"
          :data-testid="`structure-track-${item.key}`"
        >
          <div
            class="h-full rounded-full bg-blue-400"
            :data-testid="`structure-fill-${item.key}`"
            :style="{ width: `${item.left.share * 100}%` }"
          />
        </div>

        <span
          class="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-1 sm:col-start-3"
        >
          <button
            :id="toggleId(item.right.key)"
            type="button"
            class="flex min-w-0 items-baseline gap-1.5 rounded py-1 text-right text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:text-gray-100"
            :aria-expanded="open[item.key] === item.right.key"
            :aria-controls="panelId(item.key)"
            :data-testid="`structure-toggle-${item.right.key}`"
            @click="toggle(item.key, item.right)"
          >
            <span class="truncate">{{ item.right.label }}</span>
            <span
              class="font-semibold text-gray-900 tabular-nums dark:text-gray-100"
              >{{ percent(item.right.share) }}</span
            >
          </button>
          <TransactionsLink
            :to="segmentLink(item.right)"
            :subject="`Dépenses · ${item.right.label}`"
            icon-only
            class="-my-1 h-6 w-6"
            :data-testid="`structure-link-${item.key}-${item.right.key}`"
          />
        </span>
      </div>

      <!-- Where the line unfolds: always there, so a label controls it;
           out of the flow while folded. -->
      <div
        :id="panelId(item.key)"
        :class="{ hidden: !open[item.key] }"
        :data-testid="`structure-region-${item.key}`"
      >
        <StructurePanel
          v-for="side in openSides(item)"
          :key="side.key"
          :segment="side.key"
          :label="side.label"
          :filter="side.filter"
          :reading="reading"
          :everyday-categories="breakdown?.everyday[side.key] ?? []"
          :real-categories="breakdown?.real[side.key] ?? []"
          :share="shareByMonth?.[reading][side.key] ?? null"
          :month-labels="monthLabels ?? []"
          :window="window"
          @close="close(item.key)"
        />
      </div>
    </template>

    <p
      class="text-xs text-gray-500 tabular-nums dark:text-gray-400"
      data-testid="committed-note"
    >
      Engagé :
      <span class="font-medium text-gray-900 dark:text-gray-100"
        >{{ perMonth(structure.committed) }} par mois</span
      ><template v-if="structure.recurring > 0"
        >, dont
        <span class="font-medium text-gray-900 dark:text-gray-100">{{
          perMonth(structure.recurring)
        }}</span>
        d'abonnements et charges récurrentes</template
      >
      ·
      <RouterLink
        to="/recurrences"
        class="font-medium text-primary-700 hover:underline dark:text-primary-400"
        data-testid="recurring-link"
      >
        la liste →
      </RouterLink>
    </p>

    <p
      v-if="structure.unknownNature > 0"
      class="text-xs text-gray-500 dark:text-gray-400"
      data-testid="unknown-hint"
    >
      « À migrer » :
      <span class="tabular-nums">{{ perMonth(unknownAmount) }} par mois</span>
      encore classés dans des catégories d'avant le catalogue, sans nature ni
      rythme, hors de ces parts. La migration les fera entrer dans la lecture.
    </p>
  </div>
</template>

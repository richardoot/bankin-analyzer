<script setup lang="ts">
  /**
   * The structure of the period's spending in two lines (« Où part
   * l'argent », agent-os/product/dashboard-refonte.md, lot 4): constrained
   * or chosen — « Essentiel N % ▬▬▬ Plaisir N % » — and running on its own
   * or following the user — « Engagé N % ▬▬▬ Variable N % ». One hue, the
   * share bars' blue-400: the fill is the left share, the track the right
   * one, the labels say both.
   *
   * Each label is a button that will unfold its segment in place (lot 5);
   * until then it opens the segment's expenses on the Transactions page,
   * as the arrow beside it does. The rows predating the catalogue carry no
   * attribute: they stay out of both shares, and a note says how much.
   */
  import { computed } from 'vue'
  import { RouterLink, useRouter } from 'vue-router'
  import type { SpendingStructureDto } from '@/lib/api'
  import { formatCompactCurrency } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
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
  }>()

  const router = useRouter()

  const structure = computed(() =>
    props.reading === 'everyday' ? props.everyday : props.actual
  )

  interface Side {
    key: string
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

  /** Lot 4: the label opens the segment's expenses; lot 5 unfolds it. */
  function openSegment(side: Side): void {
    void router.push(segmentLink(side))
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
    <div
      v-for="item in lines"
      :key="item.key"
      :data-testid="`structure-line-${item.key}`"
      class="grid grid-cols-[auto_minmax(3rem,1fr)_auto] items-center gap-x-3 sm:grid-cols-[150px_minmax(0,1fr)_150px]"
    >
      <span class="flex min-w-0 items-center gap-1">
        <button
          type="button"
          class="flex min-w-0 items-baseline gap-1.5 rounded py-1 text-left text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:text-gray-100"
          aria-expanded="false"
          :data-testid="`structure-toggle-${item.left.key}`"
          @click="openSegment(item.left)"
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
        class="h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
        :data-testid="`structure-track-${item.key}`"
      >
        <div
          class="h-full rounded-full bg-blue-400"
          :data-testid="`structure-fill-${item.key}`"
          :style="{ width: `${item.left.share * 100}%` }"
        />
      </div>

      <span class="flex min-w-0 items-center justify-end gap-1">
        <button
          type="button"
          class="flex min-w-0 items-baseline gap-1.5 rounded py-1 text-right text-sm text-gray-700 hover:text-gray-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:text-gray-100"
          aria-expanded="false"
          :data-testid="`structure-toggle-${item.right.key}`"
          @click="openSegment(item.right)"
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

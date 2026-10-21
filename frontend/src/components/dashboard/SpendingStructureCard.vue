<script setup lang="ts">
  /**
   * Where the money goes, read through the two attributes every expense now
   * carries: constrained or chosen, running on its own or following the
   * user. Two readings of the same period — the month as it was, and the
   * lifestyle once the exceptional share is set aside — because both are
   * true and they answer different questions.
   *
   * Below, what the framework calls the savings reading: what the period
   * kept — the income less every expense, negative in deficit — and its
   * share of the income, the transfers towards savings as a side note (they
   * say where some of it went, not what was saved), and what the period
   * leaves once the committed everyday spending is paid. And what is still
   * owed to the user: money advanced to someone leaves the expenses without
   * leaving sight.
   *
   * Under the rhythm, the share of the committed spending made of charges
   * that come back on their own — subscriptions, rent, insurance — with a
   * way to the list of them.
   */
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { SpendingStructureDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import {
    NO_CATEGORY,
    transactionsLink,
    type NatureFilter,
    type RhythmFilter,
  } from '@/lib/transactionsLink'

  const props = defineProps<{
    actual: SpendingStructureDto
    everyday: SpendingStructureDto
    /** Income less every expense over the period; negative in deficit. */
    savings: number
    /** What left towards the savings categories: informational only. */
    savingsTransfers: number
    /** What is still owed across every open debt; a stock, not per month. */
    pendingReceivables: number
    /** `savings` over the income, null without income. */
    savingsRate: number | null
    /** Income less the committed everyday spending, null without income. */
    remainingToLive: number | null
    periodMonths: number
    /** Which of the two structures is read. */
    reading: 'everyday' | 'actual'
    /**
     * The period the figures cover, for the links to the Transactions
     * page: a segment opens its expenses over that window.
     */
    window?: { from?: string | undefined; to?: string | undefined } | undefined
  }>()

  const structure = computed(() =>
    props.reading === 'everyday' ? props.everyday : props.actual
  )

  interface SegmentPart {
    key: string
    label: string
    amount: number
    color: string
    /** What the segment is, as the Transactions page filters it. */
    filter: { nature: NatureFilter } | { rhythm: RhythmFilter }
  }

  interface Segment extends SegmentPart {
    share: number
  }

  function segments(parts: SegmentPart[]): Segment[] {
    const total = parts.reduce((sum, p) => sum + Math.max(0, p.amount), 0)
    return parts
      .filter(p => p.amount > 0)
      .map(p => ({ ...p, share: total > 0 ? p.amount / total : 0 }))
  }

  /*
   * Each reading is one hue in two tones — the strong share and its
   * counterpart — so the two bars never borrow a role color: amber is the
   * exceptional share on this very screen, indigo the comparison reference.
   */
  const natureSegments = computed(() =>
    segments([
      {
        key: 'essential',
        filter: { nature: 'ESSENTIAL' },
        label: 'Essentiel',
        amount: structure.value.essential,
        color: 'bg-blue-600 dark:bg-blue-500',
      },
      {
        key: 'pleasure',
        filter: { nature: 'PLEASURE' },
        label: 'Plaisir',
        amount: structure.value.pleasure,
        color: 'bg-blue-300',
      },
      {
        key: 'unknown',
        filter: { nature: NO_CATEGORY },
        label: 'À migrer',
        amount: structure.value.unknownNature,
        color: 'bg-gray-300 dark:bg-slate-600',
      },
    ])
  )

  const rhythmSegments = computed(() =>
    segments([
      {
        key: 'committed',
        filter: { rhythm: 'COMMITTED' },
        label: 'Engagé',
        amount: structure.value.committed,
        color: 'bg-teal-600 dark:bg-teal-500',
      },
      {
        key: 'variable',
        filter: { rhythm: 'VARIABLE' },
        label: 'Variable',
        amount: structure.value.variable,
        color: 'bg-teal-300',
      },
      {
        key: 'unknown',
        filter: { rhythm: NO_CATEGORY },
        label: 'À migrer',
        amount: structure.value.unknownRhythm,
        color: 'bg-gray-300 dark:bg-slate-600',
      },
    ])
  )

  const hasUnknown = computed(
    () => structure.value.unknownNature > 0 || structure.value.unknownRhythm > 0
  )

  /**
   * A segment opens its expenses over the period, by the Dashboard's own
   * rule for nature and rhythm. The figures are netted and shared — gross;
   * read « vie courante », they leave the events out — so does the link.
   */
  function segmentLink(
    filter: SegmentPart['filter'],
    label: string,
    reading: 'everyday' | 'actual' = props.reading
  ) {
    return transactionsLink({
      type: 'EXPENSE',
      ...filter,
      from: props.window?.from,
      to: props.window?.to,
      exceptional: reading === 'everyday' ? 'exclude' : undefined,
      gross: true,
      label: `Dépenses · ${label}`,
    })
  }

  const percent = (share: number) => `${Math.round(share * 100)} %`
  const perMonth = (amount: number) =>
    formatCurrency(amount / Math.max(1, props.periodMonths))
</script>

<template>
  <BaseCard data-testid="spending-structure">
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Structure des dépenses
      </h2>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Contraint ou choisi, engagé ou variable, sur la période
        <template v-if="reading === 'everyday'">
          — vie courante, hors événements.</template
        >
        <template v-else> — tout compris, événements inclus.</template>
      </p>
    </div>

    <div class="grid gap-6 md:grid-cols-2">
      <div
        v-for="axis in [
          {
            key: 'nature',
            title: 'Contraint ou choisi',
            items: natureSegments,
          },
          { key: 'rhythm', title: 'Engagé ou variable', items: rhythmSegments },
        ]"
        :key="axis.key"
        :data-testid="`axis-${axis.key}`"
      >
        <h3 class="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
          {{ axis.title }}
        </h3>
        <div
          v-if="axis.items.length > 0"
          class="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
          role="img"
          :aria-label="
            axis.items.map(s => `${s.label} ${percent(s.share)}`).join(', ')
          "
        >
          <div
            v-for="segment in axis.items"
            :key="segment.key"
            :class="segment.color"
            :style="{ width: `${segment.share * 100}%` }"
          />
        </div>
        <p v-else class="text-xs italic text-gray-500 dark:text-gray-400">
          Aucune dépense sur la période.
        </p>
        <ul class="mt-2 space-y-1 text-sm">
          <li
            v-for="segment in axis.items"
            :key="segment.key"
            class="flex items-center justify-between gap-2 text-gray-700 dark:text-gray-300"
          >
            <span class="flex items-center gap-2">
              <span
                class="inline-block h-2.5 w-2.5 rounded-full"
                :class="segment.color"
              />
              {{ segment.label }}
            </span>
            <span class="flex items-center gap-1 tabular-nums">
              {{ percent(segment.share) }}
              <span class="text-xs text-gray-500 dark:text-gray-400">
                · {{ perMonth(segment.amount) }} / mois
              </span>
              <TransactionsLink
                :to="segmentLink(segment.filter, segment.label)"
                :subject="`Dépenses · ${segment.label}`"
                icon-only
                class="-my-1 h-6 w-6"
                :data-testid="`structure-link-${axis.key}-${segment.key}`"
              />
            </span>
          </li>
        </ul>
        <p
          v-if="axis.key === 'rhythm' && structure.recurring > 0"
          class="mt-2 text-xs text-gray-500 dark:text-gray-400"
          data-testid="recurring-share"
        >
          dont abonnements et charges récurrentes :
          <span
            class="tabular-nums font-medium text-gray-700 dark:text-gray-300"
          >
            {{ perMonth(structure.recurring) }} / mois
          </span>
          ·
          <RouterLink
            to="/recurrences"
            class="text-primary-700 hover:underline dark:text-primary-400"
            data-testid="recurring-link"
          >
            voir la liste
          </RouterLink>
        </p>
      </div>
    </div>

    <p
      v-if="hasUnknown"
      class="mt-3 text-xs text-gray-500 dark:text-gray-400"
      data-testid="unknown-hint"
    >
      « À migrer » : des dépenses encore classées dans des catégories d'avant le
      catalogue, sans nature ni rythme. La migration les fera entrer dans la
      lecture.
    </p>

    <dl
      class="mt-5 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-4 dark:border-slate-800"
      data-testid="savings-reading"
    >
      <div>
        <dt class="text-xs text-gray-500 dark:text-gray-400">Mis de côté</dt>
        <dd class="font-semibold text-gray-900 dark:text-gray-100">
          {{ perMonth(savings) }} / mois
          <span
            v-if="savingsRate !== null"
            class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400"
          >
            soit {{ percent(savingsRate) }} des revenus
          </span>
        </dd>
        <dd class="text-xs text-gray-500 dark:text-gray-400">
          Revenus moins dépenses
        </dd>
        <dd
          v-if="savingsTransfers !== 0"
          class="text-xs text-gray-500 dark:text-gray-400"
          data-testid="savings-transfers"
        >
          {{ perMonth(savingsTransfers) }} / mois virés vers l'épargne
        </dd>
      </div>
      <div>
        <dt class="text-xs text-gray-500 dark:text-gray-400">
          Engagé, vie courante
        </dt>
        <dd
          class="flex items-center gap-1 font-semibold text-gray-900 dark:text-gray-100"
        >
          {{ perMonth(everyday.committed) }} / mois
          <TransactionsLink
            :to="
              segmentLink(
                { rhythm: 'COMMITTED' },
                'Engagé, vie courante',
                'everyday'
              )
            "
            subject="Dépenses · Engagé, vie courante"
            icon-only
            class="-my-1 h-6 w-6"
            data-testid="structure-link-everyday-committed"
          />
        </dd>
      </div>
      <div data-testid="pending-receivables">
        <dt class="text-xs text-gray-500 dark:text-gray-400">
          Avancé, en attente de retour
        </dt>
        <dd class="font-semibold text-gray-900 dark:text-gray-100">
          {{ formatCurrency(pendingReceivables) }}
        </dd>
      </div>
      <div>
        <dt class="text-xs text-gray-500 dark:text-gray-400">Reste à vivre</dt>
        <dd class="font-semibold text-gray-900 dark:text-gray-100">
          <template v-if="remainingToLive !== null">
            {{ perMonth(remainingToLive) }} / mois
          </template>
          <template v-else>—</template>
        </dd>
        <dd class="text-xs text-gray-500 dark:text-gray-400">
          Revenus moins l'engagé de la vie courante
        </dd>
      </div>
    </dl>
  </BaseCard>
</template>

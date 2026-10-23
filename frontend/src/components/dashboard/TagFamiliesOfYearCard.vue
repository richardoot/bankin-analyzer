<script setup lang="ts">
  /**
   * « Épisodes de l'année » — what each tag family (voyages, HYROX,
   * concerts) has cost over the current calendar year, whatever the period
   * the dashboard reads: an envelope is per year, and so is the question.
   *
   * The year is the event's: a trip paid in November for January belongs to
   * January's year. The head says the families' weight once, in figures —
   * their total, their share of the year's exceptional expenses, their share
   * of the real ones — then draws one stacked bar over the exceptional
   * expenses: a family only holds exceptional tags, so the slices are a true
   * composition, and the gray left over is the exceptional spending no
   * family holds yet. The real expenses would leave every slice a sliver.
   *
   * Each family then shows its years side by side on its own scale, its
   * envelope dashed across them, so the question it answers is whether this
   * edition costs as usual; the facts below say its share, its average so
   * far and what its envelope has left — red, with the overrun in words.
   */
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { TagFamilyOfYearDto } from '@/lib/api'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import YearColumnsChart from '@/components/charts/YearColumnsChart.vue'

  const props = defineProps<{
    /** Biggest first, each with spending this year. */
    families: TagFamilyOfYearDto[]
    /** The year's real expenses, every expense included. */
    realExpenses: number | null
    /** The year's exceptional expenses: the bar's and the shares' denominator. */
    exceptionalExpenses: number | null
  }>()

  /** At most this many years per family, the most recent ones. */
  const MAX_YEARS = 6
  const NO_COLOR = '#9ca3af'

  const year = computed(
    () => props.families[0]?.year ?? new Date().getFullYear()
  )

  function percent(part: number, whole: number): string {
    const value = (part / whole) * 100
    // Below one percent, a rounded « 0 % » would read as nothing.
    if (value > 0 && value < 1) return '< 1 %'
    return `${Math.round(value)} %`
  }

  const exceptional = computed(() =>
    props.exceptionalExpenses !== null && props.exceptionalExpenses > 0
      ? props.exceptionalExpenses
      : null
  )

  const real = computed(() =>
    props.realExpenses !== null && props.realExpenses > 0
      ? props.realExpenses
      : null
  )

  const total = computed(() =>
    props.families.reduce((sum, f) => sum + f.spent, 0)
  )

  /** The exceptional spending no family holds, never below 0. */
  const rest = computed(() =>
    exceptional.value === null
      ? 0
      : Math.max(0, +(exceptional.value - total.value).toFixed(2))
  )

  const colorOf = (family: TagFamilyOfYearDto): string =>
    family.color ?? NO_COLOR

  function shareOfExceptional(family: TagFamilyOfYearDto): string | null {
    return exceptional.value === null
      ? null
      : percent(family.spent, exceptional.value)
  }

  function sliceWidth(family: TagFamilyOfYearDto): string {
    const whole = exceptional.value ?? 1
    return `${Math.min(100, (family.spent / whole) * 100)}%`
  }

  const stackLabel = computed(() => {
    if (exceptional.value === null) return ''
    const whole = exceptional.value
    const slices = props.families
      .map(f => `${f.name} ${percent(f.spent, whole)}`)
      .join(', ')
    const restPart =
      rest.value > 0 ? `, ${percent(rest.value, whole)} sans famille` : ''
    return `${slices} des dépenses exceptionnelles de l'année${restPart}`
  })

  /**
   * The family's years from its first one to this one, without a gap — a
   * year without spending is a column at 0 — and the most recent six only.
   */
  function yearsOf(
    family: TagFamilyOfYearDto
  ): { year: number; amount: number }[] {
    const byYear = new Map(family.spentByYear.map(y => [y.year, y.spent]))
    byYear.set(family.year, byYear.get(family.year) ?? family.spent)
    const first = Math.max(
      Math.min(...byYear.keys()),
      family.year - MAX_YEARS + 1
    )
    const years: { year: number; amount: number }[] = []
    for (let y = first; y <= family.year; y++) {
      years.push({ year: y, amount: byYear.get(y) ?? 0 })
    }
    return years
  }

  function yearsLabel(family: TagFamilyOfYearDto): string {
    const years = yearsOf(family)
      .filter(y => y.amount > 0)
      .map(y => `${y.year} ${formatCurrency(y.amount)}`)
      .join(', ')
    const envelope =
      family.annualBudget !== null
        ? `, enveloppe ${formatCompactCurrency(family.annualBudget)} par an`
        : ''
    return `${family.name} : ${years}${envelope}`
  }

  /** The mean of the years before this one that spent; null on a first year. */
  function pastAverage(family: TagFamilyOfYearDto): number | null {
    const past = family.spentByYear.filter(y => y.year < family.year)
    if (past.length === 0) return null
    return past.reduce((sum, y) => sum + y.spent, 0) / past.length
  }

  const isOver = (family: TagFamilyOfYearDto): boolean =>
    family.remaining !== null && family.remaining < 0

  /** The family's rows paid this calendar year — the list reads payments. */
  function familyLink(family: TagFamilyOfYearDto) {
    return transactionsLink({
      tagFamilyId: family.id,
      from: `${family.year}-01-01`,
      to: `${family.year}-12-31`,
      gross: true,
      label: `${family.name} · ${family.year}`,
    })
  }
</script>

<template>
  <BaseCard as="section" data-testid="tag-families-of-year">
    <div class="mb-4">
      <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
        Épisodes de l'année {{ year }}
      </h2>
      <p class="text-xs text-gray-500 dark:text-gray-400">
        Par famille d'étiquettes, sur toute l'année quelle que soit la période,
        rangé à l'année de l'événement. Part des dépenses réelles de l'année.
      </p>
    </div>

    <div class="mb-5">
      <p
        class="text-sm text-gray-700 dark:text-gray-300"
        data-testid="families-of-year-header"
      >
        <span
          class="font-semibold text-gray-900 tabular-nums dark:text-gray-100"
        >
          {{ formatCurrency(total) }}
        </span>
        d'épisodes cette année
        <template v-if="exceptional !== null">
          · {{ percent(total, exceptional) }} de l'exceptionnel de l'année ({{
            formatCurrency(exceptional)
          }})
        </template>
        <template v-if="real !== null">
          · {{ percent(total, real) }} du réel
        </template>
      </p>

      <template v-if="exceptional !== null">
        <div
          class="mt-2 flex h-2.5 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
          role="img"
          :aria-label="stackLabel"
          data-testid="families-of-year-stack"
        >
          <div
            v-for="family in families"
            :key="family.id"
            class="h-full shrink-0"
            :style="{
              width: sliceWidth(family),
              minWidth: '3px',
              backgroundColor: colorOf(family),
            }"
            :title="`${family.name} : ${formatCurrency(family.spent)}, ${shareOfExceptional(family)} de l'exceptionnel`"
            :data-testid="`families-of-year-stack-slice-${family.id}`"
          ></div>
          <div
            v-if="rest > 0"
            class="h-full flex-1"
            :title="`Sans famille : ${formatCurrency(rest)}`"
            data-testid="families-of-year-stack-rest"
          ></div>
        </div>
        <p
          v-if="rest > 0"
          class="mt-1 text-xs text-gray-500 dark:text-gray-400"
          data-testid="families-of-year-rest-note"
        >
          Le gris : {{ formatCurrency(rest) }} d'exceptionnel sans famille.
        </p>
      </template>
    </div>

    <ul class="grid grid-cols-1 gap-x-8 gap-y-5 md:grid-cols-2">
      <li
        v-for="family in families"
        :key="family.id"
        class="min-w-0"
        :data-testid="`family-of-year-${family.id}`"
      >
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="flex min-w-0 items-center gap-2">
            <span
              class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: colorOf(family) }"
              aria-hidden="true"
            ></span>
            <RouterLink
              :to="`/tags/families/${family.id}`"
              class="truncate font-medium text-gray-900 hover:underline dark:text-gray-100"
              :data-testid="`family-of-year-link-${family.id}`"
            >
              {{ family.name }}
            </RouterLink>
          </span>
          <span class="flex shrink-0 items-center gap-1 tabular-nums">
            <span
              class="font-semibold whitespace-nowrap"
              :class="
                isOver(family)
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-gray-900 dark:text-gray-100'
              "
              :data-testid="`family-of-year-spent-${family.id}`"
            >
              {{ formatCurrency(family.spent) }}
            </span>
            <TransactionsLink
              :to="familyLink(family)"
              :subject="`la famille ${family.name} en ${family.year}`"
              icon-only
              class="-my-1 h-6 w-6"
              :data-testid="`family-of-year-transactions-link-${family.id}`"
            />
          </span>
        </div>

        <div class="mt-2" :data-testid="`family-of-year-years-${family.id}`">
          <YearColumnsChart
            :years="yearsOf(family)"
            :current-year="family.year"
            :color="colorOf(family)"
            :envelope="family.annualBudget ?? undefined"
            :label="yearsLabel(family)"
          />
        </div>

        <p
          class="mt-1 text-xs text-gray-500 dark:text-gray-400"
          :data-testid="`family-of-year-details-${family.id}`"
        >
          <template v-if="shareOfExceptional(family)">
            {{ shareOfExceptional(family) }} de l'exceptionnel ·
          </template>
          {{ family.tagCount }}
          {{ family.tagCount > 1 ? 'étiquettes' : 'étiquette' }} ·
          {{ family.transactionCount }}
          {{ family.transactionCount > 1 ? 'transactions' : 'transaction' }} ·
          <template v-if="pastAverage(family) !== null">
            {{ formatCompactCurrency(pastAverage(family) ?? 0) }} par an
            jusqu'ici
          </template>
          <template v-else>première année</template>
          <template v-if="family.annualBudget !== null">
            ·
            <span
              v-if="isOver(family)"
              class="font-semibold text-red-600 dark:text-red-400"
            >
              dépassement de {{ formatCurrency(-(family.remaining ?? 0)) }}
            </span>
            <span v-else
              >reste {{ formatCurrency(family.remaining ?? 0) }}</span
            >
            sur {{ formatCompactCurrency(family.annualBudget) }} par an
          </template>
        </p>
      </li>
    </ul>

    <p class="mt-4 text-xs text-gray-500 dark:text-gray-400">
      La liste des transactions suit les dates de paiement : un acompte payé
      l'année d'avant n'y figure pas, un acompte pour l'an prochain si.
    </p>
  </BaseCard>
</template>

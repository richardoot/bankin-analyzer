<script setup lang="ts">
  /**
   * « Épisodes de l'année » — what each tag family (voyages, HYROX,
   * concerts) has cost over the current calendar year, whatever the period
   * the dashboard reads: an envelope is per year, and so is the question.
   *
   * The year is the event's: a trip paid in November for January belongs to
   * January's year. Each family names its share of the year's real
   * expenses, and its envelope when it has one — red, with the overrun in
   * words, once spent.
   *
   * The bars share one euro scale, so families compare at a glance; an
   * envelope draws its own length behind the bar. They are decorative: the
   * figures are all in the text.
   */
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { TagFamilyOfYearDto } from '@/lib/api'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'

  const props = defineProps<{
    /** Biggest first, each with spending this year. */
    families: TagFamilyOfYearDto[]
    /** The year's real expenses, every expense included. */
    realExpenses: number | null
  }>()

  const year = computed(
    () => props.families[0]?.year ?? new Date().getFullYear()
  )

  /** The longest bar or envelope: the card's one scale. */
  const scale = computed(() =>
    props.families.reduce(
      (max, f) => Math.max(max, f.spent, f.annualBudget ?? 0),
      0
    )
  )

  const width = (amount: number): string =>
    `${scale.value > 0 ? Math.min(1, amount / scale.value) * 100 : 0}%`

  function share(family: TagFamilyOfYearDto): string | null {
    if (!props.realExpenses || props.realExpenses <= 0) return null
    const percent = (family.spent / props.realExpenses) * 100
    // Below one percent, a rounded « 0 % » would read as nothing.
    if (percent > 0 && percent < 1) return '< 1 %'
    return `${Math.round(percent)} %`
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

    <ul class="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
      <li
        v-for="family in families"
        :key="family.id"
        :data-testid="`family-of-year-${family.id}`"
      >
        <div class="flex items-center justify-between gap-2 text-sm">
          <span class="flex min-w-0 items-center gap-2">
            <span
              class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
              :style="{ backgroundColor: family.color ?? '#9ca3af' }"
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
              class="font-semibold"
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

        <div
          class="relative mt-1.5 h-2 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
          aria-hidden="true"
          :data-testid="`family-of-year-bar-${family.id}`"
        >
          <div
            v-if="family.annualBudget !== null"
            class="absolute inset-y-0 left-0 rounded-full bg-amber-100 dark:bg-amber-900/40"
            :style="{ width: width(family.annualBudget) }"
          ></div>
          <div
            class="absolute inset-y-0 left-0 rounded-full"
            :class="isOver(family) ? 'bg-red-500' : 'bg-amber-500'"
            :style="{ width: width(family.spent) }"
          ></div>
        </div>

        <p
          class="mt-1 text-xs text-gray-500 dark:text-gray-400"
          :data-testid="`family-of-year-details-${family.id}`"
        >
          <template v-if="share(family)">
            {{ share(family) }} du réel ·
          </template>
          {{ family.tagCount }}
          {{ family.tagCount > 1 ? 'étiquettes' : 'étiquette' }}
          <template v-if="family.annualBudget !== null">
            · sur {{ formatCompactCurrency(family.annualBudget) }} par an ·
            <span
              v-if="isOver(family)"
              class="font-semibold text-red-600 dark:text-red-400"
            >
              dépassement de {{ formatCurrency(-(family.remaining ?? 0)) }}
            </span>
            <span v-else
              >reste {{ formatCurrency(family.remaining ?? 0) }}</span
            >
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

<script setup lang="ts">
  /**
   * The events of the period unfolded in place, under « N événements sur la
   * période » (agent-os/product/dashboard-refonte.md, lot 5): one row an
   * event — its tag with its family's dot, the family, what it cost over
   * the period, the way to its analysis and to its transactions — then
   * where the money went, by category. The second level of detail, the
   * last before a page: the tags page holds the whole year.
   */
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import type { ExceptionalCategoryDto, ExceptionalEventDto } from '@/lib/api'
  import { formatCompactCurrency } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'

  const props = withDefaults(
    defineProps<{
      /** The events of the period, biggest first. */
      events: ExceptionalEventDto[]
      /** Their expenses by category, biggest first. */
      byCategory?: ExceptionalCategoryDto[]
      /** The period, for the links. */
      window?:
        { from?: string | undefined; to?: string | undefined } | undefined
    }>(),
    { byCategory: () => [], window: undefined }
  )

  const emit = defineEmits<{ close: [] }>()

  /** How many categories the foot names before it stops. */
  const MAX_CATEGORIES = 5
  /** A tag in no family, or a family without a color: a grey dot. */
  const NO_COLOR = '#9ca3af'

  const euros = (value: number) => formatCompactCurrency(value)

  const dotColor = (event: ExceptionalEventDto) =>
    event.familyColor ?? event.color ?? NO_COLOR

  /** Every exceptional expense of the period. */
  const allLink = computed(() =>
    transactionsLink({
      type: 'EXPENSE',
      exceptional: 'only',
      from: props.window?.from,
      to: props.window?.to,
      gross: true,
      label: 'Dépenses exceptionnelles de la période',
    })
  )

  /** One event's expenses over the period. */
  function eventLink(event: ExceptionalEventDto) {
    return transactionsLink({
      type: 'EXPENSE',
      tagId: event.id,
      from: props.window?.from,
      to: props.window?.to,
      gross: true,
      label: event.name,
    })
  }

  /** « Logement 427 €, Transport 391 € », then how many more. */
  const categoriesLabel = computed(() => {
    const shown = props.byCategory
      .slice(0, MAX_CATEGORIES)
      .map(c => `${c.category} ${euros(c.amount)}`)
      .join(', ')
    const rest = props.byCategory.length - MAX_CATEGORIES
    return rest > 0
      ? `${shown} et ${rest} ${rest > 1 ? 'autres' : 'autre'}`
      : shown
  })
</script>

<template>
  <div
    data-testid="events-panel"
    class="rounded-lg bg-gray-50 p-4 text-[13px] text-gray-600 dark:bg-slate-800/50 dark:text-gray-400"
    @keydown.esc.stop="emit('close')"
  >
    <div class="mb-2 flex justify-end">
      <TransactionsLink
        :to="allLink"
        subject="Dépenses exceptionnelles de la période"
        data-testid="events-panel-all-link"
      >
        Toutes les transactions exceptionnelles
      </TransactionsLink>
    </div>

    <table class="w-full table-fixed border-collapse">
      <caption class="sr-only">
        Les événements de la période
      </caption>
      <thead>
        <tr
          class="border-b border-gray-200 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 dark:border-slate-700 dark:text-gray-400"
        >
          <th scope="col" class="py-1.5 pr-3 font-semibold">Étiquette</th>
          <th
            scope="col"
            class="hidden w-32 py-1.5 pr-3 font-semibold sm:table-cell"
          >
            Famille
          </th>
          <th scope="col" class="w-24 py-1.5 pr-3 text-right font-semibold">
            Montant
          </th>
          <th scope="col" class="w-20 py-1.5 pr-1 text-right font-semibold">
            <span class="sr-only">Analyse</span>
          </th>
          <th scope="col" class="w-8 py-1.5">
            <span class="sr-only">Transactions</span>
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-gray-200/70 dark:divide-slate-700/70">
        <tr
          v-for="event in events"
          :key="event.id"
          :data-testid="`events-panel-row-${event.id}`"
        >
          <td class="py-1.5 pr-3">
            <span class="flex min-w-0 items-center gap-2">
              <span
                :data-testid="`events-panel-dot-${event.id}`"
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: dotColor(event) }"
                aria-hidden="true"
              />
              <span class="truncate text-gray-900 dark:text-gray-100">{{
                event.name
              }}</span>
            </span>
          </td>
          <td
            :data-testid="`events-panel-family-${event.id}`"
            class="hidden truncate py-1.5 pr-3 sm:table-cell"
          >
            {{ event.familyName ?? '—' }}
          </td>
          <td
            class="py-1.5 pr-3 text-right font-medium whitespace-nowrap text-gray-900 tabular-nums dark:text-gray-100"
          >
            {{ euros(event.amount) }}
          </td>
          <td class="py-1.5 pr-1 text-right">
            <RouterLink
              :to="`/tags/${event.id}`"
              class="text-xs font-medium whitespace-nowrap text-primary-700 hover:underline dark:text-primary-400"
              :aria-label="`Analyse de ${event.name}`"
              :data-testid="`events-panel-analysis-${event.id}`"
            >
              Analyse →
            </RouterLink>
          </td>
          <td class="py-1.5 text-right">
            <TransactionsLink
              :to="eventLink(event)"
              :subject="event.name"
              icon-only
              class="-my-1 h-6 w-6"
              :data-testid="`events-panel-link-${event.id}`"
            />
          </td>
        </tr>
      </tbody>
    </table>

    <div
      class="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-gray-200 pt-2.5 dark:border-slate-700"
    >
      <p
        v-if="byCategory.length > 0"
        data-testid="events-panel-by-category"
        class="min-w-0 flex-1 tabular-nums"
      >
        <span class="font-medium text-gray-900 dark:text-gray-100"
          >Par catégorie</span
        >
        : {{ categoriesLabel }}
      </p>
      <RouterLink
        to="/tags"
        class="text-xs font-medium text-primary-700 hover:underline dark:text-primary-400"
        data-testid="events-panel-year-link"
      >
        Tout l'exceptionnel de l'année →
      </RouterLink>
    </div>
  </div>
</template>

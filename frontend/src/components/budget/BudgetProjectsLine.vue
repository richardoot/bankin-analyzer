<script setup lang="ts">
  import { computed, ref, useId } from 'vue'
  import { RouterLink } from 'vue-router'
  import type {
    BudgetPlanDto,
    TagBudgetSummaryDto,
    TagBudgetSummaryFamilyDto,
    TagBudgetSummaryItemDto,
    TagDto,
  } from '@/lib/api'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import {
    DATA_HUE,
    STATE_BADGE_CLASSES,
    STATE_COLORS,
    type StateTone,
  } from '@/lib/stateTints'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'

  /**
   * « Projets de la période », folded under the envelopes: the plan's
   * second tier, the projects charged against the reserve rather than
   * against the monthly envelopes. Folded, one line: what the projects
   * commit against the reserve, and a badge — amber when the reserve is
   * spent past, grey otherwise, « pas de réserve » on a plan without the
   * equation. Unfolded, each family with an annual envelope (its prorata,
   * its spend, a share bar in the data hue), its tags, the tags outside
   * any family, then the period's events.
   *
   * A family is charged as a whole, in place of its tags' own envelopes;
   * the server's `totalBudget` already says so, and is the only figure the
   * reserve reads. Renders nothing without a project nor an event.
   */
  const props = defineProps<{
    projects: TagBudgetSummaryDto | null
    plan: BudgetPlanDto | null
    /**
     * The exceptional events whose declared period overlaps the plan,
     * listed under the projects with their colour.
     */
    events?: TagDto[] | undefined
  }>()

  const emit = defineEmits<{ 'open-tag': [tagId: string] }>()

  /** Folded on load: the line is a summary, the detail waits. */
  const expanded = ref(false)
  const panelId = useId()

  interface ProjectGroup {
    family: TagBudgetSummaryFamilyDto | null
    items: TagBudgetSummaryItemDto[]
  }

  /**
   * What the panel lists: each family with an envelope and its tags, then
   * the tags outside any such family, without a heading.
   */
  const groups = computed<ProjectGroup[]>(() => {
    const families = props.projects?.families ?? []
    const loose = props.projects?.items ?? []
    return [
      ...families.map(family => ({ family, items: family.items })),
      ...(loose.length > 0 ? [{ family: null, items: loose }] : []),
    ]
  })

  const eventList = computed(() => props.events ?? [])

  const hasContent = computed(
    () => groups.value.length > 0 || eventList.value.length > 0
  )

  /** What the projects commit: their envelopes, families prorated. */
  const committed = computed(() => props.projects?.totalBudget ?? 0)

  const reserve = computed<number | null>(() => {
    const value = props.plan?.projectReserve
    return value === null || value === undefined ? null : value
  })

  /**
   * Reserve minus the envelopes already committed to projects. Null unless
   * the plan carries an equation — without it there is nothing to charge
   * against.
   */
  const reserveRemaining = computed<number | null>(() =>
    reserve.value === null ? null : reserve.value - committed.value
  )

  const badge = computed<{ tone: StateTone; text: string }>(() => {
    const remaining = reserveRemaining.value
    if (remaining === null) return { tone: 'neutral', text: 'pas de réserve' }
    if (remaining < 0) {
      return {
        tone: 'over',
        text: `dépassement de ${formatCurrency(-remaining)}`,
      }
    }
    return { tone: 'neutral', text: `reste ${formatCurrency(remaining)}` }
  })

  /** The plan's window, as the transactions list filters it. */
  const planWindow = computed(() => ({
    from: props.plan?.startDate.slice(0, 10),
    to: props.plan?.endDate.slice(0, 10),
  }))

  /** The project's rows over the plan — what `spent` adds up, gross. */
  function projectLink(item: { id: string; name: string }) {
    return transactionsLink({
      tagId: item.id,
      ...planWindow.value,
      gross: true,
      label: item.name,
    })
  }

  /** The family's rows over the plan — what its `spent` adds up, gross. */
  function familyLink(family: TagBudgetSummaryFamilyDto) {
    return transactionsLink({
      tagFamilyId: family.id,
      ...planWindow.value,
      gross: true,
      label: family.name,
    })
  }

  /** Share of the prorated envelope spent; above 1 on an overrun. */
  function familyRatio(family: TagBudgetSummaryFamilyDto): number {
    if (family.proratedBudget <= 0) return family.spent > 0 ? Infinity : 0
    return family.spent / family.proratedBudget
  }

  /** The share bar: the data hue, the state amber past the envelope. */
  function familyBarColor(family: TagBudgetSummaryFamilyDto): string {
    return familyRatio(family) > 1 ? STATE_COLORS.over : DATA_HUE
  }

  /** Projects that have spent more than their envelope allowed. */
  function isProjectOver(item: {
    budgetAmount: number | null
    spent: number
  }): boolean {
    return item.budgetAmount !== null && item.spent > item.budgetAmount
  }

  const BADGE =
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums whitespace-nowrap'
</script>

<template>
  <div
    v-if="hasContent"
    data-testid="budget-projects-line"
    class="border-t border-gray-100 text-[13px] dark:border-slate-700"
  >
    <div
      class="flex min-h-[44px] flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2"
    >
      <p
        class="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-gray-500 dark:text-gray-400"
      >
        <span class="font-semibold text-gray-900 dark:text-gray-100">
          Projets de la période
        </span>
        <span aria-hidden="true">·</span>
        <span
          v-if="reserve !== null"
          data-testid="plan-project-reserve"
          class="tabular-nums"
        >
          <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
            formatCurrency(committed)
          }}</strong>
          engagés sur {{ formatCurrency(reserve) }} de réserve
        </span>
        <span v-else class="tabular-nums">
          <strong class="font-semibold text-gray-900 dark:text-gray-100">{{
            formatCurrency(committed)
          }}</strong>
          engagés
        </span>
        <span
          :data-testid="
            reserveRemaining !== null
              ? 'reserve-remaining'
              : 'projects-no-reserve'
          "
          :data-tone="badge.tone"
          :class="[BADGE, STATE_BADGE_CLASSES[badge.tone]]"
        >
          {{ badge.text }}
        </span>
      </p>
      <button
        type="button"
        data-testid="budget-projects-toggle"
        class="inline-flex min-h-[40px] items-center gap-1 rounded px-2 font-medium text-gray-700 hover:bg-gray-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 dark:text-gray-300 dark:hover:bg-slate-800"
        :aria-expanded="expanded"
        :aria-controls="panelId"
        @click="expanded = !expanded"
      >
        {{ expanded ? 'Replier' : 'Déplier' }}
        <IconChevronRight
          class="h-4 w-4 transition-transform"
          :class="expanded ? '-rotate-90' : 'rotate-90'"
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-if="expanded"
      :id="panelId"
      data-testid="budget-projects-panel"
      class="space-y-3 px-4 pb-4"
    >
      <div
        v-for="group in groups"
        :key="group.family?.id ?? 'none'"
        :data-testid="
          group.family ? `project-family-${group.family.id}` : 'project-tags'
        "
      >
        <!-- A family with an envelope: its prorata, its spend, its bar. -->
        <template v-if="group.family">
          <div class="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
            <span
              class="inline-block h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: group.family.color ?? '#9ca3af' }"
              aria-hidden="true"
            ></span>
            <RouterLink
              :to="{ name: 'tag-family', params: { id: group.family.id } }"
              class="font-medium text-gray-900 hover:underline dark:text-gray-100"
              :data-testid="`project-family-link-${group.family.id}`"
            >
              {{ group.family.name }}
            </RouterLink>
            <span
              class="font-semibold text-gray-900 tabular-nums dark:text-gray-100"
              :data-testid="`project-family-figures-${group.family.id}`"
            >
              {{ formatCurrency(group.family.spent) }} /
              {{ formatCurrency(group.family.proratedBudget) }}
            </span>
            <span
              v-if="familyRatio(group.family) > 1"
              :data-testid="`project-family-over-${group.family.id}`"
              :class="[BADGE, STATE_BADGE_CLASSES.over]"
            >
              dépassé
            </span>
            <span class="text-gray-500 dark:text-gray-400">
              {{ formatCompactCurrency(group.family.annualBudget) }} par an, au
              prorata de la période
            </span>
            <TransactionsLink
              :to="familyLink(group.family)"
              :subject="`la famille ${group.family.name}`"
              icon-only
              class="h-6 w-6"
              :data-testid="`project-family-transactions-link-${group.family.id}`"
            />
          </div>
          <div
            class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-800"
            aria-hidden="true"
          >
            <div
              :data-testid="`project-family-bar-${group.family.id}`"
              class="h-full rounded-full"
              :style="{
                width: `${Math.min(familyRatio(group.family), 1) * 100}%`,
                backgroundColor: familyBarColor(group.family),
              }"
            ></div>
          </div>
          <p
            v-if="group.items.length === 0"
            class="mt-1 text-xs italic text-gray-500 dark:text-gray-400"
          >
            Aucune étiquette de la famille sur la période
          </p>
        </template>

        <!-- The chip opens the tag's page; the arrow beside it, its rows. -->
        <div
          v-if="group.items.length > 0"
          class="flex flex-wrap gap-1.5"
          :class="group.family ? 'mt-1.5' : ''"
        >
          <span
            v-for="item in group.items"
            :key="item.id"
            class="inline-flex items-center gap-0.5 rounded-full border border-gray-200 pr-1 dark:border-slate-700"
          >
            <button
              type="button"
              :data-testid="`project-${item.name}`"
              class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-gray-700 transition hover:ring-2 hover:ring-primary-300 dark:text-gray-300 dark:hover:ring-primary-700"
              @click="emit('open-tag', item.id)"
            >
              <span
                class="inline-block h-2 w-2 shrink-0 rounded-full"
                :style="{ backgroundColor: item.color ?? '#9ca3af' }"
              ></span>
              {{ item.name }}
              <span
                class="font-semibold text-gray-900 tabular-nums dark:text-gray-100"
              >
                {{ formatCurrency(item.spent) }}
              </span>
              <!-- Inside a family, the family's envelope is the one charged. -->
              <template v-if="!group.family">
                <span
                  v-if="item.budgetAmount !== null"
                  class="text-gray-500 tabular-nums dark:text-gray-400"
                >
                  / {{ formatCurrency(item.budgetAmount) }}
                </span>
                <span v-else class="italic text-gray-500 dark:text-gray-400">
                  sans enveloppe
                </span>
                <span
                  v-if="isProjectOver(item)"
                  :data-testid="`project-over-${item.name}`"
                  :class="[BADGE, STATE_BADGE_CLASSES.over]"
                >
                  dépassé
                </span>
              </template>
            </button>
            <TransactionsLink
              :to="projectLink(item)"
              :subject="item.name"
              icon-only
              class="h-6 w-6"
              :data-testid="`project-transactions-link-${item.name}`"
            />
          </span>
        </div>
      </div>

      <!-- The period's events, each with its colour: the chip opens the
           event's page. -->
      <div v-if="eventList.length > 0" data-testid="project-events">
        <p class="mb-1.5 text-xs text-gray-500 dark:text-gray-400">
          Événements de la période
        </p>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="event in eventList"
            :key="event.id"
            type="button"
            :data-testid="`project-event-${event.name}`"
            class="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700 transition hover:ring-2 hover:ring-primary-300 dark:border-slate-700 dark:text-gray-300 dark:hover:ring-primary-700"
            @click="emit('open-tag', event.id)"
          >
            <span
              class="inline-block h-2 w-2 shrink-0 rounded-full"
              :style="{ backgroundColor: event.color ?? '#9ca3af' }"
              aria-hidden="true"
            ></span>
            {{ event.name }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

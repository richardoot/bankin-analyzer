<script setup lang="ts">
  import { computed } from 'vue'
  import { RouterLink } from 'vue-router'
  import type {
    BudgetPlanDto,
    TagBudgetSummaryDto,
    TagBudgetSummaryFamilyDto,
    TagBudgetSummaryItemDto,
  } from '@/lib/api'
  import { formatCompactCurrency, formatCurrency } from '@/lib/formatters'
  import { transactionsLink } from '@/lib/transactionsLink'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'

  /**
   * The plan's second tier: projects charged against the reserve rather
   * than against the monthly envelopes. Renders nothing when the period
   * carries no project; a reserve overrun is said in red, never hidden.
   *
   * A family with an annual envelope is one line: its envelope prorated to
   * the plan, what its tags spent, its tags of the period below. It is
   * charged as a whole, in place of its tags' own envelopes; the server's
   * `totalBudget` already says so, and is the only figure read here.
   */
  const props = defineProps<{
    projects: TagBudgetSummaryDto | null
    plan: BudgetPlanDto | null
  }>()

  const emit = defineEmits<{ 'open-tag': [tagId: string] }>()

  interface ProjectGroup {
    family: TagBudgetSummaryFamilyDto | null
    items: TagBudgetSummaryItemDto[]
  }

  /**
   * What the section lists: each family with an envelope and its tags, then
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

  const hasProjects = computed(() => groups.value.length > 0)

  /**
   * Reserve minus the envelopes already committed to projects. Null unless
   * the plan carries an equation — without it there is nothing to charge
   * against.
   */
  const reserveRemaining = computed<number | null>(() => {
    const reserve = props.plan?.projectReserve
    if (reserve === null || reserve === undefined) return null
    return reserve - (props.projects?.totalBudget ?? 0)
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

  /** Projects that have spent more than their envelope allowed. */
  function isProjectOver(item: {
    budgetAmount: number | null
    spent: number
  }): boolean {
    return item.budgetAmount !== null && item.spent > item.budgetAmount
  }
</script>

<template>
  <div
    v-if="hasProjects"
    data-testid="budget-projects"
    class="mb-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5"
  >
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <p class="text-xs font-medium text-amber-900 dark:text-amber-200">
        Projets de la période
      </p>
      <p
        v-if="reserveRemaining !== null"
        data-testid="reserve-remaining"
        class="text-xs tabular-nums"
        :class="
          reserveRemaining < 0
            ? 'text-red-600 dark:text-red-400 font-semibold'
            : 'text-amber-800 dark:text-amber-300'
        "
      >
        <template v-if="reserveRemaining < 0">
          {{ formatCurrency(projects?.totalBudget ?? 0) }} engagés sur
          {{ formatCurrency(plan?.projectReserve ?? 0) }} de réserve —
          dépassement de {{ formatCurrency(-reserveRemaining) }}
        </template>
        <template v-else>
          {{ formatCurrency(projects?.totalBudget ?? 0) }} engagés sur
          {{ formatCurrency(plan?.projectReserve ?? 0) }} de réserve
        </template>
      </p>
    </div>

    <div
      v-for="group in groups"
      :key="group.family?.id ?? 'none'"
      class="mt-2"
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
            class="font-medium text-amber-900 hover:underline dark:text-amber-200"
            :data-testid="`project-family-link-${group.family.id}`"
          >
            {{ group.family.name }}
          </RouterLink>
          <span
            class="tabular-nums"
            :class="
              familyRatio(group.family) > 1
                ? 'font-semibold text-red-600 dark:text-red-400'
                : 'text-amber-900 dark:text-amber-200'
            "
            :data-testid="`project-family-figures-${group.family.id}`"
          >
            {{ formatCurrency(group.family.spent) }} /
            {{ formatCurrency(group.family.proratedBudget) }}
          </span>
          <span class="text-amber-800 dark:text-amber-300">
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
          class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-amber-100 dark:bg-amber-950"
          aria-hidden="true"
        >
          <div
            class="h-full rounded-full"
            :class="
              familyRatio(group.family) > 1 ? 'bg-red-500' : 'bg-amber-500'
            "
            :style="{
              width: `${Math.min(familyRatio(group.family), 1) * 100}%`,
            }"
          ></div>
        </div>
        <p
          v-if="group.items.length === 0"
          class="mt-1 text-xs italic text-amber-800 dark:text-amber-300"
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
          class="inline-flex items-center gap-0.5 rounded-full bg-white pr-1 dark:bg-slate-900"
        >
          <button
            type="button"
            :data-testid="`project-${item.name}`"
            class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs text-gray-700 dark:text-gray-300 hover:ring-2 hover:ring-primary-300 transition dark:hover:ring-primary-700"
            @click="emit('open-tag', item.id)"
          >
            <span
              class="inline-block h-2 w-2 rounded-full shrink-0"
              :style="{ backgroundColor: item.color ?? '#9ca3af' }"
            ></span>
            {{ item.name }}
            <span
              class="font-semibold tabular-nums"
              :class="
                !group.family && isProjectOver(item)
                  ? 'text-red-600 dark:text-red-400'
                  : ''
              "
            >
              {{ formatCurrency(item.spent) }}
            </span>
            <!-- Inside a family, the family's envelope is the one charged. -->
            <template v-if="!group.family">
              <span
                v-if="item.budgetAmount !== null"
                class="text-gray-500 dark:text-gray-400 tabular-nums"
              >
                / {{ formatCurrency(item.budgetAmount) }}
              </span>
              <span v-else class="text-gray-500 dark:text-gray-400 italic">
                sans enveloppe
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
  </div>
</template>

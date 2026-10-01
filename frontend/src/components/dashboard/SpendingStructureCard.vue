<script setup lang="ts">
  /**
   * Where the money goes, read through the two attributes every expense now
   * carries: constrained or chosen, running on its own or following the
   * user. Two readings of the same period — the month as it was, and the
   * lifestyle once the exceptional share is set aside — because both are
   * true and they answer different questions.
   *
   * Below, what the framework calls the savings reading: what left the
   * everyday accounts towards savings, its share of the income, and what
   * the period left free once the committed spending and the savings were
   * out.
   */
  import { computed, ref } from 'vue'
  import type { SpendingStructureDto } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'

  const props = defineProps<{
    actual: SpendingStructureDto
    everyday: SpendingStructureDto
    savingsTransfers: number
    savingsRate: number | null
    remainingToLive: number | null
    periodMonths: number
  }>()

  type Reading = 'everyday' | 'actual'
  const reading = ref<Reading>('everyday')
  const structure = computed(() =>
    reading.value === 'everyday' ? props.everyday : props.actual
  )

  interface Segment {
    key: string
    label: string
    amount: number
    share: number
    color: string
  }

  function segments(
    parts: { key: string; label: string; amount: number; color: string }[]
  ): Segment[] {
    const total = parts.reduce((sum, p) => sum + Math.max(0, p.amount), 0)
    return parts
      .filter(p => p.amount > 0)
      .map(p => ({ ...p, share: total > 0 ? p.amount / total : 0 }))
  }

  const natureSegments = computed(() =>
    segments([
      {
        key: 'essential',
        label: 'Essentiel',
        amount: structure.value.essential,
        color: 'bg-blue-500',
      },
      {
        key: 'pleasure',
        label: 'Plaisir',
        amount: structure.value.pleasure,
        color: 'bg-amber-400',
      },
      {
        key: 'unknown',
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
        label: 'Engagé',
        amount: structure.value.committed,
        color: 'bg-indigo-500',
      },
      {
        key: 'variable',
        label: 'Variable',
        amount: structure.value.variable,
        color: 'bg-teal-400',
      },
      {
        key: 'unknown',
        label: 'À migrer',
        amount: structure.value.unknownRhythm,
        color: 'bg-gray-300 dark:bg-slate-600',
      },
    ])
  )

  const hasUnknown = computed(
    () => structure.value.unknownNature > 0 || structure.value.unknownRhythm > 0
  )

  const percent = (share: number) => `${Math.round(share * 100)} %`
  const perMonth = (amount: number) =>
    formatCurrency(amount / Math.max(1, props.periodMonths))
</script>

<template>
  <section
    data-testid="spending-structure"
    class="rounded-xl bg-white p-4 shadow-sm sm:p-6 dark:bg-slate-900 dark:shadow-slate-900/20"
  >
    <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
          Structure des dépenses
        </h2>
        <p class="text-xs text-gray-500 dark:text-gray-400">
          Contraint ou choisi, engagé ou variable, sur la période.
        </p>
      </div>
      <div
        class="inline-flex rounded-lg border border-gray-200 p-0.5 dark:border-slate-700"
        role="group"
        aria-label="Lecture"
      >
        <button
          type="button"
          :aria-pressed="reading === 'everyday'"
          data-testid="reading-everyday"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            reading === 'everyday'
              ? 'bg-primary-500 text-white dark:bg-primary-600'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
          "
          @click="reading = 'everyday'"
        >
          Vie courante
        </button>
        <button
          type="button"
          :aria-pressed="reading === 'actual'"
          data-testid="reading-actual"
          class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          :class="
            reading === 'actual'
              ? 'bg-primary-500 text-white dark:bg-primary-600'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
          "
          @click="reading = 'actual'"
        >
          Réel
        </button>
      </div>
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
            <span class="tabular-nums">
              {{ percent(segment.share) }}
              <span class="text-xs text-gray-500 dark:text-gray-400">
                · {{ perMonth(segment.amount) }} / mois
              </span>
            </span>
          </li>
        </ul>
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
      class="mt-5 grid grid-cols-1 gap-3 border-t border-gray-100 pt-4 text-sm sm:grid-cols-3 dark:border-slate-800"
      data-testid="savings-reading"
    >
      <div>
        <dt class="text-xs text-gray-500 dark:text-gray-400">Mis de côté</dt>
        <dd class="font-semibold text-gray-900 dark:text-gray-100">
          {{ perMonth(savingsTransfers) }} / mois
          <span
            v-if="savingsRate !== null"
            class="ml-1 text-xs font-normal text-gray-500 dark:text-gray-400"
          >
            soit {{ percent(savingsRate) }} des revenus
          </span>
        </dd>
      </div>
      <div>
        <dt class="text-xs text-gray-500 dark:text-gray-400">
          Engagé, vie courante
        </dt>
        <dd class="font-semibold text-gray-900 dark:text-gray-100">
          {{ perMonth(everyday.committed) }} / mois
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
      </div>
    </dl>
  </section>
</template>

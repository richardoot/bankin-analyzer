<script lang="ts">
  import type { RecurrencePeriod as Period } from '@/lib/api'

  /** What the user chose: a new subscription, or a series to attach to. */
  export type MarkRecurringChoice =
    | { kind: 'new'; period: Period }
    | { kind: 'link'; merchantKey: string; amountBucket: number }
</script>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import type {
    RecurrenceDto,
    RecurrencePeriod,
    TransactionDto,
  } from '@/lib/api'
  import { formatCurrency } from '@/lib/formatters'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'

  /**
   * Follow one expense as a recurring charge, in one of two ways.
   *
   * - A new subscription, on the rhythm the user knows it has. Detection
   *   needs a charge to come back before it sees a rhythm; an annual plan
   *   paid once is the case it cannot see, so the year is offered first.
   * - Attached to a subscription already followed: a renewal paid another
   *   way, under another label, at another price — Strava by transfer one
   *   year, by card the next — which neither the label nor the price can
   *   bring together.
   */
  const props = defineProps<{
    open: boolean
    transaction: TransactionDto | null
    /** The series it can be attached to; null while they load. */
    recurrences: RecurrenceDto[] | null
    loading?: boolean | undefined
  }>()

  const emit = defineEmits<{
    cancel: []
    confirm: [choice: MarkRecurringChoice]
  }>()

  const OPTIONS: Array<{ value: RecurrencePeriod; label: string }> = [
    { value: 'YEARLY', label: 'Chaque année' },
    { value: 'MONTHLY', label: 'Chaque mois' },
    { value: 'QUARTERLY', label: 'Chaque trimestre' },
    { value: 'FOUR_WEEKLY', label: 'Toutes les 4 semaines' },
    { value: 'WEEKLY', label: 'Chaque semaine' },
  ]

  const PERIOD_LABELS: Record<RecurrencePeriod, string> = {
    WEEKLY: 'par semaine',
    FOUR_WEEKLY: 'toutes les 4 semaines',
    MONTHLY: 'par mois',
    QUARTERLY: 'par trimestre',
    YEARLY: 'par an',
  }

  type Mode = 'new' | 'link'
  const mode = ref<Mode>('new')
  const period = ref<RecurrencePeriod>('YEARLY')
  /** The chosen series, by `<amountBucket>:<merchantKey>`. */
  const target = ref<string | null>(null)

  watch(
    () => props.open,
    open => {
      if (!open) return
      mode.value = 'new'
      period.value = 'YEARLY'
      target.value = null
    }
  )

  /** Series it can join: followed ones (not candidates), by name. */
  const targets = computed(() =>
    (props.recurrences ?? [])
      .filter(r => r.status !== 'CANDIDATE')
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  )

  const keyOf = (r: RecurrenceDto): string =>
    `${r.amountBucket}:${r.merchantKey}`

  const canConfirm = computed(
    () => mode.value === 'new' || target.value !== null
  )

  function confirm(): void {
    if (mode.value === 'new') {
      emit('confirm', { kind: 'new', period: period.value })
      return
    }
    const chosen = targets.value.find(r => keyOf(r) === target.value)
    if (!chosen) return
    emit('confirm', {
      kind: 'link',
      merchantKey: chosen.merchantKey,
      amountBucket: chosen.amountBucket,
    })
  }
</script>

<template>
  <BaseModal
    :open="open"
    :closable="!loading"
    title="Suivre comme abonnement"
    max-width="md"
    @close="emit('cancel')"
  >
    <p
      v-if="transaction"
      class="mb-4 text-sm text-gray-700 dark:text-gray-300"
      data-testid="mark-recurring-summary"
    >
      {{ transaction.description }} ·
      <span class="tabular-nums">{{
        formatCurrency(Math.abs(transaction.amount))
      }}</span>
    </p>

    <div
      class="mb-4 grid grid-cols-2 rounded-lg border border-gray-200 p-0.5 dark:border-slate-700"
      role="radiogroup"
      aria-label="Façon de suivre"
    >
      <button
        v-for="option in [
          { key: 'new', label: 'Nouvel abonnement' },
          { key: 'link', label: 'Rattacher à un abonnement' },
        ]"
        :key="option.key"
        type="button"
        role="radio"
        :aria-checked="mode === option.key"
        :data-testid="`mode-${option.key}`"
        class="min-h-[44px] rounded-md px-2 text-xs font-medium transition-colors"
        :class="
          mode === option.key
            ? 'bg-primary-600 text-white'
            : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800'
        "
        @click="mode = option.key as Mode"
      >
        {{ option.label }}
      </button>
    </div>

    <fieldset v-if="mode === 'new'">
      <legend class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">
        Ce prélèvement revient…
      </legend>
      <div class="space-y-1">
        <label
          v-for="option in OPTIONS"
          :key="option.value"
          class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800"
        >
          <input
            v-model="period"
            type="radio"
            name="recurrence-period"
            :value="option.value"
            :data-testid="`period-${option.value}`"
            class="h-4 w-4 text-primary-700"
          />
          {{ option.label }}
        </label>
      </div>
      <p class="mt-3 text-xs text-gray-500 dark:text-gray-400">
        Il apparaîtra dans les récurrences en cours et comptera en engagé. Les
        prochains prélèvements s'y rattacheront.
      </p>
    </fieldset>

    <fieldset v-else data-testid="link-targets">
      <legend class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">
        C'est une échéance de…
      </legend>
      <p
        v-if="recurrences === null"
        class="text-sm text-gray-500 dark:text-gray-400"
      >
        Chargement…
      </p>
      <p
        v-else-if="targets.length === 0"
        class="text-sm text-gray-500 dark:text-gray-400"
        data-testid="link-targets-empty"
      >
        Aucun abonnement suivi pour l'instant.
      </p>
      <div v-else class="max-h-72 space-y-1 overflow-y-auto">
        <label
          v-for="recurrence in targets"
          :key="keyOf(recurrence)"
          class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:hover:bg-slate-800"
        >
          <input
            v-model="target"
            type="radio"
            name="recurrence-target"
            :value="keyOf(recurrence)"
            :data-testid="`target-${keyOf(recurrence)}`"
            class="h-4 w-4 text-primary-700"
          />
          <span class="min-w-0 flex-1">
            <span class="block truncate font-medium">{{
              recurrence.name
            }}</span>
            <span class="block text-xs text-gray-500 dark:text-gray-400">
              {{ formatCurrency(recurrence.amount) }}
              {{ PERIOD_LABELS[recurrence.period] }}
              <template v-if="recurrence.status === 'STOPPED'">
                · terminé</template
              >
            </span>
          </span>
          <!-- The series' lines, to check before attaching — beside the
               dialog, which holds a choice. A link is interactive content:
               clicking it does not tick the radio of the label around. -->
          <TransactionsLink
            :to="
              transactionsLink({
                recurrence: keyOf(recurrence),
                recurrenceLabel: recurrence.name,
              })
            "
            :subject="recurrence.name"
            icon-only
            new-tab
            :data-testid="`target-link-${keyOf(recurrence)}`"
          />
        </label>
      </div>
    </fieldset>

    <template #footer>
      <BaseButton
        variant="secondary"
        class="flex-1"
        :disabled="loading"
        @click="emit('cancel')"
      >
        Annuler
      </BaseButton>
      <BaseButton
        class="flex-1"
        :loading="loading"
        :disabled="!canConfirm"
        data-testid="mark-recurring-confirm"
        @click="confirm"
      >
        {{ mode === 'new' ? 'Suivre' : 'Rattacher' }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

<script setup lang="ts">
  import { computed, ref, watch } from 'vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import type { TransactionDto } from '@/lib/api'
  import { formatCurrency, formatDate, formatMonth } from '@/lib/formatters'

  /**
   * Smooth one expense over several months, or stop smoothing it.
   *
   * See agent-os/product/amortization-framework.md. The everyday reading
   * then counts the purchase in monthly slices from the month of its date;
   * the real reading, the list and the balances do not move. The slice is
   * shown as the user picks, on the net the budget will spread: the amount,
   * less the reimbursements requested on it, divided like its account.
   *
   * Twelve, 24 and 36 months cover the usual cases (an unexpected repair,
   * a phone, a computer); any whole number from 2 to 60 is accepted.
   *
   * Refused before asking, with the reason, rather than after a round trip:
   * a transaction carrying an exceptional tag (an episode leaves the
   * everyday reading, a smoothed purchase stays in it), and anything that is
   * not an expense. The server says the same, and its message still shows
   * here if it refuses for a reason this dialog could not see.
   */
  const props = defineProps<{
    open: boolean
    transaction: TransactionDto | null
    /** Reimbursements requested on it: the slices spread what is left. */
    reimbursedAmount?: number | undefined
    /** Its account's divisor: a joint account spreads the user's share. */
    divisor?: number | undefined
    /** Names of the exceptional tags the transaction carries. */
    exceptionalTagNames: string[]
    loading?: boolean | undefined
    /** The server's refusal, shown as it came. */
    error?: string | null | undefined
  }>()

  const emit = defineEmits<{
    cancel: []
    /** A number of months, or null to stop smoothing. */
    confirm: [months: number | null]
  }>()

  const MIN_MONTHS = 2
  const MAX_MONTHS = 60
  const PRESETS = [12, 24, 36] as const

  type Choice = (typeof PRESETS)[number] | 'custom'
  const choice = ref<Choice>(24)
  const customMonths = ref<string>('')

  /** What the slices sum to, as the budget will spread it. */
  const netAmount = computed(() => {
    const gross = Math.abs(props.transaction?.amount ?? 0)
    const net = (gross - (props.reimbursedAmount ?? 0)) / (props.divisor ?? 1)
    return Math.max(0, Math.round(net * 100) / 100)
  })

  /** Why the net differs from the line's amount, when it does. */
  const netReasons = computed(() => {
    const reasons: string[] = []
    if ((props.reimbursedAmount ?? 0) > 0)
      reasons.push('net des remboursements demandés')
    if ((props.divisor ?? 1) > 1) reasons.push('votre part du compte joint')
    return reasons
  })

  const current = computed(() => props.transaction?.amortizationMonths ?? null)

  watch(
    () => props.open,
    open => {
      if (!open) return
      const months = current.value
      if (months !== null && (PRESETS as readonly number[]).includes(months)) {
        choice.value = months as Choice
        customMonths.value = ''
      } else if (months !== null) {
        choice.value = 'custom'
        customMonths.value = String(months)
      } else {
        choice.value = 24
        customMonths.value = ''
      }
    },
    { immediate: true }
  )

  /** The months picked, or null while the free duration is not one. */
  const months = computed<number | null>(() => {
    if (choice.value !== 'custom') return choice.value
    const value = Number(customMonths.value)
    return Number.isInteger(value) && value >= MIN_MONTHS && value <= MAX_MONTHS
      ? value
      : null
  })

  const customInvalid = computed(
    () =>
      choice.value === 'custom' && customMonths.value !== '' && !months.value
  )

  /** The regular slice; the last one absorbs the rounding gap. */
  function sliceOf(count: number): number {
    return Math.round((netAmount.value / count) * 100) / 100
  }

  /** « juin 2026 → mai 2028 » for the months picked. */
  const span = computed(() => {
    const date = props.transaction?.date
    if (!date || !months.value) return null
    const start = new Date(date)
    const end = new Date(
      Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + months.value - 1,
        15
      )
    )
    return {
      from: formatMonth(start, { capitalize: false }),
      to: formatMonth(end, { capitalize: false }),
    }
  })

  const isExpense = computed(
    () =>
      props.transaction?.type === 'EXPENSE' &&
      (props.transaction?.amount ?? 0) < 0
  )

  /** Why the smoothing cannot be set, or null when it can. */
  const blocked = computed<string | null>(() => {
    if (!isExpense.value) {
      return 'Seule une dépense peut être étalée : un revenu ou un virement compte en entier à sa date.'
    }
    if (props.exceptionalTagNames.length > 0) {
      const names = props.exceptionalTagNames.map(n => `« ${n} »`).join(', ')
      return `Cette transaction porte l'étiquette exceptionnelle ${names} : un épisode exceptionnel sort de la vie courante, alors qu'un achat étalé y reste, réparti sur plusieurs mois. Retirez l'étiquette pour l'étaler.`
    }
    return null
  })

  const canConfirm = computed(
    () =>
      blocked.value === null &&
      months.value !== null &&
      months.value !== current.value &&
      netAmount.value > 0
  )

  const confirmLabel = computed(() =>
    months.value ? `Étaler sur ${months.value} mois` : 'Étaler'
  )

  function confirm(): void {
    if (!canConfirm.value || months.value === null) return
    emit('confirm', months.value)
  }
</script>

<template>
  <BaseModal
    :open="open"
    :closable="!loading"
    title="Étaler sur plusieurs mois"
    max-width="md"
    data-testid="amortization-modal"
    @close="emit('cancel')"
  >
    <p
      v-if="transaction"
      class="text-sm text-gray-700 dark:text-gray-300"
      data-testid="amortization-summary"
    >
      {{ transaction.description }} ·
      <span class="tabular-nums">{{
        formatCurrency(Math.abs(transaction.amount))
      }}</span>
      · {{ formatDate(transaction.date, 'medium') }}
    </p>
    <p class="mt-1 mb-4 text-xs text-gray-500 dark:text-gray-400">
      En vie courante, l'achat compte par tranches mensuelles à partir de son
      mois. Le mode Réel, la liste et les soldes ne changent pas.
    </p>

    <InlineAlert
      v-if="blocked"
      variant="warning"
      class="mb-4"
      data-testid="amortization-blocked"
    >
      {{ blocked }}
    </InlineAlert>

    <fieldset :disabled="blocked !== null || loading">
      <legend class="mb-2 text-sm font-medium text-gray-800 dark:text-gray-200">
        Étaler sur…
      </legend>
      <div class="space-y-1">
        <label
          v-for="preset in PRESETS"
          :key="preset"
          class="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg px-3 text-sm text-gray-700 hover:bg-gray-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 dark:text-gray-300 dark:hover:bg-slate-800"
        >
          <input
            v-model="choice"
            type="radio"
            name="amortization-months"
            :value="preset"
            :data-testid="`amortization-preset-${preset}`"
            class="h-4 w-4 text-primary-700"
          />
          <span class="flex-1">{{ preset }} mois</span>
          <span
            class="tabular-nums text-xs text-gray-500 dark:text-gray-400"
            aria-hidden="true"
          >
            {{ formatCurrency(sliceOf(preset)) }} / mois
          </span>
        </label>
        <label
          class="flex min-h-[44px] cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-3 py-1 text-sm text-gray-700 hover:bg-gray-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 dark:text-gray-300 dark:hover:bg-slate-800"
        >
          <input
            v-model="choice"
            type="radio"
            name="amortization-months"
            value="custom"
            data-testid="amortization-preset-custom"
            class="h-4 w-4 text-primary-700"
          />
          <span>Autre durée</span>
          <span class="inline-flex items-center gap-1.5">
            <input
              v-model="customMonths"
              type="number"
              inputmode="numeric"
              :min="MIN_MONTHS"
              :max="MAX_MONTHS"
              step="1"
              placeholder="18"
              aria-label="Nombre de mois, de 2 à 60"
              :aria-invalid="customInvalid || undefined"
              aria-describedby="amortization-custom-hint"
              data-testid="amortization-custom-months"
              class="h-11 w-20 rounded-md border border-gray-300 bg-white px-2 text-right text-base tabular-nums text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary-500 sm:h-9 sm:text-sm dark:border-slate-600 dark:bg-slate-900 dark:text-gray-100"
              :class="customInvalid ? 'border-red-400 dark:border-red-500' : ''"
              @focus="choice = 'custom'"
            />
            mois
          </span>
          <span
            id="amortization-custom-hint"
            class="basis-full pl-7 text-xs"
            :class="
              customInvalid
                ? 'text-red-600 dark:text-red-400'
                : 'text-gray-500 dark:text-gray-400'
            "
          >
            De 2 à 60 mois.
          </span>
        </label>
      </div>
    </fieldset>

    <!-- The slice, said as the choice changes. -->
    <p
      v-if="!blocked && months && span"
      class="mt-4 rounded-lg bg-primary-50 px-3 py-2.5 text-sm text-primary-900 dark:bg-primary-900/20 dark:text-primary-200"
      aria-live="polite"
      data-testid="amortization-slice"
    >
      <span class="font-semibold tabular-nums"
        >{{ formatCurrency(sliceOf(months)) }} par mois</span
      >
      pendant {{ months }} mois, de {{ span.from }} à {{ span.to }}.
      <span
        v-if="netReasons.length > 0"
        class="mt-0.5 block text-xs text-primary-800/80 dark:text-primary-200/80"
        data-testid="amortization-net"
      >
        Sur {{ formatCurrency(netAmount) }} : {{ netReasons.join(', ') }}.
      </span>
    </p>

    <InlineAlert v-if="error" class="mt-4" data-testid="amortization-error">
      {{ error }}
    </InlineAlert>

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
        v-if="current !== null"
        variant="secondary"
        class="flex-1"
        :disabled="loading"
        data-testid="amortization-stop"
        @click="emit('confirm', null)"
      >
        Ne plus étaler
      </BaseButton>
      <BaseButton
        v-if="!blocked"
        class="flex-1"
        :loading="loading"
        :disabled="!canConfirm"
        data-testid="amortization-confirm"
        @click="confirm"
      >
        {{ confirmLabel }}
      </BaseButton>
    </template>
  </BaseModal>
</template>

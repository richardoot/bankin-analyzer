<script setup lang="ts">
  import { computed } from 'vue'
  import {
    NATURE_FIGURE_CLASSES,
    STATE_BADGE_CLASSES,
    deltaTone,
    gapOf,
    invertTone,
    type StateTone,
  } from '@/lib/stateTints'
  import {
    formatEuros as euros,
    formatSignedEuros as signedEuros,
    plural,
  } from '@/lib/formatters'
  import {
    BADGE,
    BADGE_LINE,
    DETAIL,
    FIGURE,
    FIGURE_UNIT,
    LINK,
    TILE,
    TILES_GRID,
    TILE_TITLE,
    figureClass,
  } from '@/components/budget/bandTiles'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import { savingsIncomeBase } from '@/lib/budgetMonth'

  /**
   * « Planification » of the Budget page (agent-os/product/budget-refonte.md,
   * lot 4): the band that takes the place of « Ce mois-ci » while the
   * envelopes are being edited — the page then asks what the plan foresees
   * a month, not how the month holds. Four tiles: the reference income
   * (a field here, the one place to set it after the wizard), the draft's
   * total against the saved one, the savings it plans against the savings
   * decided, and its margin against the comparison's history.
   *
   * The figures are in the text's ink; colour carries the state alone, in
   * the dashboard's three tints. Presentational: the page owns the draft
   * and computes its total once (`draftTotal`, the edit bar's figure too).
   */
  const props = defineProps<{
    planName: string
    /** The plan's months: the project reserve is over all of them. */
    monthCount: number
    /** The draft's reference income, null when none is set. */
    referenceIncome: number | null
    /** The reference income the server holds. */
    savedReferenceIncome: number | null
    /** The draft's total, over every entry of the plan. */
    draftTotal: number
    savedTotal: number
    /** draftTotal − savedTotal. */
    delta: number
    /** The envelopes the draft changes. */
    dirtyCount: number
    /**
     * The income of each complete plan month: once there is one, the
     * planned savings are drawn from their average, not from the
     * reference income (Richard, 2026-10-24).
     */
    completeMonthsIncome: number[]
    /** The monthly savings decided at creation, null when none. */
    savingsTarget: number | null
    /** The comparison's monthly spending; null while none is chosen. */
    comparisonExpenseAvg: number | null
    /** « janv. → juin 2026 »: the comparison's months. */
    comparisonLabel: string | null
  }>()

  const emit = defineEmits<{
    'update:referenceIncome': [value: number | null]
    /** No comparison yet: the page brings « Comparer avec » to hand. */
    'choose-comparison': []
  }>()

  // ── Revenus de référence ────────────────────────────────────────────────
  const incomeChanged = computed(
    () => props.referenceIncome !== props.savedReferenceIncome
  )

  const incomeDetail = computed(() => {
    if (incomeChanged.value) {
      return props.savedReferenceIncome === null
        ? 'non renseignés jusqu’ici'
        : `${euros(props.savedReferenceIncome)} enregistrés`
    }
    return props.referenceIncome === null
      ? 'non renseignés'
      : 'saisi à la création'
  })

  function onIncomeInput(event: Event): void {
    const raw = (event.target as HTMLInputElement).value
    const value = parseFloat(raw)
    // An empty field clears the reference, as the API's null does.
    emit(
      'update:referenceIncome',
      !Number.isFinite(value) || value < 0
        ? null
        : Math.round(value * 100) / 100
    )
  }

  // ── Budget total ────────────────────────────────────────────────────────
  const totalTile = computed(() => {
    const tone = deltaTone(props.delta)
    return {
      tone,
      badge:
        tone === 'neutral'
          ? 'comme enregistré'
          : `${signedEuros(props.delta)} vs enregistré`,
      detail: `${euros(props.savedTotal)} enregistrés · ${
        props.dirtyCount === 0
          ? 'aucune enveloppe modifiée'
          : `${props.dirtyCount} ${plural(props.dirtyCount, 'enveloppe')} ${plural(props.dirtyCount, 'modifiée')}`
      }`,
    }
  })

  // ── Épargne prévue ──────────────────────────────────────────────────────
  const savingsTile = computed(() => {
    // The real income of the complete months, the reference income
    // (the draft's) before any month is complete.
    const base = savingsIncomeBase(
      props.referenceIncome,
      props.completeMonthsIncome
    )
    if (base === null) return null
    const income = base.amount
    const planned = income - props.draftTotal
    const negative = planned < 0
    const target = props.savingsTarget
    let badge: { tone: StateTone; text: string }
    if (negative) {
      badge = { tone: 'over', text: 'le plan dépasse les revenus' }
    } else if (target !== null && target > 0) {
      badge = {
        tone: invertTone(gapOf(planned, target).tone),
        text: `${signedEuros(planned - target)} vs ${euros(target)} décidés`,
      }
    } else {
      badge = { tone: 'neutral', text: 'pas d’objectif' }
    }
    // The backend's rule for `projectReserve` (budget-plans.service.ts,
    // `toDto`): (referenceIncome − savingsTarget − totalAmount) × monthCount,
    // rounded, never clamped, null without a savings target. Here on the
    // draft and on the same income as the savings, so it follows the
    // typing; the saved reserve keeps reading the reference income.
    let detail = 'Revenus − budget total'
    if (target !== null) {
      const monthly = income - target - props.draftTotal
      const reserve = Math.round(monthly * props.monthCount * 100) / 100
      detail = `réserve projets ${euros(monthly)} × ${props.monthCount} mois = ${euros(reserve)}`
    }
    const basis =
      base.source === 'actual'
        ? `sur les revenus moyens de ${base.months} mois clos (${euros(base.amount)}), pas les revenus de référence`
        : 'sur les revenus de référence saisis'
    return { value: planned, negative, badge, detail, basis }
  })

  // ── Marge vs historique ─────────────────────────────────────────────────
  const marginTile = computed(() => {
    const history = props.comparisonExpenseAvg
    if (history === null) return null
    // Positive: the plan leaves room over the past, as on a row.
    const margin = props.draftTotal - history
    // Tighter than the past is the risk (amber), roomier the cover (teal).
    const tone = invertTone(gapOf(props.draftTotal, history).tone)
    const badge =
      tone === 'over'
        ? 'plus serré que l’historique'
        : tone === 'under'
          ? 'de la marge sur l’historique'
          : 'au niveau de l’historique'
    const label = props.comparisonLabel ? ` · ${props.comparisonLabel}` : ''
    return {
      value: margin,
      tone,
      badge,
      detail: `historique ${euros(history)} par mois${label}`,
    }
  })
</script>

<template>
  <BaseCard
    as="section"
    data-testid="budget-planning-band"
    aria-labelledby="budget-planning-title"
  >
    <header class="mb-3 sm:mb-4">
      <h2
        id="budget-planning-title"
        class="text-lg font-semibold text-gray-900 dark:text-gray-100"
        data-testid="budget-planning-title"
      >
        Planification · {{ planName }}
      </h2>
      <p :class="DETAIL">
        Ce que le plan prévoit par mois, à jour de la saisie
      </p>
    </header>

    <div :class="TILES_GRID" data-testid="budget-planning-tiles">
      <!-- The income the plan was drawn against: a field, the one place
           to set it after the wizard. -->
      <article :class="TILE" data-testid="budget-tile-reference-income">
        <label :class="TILE_TITLE" for="budget-reference-income">
          Revenus de référence
        </label>
        <div class="relative">
          <input
            id="budget-reference-income"
            type="number"
            min="0"
            step="1"
            inputmode="decimal"
            :value="referenceIncome ?? ''"
            placeholder="—"
            aria-describedby="budget-reference-income-detail"
            data-testid="budget-reference-income-input"
            class="w-full min-h-[40px] rounded-md border py-1 pl-2 pr-14 text-[22px] leading-tight font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-primary-500 sm:text-2xl"
            :class="[
              NATURE_FIGURE_CLASSES.income,
              incomeChanged
                ? 'border-primary-500 bg-primary-50 dark:border-primary-500 dark:bg-primary-900/20'
                : 'border-gray-300 bg-white dark:border-slate-600 dark:bg-slate-900',
            ]"
            @input="onIncomeInput"
          />
          <span
            class="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400"
            aria-hidden="true"
            >€ / mois</span
          >
        </div>
        <p
          id="budget-reference-income-detail"
          :class="DETAIL"
          data-testid="budget-detail-reference-income"
        >
          {{ incomeDetail }}
        </p>
      </article>

      <!-- The draft's total, at each keystroke, against the saved one. -->
      <article :class="TILE" data-testid="budget-tile-total">
        <h3 :class="TILE_TITLE">Budget total</h3>
        <p
          :class="figureClass('expense')"
          data-testid="budget-planning-value-total"
        >
          {{ euros(draftTotal) }}<span :class="FIGURE_UNIT"> par mois</span>
        </p>
        <p :class="BADGE_LINE">
          <span
            :class="[BADGE, STATE_BADGE_CLASSES[totalTile.tone]]"
            :data-tone="totalTile.tone"
            data-testid="budget-badge-total"
            >{{ totalTile.badge }}</span
          >
        </p>
        <p :class="DETAIL" data-testid="budget-detail-total">
          {{ totalTile.detail }}
        </p>
      </article>

      <!-- The savings the draft plans: the complete months' income (the
           reference income before any) − total. -->
      <article :class="TILE" data-testid="budget-tile-savings-planned">
        <h3 :class="TILE_TITLE">Épargne prévue</h3>
        <template v-if="savingsTile">
          <p
            :class="figureClass('savings', savingsTile.negative)"
            data-testid="budget-planning-value-savings"
          >
            {{ euros(savingsTile.value)
            }}<span :class="FIGURE_UNIT"> par mois</span>
          </p>
          <p :class="BADGE_LINE">
            <span
              :class="[BADGE, STATE_BADGE_CLASSES[savingsTile.badge.tone]]"
              :data-tone="savingsTile.badge.tone"
              data-testid="budget-badge-savings-planned"
              >{{ savingsTile.badge.text }}</span
            >
          </p>
          <p :class="DETAIL" data-testid="budget-savings-planned-basis">
            {{ savingsTile.basis }}
          </p>
          <p :class="DETAIL" data-testid="budget-detail-savings-planned">
            {{ savingsTile.detail }}
          </p>
        </template>
        <template v-else>
          <p :class="FIGURE" data-testid="budget-planning-value-savings">—</p>
          <p :class="DETAIL" data-testid="budget-savings-planned-no-income">
            Revenus de référence à renseigner
          </p>
        </template>
      </article>

      <!-- The draft against the comparison's history. -->
      <article :class="TILE" data-testid="budget-tile-margin">
        <h3 :class="TILE_TITLE">Marge vs historique</h3>
        <template v-if="marginTile">
          <p :class="FIGURE" data-testid="budget-planning-value-margin">
            {{ signedEuros(marginTile.value)
            }}<span :class="FIGURE_UNIT"> par mois</span>
          </p>
          <p :class="BADGE_LINE">
            <span
              :class="[BADGE, STATE_BADGE_CLASSES[marginTile.tone]]"
              :data-tone="marginTile.tone"
              data-testid="budget-badge-margin"
              >{{ marginTile.badge }}</span
            >
          </p>
          <p :class="DETAIL" data-testid="budget-detail-margin">
            {{ marginTile.detail }}
          </p>
        </template>
        <template v-else>
          <p :class="FIGURE" data-testid="budget-planning-value-margin">—</p>
          <p :class="DETAIL">Aucune comparaison choisie</p>
          <button
            type="button"
            :class="LINK"
            data-testid="budget-choose-comparison"
            @click="emit('choose-comparison')"
          >
            Choisir une comparaison →
          </button>
        </template>
      </article>
    </div>
  </BaseCard>
</template>

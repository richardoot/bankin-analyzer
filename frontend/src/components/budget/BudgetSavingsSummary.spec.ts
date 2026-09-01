import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import BudgetSavingsSummary from './BudgetSavingsSummary.vue'

const baseProps = {
  planLabel: 'Mai 2026',
  planIncomeAvg: 0,
  planBudgetTotal: 1670,
  planActualExpenseAvg: 0,
  planActualIncomeAvg: 0,
  completePlanMonthsCount: 0,
  isPlanFinished: false,
  actualPeriodLabel: null,
  comparison: null,
}

describe('BudgetSavingsSummary', () => {
  describe('Planification block', () => {
    it('uses HISTORICAL income (not plan income) to compute "Épargne prévue"', () => {
      // Future plan: no income observed in plan months yet (planIncomeAvg = 0).
      // Historical (comparison) period had 2500 € of monthly income.
      // Expected "Épargne prévue" = 2500 − 1670 = +830 €.
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          planIncomeAvg: 0, // future plan, no income data yet
          planBudgetTotal: 1670,
          comparison: {
            label: 'Févr–Avr 2026',
            incomeAvg: 2500,
            expenseAvg: 1850,
          },
        },
      })

      const planning = wrapper.find('[data-testid="summary-planning"]')
      expect(planning.exists()).toBe(true)

      const text = planning.text()
      // The "Budget alloué" block must show +830 € for "Épargne prévue"
      expect(text).toContain('830,00') // FR format may add €/space
      // And NOT the buggy −1 670 € (which would happen with plan income = 0)
      expect(text).not.toMatch(/-\s*1\s*670/)
    })

    it('computes the planning delta as compExpense − budget (savings improvement)', () => {
      // Historical: 2500 income − 1850 expense = 650 savings/mo
      // Plan projected: 2500 income − 1670 budget = 830 savings/mo
      // Delta: 830 − 650 = +180 €/mo (== compExpense − budget = 1850 − 1670)
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          comparison: {
            label: 'Févr–Avr 2026',
            incomeAvg: 2500,
            expenseAvg: 1850,
          },
        },
      })

      const text = wrapper.find('[data-testid="summary-planning"]').text()
      expect(text).toContain('180,00')
      expect(text).toContain('Plan plus économe que le passé')
    })

    it('shows historical savings (income − expense) under "Historique"', () => {
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          comparison: {
            label: 'Févr–Avr 2026',
            incomeAvg: 2500,
            expenseAvg: 1850,
          },
        },
      })
      // Épargne moyenne historique = 2500 − 1850 = 650
      const text = wrapper.find('[data-testid="summary-planning"]').text()
      expect(text).toContain('650,00')
    })
  })

  describe('Suivi block', () => {
    it('uses ACTUAL income on complete months for "Épargne prévue" and the delta', () => {
      // Plan in progress: 1 complete month with 2400 € actual income,
      // 1900 € actual expense. Budget is 1670 €.
      // Épargne prévue = 2400 − 1670 = 730
      // Épargne réelle = 2400 − 1900 = 500
      // Écart d'épargne = 500 − 730 = −230 (== budget − actual = 1670 − 1900)
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          planIncomeAvg: 2400,
          planBudgetTotal: 1670,
          planActualExpenseAvg: 1900,
          planActualIncomeAvg: 2400,
          completePlanMonthsCount: 1,
        },
      })

      const followup = wrapper.find('[data-testid="summary-followup"]')
      expect(followup.exists()).toBe(true)
      const text = followup.text()
      // Épargne prévue: 730
      expect(text).toContain('730,00')
      // Épargne réelle: 500
      expect(text).toContain('500,00')
      // Écart: −230
      expect(text).toMatch(/-\s*230/)
      expect(text).toContain('Dépassement par rapport au plan')
    })

    it('renames the block "Bilan du plan" when the plan is finished', () => {
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          planIncomeAvg: 2500,
          planActualIncomeAvg: 2500,
          planActualExpenseAvg: 1600,
          completePlanMonthsCount: 3,
          isPlanFinished: true,
        },
      })
      expect(wrapper.text()).toContain('Bilan du plan')
      expect(wrapper.text()).toContain('Plan terminé · 3 mois')
    })
  })

  describe('isolated month', () => {
    it('names the month instead of counting elapsed ones', () => {
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          planIncomeAvg: 2500,
          planActualIncomeAvg: 2500,
          planActualExpenseAvg: 1600,
          completePlanMonthsCount: 3,
          actualPeriodLabel: 'Juin 2026',
        },
      })
      expect(wrapper.text()).toContain('Juin 2026')
      expect(wrapper.text()).not.toContain('3 mois écoulés')
    })

    it('shows the block on a plan whose first month is still running', () => {
      // No month has completed, so the average has nothing to say — but the
      // month being lived does, and it is the one the user is asking about.
      const wrapper = mount(BudgetSavingsSummary, {
        props: {
          ...baseProps,
          planActualIncomeAvg: 2500,
          planActualExpenseAvg: 900,
          completePlanMonthsCount: 0,
          actualPeriodLabel: 'Août 2026 · en cours, 20/31 j',
        },
      })
      expect(wrapper.find('[data-testid="summary-followup"]').exists()).toBe(
        true
      )
      expect(wrapper.text()).toContain('20/31')
    })
  })

  describe('fallback', () => {
    it('renders only the minimal block when neither comparison nor complete months are set', () => {
      const wrapper = mount(BudgetSavingsSummary, {
        props: { ...baseProps, planIncomeAvg: 2500, planBudgetTotal: 1670 },
      })
      expect(wrapper.find('[data-testid="summary-plan-only"]').exists()).toBe(
        true
      )
      // minimalProjectedSavings = 2500 − 1670 = 830
      expect(wrapper.text()).toContain('830,00')
    })
  })
})

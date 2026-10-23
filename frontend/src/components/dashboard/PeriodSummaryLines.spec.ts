import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import PeriodSummaryLines from './PeriodSummaryLines.vue'
import type {
  CategoryDataDto,
  ExceptionalEventDto,
  TagFamilyOfYearDto,
} from '@/lib/api'

enableAutoUnmount(afterEach)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }],
})

const source = (name: string, amount: number): CategoryDataDto => ({
  categoryId: `cat-${name}`,
  category: name,
  amount,
})

const event = (id: string, amount: number): ExceptionalEventDto => ({
  id,
  name: id,
  color: null,
  icon: null,
  amount,
})

const family = (name: string, spent: number): TagFamilyOfYearDto => ({
  id: `fam-${name}`,
  name,
  color: null,
  icon: null,
  year: 2026,
  spent,
  spentByYear: [{ year: 2026, spent }],
  annualBudget: null,
  remaining: null,
  transactionCount: 2,
  tagCount: 1,
})

function mountLines(
  overrides: Partial<InstanceType<typeof PeriodSummaryLines>['$props']> = {}
) {
  return mount(PeriodSummaryLines, {
    props: {
      averageIncome: 2500,
      averageSavings: 400,
      periodMonths: 11,
      incomeSources: [
        source("Revenus d'activité", 27_225),
        source('Remboursements', 275),
      ],
      incomeLink: '/transactions?type=INCOME',
      events: [event('Rome', 527), event('Hyrox', 526)],
      families: [family('Voyages', 527), family('Hyrox', 526)],
      hasExceptionalExpenses: true,
      ...overrides,
    },
    global: { plugins: [router] },
  })
}

/** Normalises the narrow no-break spaces the formatters write. */
const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ').trim()

describe('PeriodSummaryLines', () => {
  it('reads the income per closed month, its sources, and what the period kept', () => {
    const wrapper = mountLines()
    const line = norm(wrapper.get('[data-testid="summary-line-income"]').text())

    expect(line).toContain('Revenus · 2 500 € par mois sur 11 mois clos')
    expect(line).toContain("Revenus d'activité 99 %, Remboursements 1 %")
    // Income less every expense, its share of the income: never a rate on
    // the transfers.
    expect(line).toContain('épargne 400 € par mois, 16 % des revenus')
    expect(wrapper.find('[data-testid="income-sources-bar"]').exists()).toBe(
      false
    )
    expect(
      wrapper.get('[data-testid="income-transactions-link"]').attributes('href')
    ).toBe('/transactions?type=INCOME')
  })

  it('says a deficit as one, and the current month alone as such', () => {
    const wrapper = mountLines({
      averageSavings: -300,
      closedMonths: false,
      periodMonths: 1,
    })
    const line = norm(wrapper.get('[data-testid="summary-line-income"]').text())
    expect(line).toContain('par mois sur le mois en cours')
    expect(line).toContain('déficit 300 € par mois, 12 % des revenus')
  })

  it('draws the sources as a bar of two tones once a second one passes 5 %', () => {
    const wrapper = mountLines({
      incomeSources: [
        source('Salaires', 2000),
        source('Loyers perçus', 300),
        source('Remboursements', 100),
        source('Intérêts', 50),
        source('Cadeaux', 50),
      ],
    })

    const bar = wrapper.get('[data-testid="income-sources-bar"]')
    const [first, rest] = bar.findAll('div')
    expect(first?.classes()).toContain('bg-blue-400')
    expect(first?.attributes('style')).toContain('width: 80%')
    expect(rest?.classes()).toContain('bg-blue-200')
    expect(norm(bar.attributes('aria-label') ?? '')).toBe(
      'Salaires 80 %, Loyers perçus 12 %, Remboursements 4 %, autres 4 %'
    )
    // The names once, under the bar.
    expect(wrapper.findAll('[data-testid="income-sources"]')).toHaveLength(1)
  })

  it('counts the events of the period, names the first three, and folds them for now', () => {
    const wrapper = mountLines({
      events: [
        event('Rome', 527),
        event('Hyrox', 526),
        event('Concert', 120),
        event('Mariage', 80),
      ],
    })
    const line = wrapper.get('[data-testid="summary-line-events"]')

    expect(norm(line.text())).toContain(
      '4 événements sur la période · 1 253 € · Rome, Hyrox, Concert et 1 autre'
    )
    expect(
      line.get('[data-testid="summary-event-Rome"]').attributes('href')
    ).toBe('/tags/Rome')
    const toggle = line.get('[data-testid="events-toggle"]')
    expect(toggle.text()).toBe('Déplier')
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('disabled')).toBeDefined()
  })

  it('leaves the events line out when the period carries none', () => {
    const wrapper = mountLines({ events: [] })
    expect(wrapper.find('[data-testid="summary-line-events"]').exists()).toBe(
      false
    )
  })

  it('reads the episodes of the year, with the way to the families', () => {
    const wrapper = mountLines()
    const line = wrapper.get('[data-testid="summary-line-episodes"]')

    expect(norm(line.text())).toContain(
      'Épisodes 2026 · 1 053 € · Voyages 527 €, Hyrox 526 €'
    )
    expect(line.get('[data-testid="episodes-link"]').attributes('href')).toBe(
      '/tags'
    )
  })

  it('leaves the episodes out without a family, or without an event in the period', () => {
    expect(
      mountLines({ families: [] })
        .find('[data-testid="summary-line-episodes"]')
        .exists()
    ).toBe(false)
    expect(
      mountLines({ hasExceptionalExpenses: false })
        .find('[data-testid="summary-line-episodes"]')
        .exists()
    ).toBe(false)
  })
})

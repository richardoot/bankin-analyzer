import { describe, it, expect } from 'vitest'
import type {
  SpendingStructureDto,
  TagFamilyOfYearDto,
  TrendInsightDto,
} from '@/lib/api'
import { formatCompactCurrency } from '@/lib/formatters'
import { trendMonthLink } from '@/lib/trends'
import {
  shortChargeSentence,
  todoItems,
  type TodoSummary,
  type TodoTrends,
} from './todo'

const eur = (value: number) => formatCompactCurrency(value)

function insight(overrides: Partial<TrendInsightDto>): TrendInsightDto {
  return {
    kind: 'amount',
    unit: {
      type: 'category',
      id: 'cat-food',
      categoryId: 'cat-food',
      name: 'Alimentation',
      icon: null,
    },
    direction: 'up',
    tone: 'neutral',
    current: 0,
    reference: 0,
    delta: 0,
    deltaPct: null,
    sentence: '',
    windows: {
      current: { start: '2026-09-01', end: '2026-09-30' },
      reference: { start: '2026-03-01', end: '2026-08-31' },
    },
    series: [],
    score: 0,
    ...overrides,
  }
}

const toFile = (count: number) =>
  insight({
    kind: 'uncategorized',
    unit: {
      type: 'uncategorized',
      id: 'uncategorized',
      categoryId: null,
      name: 'À classer',
      icon: null,
    },
    current: count,
    sentence: `${count} dépenses de septembre sont à classer.`,
  })

const recurrenceUnit = (name: string) => ({
  type: 'recurrence' as const,
  id: `15:${name.toLowerCase()}`,
  categoryId: 'cat-subs',
  name,
  icon: null,
})

const newSub = insight({
  kind: 'subscription',
  direction: 'up',
  unit: recurrenceUnit('Netflix'),
  sentence: 'Nouvel abonnement : Netflix, 13,49 € par mois depuis septembre.',
})

const stoppedSub = insight({
  kind: 'subscription',
  direction: 'down',
  unit: recurrenceUnit('Spotify'),
  sentence:
    'Abonnement arrêté : Spotify, 11,12 € par mois, dernier prélèvement en août.',
})

const priceUp = insight({
  kind: 'price',
  direction: 'up',
  unit: recurrenceUnit('Free'),
  sentence: 'Free : 29,99 € par mois depuis septembre 2026, contre 24,99 €.',
})

function structure(
  overrides: Partial<SpendingStructureDto> = {}
): SpendingStructureDto {
  return {
    essential: 1000,
    pleasure: 500,
    unknownNature: 0,
    committed: 800,
    variable: 700,
    unknownRhythm: 0,
    recurring: 300,
    total: 1500,
    ...overrides,
  }
}

function family(
  id: string,
  name: string,
  remaining: number | null
): TagFamilyOfYearDto {
  return {
    id,
    name,
    color: null,
    icon: null,
    year: 2026,
    spent: 1000,
    spentByYear: [{ year: 2026, spent: 1000 }],
    annualBudget: remaining === null ? null : 1000 + remaining,
    remaining,
    transactionCount: 3,
    tagCount: 1,
  }
}

const trends = (insights: TrendInsightDto[]): TodoTrends => ({
  insights,
  reading: 'everyday',
})

describe('todoItems', () => {
  it('is empty with nothing loaded', () => {
    expect(todoItems(null, null)).toEqual([])
    expect(todoItems(undefined, undefined)).toEqual([])
    expect(todoItems({}, trends([]))).toEqual([])
  })

  it('is empty when nothing is to do', () => {
    const summary: TodoSummary = {
      spendingStructure: structure(),
      pendingReceivables: 0,
      tagFamiliesOfYear: [
        family('f1', 'Voyages', 200),
        family('f2', 'Concerts', null),
      ],
    }
    const habit = insight({ kind: 'amount', sentence: 'Alimentation : plus.' })
    expect(todoItems(summary, trends([habit]))).toEqual([])
  })

  describe('the lines to file', () => {
    it('links the trend the way « Ce qui change » does', () => {
      const line = toFile(12)
      const [first] = todoItems(null, trends([line]))
      expect(first).toEqual({
        key: 'to-file',
        text: '12 lignes à classer',
        to: trendMonthLink(line, 'everyday'),
        testId: 'todo-item-to-file',
      })
    })

    it('follows the trends reading in its link', () => {
      const line = toFile(3)
      const [first] = todoItems(null, { insights: [line], reading: 'real' })
      expect(first?.to).toEqual(trendMonthLink(line, 'real'))
    })

    it('says one line in the singular', () => {
      expect(todoItems(null, trends([toFile(1)]))[0]?.text).toBe(
        '1 ligne à classer'
      )
    })

    it('says nothing for zero lines', () => {
      expect(todoItems(null, trends([toFile(0)]))).toEqual([])
    })
  })

  describe('the categories to migrate', () => {
    it('reads the larger of the two axes', () => {
      const [first] = todoItems(
        {
          spendingStructure: structure({
            unknownNature: 120,
            unknownRhythm: 340.4,
          }),
        },
        null
      )
      expect(first).toEqual({
        key: 'migration',
        text: `${eur(340.4)} dans des catégories à migrer`,
        amount: 340.4,
        to: '/settings/categories/migration',
        testId: 'todo-item-migration',
      })
    })

    it('speaks for either axis alone', () => {
      expect(
        todoItems(
          { spendingStructure: structure({ unknownNature: 50 }) },
          null
        ).map(i => i.key)
      ).toEqual(['migration'])
      expect(
        todoItems(
          { spendingStructure: structure({ unknownRhythm: 50 }) },
          null
        ).map(i => i.key)
      ).toEqual(['migration'])
    })
  })

  it('says the money advanced and links the reimbursements', () => {
    const [first] = todoItems({ pendingReceivables: 8516 }, null)
    expect(first).toEqual({
      key: 'receivables',
      text: `${eur(8516)} avancés, en attente de remboursement`,
      amount: 8516,
      to: '/reimbursements',
      testId: 'todo-item-receivables',
    })
    expect(todoItems({ pendingReceivables: null }, null)).toEqual([])
  })

  it('names each envelope over, in the summary order, and only those', () => {
    const items = todoItems(
      {
        tagFamiliesOfYear: [
          family('f-travel', 'Voyages', -250.5),
          family('f-hyrox', 'Hyrox', 900),
          family('f-none', 'Concerts', null),
          family('f-gifts', 'Cadeaux', -40),
        ],
      },
      null
    )
    expect(items).toEqual([
      {
        key: 'envelope-f-travel',
        text: `Voyages : enveloppe dépassée de ${eur(250.5)}`,
        amount: 250.5,
        to: '/tags/families/f-travel',
        testId: 'todo-item-envelope-f-travel',
      },
      {
        key: 'envelope-f-gifts',
        text: `Cadeaux : enveloppe dépassée de ${eur(40)}`,
        amount: 40,
        to: '/tags/families/f-gifts',
        testId: 'todo-item-envelope-f-gifts',
      },
    ])
  })

  it('lists the charges that came, went or changed price, shortened', () => {
    const items = todoItems(null, trends([newSub, stoppedSub, priceUp]))
    expect(items.map(i => i.text)).toEqual([
      'Nouvel abonnement : Netflix, 13,49 € par mois',
      'Abonnement arrêté : Spotify, 11,12 € par mois',
      'Free : 29,99 € par mois, contre 24,99 €',
    ])
    expect(items.every(i => i.to === '/recurrences')).toBe(true)
    expect(items.map(i => i.key)).toEqual([
      'subscription-up-15:netflix',
      'subscription-down-15:spotify',
      'price-up-15:free',
    ])
    expect(items[0]?.amount).toBeUndefined()
  })

  it('leaves the other trends out', () => {
    const others = (
      ['amount', 'frequency', 'newHabit', 'share', 'savings'] as const
    ).map(kind => insight({ kind, sentence: 'Une tendance.' }))
    expect(todoItems(null, trends(others))).toEqual([])
  })

  it('orders the sources as the plan does, whatever the trends order', () => {
    const items = todoItems(
      {
        spendingStructure: structure({ unknownNature: 10 }),
        pendingReceivables: 100,
        tagFamiliesOfYear: [family('f1', 'Voyages', -5)],
      },
      trends([priceUp, newSub, toFile(4)])
    )
    expect(items.map(i => i.key)).toEqual([
      'to-file',
      'migration',
      'receivables',
      'envelope-f1',
      'price-up-15:free',
      'subscription-up-15:netflix',
    ])
  })

  it('renders the summary alone while the trends are missing, and the reverse', () => {
    expect(
      todoItems({ pendingReceivables: 100 }, undefined).map(i => i.key)
    ).toEqual(['receivables'])
    expect(todoItems(undefined, trends([toFile(2)])).map(i => i.key)).toEqual([
      'to-file',
    ])
  })
})

describe('shortChargeSentence', () => {
  it('falls back on the name for an empty sentence', () => {
    expect(shortChargeSentence({ ...newSub, sentence: '' })).toBe('Netflix')
  })

  it('keeps a sentence it does not know, without its full stop', () => {
    expect(
      shortChargeSentence({ ...newSub, sentence: 'Netflix : un autre texte.' })
    ).toBe('Netflix : un autre texte')
  })
})

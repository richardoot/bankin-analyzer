import { describe, it, expect } from 'vitest'
import { formatCompactCurrency } from '@/lib/formatters'
import type { BudgetEnvelopeOver } from '@/lib/budgetMonth'
import {
  BUDGET_EDIT_ROUTE,
  BUDGET_NEW_ROUTE,
  budgetTodoItems,
  categoriesWithoutEnvelope,
  type BudgetTodoInput,
} from './budgetTodo'

const eur = (value: number) => formatCompactCurrency(value)

const over = (
  categoryId: string,
  categoryName: string,
  overBy: number
): BudgetEnvelopeOver => ({
  categoryId,
  categoryName,
  spent: 100 + overBy,
  envelope: 100,
  overBy,
})

function input(overrides: Partial<BudgetTodoInput> = {}): BudgetTodoInput {
  return {
    plan: { endDate: '2026-12-31', projectReserve: 900 },
    status: 'current',
    reading: { envelopesOver: [] },
    projects: { totalBudget: 0 },
    categoriesWithoutEnvelope: [],
    hasCurrentPlan: true,
    hasNextPlan: false,
    currentMonth: '2026-10',
    ...overrides,
  }
}

describe('budgetTodoItems', () => {
  it('is empty when nothing is to do', () => {
    expect(budgetTodoItems(input())).toEqual([])
  })

  it('says each envelope over, anchored to its row', () => {
    const items = budgetTodoItems(
      input({
        reading: {
          envelopesOver: [
            over('cat-rest', 'Restaurants et bars', 12),
            over('cat-food', 'Alimentation', 4),
          ],
        },
      })
    )
    expect(items.map(i => [i.key, i.text, i.to, i.testId])).toEqual([
      [
        'envelope-cat-rest',
        `Restaurants et bars : enveloppe dépassée de ${eur(12)}`,
        { hash: '#budget-row-cat-rest' },
        'todo-item-envelope-cat-rest',
      ],
      [
        'envelope-cat-food',
        `Alimentation : enveloppe dépassée de ${eur(4)}`,
        { hash: '#budget-row-cat-food' },
        'todo-item-envelope-cat-food',
      ],
    ])
  })

  it('says the project reserve committed past what it holds', () => {
    const items = budgetTodoItems(
      input({
        plan: { endDate: '2026-12-31', projectReserve: 690 },
        projects: { totalBudget: 1053 },
      })
    )
    expect(items.map(i => [i.key, i.text, i.to, i.amount])).toEqual([
      [
        'project-reserve',
        `Réserve projets : ${eur(1053)} engagés sur ${eur(690)}`,
        { hash: '#budget-projects' },
        363,
      ],
    ])
  })

  it('stays quiet on a reserve that holds, a missing one, or no projects', () => {
    const quiet = [
      input({ projects: { totalBudget: 900 } }),
      input({ plan: { endDate: '2026-12-31', projectReserve: null } }),
      input({ projects: null }),
    ]
    expect(quiet.map(i => budgetTodoItems(i))).toEqual([[], [], []])
  })

  it('sends the categories without an envelope to edit mode', () => {
    const items = budgetTodoItems(
      input({
        categoriesWithoutEnvelope: [
          {
            categoryId: 'cat-tax',
            categoryName: 'Impôts et taxes',
            monthlyAverage: 59,
          },
        ],
      })
    )
    expect(items.map(i => [i.key, i.text, i.to])).toEqual([
      [
        'no-envelope-cat-tax',
        `Impôts et taxes sans enveloppe · ${eur(59)} par mois`,
        BUDGET_EDIT_ROUTE,
      ],
    ])
    expect(BUDGET_EDIT_ROUTE).toEqual({ path: '/budget', query: { edit: '1' } })
  })

  it('asks for the next plan in the last month of a running one', () => {
    const items = budgetTodoItems(input({ currentMonth: '2026-12' }))
    expect(items.map(i => [i.key, i.text, i.to])).toEqual([
      [
        'plan-ending',
        'Le plan se termine le 31 décembre : préparer le suivant',
        BUDGET_NEW_ROUTE,
      ],
    ])
    expect(BUDGET_NEW_ROUTE).toEqual({ path: '/budget', query: { new: '1' } })
  })

  it('does not ask for the next plan once it exists', () => {
    expect(
      budgetTodoItems(input({ currentMonth: '2026-12', hasNextPlan: true }))
    ).toEqual([])
    expect(
      budgetTodoItems(
        input({
          status: 'past',
          currentMonth: '2027-02',
          hasCurrentPlan: false,
          hasNextPlan: true,
        })
      )
    ).toEqual([])
  })

  it('does not ask for the next plan before the last month', () => {
    expect(budgetTodoItems(input({ currentMonth: '2026-11' }))).toEqual([])
  })

  it('asks to create a plan when the one shown is over and none runs', () => {
    const past = { status: 'past' as const, currentMonth: '2027-02' }
    expect(
      budgetTodoItems(input({ ...past, hasCurrentPlan: false })).map(i => [
        i.key,
        i.text,
        i.to,
      ])
    ).toEqual([
      [
        'no-current-plan',
        'Aucun plan en cours : créer le suivant',
        BUDGET_NEW_ROUTE,
      ],
    ])
    expect(budgetTodoItems(input({ ...past, hasCurrentPlan: true }))).toEqual(
      []
    )
  })

  it('says a plan that does not fit in the reference income', () => {
    const items = budgetTodoItems(
      input({
        plan: { endDate: '2026-12-31', projectReserve: -870 },
        projects: { totalBudget: 300 },
      })
    )
    expect(items.map(i => [i.key, i.text, i.to, i.amount])).toEqual([
      [
        'plan-unfunded',
        `Le plan ne tient pas dans les revenus de référence (−${eur(870)})`,
        BUDGET_EDIT_ROUTE,
        870,
      ],
    ])
  })

  it('keeps the plan’s order across the five sources', () => {
    const items = budgetTodoItems(
      input({
        plan: { endDate: '2026-10-31', projectReserve: 0 },
        reading: {
          envelopesOver: [over('cat-rest', 'Restaurants et bars', 12)],
        },
        projects: { totalBudget: 200 },
        categoriesWithoutEnvelope: [
          {
            categoryId: 'cat-tax',
            categoryName: 'Impôts et taxes',
            monthlyAverage: 59,
          },
        ],
      })
    )
    expect(items.map(i => i.key)).toEqual([
      'envelope-cat-rest',
      'project-reserve',
      'no-envelope-cat-tax',
      'plan-ending',
    ])

    const unfunded = budgetTodoItems(
      input({
        status: 'past',
        hasCurrentPlan: false,
        plan: { endDate: '2026-06-30', projectReserve: -100 },
        reading: {
          envelopesOver: [over('cat-rest', 'Restaurants et bars', 12)],
        },
      })
    )
    // A finished plan reads as a review: the next plan first, then the
    // envelopes over on average in one line — its unfunded plan is closed.
    expect(unfunded.map(i => i.key)).toEqual([
      'no-current-plan',
      'envelopes-over-average',
    ])
  })

  describe('a finished plan', () => {
    const past = {
      status: 'past' as const,
      currentMonth: '2026-10',
      plan: { endDate: '2026-06-30', projectReserve: 900 },
    }

    it('says the envelopes over on average in one line, to the list', () => {
      const items = budgetTodoItems(
        input({
          ...past,
          reading: {
            envelopesOver: [
              over('cat-food', 'Alimentation', 53),
              over('cat-fun', 'Loisirs', 50),
              over('cat-shop', 'Shopping', 45),
            ],
          },
        })
      )
      expect(items.map(i => [i.key, i.text, i.to, i.amount, i.testId])).toEqual(
        [
          [
            'envelopes-over-average',
            'Trois enveloppes dépassées en moyenne : Alimentation, Loisirs, Shopping',
            { hash: '#budget-envelopes-title' },
            148,
            'todo-item-envelopes-over-average',
          ],
        ]
      )
    })

    it('names three envelopes, then counts the others', () => {
      const items = budgetTodoItems(
        input({
          ...past,
          reading: {
            envelopesOver: [
              over('a', 'A', 5),
              over('b', 'B', 4),
              over('c', 'C', 3),
              over('d', 'D', 2),
              over('e', 'E', 1),
            ],
          },
        })
      )
      expect(items.map(i => i.text)).toEqual([
        'Cinq enveloppes dépassées en moyenne : A, B, C et 2 autres',
      ])
    })

    it('says a single envelope in the singular', () => {
      const items = budgetTodoItems(
        input({
          ...past,
          reading: { envelopesOver: [over('cat-food', 'Alimentation', 53)] },
        })
      )
      expect(items.map(i => i.text)).toEqual([
        'Une enveloppe dépassée en moyenne : Alimentation',
      ])
    })

    it('asks for the next plan first when none runs', () => {
      const items = budgetTodoItems(
        input({
          ...past,
          hasCurrentPlan: false,
          reading: { envelopesOver: [over('cat-food', 'Alimentation', 53)] },
        })
      )
      expect(items.map(i => [i.key, i.to])).toEqual([
        ['no-current-plan', BUDGET_NEW_ROUTE],
        ['envelopes-over-average', { hash: '#budget-envelopes-title' }],
      ])
    })

    it('sends nowhere into editing a closed period', () => {
      // An overdrawn reserve, a category without envelope, an unfunded plan:
      // none of it is to do once the plan is over.
      const overdrawn = budgetTodoItems(
        input({
          ...past,
          plan: { endDate: '2026-06-30', projectReserve: 100 },
          projects: { totalBudget: 400 },
          categoriesWithoutEnvelope: [
            {
              categoryId: 'cat-tax',
              categoryName: 'Impôts et taxes',
              monthlyAverage: 59,
            },
          ],
        })
      )
      expect(overdrawn).toEqual([])
      const unfunded = budgetTodoItems(
        input({
          ...past,
          plan: { endDate: '2026-06-30', projectReserve: -870 },
        })
      )
      expect(unfunded).toEqual([])
    })

    it('says nothing of the envelopes when all held', () => {
      expect(budgetTodoItems(input({ ...past }))).toEqual([])
    })
  })

  it('reads no envelope over before the plan starts', () => {
    expect(budgetTodoItems(input({ status: 'future', reading: null }))).toEqual(
      []
    )
  })
})

describe('categoriesWithoutEnvelope', () => {
  const plan = {
    entries: [
      {
        id: 'e1',
        categoryId: 'cat-food',
        categoryName: 'Alimentation',
        amount: 300,
      },
      { id: 'e2', categoryId: 'cat-gift', categoryName: 'Cadeaux', amount: 0 },
    ],
  }

  it('keeps the categories that spend with no envelope, biggest first', () => {
    const result = categoriesWithoutEnvelope({
      plan,
      completeMonthsCount: 2,
      categories: [
        {
          categoryId: 'cat-food',
          categoryName: 'Alimentation',
          amounts: [320, 280, 40],
        },
        {
          categoryId: 'cat-tax',
          categoryName: 'Impôts',
          amounts: [0, 118, 500],
        },
        {
          categoryId: 'cat-gift',
          categoryName: 'Cadeaux',
          amounts: [100, 100, 0],
        },
        { categoryId: 'cat-none', categoryName: 'Rien', amounts: [0, 0, 30] },
      ],
    })
    // The running month (the third) is left out: the complete ones decide.
    expect(result).toEqual([
      { categoryId: 'cat-gift', categoryName: 'Cadeaux', monthlyAverage: 100 },
      { categoryId: 'cat-tax', categoryName: 'Impôts', monthlyAverage: 59 },
    ])
  })

  it('reads the started months while none is complete', () => {
    const result = categoriesWithoutEnvelope({
      plan,
      completeMonthsCount: 0,
      categories: [
        { categoryId: 'cat-tax', categoryName: 'Impôts', amounts: [42] },
      ],
    })
    expect(result).toEqual([
      { categoryId: 'cat-tax', categoryName: 'Impôts', monthlyAverage: 42 },
    ])
  })

  it('is empty before the plan starts', () => {
    expect(
      categoriesWithoutEnvelope({
        plan,
        completeMonthsCount: 0,
        categories: [
          { categoryId: 'cat-tax', categoryName: 'Impôts', amounts: [] },
        ],
      })
    ).toEqual([])
  })
})

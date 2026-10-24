import type {
  AmortizedPurchaseDto,
  BudgetPlanDto,
  CategoryDataDto,
  DashboardMonthDto,
  ExceptionalEventDto,
  SpendingStructureDto,
  TagBudgetSummaryDto,
  TagFamilyOfYearDto,
} from '@/lib/api'
import type { BudgetMonthInput } from '@/lib/budgetMonth'
import type { TodoItem } from '@/lib/todo'

/**
 * Made-up figures for the dashboard bricks of the design reference: the
 * states each one can be in, side by side. Never real data.
 */

const UPCOMING: DashboardMonthDto['upcoming'] = [
  {
    id: 'demo-rent',
    name: 'Loyer',
    amount: 640,
    nextExpected: '2026-10-21',
    categoryId: null,
  },
  {
    id: 'demo-phone',
    name: 'Forfait mobile',
    amount: 20,
    nextExpected: '2026-10-25',
    categoryId: null,
  },
  {
    id: 'demo-gym',
    name: 'Salle de sport',
    amount: 40,
    nextExpected: '2026-10-28',
    categoryId: null,
  },
  {
    id: 'demo-music',
    name: 'Musique',
    amount: 12,
    nextExpected: '2026-10-30',
    categoryId: null,
  },
]
const UPCOMING_TOTAL = 712

const HABIT = 2100
const DAY = 23
const DAYS = 31
const INCOME_EXPECTED = 2500

/** October, at the 23rd, with `spent` and `incomeReceived` to date. */
function monthOf(spent: number, incomeReceived: number): DashboardMonthDto {
  const remainingToLive = INCOME_EXPECTED - spent - UPCOMING_TOTAL
  return {
    month: '2026-10',
    asOfDay: DAY,
    daysInMonth: DAYS,
    spent,
    spentSeries: [1980, 2240, 2050, 2100, 2310, 1890, spent],
    habit: HABIT,
    habitToDate: Math.round(((HABIT * DAY) / DAYS) * 100) / 100,
    habitMonths: 6,
    incomeReceived,
    incomeExpected: INCOME_EXPECTED,
    incomeSeries: [2480, 2510, 2490, 2500, 2530, 2470],
    upcoming: UPCOMING,
    upcomingTotal: UPCOMING_TOTAL,
    remainingToLive,
    remainingShare: remainingToLive / INCOME_EXPECTED,
  }
}

export type MonthSampleState = 'under' | 'over' | 'neutral' | 'short' | 'error'

export const MONTH_SAMPLE_OPTIONS: {
  value: MonthSampleState
  label: string
}[] = [
  { value: 'under', label: "Sous l'habitude" },
  { value: 'over', label: 'Au-dessus' },
  { value: 'neutral', label: 'Neutre' },
  { value: 'short', label: 'Historique court' },
  { value: 'error', label: 'Erreur' },
]

/**
 * « Ce mois-ci » in each of its states. Over the habit, the month is also
 * past what the income leaves: the « Reste à vivre » tile says « dépassé ».
 */
export const MONTH_SAMPLES: Record<
  MonthSampleState,
  { data: DashboardMonthDto | null; error: string | null }
> = {
  // −17 % at this point of the month; the salary not landed yet.
  under: { data: monthOf(1290, 400), error: null },
  // +16 %, and 2 500 − 1 810 − 712 below zero.
  over: { data: monthOf(1810, 2497), error: null },
  // Within ±5 % of the habit.
  neutral: { data: monthOf(1580, 2497), error: null },
  // Two closed months only: the figures stay, no habit yet.
  short: {
    data: {
      ...monthOf(1290, 2497),
      spentSeries: [1980, 2240, 1290],
      habit: null,
      habitToDate: null,
      habitMonths: 2,
      incomeExpected: null,
      incomeSeries: [2480, 2510],
      remainingToLive: null,
      remainingShare: null,
    },
    error: null,
  },
  error: { data: null, error: 'Network Error' },
}

export const TODO_SAMPLE: TodoItem[] = [
  {
    key: 'to-file',
    text: '7 lignes à classer',
    to: '/transactions',
    testId: 'todo-item-to-file',
  },
  {
    key: 'pending',
    text: '8 516 € avancés, en attente de remboursement',
    amount: 8516,
    to: '/reimbursements',
    testId: 'todo-item-pending',
  },
  {
    key: 'envelope-demo-travel',
    text: 'Voyages : enveloppe dépassée de 250 €',
    amount: 250,
    to: '/tags',
    testId: 'todo-item-envelope-demo-travel',
  },
  {
    key: 'subscription-demo',
    text: 'Abonnement apparu : Musique',
    to: '/recurrences',
    testId: 'todo-item-subscription-demo',
  },
  {
    key: 'price-demo',
    text: 'Forfait mobile : le prix passe de 18 € à 20 €',
    to: '/recurrences',
    testId: 'todo-item-price-demo',
  },
]

/** Twelve months, eleven of them closed. */
export const STRUCTURE_SAMPLE: {
  actual: SpendingStructureDto
  everyday: SpendingStructureDto
  periodMonths: number
} = {
  actual: {
    essential: 16_800,
    pleasure: 11_200,
    unknownNature: 0,
    committed: 13_400,
    variable: 14_600,
    unknownRhythm: 0,
    recurring: 5_900,
    total: 28_000,
  },
  everyday: {
    essential: 15_900,
    pleasure: 8_600,
    unknownNature: 0,
    committed: 13_100,
    variable: 11_400,
    unknownRhythm: 0,
    recurring: 5_900,
    total: 24_500,
  },
  periodMonths: 11,
}

const INCOME_SOURCES: CategoryDataDto[] = [
  { categoryId: 'demo-work', category: "Revenus d'activité", amount: 27_200 },
  { categoryId: 'demo-refunds', category: 'Remboursements', amount: 270 },
]

const EVENTS: ExceptionalEventDto[] = [
  {
    id: 'demo-italy',
    name: 'Vacances Italie',
    color: '#06b6d4',
    icon: null,
    amount: 1_250,
  },
  {
    id: 'demo-hyrox',
    name: 'Hyrox Paris',
    color: '#8b5cf6',
    icon: null,
    amount: 526,
  },
  {
    id: 'demo-wedding',
    name: 'Mariage Léa',
    color: null,
    icon: null,
    amount: 310,
  },
]

const FAMILIES: TagFamilyOfYearDto[] = [
  {
    id: 'demo-travel',
    name: 'Voyages',
    color: '#06b6d4',
    icon: null,
    year: 2026,
    spent: 1_250,
    spentByYear: [
      { year: 2025, spent: 900 },
      { year: 2026, spent: 1_250 },
    ],
    annualBudget: 1_000,
    remaining: -250,
    transactionCount: 9,
    tagCount: 2,
  },
  {
    id: 'demo-sport',
    name: 'Hyrox',
    color: '#8b5cf6',
    icon: null,
    year: 2026,
    spent: 526,
    spentByYear: [{ year: 2026, spent: 526 }],
    annualBudget: null,
    remaining: null,
    transactionCount: 3,
    tagCount: 1,
  },
]

/** The three summary lines of « Où part l'argent », over the same period. */
export const SUMMARY_SAMPLE = {
  averageIncome: 2_497,
  averageSavings: 270,
  periodMonths: 11,
  incomeSources: INCOME_SOURCES,
  events: EVENTS,
  families: FAMILIES,
}

/* ------------------------------------------------------------------ */
/* Budget: « Automne 2026 », 1 850 € a month, read on 23 October       */
/* ------------------------------------------------------------------ */

const BUDGET_ENTRIES = [
  ['food', 'Alimentation', 450],
  ['home', 'Logement', 480],
  ['fun', 'Loisirs et culture', 250],
  ['bars', 'Restaurants et bars', 150],
  ['move', 'Transport', 180],
  ['shop', 'Shopping et soins', 340],
] as const

export const BUDGET_PLAN_SAMPLE: BudgetPlanDto = {
  id: 'demo-plan',
  name: 'Automne 2026',
  startDate: '2026-07-01',
  endDate: '2026-12-31',
  monthCount: 6,
  totalAmount: 1850,
  referenceIncome: 2465,
  savingsTarget: 500,
  projectReserve: 690,
  entries: BUDGET_ENTRIES.map(([id, name, amount]) => ({
    id: `demo-${id}`,
    categoryId: id,
    categoryName: name,
    amount,
  })),
  createdAt: '2026-06-25T00:00:00Z',
  updatedAt: '2026-06-25T00:00:00Z',
}

const BUDGET_SPENT: Record<string, number[]> = {
  food: [420, 470, 440, 300],
  home: [470, 480, 475, 470],
  fun: [210, 260, 190, 40],
  bars: [190, 140, 150, 162],
  move: [170, 150, 200, 20],
  shop: [300, 360, 250, 37],
}

/** July → September closed, October running: the month band's input. */
export function budgetSampleInput(
  selectedMonth: string | null,
  running = true
): BudgetMonthInput {
  return {
    plan: BUDGET_PLAN_SAMPLE,
    months: ['2026-07', '2026-08', '2026-09', '2026-10'],
    completeMonthsCount: running ? 3 : 4,
    selectedMonth,
    progress:
      running && selectedMonth === '2026-10'
        ? { elapsedDays: 23, totalDays: 31 }
        : null,
    categories: BUDGET_ENTRIES.map(([id, name]) => ({
      categoryId: id,
      categoryName: name,
      amounts: BUDGET_SPENT[id] ?? [],
    })),
    income: [2600, 2600, 2600, running ? 0 : 2600],
  }
}

export const BUDGET_MONTH_OPTIONS = [
  { ym: '2026-07', short: 'Juil.', full: 'Juillet 2026', isRunning: false },
  { ym: '2026-08', short: 'Août', full: 'Août 2026', isRunning: false },
  { ym: '2026-09', short: 'Sept.', full: 'Septembre 2026', isRunning: false },
  { ym: '2026-10', short: 'Oct.', full: 'Octobre 2026', isRunning: true },
]

export const BUDGET_PROJECTS_SAMPLE: TagBudgetSummaryDto = {
  items: [
    {
      id: 'demo-ski',
      name: 'Ski à Tignes',
      color: '#60a5fa',
      icon: '⛷️',
      eventStartDate: '2026-12-19',
      eventEndDate: '2026-12-26',
      budgetAmount: 900,
      spent: 412,
    },
    {
      id: 'demo-gift',
      name: 'Cadeaux de Noël',
      color: null,
      icon: '🎁',
      eventStartDate: null,
      eventEndDate: null,
      budgetAmount: 153,
      spent: 0,
    },
  ],
  families: [],
  totalBudget: 1053,
  totalSpent: 412,
}

export const BUDGET_SMOOTHED_SAMPLE: AmortizedPurchaseDto[] = [
  {
    transactionId: 'demo-bike',
    description: 'Vélo',
    date: '2026-03-12',
    months: 12,
    netAmount: 1200,
    monthlyAmount: 100,
    firstMonth: '2026-03',
    lastMonth: '2027-02',
    categoryId: 'move',
    subcategoryId: null,
    amountInPeriod: 600,
    sliceMonthsInPeriod: [
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
      '2026-12',
    ],
    dateInPeriod: false,
  },
]

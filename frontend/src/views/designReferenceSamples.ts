import type {
  CategoryDataDto,
  DashboardMonthDto,
  ExceptionalEventDto,
  SpendingStructureDto,
  TagFamilyOfYearDto,
} from '@/lib/api'
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

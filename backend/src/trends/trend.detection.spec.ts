import { describe, it, expect } from 'vitest'
import {
  TREND_RULES,
  aggregateMonths,
  availableMonths,
  completeMonthsBefore,
  detectTrends,
  formatEuros,
  lastClosedMonth,
  median,
  type TrendInsight,
  type TrendLine,
  type TrendReading,
  type TrendRegistry,
  type TrendWindow,
  type TrendsResult,
} from './trend.detection'
import {
  HABIT,
  MONTHS,
  READ_AT,
  SEPTEMBER,
  SEPTEMBER_CHANGES,
  SUBCATEGORIES,
  CATEGORIES,
  ledger,
  monthLines,
  registry,
  times,
} from './trend.fixtures'

const now = READ_AT

const detect = (
  reg: TrendRegistry,
  options: {
    window?: TrendWindow
    reading?: TrendReading
    reference?: 'median' | 'mean'
    month?: string
  } = {}
): TrendsResult => detectTrends(reg, { now, ...options })

function insightOf(
  insights: TrendInsight[],
  unitId: string
): TrendInsight | undefined {
  return insights.find(i => i.unit.id === unitId)
}

/** One line per trend, the way the card reads. */
const sentences = (insights: TrendInsight[]): string[] =>
  insights.map(i => i.sentence)

describe('detectTrends — the month read', () => {
  it('reads the last closed month in Paris by default', () => {
    expect(detect(registry(ledger())).month).toBe(SEPTEMBER)
    // 1 October at 00:30 in Paris is still 30 September in UTC.
    expect(lastClosedMonth(new Date('2026-09-30T22:30:00.000Z'))).toBe(
      '2026-09'
    )
  })

  it('refuses the current month: two thirds of a month always read as a drop', () => {
    expect(() => detect(registry(ledger()), { month: '2026-10' })).toThrow(
      /not closed/
    )
  })

  it('stays silent under three complete months', () => {
    const lines = MONTHS.slice(-3).flatMap(m =>
      monthLines(m, m === SEPTEMBER ? SEPTEMBER_CHANGES : HABIT)
    )
    const result = detect(registry(lines, [], '2026-07-01'))

    expect(result.completeMonths).toBe(2)
    expect(result.insights).toEqual([])
  })

  it('shortens the window to the history, and says so', () => {
    const lines = MONTHS.slice(-5).flatMap(m =>
      monthLines(m, m === SEPTEMBER ? SEPTEMBER_CHANGES : HABIT)
    )
    // A history starting mid-May: May is not a complete month.
    const result = detect(registry(lines, [], '2026-05-15'), { window: 12 })

    expect(result.completeMonths).toBe(3)
    expect(result.window).toBe(3)
    expect(result.insights[0]?.windows.reference).toEqual({
      start: '2026-06-01',
      end: '2026-08-31',
    })
    expect(result.insights[0]?.sentence).toContain('3 mois précédents')
  })

  it('counts a first month begun within its first week as complete', () => {
    expect(completeMonthsBefore('2025-09-07', '2025-12')).toBe(3)
    expect(completeMonthsBefore('2025-09-08', '2025-12')).toBe(2)
    expect(completeMonthsBefore(null, '2025-12')).toBe(0)
  })
})

describe('detectTrends — invariants', () => {
  it('finds nothing in a ledger that does not move', () => {
    for (const window of TREND_RULES.windows) {
      for (const reading of ['everyday', 'real'] as const) {
        expect(
          detect(registry(ledger()), { window, reading }).insights
        ).toEqual([])
      }
    }
  })

  it('is not moved by one big month in the reference, which would move a mean', () => {
    // A 900 € dinner in May, then back to the habit.
    const lines = MONTHS.flatMap(m =>
      monthLines(
        m,
        m === '2026-05'
          ? { ...HABIT, restaurant: [...times(4, 56.5), 900] }
          : HABIT
      )
    )

    const byMedian = detect(registry(lines))
    const byMean = detect(registry(lines), { reference: 'mean' })

    expect(byMedian.insights).toEqual([])
    // The mean takes May's dinner for the habit: September reads as a drop.
    expect(insightOf(byMean.insights, 'restaurant')).toMatchObject({
      direction: 'down',
      tone: 'success',
    })
  })

  it('never reads an exceptional line as a category trend in the everyday reading', () => {
    const lines = ledger(
      { ...HABIT, flights: [1200] },
      { flights: { exceptional: true } }
    )

    expect(detect(registry(lines)).insights).toEqual([])
    // The real reading counts everything, the episode included.
    expect(
      insightOf(
        detect(registry(lines), { reading: 'real' }).insights,
        'flights'
      )
    ).toMatchObject({ kind: 'amount', current: 1200, reference: 0 })
  })

  it('counts a smoothed purchase by its slice in the everyday reading', () => {
    const lines = ledger({ ...HABIT, phone: [1200] })
    const phoneLine = lines.find(l => l.subcategoryId === 'phone')
    const smoothed = [
      {
        transactionId: phoneLine?.id ?? '',
        categoryId: 'tech',
        subcategoryId: 'phone',
        nature: 'PLEASURE' as const,
        slices: [{ month: SEPTEMBER, amount: 100 }],
      },
    ]

    const everyday = detect(registry(lines, smoothed))
    const real = detect(registry(lines, smoothed), { reading: 'real' })

    expect(insightOf(everyday.insights, 'phone')).toMatchObject({
      kind: 'amount',
      current: 100,
    })
    expect(insightOf(real.insights, 'phone')).toMatchObject({ current: 1200 })
  })

  it('never tells an essential unit « vous avez réduit »', () => {
    const lines = ledger({
      ...HABIT,
      pharmacy: [],
      grocery: times(4, 48),
      delivery: [],
    })
    const insights = detect(registry(lines)).insights

    const pharmacy = insightOf(insights, 'pharmacy')
    const grocery = insightOf(insights, 'grocery')
    expect(pharmacy).toMatchObject({ direction: 'down', tone: 'neutral' })
    expect(grocery).toMatchObject({ direction: 'down', tone: 'neutral' })
    expect(pharmacy?.sentence).not.toContain('réduit')
    expect(grocery?.sentence).not.toContain('réduit')
    // The pleasure and variable delivery is the one success.
    expect(
      insights.filter(i => i.tone === 'success').map(i => i.unit.id)
    ).toEqual(['delivery'])
  })

  it('gives the same list for the same ledger, whatever the order of its rows', () => {
    const lines = ledger(SEPTEMBER_CHANGES)
    const shuffled = [...lines].reverse()
    shuffled.push(...shuffled.splice(0, 40))

    expect(detect(registry(shuffled))).toEqual(detect(registry(lines)))
  })

  it('adds a month up from its units: categories plus uncategorised lines', () => {
    const lines: TrendLine[] = [
      ...ledger(SEPTEMBER_CHANGES, { restaurant: { exceptional: true } }),
      {
        id: 'loose',
        date: '2026-09-15',
        amount: 42.1,
        categoryId: null,
        subcategoryId: null,
        nature: null,
        rhythm: null,
        isRecurring: false,
        isExceptional: false,
        description: 'CB QUELQUE PART',
      },
    ]
    const phone = monthLines('2026-03', { phone: [600] })
    const smoothed = [
      {
        transactionId: phone[0]?.id ?? '',
        categoryId: 'tech',
        subcategoryId: 'phone',
        nature: 'PLEASURE' as const,
        slices: MONTHS.slice(6, 12).map(month => ({ month, amount: 100 })),
      },
    ]
    const reg = registry([...lines, ...phone], smoothed)

    for (const reading of ['everyday', 'real'] as const) {
      const months = aggregateMonths(reg, reading, MONTHS)
      for (const [month, aggregate] of months) {
        const categories = [...aggregate.units]
          .filter(([key]) => key.startsWith('category:'))
          .reduce((sum, [, unit]) => sum + unit.amount, 0)
        expect(categories + aggregate.uncategorized).toBeCloseTo(
          aggregate.total,
          9
        )
        // The total itself is the dashboard's rule, written out.
        const expected =
          reg.lines
            .filter(l => l.date.startsWith(month))
            .filter(l => reading === 'real' || !l.isExceptional)
            .filter(
              l => reading === 'real' || l.id !== smoothed[0]?.transactionId
            )
            .reduce((sum, l) => sum + l.amount, 0) +
          (reading === 'everyday'
            ? (smoothed[0]?.slices.find(s => s.month === month)?.amount ?? 0)
            : 0)
        expect(aggregate.total).toBeCloseTo(expected, 9)
      }
    }
  })
})

describe('detectTrends — the catalogue', () => {
  const september = detect(registry(ledger(SEPTEMBER_CHANGES)))

  it('reads a sector up against its habit (trend 1)', () => {
    expect(insightOf(september.insights, 'restaurant')).toMatchObject({
      kind: 'amount',
      direction: 'up',
      tone: 'neutral',
      current: 312,
      reference: 226,
      delta: 86,
      deltaPct: 38.1,
      sentence:
        "Restaurant : 312 € en septembre, +38 % par rapport à l'habitude des 6 mois précédents (226 €).",
    })
  })

  it('reads a variable habit taken less often, with its amount, as one line (trend 2)', () => {
    const delivery = insightOf(september.insights, 'delivery')
    expect(delivery).toMatchObject({
      kind: 'frequency',
      direction: 'down',
      tone: 'success',
      current: 3,
      reference: 9,
      score: 90,
      sentence:
        "Livraison de repas : vous avez réduit la fréquence, 3 achats en septembre contre 9 par mois d'habitude sur les 6 mois précédents, soit 45 € contre 135 €.",
    })
    expect(
      september.insights.filter(i => i.unit.id === 'delivery')
    ).toHaveLength(1)
  })

  it('reads a dearer basket at the same frequency (trend 3)', () => {
    expect(insightOf(september.insights, 'grocery')).toMatchObject({
      kind: 'basket',
      direction: 'up',
      current: 62,
      reference: 48,
      sentence:
        "Supermarché : autant d'achats, mais 62 € en moyenne en septembre contre 48 € d'habitude sur les 6 mois précédents.",
    })
  })

  it('reads the pleasure share moving (trend 4)', () => {
    const lines = ledger({
      ...HABIT,
      restaurant: times(8, 56.5),
      bar: times(4, 20),
    })
    const share = insightOf(detect(registry(lines)).insights, 'pleasure')

    expect(share).toMatchObject({
      kind: 'share',
      unit: { type: 'structure', name: 'Part plaisir' },
      direction: 'up',
      tone: 'neutral',
      deltaPct: null,
    })
    expect(share?.sentence).toMatch(
      /^La part plaisir de la vie courante passe à \d+ % en septembre, contre 26 % d'habitude sur les 6 mois précédents\.$/
    )
  })

  it('stays silent under the thresholds', () => {
    // Rent +10 €: under 30 €.
    expect(insightOf(september.insights, 'rent')).toBeUndefined()
    expect(insightOf(september.insights, 'housing')).toBeUndefined()
    // Restaurants et bars: +86 € and −90 € cancel out.
    expect(insightOf(september.insights, 'restaurants')).toBeUndefined()
  })

  it('never explains an amount that went up by fewer purchases', () => {
    // Two coats instead of a handful of T-shirts: fewer lines, far more money.
    const lines = MONTHS.flatMap(m =>
      monthLines(
        m,
        m === SEPTEMBER
          ? { ...HABIT, restaurant: [225, 225] }
          : { ...HABIT, restaurant: [18, 18, 18, 18, 18] }
      )
    )
    const restaurant = insightOf(detect(registry(lines)).insights, 'restaurant')

    expect(restaurant).toMatchObject({
      kind: 'amount',
      direction: 'up',
      tone: 'neutral',
    })
    expect(restaurant?.sentence).not.toContain('réduit')
  })

  it('says « aucun » and « rien » rather than zeros', () => {
    const lines = ledger({ ...HABIT, bar: times(4, 20) })
    expect(insightOf(detect(registry(lines)).insights, 'bar')?.sentence).toBe(
      "Bars : 4 achats en septembre, contre aucun d'habitude sur les 6 mois précédents, soit 80 € contre rien."
    )
  })

  it('names a catalogue « Autre » subcategory after its category', () => {
    const reg = registry(ledger({ ...HABIT, bar: times(4, 40) }))
    reg.subcategories = reg.subcategories.map(s =>
      s.id === 'bar' ? { ...s, name: 'Autre' } : s
    )

    expect(insightOf(detect(reg).insights, 'bar')?.unit.name).toBe(
      'Restaurants et bars, autre'
    )
  })

  it('never reads a frequency or a basket on a committed subcategory or a recurrence line', () => {
    const lines = ledger(
      { ...HABIT, streaming: times(5, 13.49), lessons: times(6, 30) },
      { lessons: { recurring: true } }
    )
    const insights = detect(registry(lines)).insights

    expect(insightOf(insights, 'streaming')).toMatchObject({ kind: 'amount' })
    // Six recurrence lines, nothing a person decided: an amount, no frequency.
    expect(insightOf(insights, 'lessons')).toMatchObject({ kind: 'amount' })
    expect(insights.some(i => i.kind === 'frequency')).toBe(false)
  })

  it('carries both windows, the unit and a seven-month series', () => {
    const restaurant = insightOf(september.insights, 'restaurant')
    expect(restaurant?.windows).toEqual({
      current: { start: '2026-09-01', end: '2026-09-30' },
      reference: { start: '2026-03-01', end: '2026-08-31' },
    })
    expect(restaurant?.unit).toEqual({
      type: 'subcategory',
      id: 'restaurant',
      // A link opens a subcategory inside its category.
      categoryId: 'restaurants',
      name: 'Restaurant',
      icon: 'icon-restaurants',
    })
    expect(restaurant?.series).toEqual([226, 226, 226, 226, 226, 226, 312])
  })
})

describe('detectTrends — selection', () => {
  it('shows the subcategory instead of its category when it explains 70 % of the gap', () => {
    const insights = detect(registry(ledger(SEPTEMBER_CHANGES))).insights

    expect(insightOf(insights, 'grocery')).toBeDefined()
    expect(insightOf(insights, 'food')).toBeUndefined()
  })

  it('shows the category instead of subcategories that each explain too little', () => {
    const lines = ledger({
      ...HABIT,
      restaurant: times(4, 90),
      bar: times(6, 25),
      delivery: times(9, 15),
    })
    const insights = detect(registry(lines)).insights

    expect(insightOf(insights, 'restaurants')).toMatchObject({
      kind: 'amount',
      unit: { type: 'category', name: 'Restaurants et bars' },
    })
    expect(insightOf(insights, 'restaurant')).toBeUndefined()
    expect(insightOf(insights, 'bar')).toBeUndefined()
  })

  it('orders by the gap in euros, every direction together', () => {
    const scores = detect(registry(ledger(SEPTEMBER_CHANGES))).insights.map(
      i => i.score
    )
    expect(scores).toEqual([...scores].sort((a, b) => b - a))
  })

  it('reads September as the plan does', () => {
    expect(sentences(detect(registry(ledger(SEPTEMBER_CHANGES))).insights))
      .toMatchInlineSnapshot(`
        [
          "Supermarché : autant d'achats, mais 62 € en moyenne en septembre contre 48 € d'habitude sur les 6 mois précédents.",
          "Livraison de repas : vous avez réduit la fréquence, 3 achats en septembre contre 9 par mois d'habitude sur les 6 mois précédents, soit 45 € contre 135 €.",
          "Restaurant : 312 € en septembre, +38 % par rapport à l'habitude des 6 mois précédents (226 €).",
        ]
      `)
  })

  it('returns the whole response, shaped for the card', () => {
    expect(
      detect(registry(ledger(SEPTEMBER_CHANGES)), { window: 3 })
    ).toMatchSnapshot()
  })
})

/** `n` expense lines of `month` filed in no category. */
function unfiled(month: string, n: number, amount = 20): TrendLine[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `unfiled-${month}-${i + 1}`,
    date: `${month}-${String(3 + i).padStart(2, '0')}`,
    amount,
    categoryId: null,
    subcategoryId: null,
    nature: null,
    rhythm: null,
    isRecurring: false,
    isExceptional: false,
    description: `CB INCONNU ${i + 1}`,
  }))
}

describe('detectTrends — lines to file (trend 5)', () => {
  it('says how many lines of the month are still to file, first of the list', () => {
    const result = detect(
      // A euro each: in the total, too little to move a share.
      registry([...ledger(SEPTEMBER_CHANGES), ...unfiled(SEPTEMBER, 12, 1)])
    )

    expect(result.insights[0]).toMatchObject({
      kind: 'uncategorized',
      unit: {
        type: 'uncategorized',
        id: 'uncategorized',
        categoryId: null,
        icon: null,
      },
      direction: 'up',
      tone: 'neutral',
      current: 12,
      delta: 12,
      deltaPct: null,
      score: 12,
      sentence:
        '12 dépenses de septembre sont à classer : les tendances ne les lisent pas.',
      windows: { current: { start: '2026-09-01', end: '2026-09-30' } },
    })
    // Every line of the month, the 12 included.
    expect(result.insights[0]?.reference).toBe(
      ledger(SEPTEMBER_CHANGES).filter(l => l.date.startsWith(SEPTEMBER))
        .length + 12
    )
    // The habit trends follow, unchanged: an unfiled line is in no unit.
    expect(result.insights.slice(1).map(i => i.unit.id)).toEqual(
      detect(registry(ledger(SEPTEMBER_CHANGES))).insights.map(i => i.unit.id)
    )
  })

  it('stays silent under 5 lines and under 10 % of the month', () => {
    // 2 lines out of 28: neither 5 lines nor 10 %.
    const quiet = detect(registry([...ledger(), ...unfiled(SEPTEMBER, 2)]))
    expect(quiet.insights).toEqual([])

    // 5 lines speak, whatever their share.
    const five = detect(registry([...ledger(), ...unfiled(SEPTEMBER, 5)]))
    expect(five.insights.map(i => i.kind)).toEqual(['uncategorized'])

    // 1 line out of 4 is a quarter of the month: it speaks, in the singular.
    const small = [
      ...MONTHS.flatMap(m => monthLines(m, { rent: [650], pharmacy: [20] })),
      ...monthLines(SEPTEMBER, { grocery: [48] }),
      ...unfiled(SEPTEMBER, 1),
    ]
    expect(sentences(detect(registry(small)).insights)).toContain(
      '1 dépense de septembre est à classer : les tendances ne la lisent pas.'
    )
  })

  it("elides the month's name when it starts with a vowel", () => {
    const august = detect(registry([...ledger(), ...unfiled('2026-08', 6)]), {
      month: '2026-08',
    })
    expect(august.insights[0]?.sentence).toBe(
      "6 dépenses d'août sont à classer : les tendances ne les lisent pas."
    )
  })

  it('counts the lines to file in both readings, exceptional ones included', () => {
    const lines = [
      ...ledger(),
      ...unfiled(SEPTEMBER, 6).map(l => ({ ...l, isExceptional: true })),
    ]
    for (const reading of ['everyday', 'real'] as const) {
      expect(detect(registry(lines), { reading }).insights[0]?.current).toBe(6)
    }
  })

  it('speaks even before the habit trends can, on a short history', () => {
    const lines = [
      ...MONTHS.slice(-2).flatMap(m => monthLines(m, HABIT)),
      ...unfiled(SEPTEMBER, 7),
    ]
    const result = detect(registry(lines, [], '2026-08-01'))

    expect(result.completeMonths).toBe(1)
    expect(result.insights.map(i => i.kind)).toEqual(['uncategorized'])
    expect(result.quietSentence).toBeNull()
  })

  it('draws the lines to file over the seven months of the sparkline', () => {
    const result = detect(
      registry([
        ...ledger(),
        ...unfiled('2026-08', 2),
        ...unfiled(SEPTEMBER, 8),
      ])
    )
    expect(result.insights[0]?.series).toEqual([0, 0, 0, 0, 0, 2, 8])
  })
})

describe('detectTrends — what the card says around the list', () => {
  it('says nothing changed when no habit moved, in the reading asked', () => {
    expect(detect(registry(ledger())).quietSentence).toBe(
      "Rien de notable en septembre : la vie courante est dans l'habitude."
    )
    expect(detect(registry(ledger()), { reading: 'real' }).quietSentence).toBe(
      "Rien de notable en septembre : les dépenses sont dans l'habitude."
    )
  })

  it('keeps the quiet sentence beside lines to file, and drops it beside a habit', () => {
    expect(
      detect(registry([...ledger(), ...unfiled(SEPTEMBER, 6)])).quietSentence
    ).not.toBeNull()
    expect(detect(registry(ledger(SEPTEMBER_CHANGES))).quietSentence).toBeNull()
  })

  it('offers the closed months with three complete months before them, latest first', () => {
    expect(availableMonths('2026-05-03', '2026-09')).toEqual([
      '2026-09',
      '2026-08',
    ])
    // A history begun mid-May counts from June.
    expect(availableMonths('2026-05-20', '2026-09')).toEqual(['2026-09'])
    expect(availableMonths('2026-07-01', '2026-09')).toEqual([])
    expect(availableMonths(null, '2026-09')).toEqual([])
    expect(availableMonths('2015-01-01', '2026-09')).toHaveLength(
      TREND_RULES.selectableMonths
    )
    expect(detect(registry(ledger())).availableMonths[0]).toBe(SEPTEMBER)
  })
})

/** Lines of `subId` at another merchant, `perMonth[month]` of them at `amount`. */
function at(
  description: string,
  subId: string,
  perMonth: Partial<Record<string, number>>,
  amount: number,
  flags: { recurring?: boolean } = {}
): TrendLine[] {
  return Object.entries(perMonth).flatMap(([month, n]) =>
    monthLines(
      month,
      { [subId]: times(n ?? 0, amount) },
      { [subId]: { description, recurring: flags.recurring ?? false } }
    )
  )
}

/** The same count every month of the history, `september` in the last. */
function everyMonth(n: number, september = n): Record<string, number> {
  return Object.fromEntries(
    MONTHS.map(m => [m, m === SEPTEMBER ? september : n])
  )
}

const merchantInsight = (
  insights: TrendInsight[],
  name: string
): TrendInsight | undefined =>
  insights.find(i => i.unit.type === 'merchant' && i.unit.name === name)

describe('detectTrends — merchants (trends 6 to 8)', () => {
  it('reads a merchant visited more often, in distinct days, scored by its reference basket (trend 6)', () => {
    const lines = [
      ...ledger(),
      ...at('CB PICARD SURGELES', 'grocery', everyMonth(2, 6), 30),
    ]
    const insights = detect(registry(lines)).insights
    const picard = merchantInsight(insights, 'Picard Surgeles')

    expect(picard).toMatchObject({
      kind: 'frequency',
      unit: {
        type: 'merchant',
        id: 'picard surgeles',
        categoryId: 'food',
        icon: 'icon-food',
        // The brand, the first word of its name.
        search: 'picard',
      },
      direction: 'up',
      tone: 'neutral',
      current: 6,
      reference: 2,
      score: 120,
    })
    expect(picard?.sentence).toBe(
      "Picard Surgeles : 6 achats en septembre, contre 2 par mois d'habitude sur les 6 mois précédents, soit 180 € contre 60 €."
    )
    // Picard explains the supermarket's whole gap: it speaks for it.
    expect(insightOf(insights, 'grocery')).toBeUndefined()
  })

  it('counts two lines at a merchant the same day as one visit', () => {
    const sameDay = (month: string, n: number): TrendLine[] =>
      at('CB AMAZON', 'phone', { [month]: n }, 25).map(line => ({
        ...line,
        date: `${month}-10`,
      }))
    const lines = [
      ...ledger(),
      ...MONTHS.flatMap(m =>
        m === SEPTEMBER
          ? sameDay(m, 6)
          : at('CB AMAZON', 'phone', { [m]: 2 }, 25)
      ),
    ]
    const insights = detect(registry(lines)).insights

    // Six lines, one day: fewer visits, not more.
    expect(merchantInsight(insights, 'Amazon')).toBeUndefined()
  })

  it('reads a merchant new over the last two months as a new habit (trend 7)', () => {
    const lines = [
      ...ledger(),
      ...at('CB PICARD', 'grocery', { '2026-08': 2, [SEPTEMBER]: 2 }, 30),
    ]
    const picard = merchantInsight(detect(registry(lines)).insights, 'Picard')

    expect(picard).toMatchObject({
      kind: 'newHabit',
      direction: 'up',
      tone: 'neutral',
      current: 4,
      reference: 0,
      deltaPct: null,
      // The new habit's month.
      score: 60,
      windows: {
        current: { start: '2026-08-01', end: '2026-09-30' },
        reference: { start: '2026-02-01', end: '2026-07-31' },
      },
    })
    expect(picard?.sentence).toBe(
      'Picard : nouveau, 4 achats depuis août (120 €), aucun sur les 6 mois précédents.'
    )
  })

  it('stays silent on a merchant seen in the six months before, or visited under three days', () => {
    const seen = [
      ...ledger(),
      ...at(
        'CB PICARD',
        'grocery',
        { '2026-04': 1, '2026-08': 2, [SEPTEMBER]: 2 },
        30
      ),
    ]
    const few = [
      ...ledger(),
      ...at('CB PICARD', 'grocery', { '2026-08': 1, [SEPTEMBER]: 1 }, 30),
    ]
    const gone = [
      ...ledger(),
      ...at('CB PICARD', 'grocery', { '2026-07': 2, '2026-08': 2 }, 30),
    ]

    for (const lines of [seen, few, gone]) {
      expect(
        detect(registry(lines)).insights.some(i => i.kind === 'newHabit')
      ).toBe(false)
    }
  })

  it('reads a merchant gone this month after five months of six as a lost habit (trend 8)', () => {
    const lines = [
      ...ledger(),
      ...at('CB PICARD', 'grocery', everyMonth(2, 0), 30),
    ]
    const picard = merchantInsight(detect(registry(lines)).insights, 'Picard')

    expect(picard).toMatchObject({
      kind: 'lostHabit',
      direction: 'down',
      // Groceries are essential: gone, never « réduit ».
      tone: 'neutral',
      current: 0,
      reference: 2,
      score: 60,
    })
    expect(picard?.sentence).toBe(
      "Picard : plus aucun achat en septembre, contre 2 par mois d'habitude sur les 6 mois précédents (60 €)."
    )
  })

  it('reads a variable subcategory gone for two months as a lost habit, in place of its amount', () => {
    const lines = MONTHS.flatMap(m =>
      monthLines(m, m >= '2026-08' ? { ...HABIT, delivery: [] } : HABIT)
    )
    const insights = detect(registry(lines)).insights
    const delivery = insightOf(insights, 'delivery')

    expect(delivery).toMatchObject({
      kind: 'lostHabit',
      unit: { type: 'subcategory' },
      tone: 'success',
      windows: { current: { start: '2026-08-01', end: '2026-09-30' } },
    })
    expect(delivery?.sentence).toBe(
      "Livraison de repas : vous avez arrêté, plus aucun achat depuis août, contre 9 par mois d'habitude sur les 6 mois précédents (135 €)."
    )
    // One line for the unit; Uber Eats, which is the whole of it, keeps quiet.
    expect(insights.filter(i => i.unit.id === 'delivery')).toHaveLength(1)
    expect(merchantInsight(insights, 'Uber Eats')).toBeUndefined()
  })

  it('stays silent on a habit present in only four of the six months', () => {
    const lines = [
      ...ledger(),
      ...at(
        'CB PICARD',
        'grocery',
        { '2026-03': 2, '2026-04': 2, '2026-06': 2, '2026-08': 2 },
        30
      ),
    ]
    expect(
      detect(registry(lines)).insights.some(i => i.kind === 'lostHabit')
    ).toBe(false)
  })

  it('reads no merchant trend on a merchant whose every line belongs to a recurrence', () => {
    const lines = [
      ...ledger(),
      // Every move a habit could make, all on recurrence lines.
      ...at('CB PICARD', 'grocery', everyMonth(2, 8), 30, { recurring: true }),
      ...at('CB DECATHLON', 'lessons', { '2026-08': 3, [SEPTEMBER]: 3 }, 30, {
        recurring: true,
      }),
      ...at('CB LIDL', 'grocery', everyMonth(3, 0), 30, { recurring: true }),
    ]
    const insights = detect(registry(lines)).insights

    expect(insights.filter(i => i.unit.type === 'merchant')).toEqual([])
  })

  it('leaves a merchant that is its whole subcategory to the subcategory', () => {
    const insights = detect(registry(ledger(SEPTEMBER_CHANGES))).insights

    // Uber Eats is every delivery: the plan's sentence stays the subcategory's.
    expect(insightOf(insights, 'delivery')).toMatchObject({ kind: 'frequency' })
    expect(insights.some(i => i.unit.type === 'merchant')).toBe(false)
  })

  it('keeps a subcategory read as a basket, whatever its merchants did', () => {
    // Dearer visits at the supermarket, half of them now at Picard: Picard
    // is new and carries the gap, the basket still says what happened.
    const lines = [
      ...ledger({ ...HABIT, grocery: times(4, 70) }),
      ...at('CB PICARD', 'grocery', { [SEPTEMBER]: 4 }, 70),
    ]
    const insights = detect(registry(lines)).insights

    expect(insightOf(insights, 'grocery')).toMatchObject({ kind: 'basket' })
    expect(merchantInsight(insights, 'Picard')).toBeUndefined()
    // The same Picard beside an amount trend speaks for it.
    const amount = [
      ...ledger(),
      ...at('CB PICARD', 'grocery', { [SEPTEMBER]: 4 }, 30),
    ]
    expect(
      merchantInsight(detect(registry(amount)).insights, 'Picard')
    ).toMatchObject({ kind: 'newHabit' })
  })

  it('keeps the subcategory when the merchant explains too little of its gap', () => {
    const lines = [
      ...ledger({ ...HABIT, grocery: times(8, 80) }),
      ...at('CB PICARD', 'grocery', everyMonth(2, 6), 10),
    ]
    const insights = detect(registry(lines)).insights

    expect(insightOf(insights, 'grocery')).toBeDefined()
    expect(merchantInsight(insights, 'Picard')).toBeUndefined()
  })
})

describe('detectTrends — merchants beside the habits', () => {
  const lines = [
    ...ledger(SEPTEMBER_CHANGES),
    ...at(
      'CB PHARMACIE DU PORT',
      'pharmacy',
      { '2026-08': 2, [SEPTEMBER]: 2 },
      15
    ),
    ...at('CB FNAC', 'phone', everyMonth(3, 0), 40),
  ]
  const reg = registry(lines)

  it('keeps every month adding up from its category units: merchants are outside the sum', () => {
    // Trends 6 to 8 read units of their own, which no month adds up:
    // the categories and the lines to file still make the whole total.
    for (const reading of ['everyday', 'real'] as const) {
      for (const aggregate of aggregateMonths(reg, reading, MONTHS).values()) {
        const units = [...aggregate.units]
          .filter(([key]) => key.startsWith('category:'))
          .reduce((sum, [, unit]) => sum + unit.amount, 0)
        expect(units + aggregate.uncategorized).toBeCloseTo(aggregate.total, 9)
        expect(
          [...aggregate.units.keys()].every(
            key => key.startsWith('category:') || key.startsWith('subcategory:')
          )
        ).toBe(true)
      }
    }
  })

  it('gives the same list for the same ledger, whatever its order', () => {
    const shuffled = registry([...lines].reverse())
    expect(detect(shuffled)).toEqual(detect(reg))
  })

  it('reads lot 2 alongside the habits', () => {
    expect(
      detect(reg).insights.map(i => [i.kind, i.unit.type, i.score, i.sentence])
    ).toMatchSnapshot()
  })
})

describe('helpers', () => {
  it('takes the middle of an even window as the mean of its two middles', () => {
    expect(median([3, 1, 2, 10])).toBe(2.5)
    expect(median([])).toBe(0)
  })

  it('writes euros the French way', () => {
    expect(formatEuros(312.4)).toBe('312 €')
    expect(formatEuros(4.5)).toBe('4,50 €')
    expect(formatEuros(13)).toBe('13 €')
    expect(formatEuros(1240)).toBe('1 240 €')
  })

  it('knows every subcategory of the fixtures by its category', () => {
    const ids = new Set(CATEGORIES.map(c => c.id))
    expect(SUBCATEGORIES.every(s => ids.has(s.categoryId))).toBe(true)
  })
})

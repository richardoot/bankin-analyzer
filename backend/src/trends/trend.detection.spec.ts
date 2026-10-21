import { describe, it, expect } from 'vitest'
import {
  TREND_RULES,
  aggregateMonths,
  availableMonths,
  completeMonthsBefore,
  detectTrends,
  formatEuros,
  headlineOf,
  lastClosedMonth,
  median,
  type TrendInsight,
  type TrendLine,
  type TrendReading,
  type TrendRecurrence,
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
  flows,
  ledger,
  monthLines,
  recurrence,
  recurrenceLines,
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
  // The plan's September moves restaurants and deliveries together, which
  // is one shift (trend 11): each move is read here on its own.
  const restaurantsUp = detect(
    registry(ledger({ ...SEPTEMBER_CHANGES, delivery: HABIT.delivery }))
  )
  const fewerDeliveries = detect(
    registry(ledger({ ...SEPTEMBER_CHANGES, restaurant: HABIT.restaurant }))
  )

  it('reads a sector up against its habit (trend 1)', () => {
    expect(insightOf(restaurantsUp.insights, 'restaurant')).toMatchObject({
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
    const delivery = insightOf(fewerDeliveries.insights, 'delivery')
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
      fewerDeliveries.insights.filter(i => i.unit.id === 'delivery')
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
    // Restaurants et bars: +86 € and −90 € cancel out, and are one shift.
    expect(insightOf(september.insights, 'restaurants')?.kind).toBe('shift')
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
    const restaurant = insightOf(restaurantsUp.insights, 'restaurant')
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
          "Restaurants et bars en septembre : moins de livraison de repas (−6 achats), plus de restaurant (+86 €) que d'habitude sur les 6 mois précédents, un report plutôt qu'une économie.",
        ]
      `)
  })

  it('heads the card with its two largest gaps, in words and without a figure', () => {
    const result = detect(registry(ledger(SEPTEMBER_CHANGES)))
    expect(result.headline).toBe(
      'Septembre : un panier plus élevé en supermarché, et un report de livraison de repas vers restaurant.'
    )
    expect(result.headline).not.toMatch(/\d/)
  })

  it('has no headline when no habit moved, even beside lines to file', () => {
    expect(detect(registry(ledger())).headline).toBeNull()
    expect(
      detect(registry([...ledger(), ...unfiled(SEPTEMBER, 6)])).headline
    ).toBeNull()
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
    const insights = detect(
      registry(ledger({ ...SEPTEMBER_CHANGES, restaurant: HABIT.restaurant }))
    ).insights

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

describe('detectTrends — recurrences (trends 9 and 10)', () => {
  const monthly = (
    from: string,
    to: string,
    amount: number,
    day = '03'
  ): Array<[string, number]> => {
    const charges: Array<[string, number]> = []
    for (const m of MONTHS) {
      if (m >= from && m <= to) charges.push([`${m}-${day}`, amount])
    }
    return charges
  }

  it('reads a subscription that appeared in the last three months (trend 9)', () => {
    const gym = recurrence({
      name: 'Basic Fit',
      merchantKey: 'basic fit',
      subcategoryId: 'lessons',
      period: 'FOUR_WEEKLY',
      charges: [
        ['2026-07-03', 29.99],
        ['2026-07-31', 29.99],
        ['2026-08-28', 29.99],
        ['2026-09-25', 29.99],
      ],
    })
    const reg = registry(
      [...ledger(), ...recurrenceLines(gym)],
      [],
      undefined,
      [gym]
    )
    const insight = detect(reg).insights.find(i => i.kind === 'subscription')

    expect(insight).toMatchObject({
      unit: {
        type: 'recurrence',
        id: '30:basic fit',
        categoryId: 'leisure',
        name: 'Basic Fit',
        icon: 'icon-leisure',
      },
      direction: 'up',
      tone: 'neutral',
      current: 32.49,
      reference: 0,
      deltaPct: null,
      score: 32.49,
      sentence:
        'Nouvel abonnement : Basic Fit, 29,99 € toutes les 4 semaines depuis juillet.',
    })
  })

  it('reads a subscription whose due charge never came as stopped, and an amount it explains gives way', () => {
    const piano = recurrence({
      name: 'Simply Piano',
      merchantKey: 'simply piano',
      subcategoryId: 'lessons',
      status: 'STOPPED',
      charges: monthly('2025-09', '2026-06', 150),
    })
    const lines = [...ledger(), ...recurrenceLines(piano)]
    const insights = detect(registry(lines, [], undefined, [piano])).insights

    expect(insights.find(i => i.kind === 'subscription')).toMatchObject({
      direction: 'down',
      tone: 'neutral',
      current: 0,
      reference: 150,
      score: 150,
      sentence:
        'Abonnement arrêté : Simply Piano, 150,00 € par mois, dernier prélèvement en juin.',
    })
    // « Cours : vous avez réduit, rien contre 150 € » was the charge: gone.
    expect(insightOf(insights, 'lessons')).toBeUndefined()
    expect(insightOf(insights, 'leisure')).toBeUndefined()
  })

  it('never says « vous avez réduit » of an amount a charge explains, even without its recurrence', () => {
    const piano = recurrence({
      name: 'Simply Piano',
      merchantKey: 'simply piano',
      subcategoryId: 'lessons',
      status: 'STOPPED',
      charges: monthly('2025-09', '2026-06', 150),
    })
    const lines = [...ledger(), ...recurrenceLines(piano)]
    // The cache unread: the amount trend stays, in a neutral sentence.
    const insights = detect(registry(lines)).insights
    const lessons = insights.find(
      i => i.unit.id === 'lessons' || i.unit.id === 'leisure'
    )

    expect(lessons).toMatchObject({ kind: 'amount', tone: 'neutral' })
    expect(lessons?.sentence).not.toMatch(/vous avez réduit/)
  })

  it('stays silent on a series begun before the three months, and on a candidate', () => {
    const old = recurrence({
      name: 'Netflix',
      merchantKey: 'netflix',
      subcategoryId: 'streaming',
      charges: monthly('2026-05', '2026-09', 13.49),
    })
    const candidate = recurrence({
      name: 'Hevy',
      merchantKey: 'hevy',
      subcategoryId: 'lessons',
      status: 'CANDIDATE',
      charges: monthly('2026-08', '2026-09', 9.99),
    })

    for (const series of [old, candidate]) {
      expect(
        detect(registry(ledger(), [], undefined, [series])).insights
      ).toEqual([])
    }
  })

  it('reads a new price after a price held for two charges (trend 10)', () => {
    const netflix = recurrence({
      name: 'Netflix',
      merchantKey: 'netflix',
      subcategoryId: 'streaming',
      charges: [
        ...monthly('2025-09', '2026-06', 13.49),
        ...monthly('2026-07', '2026-09', 15.99),
      ],
    })
    const insight = detect(
      registry(ledger(), [], undefined, [netflix])
    ).insights.find(i => i.kind === 'price')

    expect(insight).toMatchObject({
      direction: 'up',
      // A dearer charge is undergone: never a reproach.
      tone: 'neutral',
      current: 15.99,
      reference: 13.49,
      delta: 2.5,
      deltaPct: 18.5,
      // Δ price × charges per month.
      score: 2.5,
      sentence: 'Netflix : 15,99 € par mois depuis juillet, contre 13,49 €.',
      windows: {
        current: { start: '2026-07-01', end: '2026-09-30' },
        reference: { start: '2025-09-01', end: '2026-06-30' },
      },
    })
  })

  it('stays silent on an unchanged price, a bill that moves every month, or a change older than three months', () => {
    const series = (charges: Array<[string, number]>): TrendRecurrence =>
      recurrence({
        name: 'EDF',
        merchantKey: 'edf',
        subcategoryId: 'rent',
        charges,
      })
    const unchanged = series(monthly('2025-09', '2026-09', 39.99))
    const moving = series(
      MONTHS.map((m, i) => [`${m}-08`, 50 + i] as [string, number])
    )
    const older = series([
      ...monthly('2025-09', '2026-04', 39.99),
      ...monthly('2026-05', '2026-09', 44.99),
    ])

    for (const s of [unchanged, moving, older]) {
      expect(detect(registry(ledger(), [], undefined, [s])).insights).toEqual(
        []
      )
    }
  })

  it('reads a past month with the charges it had then', () => {
    const netflix = recurrence({
      name: 'Netflix',
      merchantKey: 'netflix',
      subcategoryId: 'streaming',
      charges: [
        ...monthly('2025-09', '2026-06', 13.49),
        ...monthly('2026-07', '2026-09', 15.99),
      ],
    })
    // In June the new price had not come yet.
    expect(
      detect(registry(ledger(), [], undefined, [netflix]), { month: '2026-06' })
        .insights
    ).toEqual([])
  })
})

describe('detectTrends — merchants and charges together', () => {
  const gym = recurrence({
    name: 'Basic Fit',
    merchantKey: 'basic fit',
    subcategoryId: 'lessons',
    charges: [
      ['2026-07-03', 29.99],
      ['2026-08-03', 29.99],
      ['2026-09-03', 29.99],
    ],
  })
  const lines = [
    ...ledger(SEPTEMBER_CHANGES),
    ...recurrenceLines(gym),
    ...at(
      'CB PHARMACIE DU PORT',
      'pharmacy',
      { '2026-08': 2, [SEPTEMBER]: 2 },
      15
    ),
    ...at('CB FNAC', 'phone', everyMonth(3, 0), 40),
  ]
  const reg = registry(lines, [], undefined, [gym])

  it('keeps every month adding up from its category units: merchants and recurrences are outside the sum', () => {
    // Trends 6 to 10 read units of their own, which no month adds up:
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

  it('gives the same list for the same ledger and cache, whatever their order', () => {
    const shuffled = registry([...lines].reverse(), [], undefined, [
      { ...gym, charges: [...gym.charges] },
    ])
    expect(detect(shuffled)).toEqual(detect(reg))
  })

  it('reads lot 2 alongside the habits', () => {
    expect(
      detect(reg).insights.map(i => [i.kind, i.unit.type, i.score, i.sentence])
    ).toMatchSnapshot()
  })
})

/** One line of `subId` a month, at `amounts[month]` (100 € otherwise). */
function monthly(
  subId: string,
  amounts: Partial<Record<string, number>>,
  otherwise = 100
): TrendLine[] {
  return MONTHS.flatMap(m =>
    monthLines(m, { [subId]: [amounts[m] ?? otherwise] })
  )
}

/** The long run's units only: what trends 11 to 14 say. */
const longRun = (insights: TrendInsight[]): TrendInsight[] =>
  insights.filter(i => ['shift', 'drift', 'record', 'yearAgo'].includes(i.kind))

describe('detectTrends — a shift (trend 11)', () => {
  it('reads fewer deliveries and more restaurants as one shift, as the plan does', () => {
    const insights = detect(registry(ledger(SEPTEMBER_CHANGES))).insights
    const shift = insightOf(insights, 'restaurants')

    expect(shift).toMatchObject({
      kind: 'shift',
      unit: { type: 'category', id: 'restaurants', categoryId: 'restaurants' },
      direction: 'down',
      tone: 'neutral',
      current: 357,
      reference: 361,
      // The larger of the two gaps: where its lines would have ranked.
      score: 90,
      parts: [
        {
          unit: { type: 'subcategory', id: 'delivery' },
          kind: 'frequency',
          direction: 'down',
          delta: -6,
          amountDelta: -90,
        },
        {
          unit: { type: 'subcategory', id: 'restaurant' },
          kind: 'amount',
          direction: 'up',
          delta: 86,
          amountDelta: 86,
        },
      ],
      sentence:
        "Restaurants et bars en septembre : moins de livraison de repas (−6 achats), plus de restaurant (+86 €) que d'habitude sur les 6 mois précédents, un report plutôt qu'une économie.",
    })
    // One line for the two subcategories it links.
    expect(insightOf(insights, 'delivery')).toBeUndefined()
    expect(insightOf(insights, 'restaurant')).toBeUndefined()
  })

  it('reads the window chosen on the card', () => {
    const shift = insightOf(
      detect(registry(ledger(SEPTEMBER_CHANGES)), { window: 3 }).insights,
      'restaurants'
    )
    expect(shift?.windows.reference).toEqual({
      start: '2026-06-01',
      end: '2026-08-31',
    })
    expect(shift?.sentence).toContain('sur les 3 mois précédents')
  })

  it('stays silent when both move the same way, or one gap outweighs the other', () => {
    const sameWay = detect(
      registry(
        ledger({
          ...HABIT,
          restaurant: times(5, 62.4),
          delivery: times(15, 15),
        })
      )
    ).insights
    expect(sameWay.some(i => i.kind === 'shift')).toBe(false)

    // +300 € beside −90 €: a rise, not a shift.
    const unbalanced = detect(
      registry(
        ledger({
          ...SEPTEMBER_CHANGES,
          grocery: HABIT.grocery,
          restaurant: times(4, 131.5),
        })
      )
    ).insights
    expect(unbalanced.some(i => i.kind === 'shift')).toBe(false)
    expect(insightOf(unbalanced, 'restaurant')).toBeDefined()
    expect(insightOf(unbalanced, 'delivery')).toBeDefined()
  })

  it("stays silent when a side's amount gap is under trend 1, or points against its own trend", () => {
    // Deliveries: 5 a month at 8 €, then 2 at 10 € — 3 fewer, −20 €.
    // Bars: 10 at 2 € and 4 at 20 € month about, then 4 at 15 €: 3 fewer
    // against a median of 7, yet +10 € against a median of 50 €. Neither
    // amount passes trend 1, and the bars' money rose while their trend
    // fell: no shift, the two drops in frequency stand.
    const lines = MONTHS.flatMap((m, i) =>
      monthLines(
        m,
        m === SEPTEMBER
          ? { delivery: times(2, 10), bar: times(4, 15) }
          : {
              delivery: times(5, 8),
              bar: i % 2 === 0 ? times(10, 2) : times(4, 20),
            }
      )
    )
    const insights = detect(registry(lines)).insights

    expect(insights.some(i => i.kind === 'shift')).toBe(false)
    expect(insightOf(insights, 'delivery')).toMatchObject({
      kind: 'frequency',
      direction: 'down',
      delta: -3,
    })
    expect(insightOf(insights, 'bar')).toMatchObject({
      kind: 'frequency',
      direction: 'down',
      delta: -3,
    })
  })
})

describe('detectTrends — the long run (trends 12 to 14)', () => {
  it('reads a steady rise over six months as a drift, the habit line it replaces, the record it sets', () => {
    // Flights, one a month: 100 € until March, then 20 € more every month.
    const lines = [
      ...ledger(),
      ...monthly('flights', {
        '2026-04': 100,
        '2026-05': 120,
        '2026-06': 140,
        '2026-07': 160,
        '2026-08': 180,
        [SEPTEMBER]: 200,
      }),
    ]
    const insights = detect(registry(lines)).insights

    expect(longRun(insights)).toEqual([
      expect.objectContaining({
        kind: 'drift',
        unit: expect.objectContaining({ type: 'category', id: 'travel' }),
        direction: 'up',
        tone: 'neutral',
        current: 200,
        reference: 100,
        delta: 100,
        // 20 € a month on a 150 € mean.
        deltaPct: 13.3,
        score: 100,
        record: 'high',
        sentence:
          'Voyages : en hausse régulière depuis 6 mois, +13 % par mois (200 € en septembre), le plus haut depuis un an.',
        windows: {
          current: { start: '2026-09-01', end: '2026-09-30' },
          reference: { start: '2026-04-01', end: '2026-08-31' },
        },
      }),
    ])
    // The month against the habit says less than the slope: one line.
    expect(insightOf(insights, 'flights')).toBeUndefined()
  })

  it('says « vous avez réduit » of a steady drop only on a pleasure and variable category', () => {
    const lines = [
      ...ledger(),
      ...monthly(
        'flights',
        {
          '2026-04': 200,
          '2026-05': 180,
          '2026-06': 160,
          '2026-07': 140,
          '2026-08': 120,
          [SEPTEMBER]: 100,
        },
        200
      ),
    ]
    expect(insightOf(detect(registry(lines)).insights, 'travel')).toMatchObject(
      {
        kind: 'drift',
        direction: 'down',
        tone: 'success',
        sentence:
          'Voyages : vous avez réduit régulièrement depuis 6 mois, −13 % par mois (100 € en septembre), le plus bas depuis un an.',
      }
    )
  })

  it('takes no step for a drift, nor a noisy series', () => {
    // A subscription taken in July: a step, which a line fits well enough.
    const step = [
      ...ledger(),
      ...monthly('flights', {
        '2026-07': 200,
        '2026-08': 200,
        [SEPTEMBER]: 200,
      }),
    ]
    expect(detect(registry(step)).insights.some(i => i.kind === 'drift')).toBe(
      false
    )

    const noisy = [
      ...ledger(),
      ...monthly('flights', {
        '2026-04': 100,
        '2026-05': 190,
        '2026-06': 90,
        '2026-07': 200,
        '2026-08': 110,
        [SEPTEMBER]: 210,
      }),
    ]
    expect(detect(registry(noisy)).insights.some(i => i.kind === 'drift')).toBe(
      false
    )
  })

  it('says a record alone when the habit of the window did not move', () => {
    // Health at 200 € a month, then 70 € since June: on three months,
    // September's 60 € is the habit; on a year, the lowest.
    const health: Partial<Record<string, number>> = {
      '2026-06': 70,
      '2026-07': 70,
      '2026-08': 70,
      [SEPTEMBER]: 60,
    }
    const reg = registry(
      MONTHS.flatMap(m =>
        monthLines(m, { ...HABIT, pharmacy: [health[m] ?? 200] })
      )
    )
    const insights = detect(reg, { window: 3 }).insights

    expect(longRun(insights)).toEqual([
      expect.objectContaining({
        kind: 'record',
        record: 'low',
        direction: 'down',
        tone: 'neutral',
        current: 60,
        reference: 200,
        delta: -140,
        score: 140,
        sentence:
          "Santé : 60 € en septembre, le plus bas depuis un an (200 € par mois d'habitude sur les 11 mois précédents).",
        windows: {
          current: { start: '2026-09-01', end: '2026-09-30' },
          reference: { start: '2025-10-01', end: '2026-08-31' },
        },
      }),
    ])
  })

  it('reads the same month a year before alone when the habit did not move', () => {
    // A trip every September 2025, none since: the habit is quiet.
    const lines = [...ledger(), ...monthly('flights', { '2025-09': 600 })]
    const insights = detect(registry(lines)).insights

    expect(longRun(insights)).toEqual([
      expect.objectContaining({
        kind: 'yearAgo',
        unit: expect.objectContaining({ id: 'travel' }),
        direction: 'down',
        current: 100,
        reference: 600,
        delta: -500,
        deltaPct: -83.3,
        score: 500,
        sentence:
          'Voyages : 100 € en septembre, contre 600 € en septembre 2025 (−83 %).',
        windows: {
          current: { start: '2026-09-01', end: '2026-09-30' },
          reference: { start: '2025-09-01', end: '2025-09-30' },
        },
      }),
    ])
  })

  it('says in passing that a month off the habit was the same a year before: the season', () => {
    const season = { ...HABIT, restaurant: times(4, 81.5), bar: times(4, 25) }
    const lines = MONTHS.flatMap(m =>
      monthLines(m, m === SEPTEMBER || m === '2025-09' ? season : HABIT)
    )
    const restaurants = insightOf(
      detect(registry(lines)).insights,
      'restaurants'
    )

    expect(restaurants).toMatchObject({ kind: 'amount', direction: 'up' })
    expect(restaurants?.sentence).toBe(
      "Restaurants et bars : 561 € en septembre, +55 % par rapport à l'habitude des 6 mois précédents (361 €), le plus haut depuis un an, comme en septembre 2025 (561 €)."
    )
    expect(longRun(detect(registry(lines)).insights)).toEqual([])
  })

  it('says nothing of the long run in a ledger that does not move, in either reading', () => {
    for (const reading of ['everyday', 'real'] as const) {
      expect(detect(registry(ledger()), { reading }).insights).toEqual([])
    }
  })

  it('leaves an exceptional line out of every horizon in the everyday reading', () => {
    const lines = [
      ...ledger(),
      ...monthLines(
        SEPTEMBER,
        { flights: [1200] },
        { flights: { exceptional: true } }
      ),
    ]
    expect(longRun(detect(registry(lines)).insights)).toEqual([])
    // Read « Tout », the trip is counted: the habit says it (trend 1), and a
    // category never flown before sets no record and no year-on-year line.
    const real = detect(registry(lines), { reading: 'real' }).insights
    expect(insightOf(real, 'flights')).toMatchObject({ kind: 'amount' })
    expect(longRun(real)).toEqual([])
  })

  it('says which long comparisons the history is still too short for', () => {
    const lines = MONTHS.slice(-9).flatMap(m => monthLines(m, HABIT))
    const result = detect(registry(lines, [], '2026-01-01'))

    expect(result.completeMonths).toBe(8)
    expect(result.horizons).toEqual([
      {
        kind: 'record',
        months: 12,
        missing: 3,
        sentence:
          'Les records sur un an demandent 12 mois complets : il en manque 3.',
      },
      {
        kind: 'yearAgo',
        months: 13,
        missing: 4,
        sentence:
          "La comparaison avec l'an dernier demande 13 mois complets : il en manque 4.",
      },
    ])
    expect(detect(registry(ledger())).horizons).toEqual([])
  })

  it('never reads a record or a year before the history covers it', () => {
    // Nine months: September's trip would be a record over twelve.
    const lines = MONTHS.slice(-9).flatMap(m =>
      monthLines(m, m === SEPTEMBER ? { ...HABIT, flights: [900] } : HABIT)
    )
    const insights = detect(registry(lines, [], '2026-01-01')).insights
    expect(
      insights.some(i => i.kind === 'record' || i.kind === 'yearAgo')
    ).toBe(false)
  })
})

describe('detectTrends — savings (trend 15)', () => {
  const withFlows = (
    f: ReturnType<typeof flows>,
    historyStart?: string,
    lines: TrendLine[] = ledger()
  ): TrendRegistry => ({
    ...registry(lines, [], historyStart),
    flows: f,
  })

  it('reads the share of the income the expenses left, quarter against quarter, with what is left to live on', () => {
    // The habit spends 1 468,49 € a month: 2 000 € leave 26,6 %, 2 500 € 41,3 %.
    const insights = detect(withFlows(flows(2000, 2500))).insights

    expect(insights).toEqual([
      expect.objectContaining({
        kind: 'savings',
        unit: {
          type: 'savings',
          id: 'savings',
          categoryId: null,
          name: 'Épargne',
          icon: null,
        },
        direction: 'up',
        tone: 'neutral',
        current: 41.3,
        reference: 26.6,
        delta: 14.7,
        deltaPct: null,
        // Rent and streaming are the everyday committed spending: 663,49 €.
        remainingToLive: { current: 1836.51, reference: 1336.51 },
        // 14,7 points of a 2 500 € month.
        score: 367.12,
        sentence:
          "Épargne : 41 % du revenu de juillet à septembre, contre 27 % d'avril à juin ; reste à vivre 1 837 € par mois, contre 1 337 €.",
        windows: {
          current: { start: '2026-07-01', end: '2026-09-30' },
          reference: { start: '2026-04-01', end: '2026-06-30' },
        },
        series: [26.6, 26.6, 26.6, 26.6, 41.3, 41.3, 41.3],
      }),
    ])
  })

  it('says a quarter that spent more than it earned', () => {
    const insight = detect(withFlows(flows(2000, 1300))).insights[0]

    expect(insight).toMatchObject({
      kind: 'savings',
      direction: 'down',
      current: -13,
    })
    expect(insight?.sentence).toMatch(
      /^Épargne : −13 % du revenu de juillet à septembre, contre 27 % d'avril à juin ;/
    )
  })

  it('counts every expense, the exceptional ones too, whatever the card reads', () => {
    // A 900 € holiday in August: out of the everyday card, never out of
    // what the quarter kept.
    const trip: TrendLine = {
      id: 'trip',
      date: '2026-08-12',
      amount: 900,
      categoryId: 'travel',
      subcategoryId: null,
      nature: 'PLEASURE',
      rhythm: 'VARIABLE',
      isRecurring: false,
      isExceptional: true,
      description: 'HOTEL',
    }
    for (const reading of ['everyday', 'real'] as const) {
      const insight = detect(
        withFlows(flows(2000), undefined, [...ledger(), trip]),
        { reading }
      ).insights.find(i => i.kind === 'savings')

      // (6 000 − 3 × 1 468,49 − 900) / 6 000 against 26,6 %.
      expect(insight).toMatchObject({
        direction: 'down',
        current: 11.6,
        reference: 26.6,
        // The holiday is not committed: what is left to live on holds.
        remainingToLive: { current: 1336.51, reference: 1336.51 },
      })
    }
  })

  it('never follows the card window: a quarter is three months whatever the window', () => {
    for (const window of TREND_RULES.windows) {
      expect(
        detect(withFlows(flows(2000, 2500)), { window }).insights[0]?.windows
      ).toEqual({
        current: { start: '2026-07-01', end: '2026-09-30' },
        reference: { start: '2026-04-01', end: '2026-06-30' },
      })
    }
  })

  it('stays silent under 3 points, without income, or when nothing moves', () => {
    // 28,4 % against 26,6 %.
    expect(detect(withFlows(flows(2000, 2050))).insights).toEqual([])
    expect(detect(withFlows(flows(0))).insights).toEqual([])
    expect(detect(withFlows(flows(0, 2500))).insights).toEqual([])
    expect(detect(withFlows(flows(2000))).insights).toEqual([])
    // Without the flows read, there is nothing to say.
    expect(detect(registry(ledger())).insights).toEqual([])
  })

  it('waits for six complete months, and says so', () => {
    // From May: four complete months before September.
    const result = detect(withFlows(flows(2000, 2500), '2026-05-01'))

    expect(result.insights.some(i => i.kind === 'savings')).toBe(false)
    expect(result.horizons.map(h => [h.kind, h.missing])).toEqual([
      ['drift', 1],
      ['savings', 1],
      ['record', 7],
      ['yearAgo', 8],
    ])
    expect(result.horizons[1]?.sentence).toBe(
      "L'épargne d'un trimestre sur l'autre demande 6 mois complets : il en manque 1."
    )
  })

  it('leaves the sum of a month to its expense units', () => {
    const reg = withFlows(flows(2000, 2500))
    for (const aggregate of aggregateMonths(reg, 'everyday', MONTHS).values()) {
      const units = [...aggregate.units]
        .filter(([key]) => key.startsWith('category:'))
        .reduce((sum, [, unit]) => sum + unit.amount, 0)
      expect(units + aggregate.uncategorized).toBeCloseTo(aggregate.total, 9)
    }
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

describe('headlineOf — the sentence above the tiles', () => {
  const insight = (
    kind: TrendInsight['kind'],
    overrides: Partial<TrendInsight> = {}
  ): TrendInsight => ({
    kind,
    unit: {
      type: 'subcategory',
      id: 'sub',
      categoryId: 'cat',
      name: 'Restaurant',
      icon: null,
    },
    direction: 'up',
    tone: 'neutral',
    current: 2,
    reference: 1,
    delta: 1,
    deltaPct: 100,
    sentence: '',
    windows: {
      current: { start: '2026-09-01', end: '2026-09-30' },
      reference: { start: '2026-03-01', end: '2026-08-31' },
    },
    series: [],
    score: 1,
    ...overrides,
  })
  const merchant = {
    type: 'merchant' as const,
    id: 'picard',
    categoryId: 'cat',
    name: 'Picard',
    icon: null,
  }
  const one = (i: TrendInsight): string | null => headlineOf([i], 'septembre')

  it.each([
    [insight('amount'), 'Septembre : plus de dépenses en restaurant.'],
    [
      insight('amount', { direction: 'down', tone: 'success' }),
      'Septembre : vous avez réduit vos dépenses en restaurant.',
    ],
    [
      insight('amount', { direction: 'down' }),
      'Septembre : moins de dépenses en restaurant.',
    ],
    [insight('frequency'), "Septembre : plus d'achats en restaurant."],
    [
      insight('frequency', { direction: 'down', tone: 'success' }),
      'Septembre : vous avez réduit vos achats en restaurant.',
    ],
    [
      insight('frequency', { unit: merchant }),
      'Septembre : plus souvent chez Picard.',
    ],
    [
      insight('frequency', { unit: merchant, direction: 'down' }),
      'Septembre : moins souvent chez Picard.',
    ],
    [insight('basket'), 'Septembre : un panier plus élevé en restaurant.'],
    [
      insight('basket', { direction: 'down' }),
      'Septembre : un panier plus léger en restaurant.',
    ],
    [
      insight('share', {
        unit: { ...merchant, type: 'structure', id: 'pleasure' },
      }),
      'Septembre : la part plaisir en hausse.',
    ],
    [
      insight('share', {
        unit: { ...merchant, type: 'structure', id: 'committed' },
        direction: 'down',
      }),
      'Septembre : la part engagée en baisse.',
    ],
    [
      insight('subscription', {
        unit: { ...merchant, type: 'recurrence', name: 'Disney Plus' },
      }),
      'Septembre : un nouvel abonnement (Disney Plus).',
    ],
    [
      insight('subscription', {
        unit: { ...merchant, type: 'recurrence', name: 'Netflix' },
        direction: 'down',
      }),
      'Septembre : un abonnement en moins (Netflix).',
    ],
    [
      insight('price', {
        unit: { ...merchant, type: 'recurrence', name: 'Orange' },
      }),
      'Septembre : Orange plus cher.',
    ],
    [
      insight('newHabit', { unit: merchant }),
      'Septembre : une nouvelle habitude chez Picard.',
    ],
    [
      insight('lostHabit', { direction: 'down' }),
      'Septembre : plus rien en restaurant.',
    ],
    [
      insight('shift', {
        unit: { ...merchant, type: 'category', name: 'Restaurants et bars' },
        parts: [
          {
            unit: { ...merchant, type: 'subcategory', name: 'Livraison' },
            kind: 'frequency',
            direction: 'down',
            delta: -6,
            amountDelta: -90,
          },
          {
            unit: { ...merchant, type: 'subcategory', name: 'Restaurant' },
            kind: 'amount',
            direction: 'up',
            delta: 86,
            amountDelta: 86,
          },
        ],
      }),
      'Septembre : un report de livraison vers restaurant.',
    ],
    [insight('drift'), 'Septembre : une hausse régulière en restaurant.'],
    [
      insight('record', { record: 'high' }),
      'Septembre : un record sur un an en restaurant.',
    ],
    [
      insight('record', { record: 'low', direction: 'down' }),
      "Septembre : le mois le plus bas de l'année en restaurant.",
    ],
    [insight('yearAgo'), "Septembre : plus qu'il y a un an en restaurant."],
    [
      insight('savings', { unit: { ...merchant, type: 'savings' } }),
      'Septembre : vous avez mis plus de côté.',
    ],
    [
      insight('savings', {
        unit: { ...merchant, type: 'savings' },
        direction: 'down',
      }),
      'Septembre : une épargne en baisse.',
    ],
  ])('says %j in a clause', (input, expected) => {
    expect(one(input)).toBe(expected)
    expect(one(input)).not.toMatch(/\d/)
  })

  it('never says « vous avez réduit » on a drop the detection did not call a success', () => {
    for (const kind of [
      'amount',
      'frequency',
      'basket',
      'drift',
      'record',
      'yearAgo',
    ] as const) {
      expect(
        one(insight(kind, { direction: 'down', record: 'low' }))
      ).not.toContain('réduit')
    }
  })

  it('joins the two largest gaps with « , et », and leaves the lines to file out', () => {
    expect(
      headlineOf(
        [
          insight('uncategorized', { direction: 'up' }),
          insight('frequency', { unit: merchant }),
          insight('savings', { unit: { ...merchant, type: 'savings' } }),
          insight('amount'),
        ],
        'septembre'
      )
    ).toBe(
      'Septembre : plus souvent chez Picard, et vous avez mis plus de côté.'
    )
  })

  it('is null without a trend to tell', () => {
    expect(headlineOf([], 'septembre')).toBeNull()
    expect(headlineOf([insight('uncategorized')], 'septembre')).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import {
  TREND_RULES,
  aggregateMonths,
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

import { describe, it, expect } from 'vitest'
import {
  detect,
  detectRecurrences,
  type DetectedRecurrence,
  type RecurrenceExpense,
  type RecurrencePeriod,
  type SubscriptionInput,
} from './recurrence.detection'
import {
  READ_AT,
  amv,
  apple,
  hevyPaypal,
  netflix,
  rent,
} from './recurrence.fixtures'

const now = READ_AT

let subscriptionCount = 0

/** A subscription as the user's gestures leave it: one spelling, one price. */
function sub(choice: {
  merchantKey: string
  amountBucket: number | null
  decision: 'CONFIRMED' | 'DISMISSED'
  period?: RecurrencePeriod
  name?: string
}): SubscriptionInput {
  subscriptionCount++
  return {
    id: `sub-${subscriptionCount}`,
    merchantKeys: [choice.merchantKey],
    amountBuckets: choice.amountBucket === null ? [] : [choice.amountBucket],
    state: choice.decision,
    period: choice.period ?? null,
    name: choice.name ?? null,
  }
}

const subs = (choices: Parameters<typeof sub>[0][]): SubscriptionInput[] =>
  choices.map(sub)

function monthly(
  prefix: string,
  dates: string[],
  amount: number,
  description: string
): RecurrenceExpense[] {
  return dates.map((date, index) => ({
    id: `${prefix}-${index + 1}`,
    date: new Date(`${date}T00:00:00.000Z`),
    amount: -amount,
    description,
    categoryId: `${prefix}-cat`,
    subcategoryId: `${prefix}-sub`,
  }))
}

function only(found: DetectedRecurrence[]): DetectedRecurrence {
  expect(found).toHaveLength(1)
  return found[0]
}

describe('detectRecurrences — real ledgers', () => {
  it('follows Netflix through its price changes as one subscription', () => {
    const netflixRecurrence = only(detectRecurrences(netflix, { now }))

    expect(netflixRecurrence).toMatchObject({
      merchantKey: 'europe paypal',
      label: 'Prlv Sepa Paypal Europe S.a.r.l',
      period: 'MONTHLY',
      amount: 14.99,
      amountBucket: 15,
      monthlyEquivalent: 14.99,
      status: 'ACTIVE',
      firstDate: new Date('2026-02-02T00:00:00.000Z'),
      lastDate: new Date('2026-09-01T00:00:00.000Z'),
      nextExpected: new Date('2026-10-01T00:00:00.000Z'),
      occurrences: 8,
      categoryId: 'netflix-cat',
      subcategoryId: 'netflix-sub',
    })
    // The lone 14.99 of January stands before the plan change, a month
    // too early to be part of either run.
    expect(netflixRecurrence.transactionIds).not.toContain('netflix-1')
  })

  it('tells Netflix and Hevy apart under the same PayPal label', () => {
    const found = detectRecurrences([...netflix, ...hevyPaypal], { now })

    expect(found.map(r => r.amount)).toEqual([14.99])
  })

  it('finds no rhythm in two charges five months apart', () => {
    expect(detectRecurrences(hevyPaypal, { now })).toEqual([])
  })

  it('splits Apple into its monthly and its yearly services, and ignores the purchases', () => {
    const found = detectRecurrences(apple, { now })

    expect(
      found.map(r => ({
        amount: r.amount,
        period: r.period,
        status: r.status,
        occurrences: r.occurrences,
      }))
    ).toEqual([
      { amount: 9.99, period: 'MONTHLY', status: 'ACTIVE', occurrences: 15 },
      { amount: 39.99, period: 'YEARLY', status: 'ACTIVE', occurrences: 2 },
    ])
    const yearly = found[1]
    expect(yearly.monthlyEquivalent).toBe(3.33)
    expect(yearly.nextExpected).toEqual(new Date('2027-08-25T00:00:00.000Z'))
  })

  it('does not claim a purchase that falls between two monthly charges at nearly the same price', () => {
    const [monthlyService] = detectRecurrences(apple, { now })

    // 2025-10-13, 10.99: within a euro of 9.99, a week after the October charge.
    expect(monthlyService.transactionIds).not.toContain('apple-10')
    expect(monthlyService.transactionIds).toHaveLength(15)
  })

  it('keeps the rent as one charge across its labels, its revision and its late months', () => {
    const rentRecurrence = only(detectRecurrences(rent, { now }))

    expect(rentRecurrence).toMatchObject({
      period: 'MONTHLY',
      amount: 660,
      amountBucket: 660,
      monthlyEquivalent: 660,
      status: 'ACTIVE',
      occurrences: 15,
    })
    expect(rentRecurrence.merchantKey).toBe('claire durand martin paul')
  })

  it('reads two contracts at one insurer as two charges, each following its own revision', () => {
    const found = detectRecurrences(amv, { now })

    expect(
      found.map(r => ({
        amount: r.amount,
        occurrences: r.occurrences,
        status: r.status,
      }))
    ).toEqual([
      { amount: 37.3, occurrences: 15, status: 'ACTIVE' },
      { amount: 29.5, occurrences: 15, status: 'ACTIVE' },
    ])
    expect(found[0].firstDate).toEqual(new Date('2025-07-10T00:00:00.000Z'))
  })

  it('reads the whole ledger at once without mixing merchants', () => {
    const found = detectRecurrences(
      [...netflix, ...hevyPaypal, ...apple, ...rent, ...amv],
      { now }
    )

    expect(found.map(r => r.amount)).toEqual([
      660, 37.3, 29.5, 14.99, 9.99, 39.99,
    ])
    const claimed = found.flatMap(r => r.transactionIds)
    expect(new Set(claimed).size).toBe(claimed.length)
  })
})

describe('detectRecurrences — rules', () => {
  const months = [
    '2026-04-03',
    '2026-05-03',
    '2026-06-03',
    '2026-07-03',
    '2026-08-03',
    '2026-09-03',
  ]

  it('counts two lines of the same price the same month once', () => {
    const lines = [
      ...monthly('free', months, 19.99, 'Prlv Sepa Free Mobile'),
      ...monthly(
        'dup',
        ['2026-08-03', '2026-09-03'],
        19.99,
        'Prlv Sepa Free Mobile'
      ),
    ]

    const freeMobile = only(detectRecurrences(lines, { now }))
    expect(freeMobile.occurrences).toBe(6)
    expect(freeMobile.monthlyEquivalent).toBe(19.99)
    expect(freeMobile.transactionIds).toHaveLength(6)
  })

  it('reads a quarterly insurance and brings it to a month', () => {
    const lines = monthly(
      'insurance',
      ['2025-10-15', '2026-01-15', '2026-04-15', '2026-07-15'],
      120,
      'Prlv Sepa Maif Assurance Auto'
    )

    expect(only(detectRecurrences(lines, { now }))).toMatchObject({
      period: 'QUARTERLY',
      monthlyEquivalent: 40,
      nextExpected: new Date('2026-10-15T00:00:00.000Z'),
      status: 'ACTIVE',
    })
  })

  it('reads a weekly charge and brings it to a month', () => {
    const lines = monthly(
      'basket',
      ['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30'],
      12,
      'CB Panier Bio Amap'
    )

    expect(only(detectRecurrences(lines, { now }))).toMatchObject({
      period: 'WEEKLY',
      monthlyEquivalent: 52,
    })
  })

  it('leaves no trace of an annual plan once its first payment is out of reach, and finds the monthly one that replaced it', () => {
    const lines = [
      ...monthly('hevy-year', ['2025-09-15'], 23.99, 'CB Hevy App'),
      ...monthly(
        'hevy-month',
        ['2026-07-15', '2026-08-15', '2026-09-15'],
        3.49,
        'CB Hevy App'
      ),
    ]

    expect(only(detectRecurrences(lines, { now }))).toMatchObject({
      amount: 3.49,
      period: 'MONTHLY',
      status: 'ACTIVE',
    })
  })

  it('never makes a recurrence from a merchant seen once', () => {
    const lines = monthly('once', ['2026-09-12'], 49, 'CB Decathlon')

    expect(detectRecurrences(lines, { now })).toEqual([])
  })

  it('makes a candidate of two monthly charges, and nothing of two stale ones', () => {
    const recent = monthly(
      'recent',
      ['2026-08-20', '2026-09-20'],
      7.99,
      'CB Spotify'
    )
    const stale = monthly(
      'stale',
      ['2026-02-20', '2026-03-20'],
      5.99,
      'CB Deezer'
    )

    expect(detectRecurrences([...recent, ...stale], { now })).toMatchObject([
      { label: 'CB Spotify', status: 'CANDIDATE', occurrences: 2 },
    ])
  })

  it('marks a charge that missed two periods as stopped, and keeps it for good', () => {
    const lines = monthly(
      'gym',
      ['2026-03-05', '2026-04-05', '2026-05-05', '2026-06-05'],
      29.99,
      'Prlv Sepa Fitness Park'
    )

    expect(only(detectRecurrences(lines, { now })).status).toBe('STOPPED')
    expect(
      only(
        detectRecurrences(lines, { now: new Date('2029-03-01T00:00:00.000Z') })
      )
    ).toMatchObject({
      status: 'STOPPED',
      firstDate: new Date('2026-03-05T00:00:00.000Z'),
      lastDate: new Date('2026-06-05T00:00:00.000Z'),
      totalPaid: 119.96,
    })
  })

  it('totals what a series cost across its price changes', () => {
    // Netflix: 21.99 twice, then 14.99 six times.
    expect(only(detectRecurrences(netflix, { now })).totalPaid).toBe(133.92)
  })

  it('ignores lines whose label is only bank noise', () => {
    const lines = monthly('noise', months, 10, 'CB 12/09/26 *1234')

    expect(detectRecurrences(lines, { now })).toEqual([])
  })

  it('gives the same answer twice', () => {
    const all = [...netflix, ...apple, ...rent, ...amv]

    expect(detectRecurrences(all, { now })).toEqual(
      detectRecurrences([...all].reverse(), { now })
    )
  })
})

/** Lines from `start`, each `gaps[i]` days after the previous one. */
function spaced(
  prefix: string,
  start: string,
  gaps: number[],
  amount: number,
  description: string
): RecurrenceExpense[] {
  const dates = [new Date(`${start}T00:00:00.000Z`)]
  for (const gap of gaps) {
    const next = new Date(dates[dates.length - 1] ?? 0)
    next.setUTCDate(next.getUTCDate() + gap)
    dates.push(next)
  }
  return dates.map((date, index) => ({
    id: `${prefix}-${index + 1}`,
    date,
    amount: -amount,
    description,
    categoryId: `${prefix}-cat`,
    subcategoryId: `${prefix}-sub`,
  }))
}

describe('detectRecurrences — habits are not commitments', () => {
  // Gaps and counts below are those of production rows read on 2026-10-07.

  it('leaves out a laundry used every week or so', () => {
    const laundry = spaced(
      'laundry',
      '2025-07-14',
      [
        6, 8, 6, 9, 5, 9, 5, 7, 16, 5, 8, 6, 7, 10, 8, 7, 12, 6, 6, 7, 7, 11,
        10, 7, 10, 5, 6, 8, 7, 7, 7, 7, 6, 15, 8, 12, 8, 7, 6, 10, 11, 8, 6, 7,
        11, 5, 5, 7, 9, 6, 6, 10, 11, 7, 7, 8, 6,
      ],
      5,
      'CB Cbs Services'
    )

    // 42 more passes at the same price, a day or two after a weekly one.
    const between = laundry.slice(0, 42).map((line, index) => ({
      ...line,
      id: `laundry-extra-${index + 1}`,
      date: new Date(line.date.getTime() + (1 + (index % 2)) * 86_400_000),
    }))

    expect(detectRecurrences([...laundry, ...between], { now })).toEqual([])
  })

  it('keeps a clean run that follows a messy year', () => {
    // A rent whose 2025 transfers were partly labelled with another sender:
    // three months missing from the run, then fourteen clean ones.
    const messy = spaced(
      'rent-old',
      '2025-01-01',
      [29, 60, 62, 66],
      650,
      'Vir Sepa Martin Paul'
    )
    const clean = spaced(
      'rent',
      '2025-09-02',
      [29, 32, 30, 30, 31, 31, 28, 33, 28, 36, 27, 29, 30],
      660,
      'Vir Sepa Martin Paul'
    )

    expect(
      only(detectRecurrences([...messy, ...clean], { now }))
    ).toMatchObject({
      amount: 660,
      status: 'ACTIVE',
      // The clean fourteen, and the August 2025 transfer that opens them.
      occurrences: 15,
    })
  })

  it('keeps a yearly plan apart from purchases at the same brand', () => {
    const prime = spaced(
      'prime',
      '2025-04-01',
      [365],
      69.9,
      'CB Amazon Prime Fr'
    )
    const purchases = [
      ...spaced('mktp', '2025-05-10', [40, 70, 33], 68.5, 'CB Amazon Payments'),
      ...spaced('sarl', '2025-09-10', [50, 61], 71.2, 'CB Amazon Sarl'),
      ...spaced('bare', '2026-02-03', [20], 70.1, 'CB Amazon'),
    ]

    expect(detectRecurrences([...prime, ...purchases], { now })).toMatchObject([
      { amount: 69.9, period: 'YEARLY', status: 'ACTIVE' },
    ])
  })

  it('reads a sender-labelled transfer as the same landlord', () => {
    const rent = [
      ...spaced(
        'a',
        '2026-03-01',
        [61, 61],
        660,
        'Vir Sepa Martin Paul Virement De Claire Durand'
      ),
      ...spaced(
        'b',
        '2026-04-01',
        [61],
        660,
        'Vir Sepa Martin Paul Virement De Jean Dupont'
      ),
      ...spaced('c', '2026-08-01', [31], 660, 'Vir Sepa Martin Paul'),
    ]

    expect(only(detectRecurrences(rent, { now }))).toMatchObject({
      period: 'MONTHLY',
      occurrences: 7,
      status: 'ACTIVE',
    })
  })

  it('leaves out a toll whose few on-rhythm passes sit among many others', () => {
    const onRhythm = spaced(
      'toll',
      '2026-06-15',
      [35, 35, 35],
      4.4,
      'CB Atlandes'
    )
    const others = spaced(
      'toll-other',
      '2025-11-02',
      [3, 9, 2, 14, 6, 21, 4, 5, 30, 2, 8, 11, 3, 16, 7, 1, 12, 4],
      4.4,
      'CB Atlandes'
    )

    // On its own, the run would read as monthly.
    expect(detectRecurrences(onRhythm, { now })).toMatchObject([
      { period: 'MONTHLY', status: 'ACTIVE' },
    ])
    expect(detectRecurrences([...onRhythm, ...others], { now })).toEqual([])
  })

  it('does not read train tickets 84 then 175 days apart as quarterly', () => {
    const train = spaced(
      'train',
      '2025-12-08',
      [84, 175],
      122.4,
      'CB Sncf Voyageurs'
    )

    expect(detectRecurrences(train, { now })).toEqual([])
  })

  it('does not read a café every 42, 42 and 63 days as monthly', () => {
    const cafe = spaced('cafe', '2026-03-08', [42, 42, 63], 2.99, 'CB Nyx*cafe')

    expect(detectRecurrences(cafe, { now })).toEqual([])
  })

  it('does not read two purchases 374 days apart as an annual plan', () => {
    const shop = spaced('shop', '2025-08-28', [374], 17.33, 'Vir Corner Auchan')

    expect(detectRecurrences(shop, { now })).toEqual([])
  })

  it('keeps a subscription with one missed charge', () => {
    const app = spaced(
      'app',
      '2025-10-03',
      [31, 32, 29, 30, 58, 34, 28, 30, 33, 28, 31],
      9.99,
      'CB Apple.com/bill'
    )

    expect(only(detectRecurrences(app, { now }))).toMatchObject({
      period: 'MONTHLY',
      status: 'ACTIVE',
      occurrences: 12,
    })
  })
})

describe('detectRecurrences — when a charge has ended', () => {
  const series = (last: string): RecurrenceExpense[] =>
    spaced('plan', last, [], 12, 'Prlv Sepa Orange').concat(
      spaced('plan-before', '2026-06-01', [30, 30], 12, 'Prlv Sepa Orange')
    )

  it('keeps a monthly running up to 38 days after its last charge', () => {
    // 2026-08-30 to 2026-10-07: 38 days.
    expect(only(detectRecurrences(series('2026-08-30'), { now })).status).toBe(
      'ACTIVE'
    )
  })

  it('ends a monthly the day after', () => {
    // 2026-08-29 to 2026-10-07: 39 days.
    expect(only(detectRecurrences(series('2026-08-29'), { now })).status).toBe(
      'STOPPED'
    )
  })
})

describe('detectRecurrences — four-weekly billing', () => {
  it('reads a gym billed every 28 days as thirteen charges a year', () => {
    const gym = spaced(
      'gym',
      '2026-01-20',
      [28, 28, 28, 28, 28, 28, 56, 28],
      50,
      'Prlv Sepa Fitness Park'
    )

    expect(only(detectRecurrences(gym, { now }))).toMatchObject({
      period: 'FOUR_WEEKLY',
      monthlyEquivalent: 54.17,
      lastDate: new Date('2026-09-29T00:00:00.000Z'),
      nextExpected: new Date('2026-10-27T00:00:00.000Z'),
      status: 'ACTIVE',
    })
  })

  it('keeps a calendar month monthly, February included', () => {
    const plan = spaced(
      'plan',
      '2026-06-30',
      [31, 31, 30],
      12,
      'Prlv Sepa Orange'
    )

    expect(only(detectRecurrences(plan, { now })).period).toBe('MONTHLY')
  })
})

describe('detectRecurrences — names and hand-made links', () => {
  // Strava, as production carries it: a year by transfer at 46.99, renewed
  // by card at 59.99 under a label sharing one word with the first.
  const strava = [
    ...monthly(
      'strava-2025',
      ['2025-02-10'],
      46.99,
      'Vir Corner Strava Qwertys Billeterie Réf'
    ),
    ...monthly('strava-2026', ['2026-02-11'], 59.99, 'CB Strava Ireland Li'),
  ]
  const markedAnnual = sub({
    merchantKey: 'ireland strava',
    amountBucket: 60,
    decision: 'CONFIRMED' as const,
    period: 'YEARLY' as const,
  })

  it('names a series after the service its labels name', () => {
    expect(only(detectRecurrences(netflix, { now })).name).toBe('Paypal')
    expect(only(detectRecurrences(rent, { now })).name).toBe('Martin Paul')
  })

  it('names a series the way the user named it', () => {
    const found = detectRecurrences(netflix, {
      now,
      subscriptions: subs([
        {
          merchantKey: 'europe paypal',
          amountBucket: 15,
          decision: 'CONFIRMED',
          name: 'Netflix',
        },
      ]),
    })

    expect(only(found)).toMatchObject({ name: 'Netflix', amount: 14.99 })
  })

  it('cannot bring the two Strava payments together on its own', () => {
    expect(
      detectRecurrences(strava, { now, subscriptions: [markedAnnual] })
    ).toMatchObject([{ occurrences: 1, amount: 59.99 }])
  })

  it('folds the payment the user attached into the series, whatever its label and price', () => {
    const found = detectRecurrences(strava, {
      now,
      subscriptions: [markedAnnual],
      links: [
        {
          transactionId: 'strava-2025-1',
          subscriptionId: markedAnnual.id,
        },
      ],
    })

    expect(only(found)).toMatchObject({
      name: 'Strava',
      period: 'YEARLY',
      status: 'ACTIVE',
      amount: 59.99,
      occurrences: 2,
      totalPaid: 106.98,
      firstDate: new Date('2025-02-10T00:00:00.000Z'),
      transactionIds: ['strava-2025-1', 'strava-2026-1'],
    })
  })

  it('leaves an attached line out of every other series', () => {
    const paypal = [
      ...netflix,
      ...monthly(
        'odd',
        ['2025-06-02'],
        14.99,
        'Prlv Sepa Paypal Europe S.a.r.l'
      ),
    ]
    const found = detectRecurrences([...paypal, ...strava], {
      now,
      subscriptions: [markedAnnual],
      links: [
        {
          transactionId: 'odd-1',
          subscriptionId: markedAnnual.id,
        },
      ],
    })

    const claimed = found.flatMap(r => r.transactionIds)
    expect(claimed.filter(id => id === 'odd-1')).toHaveLength(1)
    expect(found.find(r => r.name === 'Strava')?.transactionIds).toContain(
      'odd-1'
    )
  })
})

describe('detect — subscriptions keep their identity', () => {
  it('learns the spellings and prices of the series it recognised', () => {
    // Followed when Netflix cost 21.99; it has moved back to 14.99 since.
    const followed = sub({
      merchantKey: 'europe paypal',
      amountBucket: 22,
      decision: 'CONFIRMED',
      name: 'Netflix',
    })

    const { recurrences, learned } = detect(netflix, {
      now,
      subscriptions: [followed],
    })

    expect(only(recurrences)).toMatchObject({
      subscriptionId: followed.id,
      name: 'Netflix',
      amount: 14.99,
    })
    expect(learned.get(followed.id)).toEqual({
      merchantKeys: ['europe paypal'],
      amountBuckets: [15, 22],
    })
  })

  it('follows a landlord across the spellings its transfers take', () => {
    const followed = sub({
      merchantKey: 'martin paul',
      amountBucket: 650,
      decision: 'CONFIRMED',
      name: 'Loyer',
    })

    const { recurrences, learned } = detect(rent, {
      now,
      subscriptions: [followed],
    })

    expect(only(recurrences).name).toBe('Loyer')
    expect(learned.get(followed.id)?.merchantKeys).toEqual([
      'claire durand martin paul',
      'martin paul',
    ])
  })

  it('is one series at most, whatever else it could match', () => {
    // A subscription covering every Apple price recognises one series; the
    // other stays a plain detected one.
    const followed = sub({
      merchantKey: 'apple bill com',
      amountBucket: null,
      decision: 'CONFIRMED',
    })

    const found = detectRecurrences(apple, { now, subscriptions: [followed] })

    expect(found.filter(r => r.subscriptionId === followed.id)).toHaveLength(1)
    expect(found).toHaveLength(2)
  })

  it('builds a series from the lines attached to it alone', () => {
    const strava = [
      ...monthly('a', ['2025-02-10'], 46.99, 'Vir Corner Strava Qwertys'),
      ...monthly('b', ['2026-02-11'], 59.99, 'CB Strava Ireland Li'),
    ]
    const followed = sub({
      merchantKey: 'strava',
      amountBucket: 60,
      decision: 'CONFIRMED',
      period: 'YEARLY',
    })

    const found = detectRecurrences(strava, {
      now,
      subscriptions: [followed],
      links: [
        { transactionId: 'a-1', subscriptionId: followed.id },
        { transactionId: 'b-1', subscriptionId: followed.id },
      ],
    })

    expect(only(found)).toMatchObject({
      subscriptionId: followed.id,
      name: 'Strava',
      period: 'YEARLY',
      occurrences: 2,
    })
  })

  it('leaves a subscription that finds no line out of the list', () => {
    const orphan = sub({
      merchantKey: 'deezer',
      amountBucket: 11,
      decision: 'CONFIRMED',
    })

    const { recurrences, learned } = detect(netflix, {
      now,
      subscriptions: [orphan],
    })

    expect(recurrences.some(r => r.subscriptionId === orphan.id)).toBe(false)
    expect(learned.has(orphan.id)).toBe(false)
  })
})

describe('detectRecurrences — decisions', () => {
  const spotify = monthly(
    'spotify',
    ['2026-08-20', '2026-09-20'],
    7.99,
    'CB Spotify'
  )

  it('removes a dismissed series and leaves the other series of the merchant', () => {
    const found = detectRecurrences(apple, {
      now,
      subscriptions: subs([
        {
          merchantKey: 'apple bill com',
          amountBucket: 40,
          decision: 'DISMISSED',
        },
      ]),
    })

    expect(found.map(r => r.amount)).toEqual([9.99])
  })

  it('removes every series of a merchant dismissed without a price', () => {
    const found = detectRecurrences(apple, {
      now,
      subscriptions: subs([
        {
          merchantKey: 'apple bill com',
          amountBucket: null,
          decision: 'DISMISSED',
        },
      ]),
    })

    expect(found).toEqual([])
  })

  it('keeps a dismissal across a price change it was made before', () => {
    const found = detectRecurrences(rent, {
      now,
      subscriptions: subs([
        {
          merchantKey: 'claire durand martin paul',
          amountBucket: 650,
          decision: 'DISMISSED',
        },
      ]),
    })

    expect(found).toEqual([])
  })

  it('matches a decision made under another spelling of the merchant', () => {
    const found = detectRecurrences(rent, {
      now,
      subscriptions: subs([
        {
          merchantKey: 'martin paul',
          amountBucket: null,
          decision: 'DISMISSED',
        },
      ]),
    })

    expect(found).toEqual([])
  })

  it('promotes a confirmed candidate', () => {
    const found = detectRecurrences(spotify, {
      now,
      subscriptions: subs([
        { merchantKey: 'spotify', amountBucket: 8, decision: 'CONFIRMED' },
      ]),
    })

    expect(only(found).status).toBe('ACTIVE')
  })

  it('keeps a confirmed charge listed when it stops being regular', () => {
    const irregular = monthly(
      'piano',
      [
        '2026-01-05',
        '2026-01-20',
        '2026-04-18',
        '2026-05-01',
        '2026-08-20',
        '2026-09-10',
      ],
      17.99,
      'CB Simply Piano'
    )

    expect(detectRecurrences(irregular, { now })).toEqual([])
    expect(
      only(
        detectRecurrences(irregular, {
          now,
          subscriptions: subs([
            {
              merchantKey: 'piano simply',
              amountBucket: 18,
              decision: 'CONFIRMED',
            },
          ]),
        })
      )
    ).toMatchObject({
      period: 'MONTHLY',
      status: 'ACTIVE',
      occurrences: 6,
    })
  })

  it('lists an annual plan the user marked after its first payment', () => {
    const app = monthly('app', ['2026-03-12'], 49.99, 'CB Strava Annual')

    expect(detectRecurrences(app, { now })).toEqual([])
    expect(
      only(
        detectRecurrences(app, {
          now,
          subscriptions: subs([
            {
              merchantKey: 'annual strava',
              amountBucket: 50,
              decision: 'CONFIRMED',
              period: 'YEARLY',
            },
          ]),
        })
      )
    ).toMatchObject({
      period: 'YEARLY',
      status: 'ACTIVE',
      occurrences: 1,
      monthlyEquivalent: 4.17,
      nextExpected: new Date('2027-03-12T00:00:00.000Z'),
    })
  })

  it('ends a marked annual plan once a year and a week pass without renewal', () => {
    const app = monthly('app', ['2025-09-01'], 49.99, 'CB Strava Annual')
    const decisions = subs([
      {
        merchantKey: 'annual strava',
        amountBucket: 50,
        decision: 'CONFIRMED' as const,
        period: 'YEARLY' as const,
      },
    ])

    // 2025-09-01 to 2026-10-07: 401 days, past the 372 the window allows.
    expect(
      only(detectRecurrences(app, { now, subscriptions: decisions })).status
    ).toBe('STOPPED')
  })

  it('folds the renewal of a marked plan into the same recurrence', () => {
    const app = monthly(
      'app',
      ['2025-03-12', '2026-03-12'],
      49.99,
      'CB Strava Annual'
    )

    expect(
      only(
        detectRecurrences(app, {
          now,
          subscriptions: subs([
            {
              merchantKey: 'annual strava',
              amountBucket: 50,
              decision: 'CONFIRMED',
              period: 'YEARLY',
            },
          ]),
        })
      )
    ).toMatchObject({ period: 'YEARLY', occurrences: 2, totalPaid: 99.98 })
  })

  it('lets a decision about one merchant leave the others alone', () => {
    const found = detectRecurrences([...spotify, ...rent], {
      now,
      subscriptions: subs([
        { merchantKey: 'spotify', amountBucket: null, decision: 'DISMISSED' },
      ]),
    })

    expect(found.map(r => r.amount)).toEqual([660])
  })
})

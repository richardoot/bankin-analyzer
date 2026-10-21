import { describe, it, expect } from 'vitest'
import type { TrendInsightDto, TrendKind, TrendUnitDto } from '@/lib/api'
import {
  BADGE_CLASSES,
  TREND_GROUPS,
  badgeLabel,
  badgeText,
  fallbackIcon,
  hasTrendReference,
  hueOf,
  tileEuros,
  tileOf,
  trendGroupOf,
  type TrendTile,
} from './trends'

function line(
  kind: TrendKind,
  type: TrendUnitDto['type']
): Pick<TrendInsightDto, 'kind' | 'unit'> {
  return {
    kind,
    unit: { type, id: 'u', categoryId: null, name: 'u', icon: null },
  }
}

describe('trendGroupOf', () => {
  it('files the groups in their order of display', () => {
    expect(TREND_GROUPS.map(g => g.title)).toEqual([
      'Abonnements et charges',
      'Catégories',
      'Enseignes',
      "Vue d'ensemble",
    ])
    expect(TREND_GROUPS.map(g => g.tab)).toEqual([
      'Abonnements',
      'Catégories',
      'Enseignes',
      "Vue d'ensemble",
    ])
  })

  it('keeps the lines to file out of every group', () => {
    expect(trendGroupOf(line('uncategorized', 'uncategorized'))).toBeNull()
  })

  it('files subscriptions and prices under the charges', () => {
    expect(trendGroupOf(line('subscription', 'recurrence'))).toBe('charges')
    expect(trendGroupOf(line('price', 'recurrence'))).toBe('charges')
  })

  it.each([
    'amount',
    'frequency',
    'basket',
    'shift',
    'drift',
    'record',
    'yearAgo',
  ] as const)(
    'files %s on a category or a subcategory under the categories',
    kind => {
      expect(trendGroupOf(line(kind, 'category'))).toBe('categories')
      expect(trendGroupOf(line(kind, 'subcategory'))).toBe('categories')
    }
  )

  it('files a habit that came or went, and a merchant frequency, under the merchants', () => {
    expect(trendGroupOf(line('newHabit', 'merchant'))).toBe('merchants')
    expect(trendGroupOf(line('lostHabit', 'merchant'))).toBe('merchants')
    expect(trendGroupOf(line('frequency', 'merchant'))).toBe('merchants')
  })

  it('files a habit lost on a subcategory under the categories', () => {
    expect(trendGroupOf(line('lostHabit', 'subcategory'))).toBe('categories')
    expect(trendGroupOf(line('lostHabit', 'category'))).toBe('categories')
  })

  it('files shares and savings under the overview', () => {
    expect(trendGroupOf(line('share', 'structure'))).toBe('overview')
    expect(trendGroupOf(line('savings', 'savings'))).toBe('overview')
  })

  it('files a kind it does not know under the categories', () => {
    const unknown = line('amount', 'category')
    expect(
      trendGroupOf({ ...unknown, kind: 'someday' as unknown as TrendKind })
    ).toBe('categories')
  })
})

/** A trend of September against the six months before, to vary. */
function trend(
  kind: TrendKind,
  overrides: Partial<TrendInsightDto> = {}
): TrendInsightDto {
  return {
    kind,
    unit: {
      type: 'subcategory',
      id: 'sub-restaurant',
      categoryId: 'cat-dining',
      name: 'Restaurant',
      icon: '🍽️',
    },
    direction: 'up',
    tone: 'neutral',
    current: 359,
    reference: 158,
    delta: 201,
    deltaPct: 127.2,
    sentence: 'Restaurant : 359 € en septembre.',
    windows: {
      current: { start: '2026-09-01', end: '2026-09-30' },
      reference: { start: '2026-03-01', end: '2026-08-31' },
    },
    series: [150, 160, 158, 150, 170, 158, 359],
    score: 201,
    ...overrides,
  }
}

/** Every space as a plain one: the figures use no-break spaces. */
function plain(tile: TrendTile): Omit<TrendTile, 'linkLabel'> & {
  linkLabel: string
} {
  const flat = (text: string) => text.replace(/\s/g, ' ')
  return {
    title: flat(tile.title),
    subtitle: flat(tile.subtitle),
    figure: flat(tile.figure),
    figureUnit: tile.figureUnit === null ? null : flat(tile.figureUnit),
    usual: flat(tile.usual),
    compact: flat(tile.compact),
    linkLabel: tile.linkLabel,
  }
}

const NAMES: Record<string, string> = {
  'cat-dining': 'Restaurants et bars',
  'cat-food': 'Alimentation',
}
const ctx = {
  reading: 'everyday' as const,
  categoryName: (id: string) => NAMES[id],
}

const merchant: TrendUnitDto = {
  type: 'merchant',
  id: 'picard',
  categoryId: 'cat-food',
  name: 'Picard',
  icon: null,
  search: 'picard',
}
const series: TrendUnitDto = {
  type: 'recurrence',
  id: '9:disney plus',
  categoryId: 'cat-leisure',
  name: 'Disney Plus',
  icon: null,
}

describe('tileOf', () => {
  it('writes euros whole from 20 on, to the cent below', () => {
    expect(tileEuros(359.4).replace(/\s/g, ' ')).toBe('359 €')
    expect(tileEuros(1240).replace(/\s/g, ' ')).toBe('1 240 €')
    expect(tileEuros(8.99).replace(/\s/g, ' ')).toBe('8,99 €')
    expect(tileEuros(8).replace(/\s/g, ' ')).toBe('8 €')
  })

  it.each<[string, TrendInsightDto, Partial<TrendTile>]>([
    [
      'an amount, under its parent',
      trend('amount'),
      {
        title: 'Restaurant',
        subtitle: 'Restaurants et bars · en hausse',
        figure: '359 €',
        figureUnit: null,
        usual: "d'habitude 158 €",
        compact: "359 € · d'habitude 158 €",
      },
    ],
    [
      'an amount on a category, its record said',
      trend('amount', {
        unit: {
          type: 'category',
          id: 'cat-food',
          categoryId: 'cat-food',
          name: 'Alimentation',
          icon: null,
        },
        record: 'high',
      }),
      { subtitle: 'Le plus haut depuis un an', figure: '359 €' },
    ],
    [
      'a frequency, in purchases a month',
      trend('frequency', { current: 8, reference: 3.5 }),
      {
        subtitle: 'Restaurants et bars · plus souvent',
        figure: '8',
        figureUnit: 'achats',
        usual: "d'habitude 3,5 par mois",
        compact: "8 achats · d'habitude 3,5",
      },
    ],
    [
      "a merchant's frequency",
      trend('frequency', {
        unit: merchant,
        direction: 'down',
        current: 1,
        reference: 4,
      }),
      {
        title: 'Picard',
        subtitle: 'Enseigne · moins souvent',
        figure: '1',
        figureUnit: 'achat',
      },
    ],
    [
      'a basket, per visit',
      trend('basket', {
        unit: {
          type: 'subcategory',
          id: 'sub-super',
          categoryId: 'cat-food',
          name: 'Supermarché',
          icon: null,
        },
        current: 79,
        reference: 61,
      }),
      {
        subtitle: 'Alimentation · panier moyen',
        figure: '79 €',
        figureUnit: 'par passage',
        usual: "d'habitude 61 €",
        compact: "79 € le panier · d'habitude 61 €",
      },
    ],
    [
      'a share of the everyday life',
      trend('share', {
        unit: {
          type: 'structure',
          id: 'committed',
          categoryId: null,
          name: 'Part engagée',
          icon: null,
        },
        direction: 'down',
        current: 56.2,
        reference: 64,
      }),
      {
        title: 'Part engagée',
        subtitle: 'Structure de la vie courante',
        figure: '56 %',
        figureUnit: null,
        usual: "d'habitude 64 %",
      },
    ],
    [
      'a new habit, since its first month',
      trend('newHabit', {
        unit: merchant,
        current: 5,
        reference: 0,
        windows: {
          current: { start: '2026-08-01', end: '2026-09-30' },
          reference: { start: '2026-02-01', end: '2026-07-31' },
        },
      }),
      {
        subtitle: 'Nouvelle habitude depuis août',
        figure: '5',
        figureUnit: 'achats',
        usual: 'aucun avant',
      },
    ],
    [
      'a lost habit',
      trend('lostHabit', {
        direction: 'down',
        current: 0,
        reference: 4,
      }),
      {
        subtitle: 'Habitude abandonnée depuis septembre',
        figure: 'Aucun',
        figureUnit: 'achat',
        usual: "d'habitude 4 par mois",
        compact: "aucun achat · d'habitude 4",
      },
    ],
    [
      'a subscription that appeared, a month',
      trend('subscription', {
        unit: series,
        current: 8.99,
        reference: 0,
        windows: {
          current: { start: '2026-07-01', end: '2026-09-30' },
          reference: { start: '2026-04-01', end: '2026-06-30' },
        },
      }),
      {
        title: 'Disney Plus',
        subtitle: 'Nouvel abonnement depuis juillet',
        figure: '8,99 €',
        figureUnit: '/ mois',
      },
    ],
    [
      'a subscription that stopped, at what it cost',
      trend('subscription', {
        unit: series,
        direction: 'down',
        current: 0,
        reference: 8.99,
      }),
      {
        subtitle: 'Abonnement arrêté',
        figure: '8,99 €',
        figureUnit: '/ mois',
        usual: 'plus prélevé',
      },
    ],
    [
      'a price, against the one before',
      trend('price', {
        unit: series,
        current: 15.99,
        reference: 13.49,
        windows: {
          current: { start: '2026-07-01', end: '2026-09-30' },
          reference: { start: '2026-04-01', end: '2026-06-30' },
        },
      }),
      {
        subtitle: 'Prix en hausse depuis juillet',
        figure: '15,99 €',
        figureUnit: 'par prélèvement',
        usual: 'avant 13,49 €',
      },
    ],
    [
      'a shift, by its two subcategories',
      trend('shift', {
        unit: {
          type: 'category',
          id: 'cat-dining',
          categoryId: 'cat-dining',
          name: 'Restaurants et bars',
          icon: null,
        },
        current: 357,
        reference: 361,
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
      {
        subtitle: 'Report entre deux sous-catégories',
        figure: '357 €',
        usual: 'moins de livraison, plus de restaurant',
      },
    ],
    [
      'a drift, since the start of its horizon',
      trend('drift', {
        current: 520,
        reference: 420,
        windows: {
          current: { start: '2026-09-01', end: '2026-09-30' },
          reference: { start: '2026-04-01', end: '2026-08-31' },
        },
      }),
      {
        subtitle: 'Hausse régulière depuis avril',
        figure: '520 €',
        usual: 'contre 420 € en avril',
      },
    ],
    [
      'a record low',
      trend('record', {
        record: 'low',
        direction: 'down',
        current: 45,
        reference: 120,
      }),
      {
        subtitle: 'Le plus bas depuis un an',
        figure: '45 €',
        usual: "d'habitude 120 €",
      },
    ],
    [
      'the same month a year before',
      trend('yearAgo', {
        current: 288,
        reference: 345,
        direction: 'down',
        windows: {
          current: { start: '2026-09-01', end: '2026-09-30' },
          reference: { start: '2025-09-01', end: '2025-09-30' },
        },
      }),
      {
        subtitle: "Par rapport à l'an dernier",
        figure: '288 €',
        usual: 'contre 345 € en septembre 2025',
      },
    ],
    [
      'the savings, quarter against quarter',
      trend('savings', {
        unit: {
          type: 'savings',
          id: 'savings',
          categoryId: null,
          name: 'Épargne',
          icon: null,
        },
        current: 13.2,
        reference: 3,
        remainingToLive: { current: 2152, reference: 2400 },
        windows: {
          current: { start: '2026-07-01', end: '2026-09-30' },
          reference: { start: '2026-04-01', end: '2026-06-30' },
        },
      }),
      {
        subtitle: 'Juillet à septembre · par trimestre',
        figure: '13 %',
        figureUnit: 'du revenu',
        usual: 'contre 3 % · reste à vivre 2 152 €/mois',
        compact: '13 % du revenu · contre 3 %',
        linkLabel: 'Transactions',
      },
    ],
  ])('lays out %s', (_, insight, expected) => {
    expect(plain(tileOf(insight, ctx))).toMatchObject(expected)
  })

  it('names the parent only when it is known, and says a share of all spending in « Tout »', () => {
    expect(tileOf(trend('frequency')).subtitle).toBe('Plus souvent')
    expect(
      tileOf(
        trend('share', {
          unit: {
            type: 'structure',
            id: 'pleasure',
            categoryId: null,
            name: 'Part plaisir',
            icon: null,
          },
        }),
        { reading: 'real' }
      ).subtitle
    ).toBe('Structure des dépenses')
  })

  it('links the month as « Transactions », the savings quarter too', () => {
    expect(tileOf(trend('amount')).linkLabel).toBe('Transactions')
    expect(
      tileOf(
        trend('savings', {
          unit: {
            type: 'savings',
            id: 'savings',
            categoryId: null,
            name: 'Épargne',
            icon: null,
          },
        })
      ).linkLabel
    ).toBe('Transactions')
  })
})

describe('the badge', () => {
  it('colours a rise blue, a chosen drop green, any other drop grey, the lines to file amber', () => {
    expect(hueOf(trend('amount'))).toBe('up')
    expect(hueOf(trend('amount', { direction: 'down', tone: 'success' }))).toBe(
      'success'
    )
    expect(hueOf(trend('amount', { direction: 'down' }))).toBe('down')
    expect(hueOf(trend('uncategorized'))).toBe('todo')
    expect(BADGE_CLASSES.up).toContain('bg-sky-50')
  })

  it('says a gap in its own terms', () => {
    expect(badgeText(trend('amount'))).toBe('+127 %')
    expect(badgeText(trend('subscription', { unit: series }))).toBe('Apparu')
    expect(badgeText(trend('share', { delta: -8, deltaPct: null }))).toBe(
      '−8 pts'
    )
    expect(badgeLabel(trend('amount'))).toBe('En hausse : +127 %')
  })

  it('opens the reference everywhere but on a series and the lines to file', () => {
    expect(hasTrendReference(trend('amount'))).toBe(true)
    expect(hasTrendReference(trend('subscription', { unit: series }))).toBe(
      false
    )
    expect(hasTrendReference(trend('uncategorized'))).toBe(false)
    expect(fallbackIcon(trend('frequency', { unit: merchant }))).toBe('🏪')
  })
})

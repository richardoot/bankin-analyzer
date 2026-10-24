import type { RouteLocationRaw } from 'vue-router'
import type {
  TrendInsightDto,
  TrendPartDto,
  TrendPeriodDto,
  TrendReading,
  TrendWindow,
} from '@/lib/api'
import { formatCurrency, formatMonth } from '@/lib/formatters'
import { NO_CATEGORY, transactionsLink } from '@/lib/transactionsLink'
import {
  STATE_BADGE_CLASSES,
  STATE_COLORS,
  type StateTone,
} from '@/lib/stateTints'

/**
 * The reference windows « Ce qui change » offers, in complete months before
 * the month read: 3 for a recent habit, 6 (the default) for « avant », 12
 * for the whole year. The server accepts these three and no other.
 */
export const TREND_WINDOWS: readonly TrendWindow[] = [3, 6, 12]

export const DEFAULT_TREND_WINDOW: TrendWindow = 6

export function isTrendWindow(value: unknown): value is TrendWindow {
  return TREND_WINDOWS.includes(value as TrendWindow)
}

/**
 * The groups « Ce qui change » files its lines under, in the order it shows
 * them: what is paid each month, the categories, the merchants, then the
 * month as a whole. Display only — the score still orders the lines.
 */
export type TrendGroupKey = 'charges' | 'categories' | 'merchants' | 'overview'

export const TREND_GROUPS: ReadonlyArray<{
  key: TrendGroupKey
  title: string
  /** The group's tab on the card: a word, short enough for a phone. */
  tab: string
}> = [
  { key: 'charges', title: 'Abonnements et charges', tab: 'Abonnements' },
  { key: 'categories', title: 'Catégories', tab: 'Catégories' },
  { key: 'merchants', title: 'Enseignes', tab: 'Enseignes' },
  { key: 'overview', title: "Vue d'ensemble", tab: "Vue d'ensemble" },
]

const isCategoryUnit = (insight: Pick<TrendInsightDto, 'unit'>): boolean =>
  insight.unit.type === 'category' || insight.unit.type === 'subcategory'

/**
 * The group a line reads in, from its kind and its unit; null for the lines
 * to file, a warning shown above the groups rather than a trend. A habit
 * that came or went belongs to its merchant, or to its category when it is
 * one; a frequency to its merchant when it reads one. Any kind this card
 * does not know yet reads in « Catégories ».
 */
export function trendGroupOf(
  insight: Pick<TrendInsightDto, 'kind' | 'unit'>
): TrendGroupKey | null {
  switch (insight.kind) {
    case 'uncategorized':
      return null
    case 'subscription':
    case 'price':
      return 'charges'
    case 'share':
    case 'savings':
      return 'overview'
    case 'newHabit':
    case 'lostHabit':
      return isCategoryUnit(insight) ? 'categories' : 'merchants'
    case 'frequency':
      return insight.unit.type === 'merchant' ? 'merchants' : 'categories'
    default:
      return 'categories'
  }
}

/* ------------------------------------------------------------------ */
/* The badge                                                          */
/* ------------------------------------------------------------------ */

const MINUS = '−'

function signed(value: number, text: string): string {
  return `${value < 0 ? MINUS : '+'}${text}`
}

/**
 * What came or went has no percentage: a word says it. A price says its
 * gap to the cent, as its sentence does.
 */
const WORD_BADGES: Partial<
  Record<TrendInsightDto['kind'], (insight: TrendInsightDto) => string>
> = {
  newHabit: () => 'Nouveau',
  lostHabit: () => 'Plus rien',
  subscription: insight => (insight.direction === 'up' ? 'Apparu' : 'Arrêté'),
  shift: () => 'Report',
  record: insight =>
    insight.record === 'low' ? 'Plus bas depuis un an' : 'Record 12 mois',
}

const WORD_LABELS: Partial<
  Record<TrendInsightDto['kind'], (insight: TrendInsightDto) => string>
> = {
  newHabit: () => 'Nouvelle habitude',
  lostHabit: () => 'Habitude abandonnée',
  subscription: insight =>
    insight.direction === 'up' ? 'Abonnement apparu' : 'Abonnement arrêté',
  shift: () => 'Report entre deux sous-catégories',
  record: insight =>
    insight.record === 'low'
      ? 'Le mois le plus bas depuis un an'
      : 'Le mois le plus haut depuis un an',
}

/** The year a comparison with last year reads: « 2025 ». */
const yearOf = (insight: TrendInsightDto): string =>
  insight.windows.reference.start.slice(0, 4)

const roundPct = (value: number): string => `${Math.round(Math.abs(value))} %`

/** The gap the badge shows: a percentage when there is one. */
export function badgeText(insight: TrendInsightDto): string {
  const word = WORD_BADGES[insight.kind]
  if (word) return word(insight)
  if (insight.kind === 'uncategorized') return `${insight.current} à classer`
  if (insight.kind === 'price') {
    return signed(insight.delta, formatCurrency(Math.abs(insight.delta)))
  }
  if (insight.kind === 'share' || insight.kind === 'savings') {
    return signed(insight.delta, `${Math.round(Math.abs(insight.delta))} pts`)
  }
  // A slope, per month.
  if (insight.kind === 'drift' && insight.deltaPct !== null) {
    return signed(insight.deltaPct, `${roundPct(insight.deltaPct)}/mois`)
  }
  if (insight.kind === 'yearAgo') {
    const gap =
      insight.deltaPct !== null
        ? signed(insight.deltaPct, roundPct(insight.deltaPct))
        : signed(insight.delta, `${Math.round(Math.abs(insight.delta))} €`)
    return `${gap} vs ${yearOf(insight)}`
  }
  if (insight.deltaPct !== null) {
    return signed(insight.deltaPct, roundPct(insight.deltaPct))
  }
  // Nothing in the habit to compare with: the gap itself.
  if (insight.kind === 'frequency') {
    return signed(insight.delta, String(Math.abs(insight.delta)))
  }
  // Whole euros, as the sentence writes them.
  const euros = Math.abs(insight.delta)
  return signed(
    insight.delta,
    euros >= 20 ? `${Math.round(euros)} €` : formatCurrency(euros)
  )
}

/** A trend's tint: one of the three states, or the lines to file. */
export type TrendHue = StateTone | 'todo'

/**
 * A drop reads in teal, a rise in amber, as the month's band reads its
 * gap to the habit. Neither is a verdict, so no green and no red. The
 * savings and a shift between two subcategories are not spending above or
 * below a habit: grey. The lines to file are a thing to do: amber, the
 * hue of « À faire ».
 */
export function hueOf(insight: TrendInsightDto): TrendHue {
  if (insight.kind === 'uncategorized') return 'todo'
  if (insight.kind === 'savings' || insight.kind === 'shift') return 'neutral'
  return insight.direction === 'up' ? 'over' : 'under'
}

export const BADGE_CLASSES: Readonly<Record<TrendHue, string>> = {
  ...STATE_BADGE_CLASSES,
  todo: STATE_BADGE_CLASSES.over,
}

/** The last point of a trend's sparkline; the line is the data hue. */
export const SPARK_COLORS: Readonly<Record<TrendHue, string>> = {
  ...STATE_COLORS,
  todo: STATE_COLORS.over,
}

const ARROWS: Record<TrendInsightDto['direction'], string> = {
  up: '↑',
  down: '↓',
}

/** A word badge says it all: no arrow beside it. */
export const arrowOf = (insight: TrendInsightDto): string =>
  WORD_BADGES[insight.kind] || insight.kind === 'uncategorized'
    ? ''
    : ARROWS[insight.direction]

/** What a reader hears for the badge. */
export function badgeLabel(insight: TrendInsightDto): string {
  if (insight.kind === 'uncategorized') {
    return `${insight.current} dépenses à classer`
  }
  const word = WORD_LABELS[insight.kind]
  if (word) return word(insight)
  const way = insight.direction === 'up' ? 'hausse' : 'baisse'
  const WHAT: Partial<Record<TrendInsightDto['kind'], string>> = {
    price: 'Prix en',
    drift: 'En',
    savings: 'Épargne en',
    yearAgo: `Par rapport à ${yearOf(insight)}, en`,
  }
  const what = WHAT[insight.kind] ?? 'En'
  const regular = insight.kind === 'drift' ? ' régulière' : ''
  return `${what} ${way}${regular} : ${badgeText(insight)}`
}

/* ------------------------------------------------------------------ */
/* The tile                                                           */
/* ------------------------------------------------------------------ */

/**
 * A tile's words, from its trend alone: the unit, what is measured, the
 * month's figure large and the habit's beside it. The full sentence stays
 * the server's (`insight.sentence`); this only lays its figures out.
 */
export interface TrendTile {
  /** The unit's name: « Restaurant ». */
  title: string
  /** Its parent and the measure: « Restaurants et bars · plus souvent ». */
  subtitle: string
  /** The month's figure, large: « 8 », « 359 € », « 13 % ». */
  figure: string
  /** What the figure counts, beside it in small: « achats », « / mois ». */
  figureUnit: string | null
  /** The habit it is read against: « d'habitude 3,5 par mois ». */
  usual: string
  /** One line for a phone: « 8 achats · d'habitude 3,5 ». */
  compact: string
  /** The month's link: « Transactions », the quarter's for savings. */
  linkLabel: string
}

export interface TileContext {
  /** The dashboard's reading: a share reads « de la vie courante » or not. */
  reading?: TrendReading | undefined
  /** A category's name by its id, for a subcategory's parent; optional. */
  categoryName?: ((id: string) => string | undefined) | undefined
}

/** « 359 € », « 8,99 € », « 1 240 € »: whole euros from 20 on, as the sentences write them. */
export function tileEuros(value: number): string {
  const abs = Math.abs(value)
  const whole = abs >= 20 || Number.isInteger(abs)
  const text = new Intl.NumberFormat('fr-FR', {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  }).format(abs)
  return `${value < 0 ? MINUS : ''}${text}\u00a0€`
}

/** « 9 », « 3,5 ». */
function count(value: number): string {
  return String(Math.round(value * 10) / 10).replace('.', ',')
}

const achats = (value: number): string =>
  `achat${Math.abs(value) >= 2 ? 's' : ''}`

/** « juillet », from a period's first day. */
const monthOf = (date: string): string =>
  formatMonth(date, { style: 'long', capitalize: false, year: false })

/** « septembre 2025 ». */
const monthYearOf = (date: string): string =>
  formatMonth(date, { style: 'long', capitalize: false })

const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1)

/** « Juillet à septembre »: the months a quarter covers. */
function quarterOf(insight: TrendInsightDto): string {
  const { start, end } = insight.windows.current
  const first = monthOf(start)
  const last = monthOf(end)
  return first === last ? capitalize(first) : `${capitalize(first)} à ${last}`
}

/**
 * Where the unit sits: a subcategory's parent when it is known and says
 * something more, a merchant as one, nothing for a category.
 */
function placeOf(insight: TrendInsightDto, ctx: TileContext): string | null {
  const { unit } = insight
  if (unit.type === 'merchant') return 'Enseigne'
  if (unit.type !== 'subcategory' || !unit.categoryId) return null
  const parent = ctx.categoryName?.(unit.categoryId)
  return parent && parent !== unit.name ? parent : null
}

function withPlace(
  insight: TrendInsightDto,
  ctx: TileContext,
  measure: string
): string {
  const place = placeOf(insight, ctx)
  return place ? `${place} · ${measure}` : capitalize(measure)
}

/** The figures of a tile, for every kind the card shows. */
export function tileOf(
  insight: TrendInsightDto,
  ctx: TileContext = {}
): TrendTile {
  const up = insight.direction === 'up'
  const base = {
    title: insight.unit.name,
    linkLabel: 'Transactions',
  }
  const tile = (
    subtitle: string,
    figure: string,
    figureUnit: string | null,
    usual: string,
    compact?: string
  ): TrendTile => ({
    ...base,
    subtitle,
    figure,
    figureUnit,
    usual,
    compact:
      compact ?? `${figure}${figureUnit ? ` ${figureUnit}` : ''} · ${usual}`,
  })
  const usualEuros =
    insight.reference === 0
      ? "rien d'habitude"
      : `d'habitude ${tileEuros(insight.reference)}`

  switch (insight.kind) {
    case 'amount':
      return tile(
        withPlace(
          insight,
          ctx,
          insight.record === 'high'
            ? 'le plus haut depuis un an'
            : insight.record === 'low'
              ? 'le plus bas depuis un an'
              : up
                ? 'en hausse'
                : 'en baisse'
        ),
        tileEuros(insight.current),
        null,
        usualEuros
      )
    case 'frequency': {
      const usual =
        insight.reference === 0
          ? "aucun d'habitude"
          : `d'habitude ${count(insight.reference)} par mois`
      return tile(
        withPlace(insight, ctx, up ? 'plus souvent' : 'moins souvent'),
        count(insight.current),
        achats(insight.current),
        usual,
        `${count(insight.current)} ${achats(insight.current)} · ${
          insight.reference === 0
            ? "aucun d'habitude"
            : `d'habitude ${count(insight.reference)}`
        }`
      )
    }
    case 'basket':
      return tile(
        withPlace(insight, ctx, 'panier moyen'),
        tileEuros(insight.current),
        'par passage',
        `d'habitude ${tileEuros(insight.reference)}`,
        `${tileEuros(insight.current)} le panier · d'habitude ${tileEuros(insight.reference)}`
      )
    case 'share':
      return tile(
        ctx.reading === 'real'
          ? 'Structure des dépenses'
          : 'Structure de la vie courante',
        `${Math.round(insight.current)} %`,
        null,
        `d'habitude ${Math.round(insight.reference)} %`
      )
    case 'uncategorized':
      return tile(
        'À classer',
        String(insight.current),
        insight.current >= 2 ? 'dépenses' : 'dépense',
        'les tendances ne les lisent pas'
      )
    case 'newHabit':
      return tile(
        `Nouvelle habitude depuis ${monthOf(insight.windows.current.start)}`,
        count(insight.current),
        achats(insight.current),
        'aucun avant'
      )
    case 'lostHabit':
      return tile(
        `Habitude abandonnée depuis ${monthOf(insight.windows.current.start)}`,
        'Aucun',
        'achat',
        `d'habitude ${count(insight.reference)} par mois`,
        `aucun achat · d'habitude ${count(insight.reference)}`
      )
    case 'subscription':
      return up
        ? tile(
            `Nouvel abonnement depuis ${monthOf(insight.windows.current.start)}`,
            tileEuros(insight.current),
            '/ mois',
            'aucun avant'
          )
        : tile(
            'Abonnement arrêté',
            tileEuros(insight.reference),
            '/ mois',
            'plus prélevé',
            `${tileEuros(insight.reference)} / mois · plus prélevé`
          )
    case 'price':
      return tile(
        `Prix en ${up ? 'hausse' : 'baisse'} depuis ${monthOf(insight.windows.current.start)}`,
        tileEuros(insight.current),
        'par prélèvement',
        `avant ${tileEuros(insight.reference)}`,
        `${tileEuros(insight.current)} · avant ${tileEuros(insight.reference)}`
      )
    case 'shift': {
      const [from, to] = insight.parts ?? []
      const usual =
        from && to
          ? `moins de ${from.unit.name.toLowerCase()}, plus de ${to.unit.name.toLowerCase()}`
          : usualEuros
      return tile(
        'Report entre deux sous-catégories',
        tileEuros(insight.current),
        null,
        usual
      )
    }
    case 'drift':
      return tile(
        `${up ? 'Hausse' : 'Baisse'} régulière depuis ${monthOf(insight.windows.reference.start)}`,
        tileEuros(insight.current),
        null,
        `contre ${tileEuros(insight.reference)} en ${monthOf(insight.windows.reference.start)}`
      )
    case 'record':
      return tile(
        insight.record === 'low'
          ? 'Le plus bas depuis un an'
          : 'Le plus haut depuis un an',
        tileEuros(insight.current),
        null,
        usualEuros
      )
    case 'yearAgo':
      return tile(
        "Par rapport à l'an dernier",
        tileEuros(insight.current),
        null,
        `contre ${insight.reference === 0 ? 'rien' : tileEuros(insight.reference)} en ${monthYearOf(insight.windows.reference.start)}`
      )
    case 'savings': {
      const rest = insight.remainingToLive
        ? ` · reste à vivre ${tileEuros(insight.remainingToLive.current)}/mois`
        : ''
      return tile(
        `${quarterOf(insight)} · par trimestre`,
        `${Math.round(insight.current)} %`,
        'du revenu',
        `contre ${Math.round(insight.reference)} %${rest}`,
        `${Math.round(insight.current)} % du revenu · contre ${Math.round(insight.reference)} %`
      )
    }
  }
}

/* ------------------------------------------------------------------ */
/* The links                                                          */
/* ------------------------------------------------------------------ */

/**
 * The filters a trend's links share: what the unit is, in the dashboard's
 * reading. The figures are netted and shared — `gross` lets the list say
 * it shows full amounts. The lines to file are counted in both readings,
 * so their link never leaves the events out.
 */
function unitFilters(
  insight: Pick<TrendInsightDto, 'kind' | 'unit'>,
  reading: TrendReading
) {
  const exceptional =
    reading === 'everyday' && insight.kind !== 'uncategorized'
      ? ('exclude' as const)
      : undefined
  const base = { type: 'EXPENSE' as const, exceptional, gross: true }
  const { unit } = insight
  switch (unit.type) {
    case 'category':
      return { ...base, categoryId: unit.id }
    case 'subcategory':
      return {
        ...base,
        categoryId: unit.categoryId ?? undefined,
        subcategoryId: unit.id,
      }
    case 'structure':
      return unit.id === 'pleasure'
        ? { ...base, nature: 'PLEASURE' as const }
        : { ...base, rhythm: 'COMMITTED' as const }
    case 'uncategorized':
      return { ...base, categoryId: NO_CATEGORY }
    // The page has no merchant filter: its labels, by the word they share.
    case 'merchant':
      return { ...base, q: unit.search ?? unit.name }
    // The series' own lines, whatever their filing or the reading.
    case 'recurrence':
      return {
        type: 'EXPENSE' as const,
        gross: true,
        recurrence: unit.id,
        recurrenceLabel: unit.name,
      }
    // Income less every expense: no set of categories, every transaction
    // of the quarter.
    case 'savings':
      return { gross: true }
  }
}

/** The long run (11 to 15): lines that read a horizon of their own. */
const LONG_RUN = new Set<TrendInsightDto['kind']>([
  'shift',
  'drift',
  'record',
  'yearAgo',
  'savings',
])

/** « septembre 2026 », or « juillet 2026 – septembre 2026 » for several months. */
function periodLabel(period: TrendPeriodDto): string {
  const options = { style: 'long', capitalize: false } as const
  const start = formatMonth(period.start, options)
  const end = formatMonth(period.end, options)
  return start === end ? start : `${start} – ${end}`
}

/** The trend's own lines in the month it reads (its months, for the long run). */
export function trendMonthLink(
  insight: TrendInsightDto,
  reading: TrendReading
): RouteLocationRaw {
  return transactionsLink({
    ...unitFilters(insight, reading),
    from: insight.windows.current.start,
    to: insight.windows.current.end,
    label: LONG_RUN.has(insight.kind)
      ? `${insight.unit.name} · ${periodLabel(insight.windows.current)}`
      : `${insight.unit.name} · ${formatMonth(insight.windows.current.start, { style: 'long', capitalize: false })}`,
  })
}

/** A shift opens each of its two subcategories in the month. */
export function trendPartLink(
  insight: TrendInsightDto,
  part: TrendPartDto,
  reading: TrendReading
): RouteLocationRaw {
  return transactionsLink({
    ...unitFilters({ kind: insight.kind, unit: part.unit }, reading),
    from: insight.windows.current.start,
    to: insight.windows.current.end,
    label: `${part.unit.name} · ${periodLabel(insight.windows.current)}`,
  })
}

/**
 * The months the trend compares with: the card's window for a habit, its
 * own horizon for the long run (the five months before, eleven, the same
 * month a year before, the quarter before).
 */
export function trendReferenceLink(
  insight: TrendInsightDto,
  reading: TrendReading,
  window: number
): RouteLocationRaw {
  return transactionsLink({
    ...unitFilters(insight, reading),
    from: insight.windows.reference.start,
    to: insight.windows.reference.end,
    label: LONG_RUN.has(insight.kind)
      ? `${insight.unit.name} · ${periodLabel(insight.windows.reference)}`
      : `${insight.unit.name} · ${window} mois de référence`,
  })
}

/**
 * The months before, as a second link. A series is read on the
 * recurrences screen instead: its months before are its own history.
 */
export const hasTrendReference = (insight: TrendInsightDto): boolean =>
  insight.kind !== 'uncategorized' && insight.unit.type !== 'recurrence'

/**
 * The unit's own icon — a merchant's or a series' is the one of the
 * category it is filed in, as on the recurrences screen — or a sign for
 * what has none.
 */
export function fallbackIcon(insight: TrendInsightDto): string {
  switch (insight.unit.type) {
    case 'uncategorized':
      return '🏷️'
    case 'structure':
      return '📊'
    case 'merchant':
      return '🏪'
    case 'recurrence':
      return '🔁'
    case 'savings':
      return '💰'
    default:
      return '•'
  }
}

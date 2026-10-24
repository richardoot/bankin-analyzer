/**
 * Every number and date the interface shows passes through here, so a
 * screen never decides on its own whether a month reads « Fév », « Févr »
 * or « févr. », or whether an amount keeps its cents.
 */

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
}

const WHOLE_EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
})

const COMPACT_EUROS = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/**
 * An amount for a chart axis, a KPI or a badge, where the cents are noise:
 * « 1 234 € ». Pass `compact: true` for the tightest spots (a phone's y
 * axis): « 1,2 k€ ».
 */
export function formatCompactCurrency(
  value: number,
  options: { compact?: boolean } = {}
): string {
  return options.compact
    ? COMPACT_EUROS.format(value)
    : WHOLE_EUROS.format(value)
}

/** The typographic minus a figure is written with: « −870 € », not « -870 € ». */
export const MINUS = '\u2212'

/**
 * Whole euros, as a band or a badge writes them: « 1 234 € », « −870 € »
 * with the typographic minus (Intl writes the hyphen).
 */
export function formatEuros(value: number): string {
  return value < 0
    ? `${MINUS}${WHOLE_EUROS.format(-value)}`
    : WHOLE_EUROS.format(value)
}

/**
 * A change in whole euros, always signed: « +115 € », « −30 € », and
 * « 0 € » when it rounds to nothing.
 */
export function formatSignedEuros(value: number): string {
  if (Math.round(value) === 0) return WHOLE_EUROS.format(0)
  return `${value > 0 ? '+' : MINUS}${WHOLE_EUROS.format(Math.abs(value))}`
}

const SIGNED_PERCENT = new Intl.NumberFormat('fr-FR', {
  style: 'percent',
  maximumFractionDigits: 0,
  signDisplay: 'exceptZero',
})

/** A gap as a share: « +16 % », « −25 % », « 0 % ». */
export function formatSignedPercent(ratio: number): string {
  return SIGNED_PERCENT.format(ratio).replace('-', MINUS)
}

/** « 1 jour », « 3 jours »: a French plural in -s, from the count. */
export function plural(count: number, word: string): string {
  return `${word}${count > 1 ? 's' : ''}`
}

/**
 * A typed amount, read the way a French user writes it: "12,50", "12.5",
 * "1 234,5" (spaces, including the narrow no-break one `toLocaleString`
 * inserts). NaN when nothing numeric was typed — the caller decides what
 * an empty field means.
 */
export function parseDecimal(raw: string): number {
  const normalized = raw.replace(/[\s\u00a0\u202f]/g, '').replace(',', '.')
  if (normalized === '') return Number.NaN
  return Number(normalized)
}

/** Month names, abbreviated the way the Imprimerie nationale does. */
export const MONTHS_FR = [
  'Janv.',
  'Févr.',
  'Mars',
  'Avr.',
  'Mai',
  'Juin',
  'Juil.',
  'Août',
  'Sept.',
  'Oct.',
  'Nov.',
  'Déc.',
] as const

export const MONTHS_FR_LONG = [
  'Janvier',
  'Février',
  'Mars',
  'Avril',
  'Mai',
  'Juin',
  'Juillet',
  'Août',
  'Septembre',
  'Octobre',
  'Novembre',
  'Décembre',
] as const

/**
 * Reads a date the API hands out — an ISO day (`2026-10-17`), a `YYYY-MM`
 * month, or a full timestamp — without letting the browser shift a plain
 * day across midnight. Returns null for anything unreadable.
 */
export function parseIsoDate(
  value: string | Date | null | undefined
): Date | null {
  if (value == null || value === '') return null
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  const isMonth = /^\d{4}-\d{2}$/.test(value)
  const isDay = /^\d{4}-\d{2}-\d{2}$/.test(value)
  const local = isMonth
    ? `${value}-01T00:00:00`
    : isDay
      ? `${value}T00:00:00`
      : value
  const date = new Date(local)
  return Number.isNaN(date.getTime()) ? null : date
}

export type DateStyle = 'short' | 'medium' | 'long'

const DATE_FORMATS: Record<DateStyle, Intl.DateTimeFormat> = {
  short: new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }),
  medium: new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }),
  long: new Intl.DateTimeFormat('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
}

/**
 * A date as the user reads it: `short` « 17/10/2026 » (lists, tables),
 * `medium` « 17 oct. 2026 » (chips, captions), `long` « 17 octobre 2026 »
 * (a plan's dates, a sentence). An unreadable value comes back as « — ».
 */
export function formatDate(
  value: string | Date | null | undefined,
  style: DateStyle = 'short'
): string {
  const date = parseIsoDate(value)
  return date ? DATE_FORMATS[style].format(date) : '—'
}

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

/** « 17/10/2026 14:32 » — when the minute matters (a sync, a settlement). */
export function formatDateTime(
  value: string | Date | null | undefined
): string {
  const date = parseIsoDate(value)
  return date ? DATE_TIME_FORMAT.format(date) : '—'
}

/**
 * A month label from a `YYYY-MM` key, an ISO date or a Date: « Oct. 2026 »,
 * or « Octobre 2026 » with `style: 'long'`. Omit the year with
 * `year: false` for an axis that already says which year it is. A label
 * stands alone and starts with a capital; inside a sentence (« depuis
 * oct. 2026 ») pass `capitalize: false`.
 */
export function formatMonth(
  value: string | Date | null | undefined,
  options: {
    style?: 'short' | 'long'
    year?: boolean
    capitalize?: boolean
  } = {}
): string {
  const date = parseIsoDate(value)
  if (!date) return '—'
  const names = options.style === 'long' ? MONTHS_FR_LONG : MONTHS_FR
  const label = names[date.getMonth()] ?? ''
  const name = options.capitalize === false ? label.toLowerCase() : label
  return options.year === false ? name : `${name} ${date.getFullYear()}`
}

/**
 * A span of months in words, for a heading: « novembre 2025 à octobre
 * 2026 », « mars à octobre 2026 » within one year, « octobre 2026 » for a
 * single month. Takes `YYYY-MM` keys (or ISO dates), first and last.
 */
export function formatMonthRange(from: string, to: string): string {
  const first = parseIsoDate(from)
  const last = parseIsoDate(to)
  if (!first || !last) return '—'
  const long = (value: string, year: boolean) =>
    formatMonth(value, { style: 'long', capitalize: false, year })
  if (
    first.getFullYear() === last.getFullYear() &&
    first.getMonth() === last.getMonth()
  ) {
    return long(to, true)
  }
  return `${long(from, first.getFullYear() !== last.getFullYear())} à ${long(to, true)}`
}

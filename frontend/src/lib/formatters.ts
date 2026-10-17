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
 * `year: false` for an axis that already says which year it is.
 */
export function formatMonth(
  value: string | Date | null | undefined,
  options: { style?: 'short' | 'long'; year?: boolean } = {}
): string {
  const date = parseIsoDate(value)
  if (!date) return '—'
  const names = options.style === 'long' ? MONTHS_FR_LONG : MONTHS_FR
  const name = names[date.getMonth()]
  return options.year === false ? name : `${name} ${date.getFullYear()}`
}

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(value)
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

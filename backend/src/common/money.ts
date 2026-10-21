/**
 * Rounds euros to the cent, a half-cent tie included, whichever side of it
 * floating-point sums landed on. A joint account divides by two, so a total
 * can be worth exactly x,xx5 €: summed row by row it reads 2457.7249999…,
 * summed by category 2457.7250000…, and a plain `Math.round` would give the
 * two readings a cent apart. Rounded to a millionth of a cent first, both
 * are the same tie and round the same way.
 */
export function roundCents(value: number): number {
  return Math.round(Number((value * 100).toFixed(6))) / 100
}

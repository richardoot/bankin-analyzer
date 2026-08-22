/**
 * The nth match of a query, or a failure that says what was missing.
 *
 * Test Utils' `get` covers the first match only, and indexing `findAll`
 * yields `T | undefined` — which a test then has to guard, burying the
 * assertion it was actually making. This keeps the intent on one line and
 * fails with a count rather than a `Cannot read properties of undefined`.
 */
export function nth<T>(items: T[], index: number, what = 'element'): T {
  const item = items[index]
  if (item === undefined) {
    throw new Error(
      `expected at least ${index + 1} ${what}(s), found ${items.length}`
    )
  }
  return item
}

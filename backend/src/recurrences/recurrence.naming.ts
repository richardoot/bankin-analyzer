/**
 * The name of the service a recurring charge pays for, read from its bank
 * labels: "CB Strava Ireland Li" is Strava, "Prlv Sepa Orange Sa Votre
 * Abonnement Mobile" is Orange.
 *
 * A bank label wraps the merchant in what the bank writes about the
 * movement (CB, Prlv Sepa, Vir Inst), what the merchant writes about itself
 * (its legal form, its country, "votre abonnement") and references. Once
 * that is gone, the first words left are the merchant. When a series was
 * paid under several labels — Strava by transfer one year, by card the
 * next — the words every label shares name it better than any one label.
 *
 * A best guess the user can always replace; never used to match anything.
 */

/** What the bank writes before the merchant. */
const LEADING_NOISE = new Set([
  'cb',
  'carte',
  'prlv',
  'prelevement',
  'sepa',
  'vir',
  'virement',
  'inst',
  'instantane',
  'paiement',
  'achat',
  'avoir',
  // Card and payment intermediaries the merchant shows up behind.
  'corner',
])

/** Where the merchant's own name stops. */
const STOP_WORDS = new Set([
  // Legal forms.
  'sa',
  'sas',
  'sasu',
  'sarl',
  'eurl',
  'ltd',
  'li',
  'inc',
  'gmbh',
  'bv',
  'cie',
  'et',
  // Places a merchant bills from.
  'france',
  'fr',
  'europe',
  'eu',
  'ireland',
  'luxembourg',
  'uk',
  // What a label says about the movement or the customer.
  'votre',
  'abonnement',
  'facture',
  'ref',
  'reference',
  'rum',
  'numero',
  'client',
  'clients',
  'particuliers',
  'virement',
  'prlv',
  'de',
  'du',
  'des',
  'pour',
  'merci',
  'bill',
  'com',
  'subscri',
  'subscription',
  'usd',
  'eur',
  'euro',
  'payments',
  'mktp',
  'the',
])

/** Small words kept inside a name, never at its edges: "Tenue de compte". */
const CONNECTIVES = new Set(['de', 'du', 'des'])

/** At most this many words: a service, not a sentence. */
const MAX_WORDS = 2

/** The words of a label, accents and punctuation gone, case kept. */
function wordsOf(description: string): string[] {
  const cleaned = description
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // "Openai *Chatgpt", "Anthropic* Claude": the merchant is before the
    // star. A leading star ("*Interets Debiteurs") is only punctuation.
    .replace(/([A-Za-z0-9])\s*\*.*$/, '$1')
    // Card-line date and card number.
    .replace(/\b\d{2}\/\d{2}\/\d{2,4}\b/g, ' ')
    .replace(/\bCB\*?\d+\b/gi, ' ')
    // "S.a.r.l" reads as one legal form, not four letters.
    .replace(/\b([a-z])\.(?=[a-z]\b)/gi, '$1')
  return cleaned
    .split(/[^A-Za-z0-9]+/)
    .filter(word => word !== '' && !/\d/.test(word))
}

const lower = (word: string): string => word.toLowerCase()

/**
 * The merchant words of one label, in order. A direct debit collected for
 * a brand by a franchisee names the brand after a second "Prlv": "Prlv
 * Sepa Aksport Fit Prlv Fitness Park Merignac" is Fitness Park.
 */
function merchantWords(description: string): string[] {
  const all = wordsOf(description)
  const inner = all.findIndex(
    (word, index) => index > 0 && lower(word) === 'prlv'
  )
  const words = inner > 0 ? all.slice(inner) : all
  let start = 0
  while (start < words.length && LEADING_NOISE.has(lower(words[start] ?? ''))) {
    start++
  }
  const rest = words.slice(start)
  const kept: string[] = []
  for (const [index, word] of rest.entries()) {
    const next = rest[index + 1]
    if (
      CONNECTIVES.has(lower(word)) &&
      kept.length > 0 &&
      next !== undefined &&
      !STOP_WORDS.has(lower(next))
    ) {
      kept.push(lower(word))
      continue
    }
    if (STOP_WORDS.has(lower(word))) {
      if (kept.length > 0) break
      continue
    }
    if (word.length <= 2) continue
    kept.push(word)
  }
  return kept
}

/** The first `count` content words, with the connectives between them. */
function firstWords(words: string[], count: number): string[] {
  const taken: string[] = []
  let content = 0
  for (const word of words) {
    if (CONNECTIVES.has(word)) {
      taken.push(word)
      continue
    }
    if (content === count) break
    taken.push(word)
    content++
  }
  while (taken.length > 0 && CONNECTIVES.has(taken[taken.length - 1] ?? '')) {
    taken.pop()
  }
  return taken
}

function capitalize(word: string): string {
  if (CONNECTIVES.has(word)) return word
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
}

/** A lone short word is an acronym: AMV, EDF, SFR. */
function display(words: string[]): string {
  if (words.length === 1 && (words[0]?.length ?? 0) <= 3) {
    return (words[0] ?? '').toUpperCase()
  }
  return words.map(capitalize).join(' ')
}

/**
 * The service a series pays for, from the labels of its charges (latest
 * first). The words every label shares, in the order the latest one gives
 * them; failing that, the latest label's own merchant words.
 */
export function serviceName(descriptions: string[]): string {
  const [latest, ...others] = descriptions
  if (latest === undefined) return ''
  const own = merchantWords(latest)

  const shared = own.filter(word =>
    others.every(other =>
      merchantWords(other).some(candidate => lower(candidate) === lower(word))
    )
  )
  if (shared.length > 0 && others.length > 0) {
    return display(firstWords(shared, MAX_WORDS))
  }
  if (own.length > 0) return display(firstWords(own, MAX_WORDS))
  return latest.trim()
}

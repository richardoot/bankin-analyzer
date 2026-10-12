/**
 * Export a user's expenses, anonymised, as a fixture for the recurrence
 * snapshot test (`src/recurrences/recurrence.ledgers.spec.ts`).
 *
 * ## Why
 *
 * Detection is a stack of thresholds tuned on real ledgers. Changing one
 * can break a case nobody is looking at; replaying whole ledgers and
 * comparing the outcome to a reviewed reference shows the exact effect of
 * every change.
 *
 * ## What is kept, what is not
 *
 * Kept: dates and amounts (detection reads nothing else), the structure of
 * each label — the bank's own words (CB, Prlv Sepa, Vir…), legal forms,
 * countries, references — and which lines share a category. Replaced:
 * every other word of a label, through a keyed hash whose key is drawn at
 * random for each run and never written down. The same word becomes the
 * same pseudonym everywhere in the file, so merchants still group the way
 * they did; nothing maps a pseudonym back to the word. Ids are renumbered.
 *
 * ## Usage (read-only)
 *
 *   DOTENV_CONFIG_PATH=.env.production.local \
 *     pnpm ts-node src/scripts/export-recurrence-ledger.ts \
 *     --email me@example.com --out src/recurrences/ledgers/ledger-a.json
 */
import { createHmac, randomBytes } from 'crypto'
import { writeFileSync } from 'fs'
import { Pool } from 'pg'
import {
  detectRecurrences,
  type RecurrenceExpense,
} from '../recurrences/recurrence.detection'

/** Words a bank or a merchant writes about the movement, kept as they are. */
const KEPT_WORDS = new Set([
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
  'ref',
  'reference',
  'rum',
  'facture',
  'echeance',
  'remboursement',
  'remb',
  'web',
  'internet',
  'mandat',
  'france',
  'fr',
  'fra',
  'europe',
  'eu',
  'ireland',
  'luxembourg',
  'uk',
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
  'de',
  'du',
  'des',
  'la',
  'le',
  'les',
  'pour',
  'par',
  'the',
  'and',
  'votre',
  'abonnement',
  'numero',
  'client',
  'clients',
  'particuliers',
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
  'corner',
])

const CONSONANTS = 'bcdfghjklmnpqrstvwxz'
const VOWELS = 'aeiou'

/**
 * A keyed, consistent pseudonym for every word that is not the bank's own:
 * the same length as the word (the merchant key drops words of two letters
 * or fewer, the naming rules read short words as acronyms), pronounceable,
 * and never shared by two words — a collision would merge two merchants
 * the real ledger keeps apart.
 */
export function pseudonymizer(key: Buffer): (word: string) => string {
  const byWord = new Map<string, string>()
  const taken = new Set<string>()
  return (word: string): string => {
    const lower = word
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
    if (KEPT_WORDS.has(lower) || /\d/.test(lower)) return word
    const known = byWord.get(lower)
    if (known) return matchCase(word, known)
    let pseudonym = ''
    for (let attempt = 0; pseudonym === '' || taken.has(pseudonym); attempt++) {
      const digest = createHmac('sha256', key)
        .update(`${lower}:${attempt}`)
        .digest()
      pseudonym = Array.from({ length: lower.length }, (_, i) => {
        const pool = i % 2 === 0 ? CONSONANTS : VOWELS
        return pool[(digest[i % digest.length] ?? 0) % pool.length]
      }).join('')
    }
    byWord.set(lower, pseudonym)
    taken.add(pseudonym)
    return matchCase(word, pseudonym)
  }
}

function matchCase(original: string, pseudonym: string): string {
  if (original === original.toUpperCase()) return pseudonym.toUpperCase()
  if (original[0] === original[0]?.toUpperCase()) {
    return pseudonym.charAt(0).toUpperCase() + pseudonym.slice(1)
  }
  return pseudonym
}

/** Every alphabetic run of a label pseudonymised; punctuation and digits kept. */
export function anonymizeLabel(
  label: string,
  pseudonym: (word: string) => string
): string {
  return label.replace(/[A-Za-zÀ-ÿ]+/g, word => pseudonym(word))
}

/**
 * What detection makes of a ledger, names and labels aside — sorted, since
 * detection breaks ties by name and names are what anonymisation changes.
 */
function shape(expenses: RecurrenceExpense[], now: Date): string[] {
  return detectRecurrences(expenses, { now })
    .map(r =>
      [
        r.status,
        r.period,
        r.amount,
        r.occurrences,
        r.firstDate.toISOString().slice(0, 10),
        r.lastDate.toISOString().slice(0, 10),
      ].join(' ')
    )
    .sort()
}

/**
 * The fixture is only worth having if detection reads it as it reads the
 * real ledger: a pseudonym that merged or split a merchant would test
 * something else. Refuse to write it otherwise.
 */
function assertSameDetection(
  real: Array<{
    date: Date
    amount: string
    description: string
    category_id: string | null
    subcategory_id: string | null
  }>,
  anonymized: Array<{
    id: string
    date: string
    amount: number
    description: string
    categoryId: string | null
    subcategoryId: string | null
  }>,
  now: Date
): void {
  const before = shape(
    real.map((row, index) => ({
      id: `t-${index + 1}`,
      date: new Date(`${row.date.toISOString().slice(0, 10)}T00:00:00.000Z`),
      amount: Number(row.amount),
      description: row.description,
      categoryId: row.category_id,
      subcategoryId: row.subcategory_id,
    })),
    now
  )
  const after = shape(
    anonymized.map(row => ({
      ...row,
      date: new Date(`${row.date}T00:00:00.000Z`),
    })),
    now
  )
  if (JSON.stringify(before) !== JSON.stringify(after)) {
    throw new Error(
      `Anonymisation changed what detection finds:\n${before.join('\n')}\n---\n${after.join('\n')}`
    )
  }
}

interface Options {
  email: string
  out: string
}

function parseArgs(argv: string[]): Options {
  let email: string | null = null
  let out: string | null = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email') email = argv[++i] ?? null
    else if (argv[i] === '--out') out = argv[++i] ?? null
    else throw new Error(`Unknown argument: ${argv[i]}`)
  }
  if (!email || !out) throw new Error('--email and --out are required')
  return { email, out }
}

async function main(options: Options): Promise<void> {
  const connectionString = process.env.DIRECT_URL ?? process.env.DATABASE_URL
  if (!connectionString)
    throw new Error('DATABASE_URL or DIRECT_URL must be set')
  const pool = new Pool({ connectionString })
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    const user = await client.query<{ id: string }>(
      'SELECT id FROM app.users WHERE email = $1',
      [options.email]
    )
    const userId = user.rows[0]?.id
    if (!userId) throw new Error(`No user with email ${options.email}`)
    const rows = await client.query<{
      date: Date
      amount: string
      description: string
      category_id: string | null
      subcategory_id: string | null
    }>(
      `SELECT date, amount::text AS amount, description, category_id, subcategory_id
         FROM app.transactions
        WHERE user_id = $1 AND type = 'EXPENSE' AND amount < 0
        ORDER BY date, id`,
      [userId]
    )
    await client.query('ROLLBACK')

    const pseudonym = pseudonymizer(randomBytes(32))
    const ids = new Map<string, string>()
    const renumber = (id: string | null, prefix: string): string | null => {
      if (!id) return null
      const known = ids.get(id)
      if (known) return known
      const next = `${prefix}-${ids.size + 1}`
      ids.set(id, next)
      return next
    }
    const expenses = rows.rows.map((row, index) => ({
      id: `t-${index + 1}`,
      date: row.date.toISOString().slice(0, 10),
      amount: Number(row.amount),
      description: anonymizeLabel(row.description, pseudonym),
      categoryId: renumber(row.category_id, 'cat'),
      subcategoryId: renumber(row.subcategory_id, 'sub'),
    }))
    const readAt = new Date().toISOString().slice(0, 10)
    assertSameDetection(
      rows.rows,
      expenses,
      new Date(`${readAt}T00:00:00.000Z`)
    )
    const fixture = { readAt, expenses }
    writeFileSync(options.out, `${JSON.stringify(fixture, null, 1)}\n`)
    console.log(`${expenses.length} expenses written to ${options.out}`)
  } finally {
    client.release()
    await pool.end()
  }
}

if (require.main === module) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('dotenv/config')
  main(parseArgs(process.argv.slice(2))).catch(err => {
    console.error(err)
    process.exit(1)
  })
}

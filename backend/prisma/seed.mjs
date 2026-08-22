// @ts-check
/**
 * Local seed for Bankin Analyzer.
 *
 * Generates a realistic, substantial dataset for ONE user so you can exercise
 * every feature (dashboard, transactions, categories, budgets, reimbursements,
 * settlements, tags…) after each `docker-start`.
 *
 * ── Safety ──────────────────────────────────────────────────────────────────
 * This script REFUSES to run against anything that is not a local database.
 * It never touches the remote Supabase referenced by backend/.env.
 *
 * ── User resolution ─────────────────────────────────────────────────────────
 * The dataset is attached to an EXISTING `app.users` row (the one created the
 * first time you logged into the local app). So the flow is:
 *   1. Start the stack  → ./scripts/docker-start.sh
 *   2. Log in once      → http://localhost:5173  (creates your user row)
 *   3. Seed             → pnpm seed
 * Re-running wipes THIS user's domain data and regenerates it from scratch.
 *
 * Override the target with SEED_USER_EMAIL=... and the DB with
 * SEED_DATABASE_URL=... (defaults to the local podman Postgres).
 */

import { createHash } from 'node:crypto'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'

// Resolve the generated Prisma client from src (dev) or dist (container image,
// where nest-cli copies `generated/**` into dist).
const { PrismaClient } = await import('../src/generated/prisma/index.js').catch(
  () => import('../dist/generated/prisma/index.js')
)

const DEFAULT_LOCAL_URL =
  'postgresql://postgres:postgres@localhost:5432/postgres'
const connectionString = process.env.SEED_DATABASE_URL ?? DEFAULT_LOCAL_URL

// ── Guard: never seed a remote / production database ──────────────────────────
const host = (() => {
  try {
    return new URL(connectionString).hostname
  } catch {
    return ''
  }
})()
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'db'])
if (!LOCAL_HOSTS.has(host)) {
  console.error(
    `\n✖ Refusing to seed a non-local database (host "${host}").\n` +
      `  Set SEED_DATABASE_URL to a local Postgres if this is wrong.\n`
  )
  process.exit(1)
}

const adapter = new PrismaPg(new pg.Pool({ connectionString }))
const prisma = new PrismaClient({ adapter })

// ── Deterministic RNG (mulberry32) so re-seeding is reproducible ──────────────
let _seed = 0x9e3779b9
function rand() {
  _seed |= 0
  _seed = (_seed + 0x6d2b79f5) | 0
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const randInt = (min, max) => Math.floor(rand() * (max - min + 1)) + min
const pick = arr => arr[Math.floor(rand() * arr.length)]
/** Round to 2 decimals. */
const r2 = n => Math.round(n * 100) / 100
/** Negative expense amount in [min, max] (absolute values). */
const expense = (min, max) => -r2(min + rand() * (max - min))
/** Positive income amount. */
const income = (min, max) => r2(min + rand() * (max - min))
const dateUTC = (y, m, d, hour = 10) => new Date(Date.UTC(y, m, d, hour, 0, 0))

// ── Category tree (icon + subcategories) ──────────────────────────────────────
/** @type {Array<{name:string,icon:string,subs:string[],excluded?:boolean}>} */
const EXPENSE_CATEGORIES = [
  {
    name: 'Alimentation',
    icon: '🛒',
    subs: ['Supermarché', 'Boulangerie', 'Marché'],
  },
  {
    name: 'Logement',
    icon: '🏠',
    subs: ['Loyer', 'Électricité', 'Internet', 'Assurance habitation'],
  },
  {
    name: 'Transport',
    icon: '🚗',
    subs: ['Essence', 'Transports en commun', 'Péage', 'Entretien'],
  },
  {
    name: 'Restaurants',
    icon: '🍽️',
    subs: ['Restaurant', 'Fast-food', 'Café'],
  },
  {
    name: 'Loisirs',
    icon: '🎉',
    subs: ['Cinéma', 'Sport', 'Sorties', 'Livres'],
  },
  { name: 'Santé', icon: '💊', subs: ['Pharmacie', 'Médecin', 'Mutuelle'] },
  {
    name: 'Shopping',
    icon: '🛍️',
    subs: ['Vêtements', 'Électronique', 'Maison'],
  },
  {
    name: 'Abonnements',
    icon: '🔁',
    subs: ['Téléphone', 'Netflix', 'Spotify'],
  },
  {
    name: 'Voyages',
    icon: '✈️',
    subs: ['Transport', 'Hébergement', 'Activités'],
  },
  { name: 'Enfants', icon: '🧸', subs: ['Garde', 'Scolarité', 'Loisirs'] },
  {
    name: 'Achats exceptionnels',
    icon: '💎',
    subs: ['Véhicule', 'Électroménager', 'Mobilier'],
    excluded: true, // excluded from budget plans
  },
]

/** @type {Array<{name:string,icon:string}>} */
const INCOME_CATEGORIES = [
  { name: 'Salaire', icon: '💰' },
  { name: 'Prime', icon: '🎁' },
  { name: 'Remboursement', icon: '💸' },
  { name: 'Revenus locatifs', icon: '🏦' },
  { name: 'Intérêts', icon: '📈' },
]

const ACCOUNTS = [
  { name: 'Compte Courant', type: 'STANDARD', divisor: 1 },
  { name: 'Compte Joint', type: 'JOINT', divisor: 2 },
  { name: 'Livret A', type: 'STANDARD', divisor: 1 },
  {
    name: 'PEA',
    type: 'INVESTMENT',
    divisor: 1,
    isExcludedFromStats: true,
  },
]

const PERSONS = ['Marie', 'Julien', 'Sophie', 'Thomas']

/**
 * Every tag here is exceptional: it describes a one-off event, not the user's
 * recurring lifestyle, so it stays out of the dashboard's everyday averages.
 *
 * `period` marks the *absorbing* events — the ones during which everyday life
 * is suspended because the user is away. Those days leave the denominator of
 * the everyday averages, and the category baseline is deducted from the event's
 * surplus. Events without a period are additive (a party or works at home): the
 * everyday spending carried on in parallel, so nothing is substituted.
 */
const TAGS = [
  {
    name: 'Vacances Été',
    color: '#f59e0b',
    icon: '⛱️',
    period: { monthIdx: 2, fromDay: 8, toDay: 20 },
    // Comfortably under: 13 days away, the everyday baseline eats a big share
    // of the raw spend, so the real surplus is far below the envelope.
    budget: 2400,
  },
  { name: 'Travaux Maison', color: '#f97316', icon: '🔨', budget: 2000 },
  {
    name: 'Vacances Italie',
    color: '#06b6d4',
    icon: '🏖️',
    period: { monthIdx: 6, fromDay: 10, toDay: 14 },
    budget: 1500,
  },
  { name: 'Anniversaire Marie', color: '#ec4899', icon: '🎂', budget: 250 },
  {
    name: 'Week-end Ski',
    color: '#6366f1',
    icon: '⛷️',
    period: { monthIdx: 12, fromDay: 7, toDay: 8 },
    // Deliberately too small — exercises the overrun path on the tag view
    // and the "dépassement de réserve" line on the budget page.
    budget: 400,
  },
  {
    name: 'Compétition Trail',
    color: '#84cc16',
    icon: '🏃',
    period: { monthIdx: 14, fromDay: 19, toDay: 20 },
    budget: 300,
  },
  // Additive: the shopping happened on top of an ordinary month, nothing is
  // substituted — and no envelope was ever decided, so the budget page shows
  // it as "sans enveloppe".
  { name: 'Rentrée scolaire', color: '#0ea5e9', icon: '🎒' },
  { name: 'Noël', color: '#22c55e', icon: '🎄', budget: 600 },
]

const SUPERMARKETS = ['Carrefour', 'Leclerc', 'Monoprix', 'Lidl', 'Auchan']
const RESTAURANTS = [
  'Le Bistrot du Coin',
  'Sushi Bar',
  'Pizzeria Roma',
  'Chez Marcel',
  'Burger House',
]

/**
 * Look up a GoTrue auth user id by email, straight from the shared database.
 * (GoTrue lives in the same Postgres as the app.) Returns null when absent.
 */
async function findAuthUserId(email) {
  const rows = await prisma.$queryRawUnsafe(
    'SELECT id::text AS id FROM auth.users WHERE email = $1 LIMIT 1',
    email
  )
  return rows[0]?.id ?? null
}

/**
 * Register a GoTrue user via the public signup endpoint (anon key, validated by
 * Kong). We use signup rather than the admin API because this stack signs OAuth
 * tokens with RS256 (GOTRUE_JWT_KEYS), so the HS256 service-role key is rejected
 * by the admin endpoints. Signup needs no bearer JWT, so it is unaffected.
 * With GOTRUE_MAILER_AUTOCONFIRM=true the account is immediately usable.
 */
async function signupAuthUser(baseUrl, anonKey, email, password) {
  const base = baseUrl.replace(/\/$/, '')
  const res = await fetch(`${base}/auth/v1/signup`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  })
  // 422 = already registered → fine, we look it up in the DB afterwards.
  if (!res.ok && res.status !== 422) {
    const text = await res.text().catch(() => '')
    throw new Error(`GoTrue signup failed (${res.status}): ${text}`)
  }
}

/** Ensure a loginnable demo user exists (auth + app rows). Idempotent. */
async function createDemoUser(email) {
  const existing = await prisma.user.findFirst({ where: { email } })
  if (existing) return existing

  const url = process.env.SEED_SUPABASE_URL || process.env.SUPABASE_URL
  const anonKey =
    process.env.SEED_ANON_KEY ||
    process.env.ANON_KEY ||
    process.env.SUPABASE_ANON_KEY
  const password = process.env.SEED_PASSWORD || 'Password123!'

  if (!url || !anonKey) {
    throw new Error(
      'Cannot auto-create a demo user: SEED_SUPABASE_URL and SEED_ANON_KEY ' +
        '(or SUPABASE_URL / ANON_KEY) are required. Otherwise log into the ' +
        'app once and re-run without SEED_CREATE_USER.'
    )
  }

  let supabaseId = await findAuthUserId(email)
  if (!supabaseId) {
    await signupAuthUser(url, anonKey, email, password)
    supabaseId = await findAuthUserId(email)
  }
  if (!supabaseId) {
    throw new Error(`Could not create or find the GoTrue user for ${email}`)
  }

  const user = await prisma.user.upsert({
    where: { supabaseId },
    update: { email },
    create: { supabaseId, email },
  })
  console.log(`👤 Demo login ready → ${email} / ${password}`)
  return user
}

async function resolveUser() {
  // 1. Explicit target by email (must already exist).
  const explicit = process.env.SEED_USER_EMAIL
  if (explicit) {
    const u = await prisma.user.findFirst({ where: { email: explicit } })
    if (!u) throw new Error(`No user found with email "${explicit}"`)
    return u
  }

  // 2. Cold-start / compose mode: create a loginnable demo user if needed.
  if (process.env.SEED_CREATE_USER === 'true') {
    return createDemoUser(process.env.SEED_EMAIL || 'demo@bankin.local')
  }

  // 3. Manual mode: seed the most recent existing user.
  const users = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } })
  if (users.length === 0) {
    throw new Error(
      'No user exists yet. Log into the local app once (creates your user), ' +
        'then re-run the seed — or set SEED_CREATE_USER=true (needs the ' +
        'Supabase service-role key) to auto-create a demo account.'
    )
  }
  if (users.length > 1) {
    console.log(
      `ℹ️  ${users.length} users found — seeding the most recent (${users[0].email}). ` +
        'Use SEED_USER_EMAIL to target another.'
    )
  }
  return users[0]
}

async function wipeUserData(userId) {
  // Children first, respecting FKs.
  await prisma.reimbursementPayment.deleteMany({ where: { userId } })
  await prisma.settlementReimbursement.deleteMany({
    where: { settlement: { userId } },
  })
  await prisma.settlement.deleteMany({ where: { userId } })
  await prisma.reimbursementRequest.deleteMany({ where: { userId } })
  await prisma.transactionTag.deleteMany({
    where: { transaction: { userId } },
  })
  await prisma.tag.deleteMany({ where: { userId } })
  await prisma.budgetPlanEntry.deleteMany({
    where: { budgetPlan: { userId } },
  })
  await prisma.budgetPlan.deleteMany({ where: { userId } })
  await prisma.transaction.deleteMany({ where: { userId } })
  await prisma.subcategory.deleteMany({ where: { userId } })
  await prisma.category.deleteMany({ where: { userId } })
  await prisma.importHistory.deleteMany({ where: { userId } })
  await prisma.account.deleteMany({ where: { userId } })
  await prisma.filterPreferences.deleteMany({ where: { userId } })
  await prisma.person.deleteMany({ where: { userId } })
}

async function main() {
  const user = await resolveUser()
  const userId = user.id
  console.log(`\n🌱 Seeding data for ${user.email} (${userId})`)

  console.log('🧹 Wiping existing data for this user…')
  await wipeUserData(userId)

  // ── Accounts ───────────────────────────────────────────────────────────────
  const accountByName = {}
  for (const a of ACCOUNTS) {
    const acc = await prisma.account.create({
      data: {
        userId,
        name: a.name,
        type: a.type,
        divisor: a.divisor ?? 1,
        isExcludedFromStats: a.isExcludedFromStats ?? false,
      },
    })
    accountByName[a.name] = acc
  }

  // ── Categories + subcategories ───────────────────────────────────────────────
  const categoryByName = {} // name -> category row
  const subByKey = {} // `${cat}/${sub}` -> subcategory row
  for (const c of EXPENSE_CATEGORIES) {
    const cat = await prisma.category.create({
      data: {
        userId,
        name: c.name,
        type: 'EXPENSE',
        icon: c.icon,
        isExcludedFromBudget: c.excluded ?? false,
      },
    })
    categoryByName[c.name] = cat
    for (const s of c.subs) {
      const sub = await prisma.subcategory.create({
        data: { userId, categoryId: cat.id, name: s },
      })
      subByKey[`${c.name}/${s}`] = sub
    }
  }
  for (const c of INCOME_CATEGORIES) {
    const cat = await prisma.category.create({
      data: { userId, name: c.name, type: 'INCOME', icon: c.icon },
    })
    categoryByName[c.name] = cat
  }

  // ── Persons ──────────────────────────────────────────────────────────────────
  const personByName = {}
  for (const name of PERSONS) {
    personByName[name] = await prisma.person.create({
      data: { userId, name },
    })
  }

  // ── Build the transaction list (metadata form) ───────────────────────────────
  /**
   * @typedef {Object} TxSpec
   * @property {Date} date
   * @property {string} description
   * @property {number} amount
   * @property {'EXPENSE'|'INCOME'} type
   * @property {string} category
   * @property {string} [sub]
   * @property {string} account
   * @property {string} [note]
   * @property {boolean} [pointed]
   * @property {string[]} [tags]
   * @property {Array<{person:string,amount:number,status?:string,received?:number}>} [reimb]
   * @property {boolean} [settlesReimb]  // INCOME that settles this person's reimbursements
   * @property {string} [settlePerson]
   */
  /** @type {TxSpec[]} */
  const specs = []

  const now = new Date()
  // 18 months so the 12-month rolling baseline of the earliest event still has
  // real history in front of it, instead of being clamped to a few weeks.
  const MONTHS = 18
  // Oldest month first.
  const months = []
  for (let k = MONTHS - 1; k >= 0; k--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - k, 1))
    months.push({ y: d.getUTCFullYear(), m: d.getUTCMonth() })
  }
  const isCurrentMonth = idx => idx === months.length - 1
  const maxDay = idx =>
    isCurrentMonth(idx) ? Math.min(now.getUTCDate(), 28) : 28

  // ── Tags ─────────────────────────────────────────────────────────────────────
  // Created here rather than earlier because the absorbing events anchor their
  // period on the generated month grid.
  const tagByName = {}
  for (const t of TAGS) {
    const anchor = t.period ? months[t.period.monthIdx] : null
    tagByName[t.name] = await prisma.tag.create({
      data: {
        userId,
        name: t.name,
        color: t.color,
        icon: t.icon,
        isExceptional: true,
        eventStartDate:
          anchor && t.period
            ? new Date(Date.UTC(anchor.y, anchor.m, t.period.fromDay))
            : null,
        eventEndDate:
          anchor && t.period
            ? new Date(Date.UTC(anchor.y, anchor.m, t.period.toDay))
            : null,
        budgetAmount: t.budget ?? null,
      },
    })
  }

  for (let idx = 0; idx < months.length; idx++) {
    const { y, m } = months[idx]
    const cap = maxDay(idx)
    const winter = m <= 1 || m >= 10 // heating months → higher electricity

    // Income
    specs.push({
      date: dateUTC(y, m, 2),
      description: 'Salaire',
      amount: income(2550, 2750),
      type: 'INCOME',
      category: 'Salaire',
      account: 'Compte Courant',
      pointed: true,
    })
    specs.push({
      date: dateUTC(y, m, 3),
      description: 'Salaire conjoint',
      amount: income(2300, 2500),
      type: 'INCOME',
      category: 'Salaire',
      account: 'Compte Joint',
      pointed: true,
    })
    specs.push({
      date: dateUTC(y, m, 6),
      description: 'Loyer studio locatif',
      amount: income(450, 450),
      type: 'INCOME',
      category: 'Revenus locatifs',
      account: 'Compte Courant',
    })
    // Twice-a-year bonus
    if (m === 5 || m === 11) {
      specs.push({
        date: dateUTC(y, m, 15),
        description: m === 11 ? "Prime de fin d'année" : 'Prime',
        amount: income(900, 1600),
        type: 'INCOME',
        category: 'Prime',
        account: 'Compte Courant',
      })
    }
    // Quarterly interest
    if (m % 3 === 0) {
      specs.push({
        date: dateUTC(y, m, 1),
        description: 'Intérêts Livret A',
        amount: income(18, 42),
        type: 'INCOME',
        category: 'Intérêts',
        account: 'Livret A',
      })
    }
    // Monthly saving transfer approximation as investment inflow
    if (m % 2 === 0) {
      specs.push({
        date: dateUTC(y, m, 4),
        description: 'Versement PEA',
        amount: income(200, 200),
        type: 'INCOME',
        category: 'Intérêts',
        account: 'PEA',
      })
    }

    // Fixed expenses
    specs.push({
      date: dateUTC(y, m, 5),
      description: 'Loyer appartement',
      amount: -1100,
      type: 'EXPENSE',
      category: 'Logement',
      sub: 'Loyer',
      account: 'Compte Courant',
      pointed: true,
    })
    specs.push({
      date: dateUTC(y, m, 8),
      description: 'EDF Électricité',
      amount: expense(winter ? 110 : 55, winter ? 155 : 90),
      type: 'EXPENSE',
      category: 'Logement',
      sub: 'Électricité',
      account: 'Compte Joint',
    })
    specs.push({
      date: dateUTC(y, m, 8),
      description: 'Free Internet Fibre',
      amount: -34.99,
      type: 'EXPENSE',
      category: 'Logement',
      sub: 'Internet',
      account: 'Compte Courant',
    })
    specs.push({
      date: dateUTC(y, m, 10),
      description: 'Assurance habitation',
      amount: -24.5,
      type: 'EXPENSE',
      category: 'Logement',
      sub: 'Assurance habitation',
      account: 'Compte Joint',
    })
    specs.push({
      date: dateUTC(y, m, 12),
      description: 'Forfait mobile',
      amount: -19.99,
      type: 'EXPENSE',
      category: 'Abonnements',
      sub: 'Téléphone',
      account: 'Compte Courant',
    })
    specs.push({
      date: dateUTC(y, m, 12),
      description: 'Netflix',
      amount: -13.49,
      type: 'EXPENSE',
      category: 'Abonnements',
      sub: 'Netflix',
      account: 'Compte Courant',
    })
    specs.push({
      date: dateUTC(y, m, 12),
      description: 'Spotify',
      amount: -10.99,
      type: 'EXPENSE',
      category: 'Abonnements',
      sub: 'Spotify',
      account: 'Compte Courant',
    })
    specs.push({
      date: dateUTC(y, m, 14),
      description: 'Mutuelle santé',
      amount: -58,
      type: 'EXPENSE',
      category: 'Santé',
      sub: 'Mutuelle',
      account: 'Compte Courant',
    })
    specs.push({
      date: dateUTC(y, m, 1),
      description: 'Abonnement transports',
      amount: -75.2,
      type: 'EXPENSE',
      category: 'Transport',
      sub: 'Transports en commun',
      account: 'Compte Courant',
    })

    // Groceries (variable)
    const groceryCount = randInt(6, 9)
    for (let i = 0; i < groceryCount; i++) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), randInt(9, 20)),
        description: pick(SUPERMARKETS),
        amount: expense(28, 125),
        type: 'EXPENSE',
        category: 'Alimentation',
        sub: 'Supermarché',
        account: rand() < 0.5 ? 'Compte Joint' : 'Compte Courant',
        pointed: rand() < 0.6,
      })
    }
    for (let i = 0; i < randInt(2, 4); i++) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), 8),
        description: 'Boulangerie',
        amount: expense(6, 18),
        type: 'EXPENSE',
        category: 'Alimentation',
        sub: 'Boulangerie',
        account: 'Compte Courant',
      })
    }

    // Restaurants
    for (let i = 0; i < randInt(2, 4); i++) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), 20),
        description: pick(RESTAURANTS),
        amount: expense(22, 78),
        type: 'EXPENSE',
        category: 'Restaurants',
        sub: 'Restaurant',
        account: 'Compte Courant',
      })
    }

    // Fuel
    for (let i = 0; i < randInt(1, 2); i++) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), 18),
        description: 'Station essence Total',
        amount: expense(52, 82),
        type: 'EXPENSE',
        category: 'Transport',
        sub: 'Essence',
        account: 'Compte Courant',
      })
    }

    // Leisure
    if (rand() < 0.7) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), 21),
        description: 'Cinéma UGC',
        amount: expense(11, 26),
        type: 'EXPENSE',
        category: 'Loisirs',
        sub: 'Cinéma',
        account: 'Compte Courant',
      })
    }
    specs.push({
      date: dateUTC(y, m, 2),
      description: 'Salle de sport',
      amount: -39.9,
      type: 'EXPENSE',
      category: 'Loisirs',
      sub: 'Sport',
      account: 'Compte Courant',
    })

    // Occasional shopping
    if (rand() < 0.4) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), 15),
        description: pick(['Zara', 'Uniqlo', 'Decathlon', 'Fnac']),
        amount: expense(30, 160),
        type: 'EXPENSE',
        category: 'Shopping',
        sub: rand() < 0.5 ? 'Vêtements' : 'Électronique',
        account: 'Compte Courant',
      })
    }

    // Occasional pharmacy / doctor
    if (rand() < 0.5) {
      specs.push({
        date: dateUTC(y, m, randInt(1, cap), 11),
        description: rand() < 0.5 ? 'Pharmacie' : 'Consultation médecin',
        amount: expense(15, 60),
        type: 'EXPENSE',
        category: 'Santé',
        sub: rand() < 0.5 ? 'Pharmacie' : 'Médecin',
        account: 'Compte Courant',
      })
    }
  }

  // ── One-off exceptional purchases (excluded-from-budget category) ─────────────
  {
    const carMonth = months[4]
    specs.push({
      date: dateUTC(carMonth.y, carMonth.m, 18),
      description: "Achat voiture d'occasion",
      amount: -8500,
      type: 'EXPENSE',
      category: 'Achats exceptionnels',
      sub: 'Véhicule',
      account: 'Compte Courant',
      note: 'Renault Clio — achat exceptionnel',
    })
    const applMonth = months[9]
    specs.push({
      date: dateUTC(applMonth.y, applMonth.m, 22),
      description: 'Lave-linge Bosch',
      amount: -649,
      type: 'EXPENSE',
      category: 'Achats exceptionnels',
      sub: 'Électroménager',
      account: 'Compte Joint',
    })
  }

  // ── Tagged events ─────────────────────────────────────────────────────────────
  // Vacances Été (idx 2) — a long absorbing trip: 13 days out of everyday life.
  {
    const { y, m } = months[2]
    const tag = ['Vacances Été']
    specs.push({
      date: dateUTC(y, m, 2),
      description: 'Location maison Ardèche',
      amount: -980,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Hébergement',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 8),
      description: 'Péages + essence descente',
      amount: -164.3,
      type: 'EXPENSE',
      category: 'Transport',
      sub: 'Péage',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 11),
      description: 'Courses marché Vallon',
      amount: -132.75,
      type: 'EXPENSE',
      category: 'Alimentation',
      sub: 'Marché',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 13),
      description: 'Descente des gorges en canoë',
      amount: -186,
      type: 'EXPENSE',
      category: 'Loisirs',
      sub: 'Sport',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 16),
      description: 'Restaurant Le Chêne Vert',
      amount: -128.4,
      type: 'EXPENSE',
      category: 'Restaurants',
      sub: 'Restaurant',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 20),
      description: 'Essence retour',
      amount: -88.9,
      type: 'EXPENSE',
      category: 'Transport',
      sub: 'Essence',
      account: 'Compte Courant',
      tags: tag,
    })
  }

  // Travaux Maison (idx 3)
  {
    const { y, m } = months[3]
    const tag = ['Travaux Maison']
    specs.push({
      date: dateUTC(y, m, 6),
      description: 'Leroy Merlin — peinture',
      amount: -234.5,
      type: 'EXPENSE',
      category: 'Shopping',
      sub: 'Maison',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 9),
      description: 'Leroy Merlin — parquet',
      amount: -812,
      type: 'EXPENSE',
      category: 'Shopping',
      sub: 'Maison',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 16),
      description: 'Castorama — outillage',
      amount: -157.8,
      type: 'EXPENSE',
      category: 'Shopping',
      sub: 'Maison',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 20),
      description: 'Artisan plombier',
      amount: -450,
      type: 'EXPENSE',
      category: 'Logement',
      sub: 'Assurance habitation',
      account: 'Compte Joint',
      tags: tag,
    })
  }

  // Vacances Italie (idx 6) — cluster + reimbursement split
  {
    const { y, m } = months[6]
    const tag = ['Vacances Italie']
    specs.push({
      date: dateUTC(y, m, 3),
      description: "Billets d'avion Rome",
      amount: -428,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Transport',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 10),
      description: 'Hôtel Firenze 4 nuits',
      amount: -612,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Hébergement',
      account: 'Compte Courant',
      tags: tag,
      reimb: [{ person: 'Sophie', amount: 306, status: 'PENDING' }],
    })
    specs.push({
      date: dateUTC(y, m, 11),
      description: 'Trattoria Da Mario',
      amount: -96,
      type: 'EXPENSE',
      category: 'Restaurants',
      sub: 'Restaurant',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 12),
      description: 'Musée des Offices',
      amount: -48,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Activités',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 13),
      description: 'Location scooter',
      amount: -75,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Activités',
      account: 'Compte Courant',
      tags: tag,
    })
  }

  // Anniversaire Marie (idx 9) — restaurant split reimbursed + settlement
  {
    const { y, m } = months[9]
    const tag = ['Anniversaire Marie']
    specs.push({
      date: dateUTC(y, m, 14),
      description: 'Cadeau anniversaire Marie',
      amount: -120,
      type: 'EXPENSE',
      category: 'Shopping',
      sub: 'Maison',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 14),
      description: 'Restaurant anniversaire',
      amount: -210,
      type: 'EXPENSE',
      category: 'Restaurants',
      sub: 'Restaurant',
      account: 'Compte Courant',
      tags: tag,
      reimb: [
        { person: 'Julien', amount: 52.5, status: 'COMPLETED', received: 52.5 },
        { person: 'Thomas', amount: 52.5, status: 'PENDING' },
      ],
    })
    // Income that settles Julien's completed reimbursement
    specs.push({
      date: dateUTC(y, m, 20),
      description: 'Virement Julien (part resto)',
      amount: 52.5,
      type: 'INCOME',
      category: 'Remboursement',
      account: 'Compte Courant',
      settlesReimb: true,
      settlePerson: 'Julien',
    })
  }

  // Week-end Ski (idx 12)
  {
    const { y, m } = months[12]
    const tag = ['Week-end Ski']
    specs.push({
      date: dateUTC(y, m, 7),
      description: 'Forfait ski Les Arcs',
      amount: -186,
      type: 'EXPENSE',
      category: 'Loisirs',
      sub: 'Sport',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 7),
      description: 'Chalet 2 nuits',
      amount: -340,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Hébergement',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 8),
      description: 'Location matériel ski',
      amount: -94,
      type: 'EXPENSE',
      category: 'Loisirs',
      sub: 'Sport',
      account: 'Compte Courant',
      tags: tag,
    })
  }

  // Compétition Trail (idx 14) — a short absorbing event inside the running plan
  {
    const { y, m } = months[14]
    const tag = ['Compétition Trail']
    specs.push({
      date: dateUTC(y, m, 12),
      description: 'Inscription trail des Crêtes',
      amount: -68,
      type: 'EXPENSE',
      category: 'Loisirs',
      sub: 'Sport',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 19),
      description: 'Hôtel veille de course',
      amount: -112,
      type: 'EXPENSE',
      category: 'Voyages',
      sub: 'Hébergement',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 19),
      description: 'Essence trajet course',
      amount: -61.4,
      type: 'EXPENSE',
      category: 'Transport',
      sub: 'Essence',
      account: 'Compte Courant',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 20),
      description: 'Ravitaillement + repas post-course',
      amount: -74.2,
      type: 'EXPENSE',
      category: 'Restaurants',
      sub: 'Restaurant',
      account: 'Compte Courant',
      tags: tag,
    })
  }

  // Rentrée scolaire (idx 16) — additive: no period, everyday life carried on
  {
    const { y, m } = months[16]
    const tag = ['Rentrée scolaire']
    specs.push({
      date: dateUTC(y, m, 4),
      description: 'Fournitures scolaires',
      amount: -142.6,
      type: 'EXPENSE',
      category: 'Enfants',
      sub: 'Scolarité',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 5),
      description: 'Cartable + trousse',
      amount: -87.9,
      type: 'EXPENSE',
      category: 'Shopping',
      sub: 'Vêtements',
      account: 'Compte Joint',
      tags: tag,
    })
    specs.push({
      date: dateUTC(y, m, 9),
      description: 'Licence club de foot',
      amount: -180,
      type: 'EXPENSE',
      category: 'Enfants',
      sub: 'Loisirs',
      account: 'Compte Courant',
      tags: tag,
    })
  }

  // Noël — attach to any December in range
  {
    const dec = months.find(mm => mm.m === 11)
    if (dec) {
      const { y, m } = dec
      const tag = ['Noël']
      specs.push({
        date: dateUTC(y, m, 18),
        description: 'Cadeaux de Noël',
        amount: -340,
        type: 'EXPENSE',
        category: 'Shopping',
        sub: 'Maison',
        account: 'Compte Courant',
        tags: tag,
      })
      specs.push({
        date: dateUTC(y, m, 23),
        description: 'Repas de Noël',
        amount: -165,
        type: 'EXPENSE',
        category: 'Alimentation',
        sub: 'Supermarché',
        account: 'Compte Joint',
        tags: tag,
      })
      specs.push({
        date: dateUTC(y, m, 24),
        description: 'Sapin & décorations',
        amount: -68,
        type: 'EXPENSE',
        category: 'Shopping',
        sub: 'Maison',
        account: 'Compte Courant',
        tags: tag,
      })
    }
  }

  // ── Persist transactions ──────────────────────────────────────────────────────
  console.log(`💳 Creating ${specs.length} transactions…`)
  const remReqData = [] // {reimbId?, txId, person, amount, status, received, categoryId}
  const settlementSpecs = [] // {txId, person}
  let hashCounter = 0

  for (const s of specs) {
    const account = accountByName[s.account]
    const category = categoryByName[s.category]
    const sub = s.sub ? subByKey[`${s.category}/${s.sub}`] : null
    const iso = s.date.toISOString()
    const hash = createHash('sha256')
      .update(
        `${userId}|${iso}|${s.amount}|${account.id}|${s.description}|${hashCounter++}`
      )
      .digest('hex')

    const tx = await prisma.transaction.create({
      data: {
        userId,
        accountId: account.id,
        categoryId: category.id,
        subcategoryId: sub?.id ?? null,
        subcategory: sub?.name ?? null,
        hash,
        date: s.date,
        description: s.description,
        amount: s.amount,
        type: s.type,
        note: s.note ?? null,
        isPointed: s.pointed ?? false,
      },
    })

    if (s.tags?.length) {
      await prisma.transactionTag.createMany({
        data: s.tags.map(t => ({
          transactionId: tx.id,
          tagId: tagByName[t].id,
        })),
        skipDuplicates: true,
      })
    }
    if (s.reimb?.length) {
      for (const rb of s.reimb) {
        remReqData.push({
          txId: tx.id,
          person: rb.person,
          amount: rb.amount,
          status: rb.status ?? 'PENDING',
          received: rb.received ?? 0,
          categoryId: categoryByName['Remboursement'].id,
        })
      }
    }
    if (s.settlesReimb)
      settlementSpecs.push({ txId: tx.id, person: s.settlePerson })
  }

  // ── Reimbursement requests ────────────────────────────────────────────────────
  console.log(`🤝 Creating ${remReqData.length} reimbursement requests…`)
  const reimbByPerson = {} // person -> [reimbRow]
  for (const rr of remReqData) {
    const row = await prisma.reimbursementRequest.create({
      data: {
        userId,
        transactionId: rr.txId,
        personId: personByName[rr.person].id,
        categoryId: rr.categoryId,
        amount: rr.amount,
        amountReceived: rr.received,
        status: rr.status,
      },
    })
    ;(reimbByPerson[rr.person] ??= []).push(row)
  }

  // ── Settlements (income tx settling a person's completed reimbursements) ──────
  console.log(`✅ Creating ${settlementSpecs.length} settlements…`)
  for (const ss of settlementSpecs) {
    const completed = (reimbByPerson[ss.person] ?? []).filter(
      r => r.status === 'COMPLETED'
    )
    if (completed.length === 0) continue
    const amountUsed = completed.reduce((sum, r) => sum + Number(r.amount), 0)
    const settlement = await prisma.settlement.create({
      data: {
        userId,
        personId: personByName[ss.person].id,
        incomeTransactionId: ss.txId,
        amountUsed,
        note: 'Règlement automatique (seed)',
      },
    })
    for (const r of completed) {
      await prisma.settlementReimbursement.create({
        data: {
          settlementId: settlement.id,
          reimbursementId: r.id,
          amountSettled: Number(r.amount),
        },
      })
    }
  }

  // ── Budget plans ──────────────────────────────────────────────────────────────
  console.log('📊 Creating budget plans…')
  const budgetCats = EXPENSE_CATEGORIES.filter(c => !c.excluded).map(
    c => c.name
  )
  const monthlyBudget = {
    Alimentation: 550,
    Logement: 1300,
    Transport: 200,
    Restaurants: 200,
    Loisirs: 120,
    Santé: 90,
    Shopping: 150,
    Abonnements: 60,
    Voyages: 150,
    Enfants: 100,
  }

  /** Envelope total per month — entries are monthly amounts, like the UI. */
  const monthlyEnvelopeTotal = budgetCats.reduce(
    (sum, c) => sum + (monthlyBudget[c] ?? 100),
    0
  )

  /**
   * Average monthly income over a window, computed exactly the way the app
   * does it: joint accounts halved, reimbursement-linked income categories
   * left out (they are deductions, not earnings).
   */
  const REIMBURSEMENT_INCOME = new Set(['Remboursement', 'Revenus locatifs'])
  const divisorOf = accountName =>
    ACCOUNTS.find(a => a.name === accountName)?.divisor ?? 1

  function averageMonthlyIncome(startDate, endDate, monthsCount) {
    let total = 0
    for (const s of specs) {
      if (s.type !== 'INCOME') continue
      if (REIMBURSEMENT_INCOME.has(s.category)) continue
      if (s.date < startDate || s.date > endDate) continue
      total += s.amount / divisorOf(s.account)
    }
    return r2(total / monthsCount)
  }

  async function createPlan(
    name,
    startIdx,
    endIdxInclusive,
    monthsCount,
    savingsTarget
  ) {
    const start = months[startIdx]
    const end = months[endIdxInclusive]
    const startDate = new Date(Date.UTC(start.y, start.m, 1))
    const endDate = new Date(Date.UTC(end.y, end.m + 1, 0)) // last day of end month
    const referenceIncome = averageMonthlyIncome(
      startDate,
      endDate,
      monthsCount
    )
    const plan = await prisma.budgetPlan.create({
      data: {
        userId,
        name,
        startDate,
        endDate,
        savingsTarget,
        referenceIncome,
      },
    })
    for (const catName of budgetCats) {
      await prisma.budgetPlanEntry.create({
        data: {
          budgetPlanId: plan.id,
          categoryId: categoryByName[catName].id,
          // Monthly, not a total over the plan: that is what the budget page
          // compares against the per-month "Réel à date".
          amount: monthlyBudget[catName] ?? 100,
        },
      })
    }
    const reserve = r2(
      (referenceIncome - savingsTarget - monthlyEnvelopeTotal) * monthsCount
    )
    console.log(
      `   ${name}: revenus ${referenceIncome} − épargne ${savingsTarget} − ` +
        `enveloppes ${monthlyEnvelopeTotal} → réserve projets ${reserve} € ` +
        `sur ${monthsCount} mois`
    )
    return plan
  }

  // A finished plan (3 fully-past months) with a comfortable reserve, and a
  // running plan whose saver is ambitious enough that the committed project
  // envelopes overrun what is left — the case the budget page must surface.
  await createPlan('Budget printemps (terminé)', 2, 4, 3, 800)
  await createPlan(
    'Budget en cours',
    months.length - 6,
    months.length - 1,
    6,
    1150
  )

  // ── Import history (one completed import) ─────────────────────────────────────
  await prisma.importHistory.create({
    data: {
      userId,
      status: 'COMPLETED',
      transactionsImported: specs.length,
      categoriesCreated: EXPENSE_CATEGORIES.length + INCOME_CATEGORIES.length,
      duplicatesSkipped: randInt(3, 15),
      totalInFile: specs.length + randInt(3, 15),
      dateRangeStart: specs[0].date,
      dateRangeEnd: specs[specs.length - 1].date,
      fileName: 'export-bankin-demo.csv',
    },
  })

  // ── Filter preferences (hide one category on the dashboard to exercise UI) ────
  await prisma.filterPreferences.create({
    data: {
      userId,
      hiddenExpenseCategoryIds: [],
      hiddenIncomeCategoryIds: [],
      globalHiddenExpenseCategoryIds: [],
      globalHiddenIncomeCategoryIds: [],
      isPanelExpanded: true,
    },
  })

  // ── Summary ───────────────────────────────────────────────────────────────────
  const totals = {
    accounts: await prisma.account.count({ where: { userId } }),
    categories: await prisma.category.count({ where: { userId } }),
    subcategories: await prisma.subcategory.count({ where: { userId } }),
    transactions: await prisma.transaction.count({ where: { userId } }),
    tags: await prisma.tag.count({ where: { userId } }),
    taggedTx: await prisma.transactionTag.count({
      where: { transaction: { userId } },
    }),
    persons: await prisma.person.count({ where: { userId } }),
    reimbursements: await prisma.reimbursementRequest.count({
      where: { userId },
    }),
    settlements: await prisma.settlement.count({ where: { userId } }),
    budgetPlans: await prisma.budgetPlan.count({ where: { userId } }),
    taggedEnvelopes: await prisma.tag.count({
      where: { userId, budgetAmount: { not: null } },
    }),
  }
  console.log('\n✅ Seed complete:')
  for (const [k, v] of Object.entries(totals)) {
    console.log(`   ${k.padEnd(16)} ${v}`)
  }
  console.log('')
}

main()
  .catch(e => {
    console.error('\n✖ Seed failed:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

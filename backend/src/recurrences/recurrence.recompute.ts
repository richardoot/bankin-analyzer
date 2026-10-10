/**
 * Read a user's expenses, detect their recurrences, and replace what the
 * tables held. Shared by `RecurrencesService` and the recompute script, so
 * the two can never disagree about what a recompute is.
 *
 * Idempotent: with no new transaction and no new decision, a second run
 * writes the same rows (new ids, same content).
 */

import { randomUUID } from 'crypto'
import type { PrismaClient } from '../generated/prisma'
import {
  detect,
  type DetectedRecurrence,
  type DetectionResult,
  type SubscriptionInput,
} from './recurrence.detection'

export interface RecomputeOptions {
  /** The moment of reading; tests pin it, everything else reads the clock. */
  now?: Date
  /** Detect and return, write nothing. */
  dryRun?: boolean
}

type Reader = Pick<
  PrismaClient,
  'transaction' | 'subscription' | 'subscriptionLink'
>

/** A day: time alone turns a running charge into an ended one. */
const MAX_AGE_MS = 24 * 60 * 60 * 1000

interface StateRow {
  version: bigint
  computedVersion: bigint | null
  computedAt: Date | null
}

/**
 * Fresh while no change to the ledger came after the version the cache
 * was built from, and for a day at most. A user without a state row was
 * never computed.
 */
export function isFresh(state: StateRow | null, now: Date): boolean {
  if (!state || state.computedVersion === null || !state.computedAt) {
    return false
  }
  return (
    state.version <= state.computedVersion &&
    now.getTime() - state.computedAt.getTime() < MAX_AGE_MS
  )
}

interface Reading {
  result: DetectionResult
  /** The subscriptions as read, to write back only what detection widened. */
  subscriptions: SubscriptionInput[]
}

/** What detection finds in the user's ledger right now. */
async function detectFor(
  prisma: Reader,
  userId: string,
  now: Date
): Promise<Reading> {
  // One after the other: inside a transaction they share a connection.
  const expenses = await prisma.transaction.findMany({
    where: {
      userId,
      type: 'EXPENSE',
      amount: { lt: 0 },
      // The whole history: an annual plan needs two years to be seen, and a
      // subscription ended long ago is still part of what the user paid for.
      date: { lte: now },
    },
    select: {
      id: true,
      date: true,
      amount: true,
      description: true,
      categoryId: true,
      subcategoryId: true,
    },
  })
  const subscriptions = await prisma.subscription.findMany({
    where: { userId },
    select: {
      id: true,
      state: true,
      name: true,
      period: true,
      merchantKeys: true,
      amountBuckets: true,
    },
    orderBy: { createdAt: 'asc' },
  })
  const links = await prisma.subscriptionLink.findMany({
    where: { userId },
    select: { transactionId: true, subscriptionId: true },
  })

  const result = detect(
    expenses.map(expense => ({ ...expense, amount: Number(expense.amount) })),
    { now, subscriptions, links }
  )
  return { result, subscriptions }
}

/**
 * One cache row per series key. A series rebuilt from attached payments
 * alone may land on the key of a detected one; the user's wins.
 */
function oneRowPerKey(recurrences: DetectedRecurrence[]): DetectedRecurrence[] {
  const byKey = new Map<string, DetectedRecurrence>()
  for (const recurrence of recurrences) {
    const key = `${recurrence.merchantKey}|${recurrence.amountBucket}`
    const existing = byKey.get(key)
    if (!existing || (!existing.subscriptionId && recurrence.subscriptionId)) {
      byKey.set(key, recurrence)
    }
  }
  return recurrences.filter(
    r => byKey.get(`${r.merchantKey}|${r.amountBucket}`) === r
  )
}

const sameList = <T>(left: T[], right: T[]): boolean =>
  left.length === right.length && left.every((item, i) => item === right[i])

type Tx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

/** Wait for any other recompute of this user, inside the caller's transaction. */
async function lockUser(tx: Tx, userId: string): Promise<void> {
  // Two recomputes for one user — a sync finishing while the page reads —
  // would otherwise interleave their delete and insert and collide on the
  // unique key, or let the slower one write what it read before the
  // other's change. The later one waits, then reads and writes.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`recurrences:${userId}`}))`
}

async function readState(
  tx: Pick<PrismaClient, 'recurrenceState'>,
  userId: string
): Promise<StateRow | null> {
  return tx.recurrenceState.findUnique({
    where: { userId },
    select: { version: true, computedVersion: true, computedAt: true },
  })
}

/** Rebuild the cache, under the caller's lock. */
async function rebuild(
  tx: Tx,
  userId: string,
  now: Date
): Promise<DetectedRecurrence[]> {
  // The version is read before the ledger: a change committed after this
  // read leaves the cache marked stale instead of being lost.
  const readVersion = (await readState(tx, userId))?.version ?? 0n
  const { result, subscriptions } = await detectFor(tx, userId, now)
  const detected = oneRowPerKey(result.recurrences)
  const rows = detected.map(recurrence => ({ id: randomUUID(), recurrence }))

  // What each subscription recognised this time, so that a new label or a
  // new price keeps it on its series.
  for (const subscription of subscriptions) {
    const learned = result.learned.get(subscription.id)
    if (!learned) continue
    if (
      sameList(learned.merchantKeys, [...subscription.merchantKeys].sort()) &&
      sameList(
        learned.amountBuckets,
        [...subscription.amountBuckets].sort((a, b) => a - b)
      )
    ) {
      continue
    }
    await tx.subscription.update({
      where: { id: subscription.id },
      data: {
        merchantKeys: learned.merchantKeys,
        amountBuckets: learned.amountBuckets,
      },
    })
  }

  await tx.recurrence.deleteMany({ where: { userId } })
  if (rows.length > 0) {
    await tx.recurrence.createMany({
      data: rows.map(({ id, recurrence }) => ({
        id,
        userId,
        subscriptionId: recurrence.subscriptionId,
        merchantKey: recurrence.merchantKey,
        amountBucket: recurrence.amountBucket,
        label: recurrence.label,
        name: recurrence.name,
        categoryId: recurrence.categoryId,
        subcategoryId: recurrence.subcategoryId,
        period: recurrence.period,
        amount: recurrence.amount,
        monthlyEquivalent: recurrence.monthlyEquivalent,
        occurrences: recurrence.occurrences,
        totalPaid: recurrence.totalPaid,
        firstDate: recurrence.firstDate,
        lastDate: recurrence.lastDate,
        nextExpected: recurrence.nextExpected,
        status: recurrence.status,
        computedAt: now,
      })),
    })
    await tx.recurrenceTransaction.createMany({
      data: rows.flatMap(({ id, recurrence }) =>
        recurrence.transactionIds.map(transactionId => ({
          recurrenceId: id,
          transactionId,
        }))
      ),
    })
  }

  await tx.recurrenceState.upsert({
    where: { userId },
    create: {
      userId,
      version: readVersion,
      computedVersion: readVersion,
      computedAt: now,
    },
    update: { computedVersion: readVersion, computedAt: now },
  })
  return detected
}

/** Rebuild the user's recurrences now, whatever their state. */
export async function recomputeRecurrences(
  prisma: PrismaClient,
  userId: string,
  options: RecomputeOptions = {}
): Promise<DetectedRecurrence[]> {
  const now = options.now ?? new Date()
  if (options.dryRun) {
    return (await detectFor(prisma, userId, now)).result.recurrences
  }
  return prisma.$transaction(async tx => {
    await lockUser(tx, userId)
    return rebuild(tx, userId, now)
  })
}

/**
 * Rebuild the user's recurrences if the ledger changed since, or a day
 * passed — what every reader of the cache calls first. Checked again under
 * the lock, so readers arriving together rebuild once.
 *
 * @returns whether a rebuild happened.
 */
export async function refreshRecurrences(
  prisma: PrismaClient,
  userId: string,
  now: Date = new Date()
): Promise<boolean> {
  if (isFresh(await readState(prisma, userId), now)) return false
  return prisma.$transaction(async tx => {
    await lockUser(tx, userId)
    if (isFresh(await readState(tx, userId), now)) return false
    await rebuild(tx, userId, now)
    return true
  })
}

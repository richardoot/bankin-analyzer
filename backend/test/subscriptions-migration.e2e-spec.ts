import { describe, it, expect, afterEach } from 'vitest'
import { createE2eDatabase } from './e2e-database'
import type { E2eDatabase } from './e2e-database'

/**
 * The subscriptions migration carries over what the user had already said:
 * decisions become subscriptions, links follow the subscription their
 * series became, and a link to a series nobody had decided about makes
 * that series a followed subscription.
 */
describe('Subscriptions migration (e2e)', () => {
  let db: E2eDatabase | undefined

  afterEach(async () => {
    await db?.close()
    db = undefined
  })

  it('folds decisions and links into subscriptions', async () => {
    db = await createE2eDatabase({ stopBefore: '20261009090000_subscriptions' })
    const seed = db.query
    await seed(
      `INSERT INTO app.users (id, supabase_id, email, updated_at) VALUES ('u1', 's1', 'u1@e2e.invalid', now())`
    )
    await seed(
      `INSERT INTO app.accounts (id, user_id, name, updated_at) VALUES ('a1', 'u1', 'Compte', now())`
    )
    for (const [id, description, amount] of [
      ['t-strava-2025', 'Vir Corner Strava Qwertys', -46.99],
      ['t-apple', 'CB Apple.com/bill', -9.99],
    ] as const) {
      await seed(
        `INSERT INTO app.transactions (id, user_id, account_id, hash, date, description, amount, type, updated_at)
         VALUES ($1, 'u1', 'a1', $1, now(), $2, $3, 'EXPENSE', now())`,
        [id, description, amount]
      )
    }
    await seed(
      `INSERT INTO app.recurrence_decisions (id, user_id, merchant_key, amount_bucket, decision, period, name)
       VALUES ('d-strava', 'u1', 'ireland strava', 60, 'CONFIRMED', 'YEARLY', 'Strava'),
              ('d-spotify', 'u1', 'spotify', NULL, 'DISMISSED', NULL, NULL)`
    )
    await seed(
      `INSERT INTO app.recurrence_links (id, user_id, transaction_id, merchant_key, amount_bucket)
       VALUES ('l-strava', 'u1', 't-strava-2025', 'ireland strava', 60),
              ('l-apple', 'u1', 't-apple', 'apple bill com', 10)`
    )

    await db.applyRemainingMigrations()

    const subscriptions = await db.prisma.subscription.findMany({
      orderBy: { createdAt: 'asc' },
    })
    expect(subscriptions).toHaveLength(3)
    expect(subscriptions.find(s => s.id === 'd-strava')).toMatchObject({
      state: 'CONFIRMED',
      name: 'Strava',
      period: 'YEARLY',
      merchantKeys: ['ireland strava'],
      amountBuckets: [60],
    })
    expect(subscriptions.find(s => s.id === 'd-spotify')).toMatchObject({
      state: 'DISMISSED',
      merchantKeys: ['spotify'],
      amountBuckets: [],
    })
    const apple = subscriptions.find(
      s => s.merchantKeys[0] === 'apple bill com'
    )
    expect(apple).toMatchObject({ state: 'CONFIRMED', amountBuckets: [10] })

    const links = await db.prisma.subscriptionLink.findMany()
    expect(
      Object.fromEntries(links.map(l => [l.transactionId, l.subscriptionId]))
    ).toEqual({ 't-strava-2025': 'd-strava', 't-apple': apple?.id })
  })
})

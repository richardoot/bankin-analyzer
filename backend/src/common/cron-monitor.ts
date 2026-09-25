/**
 * A cron job that reports for duty.
 *
 * Nothing else notices a nightly job that does not run: the health check
 * is green, the logs are empty, the user simply finds no new balance
 * point and cannot tell why. So each run checks in with Sentry when it
 * starts and when it ends, and Sentry raises an issue — hence an email —
 * when a run is missed, fails, or overruns.
 *
 * Two check-ins rather than the SDK's `withMonitor` wrapper because a run
 * that completes can still be a failure (one bank refused), and only the
 * caller can say so: `failed(result)` decides the final status.
 *
 * Inert without a DSN, like the rest of the SDK. On Vercel the final
 * check-in is handed to `waitUntil` so the function is not frozen with
 * it still in the queue; elsewhere that call is a no-op.
 */
import * as Sentry from '@sentry/nestjs'
import { waitUntil } from '@vercel/functions'

export interface CronMonitor {
  /** The monitor's name in Sentry, created on the first check-in. */
  slug: string
  /** The schedule Vercel runs it on, in UTC — the same string as vercel.json. */
  crontab: string
  /** Minutes past the scheduled time before the run counts as missed. */
  checkinMarginMinutes?: number
  /** Minutes a run may stay in progress before it counts as timed out. */
  maxRuntimeMinutes?: number
}

export const DEFAULT_CHECKIN_MARGIN_MINUTES = 10
export const DEFAULT_MAX_RUNTIME_MINUTES = 10

export async function monitoredRun<T>(
  monitor: CronMonitor,
  job: () => Promise<T>,
  failed: (result: T) => boolean = () => false
): Promise<T> {
  const startedAt = Date.now()
  const checkInId = Sentry.captureCheckIn(
    { monitorSlug: monitor.slug, status: 'in_progress' },
    {
      schedule: { type: 'crontab', value: monitor.crontab },
      // Vercel Cron schedules are UTC, whatever the account's locale.
      timezone: 'UTC',
      checkinMargin:
        monitor.checkinMarginMinutes ?? DEFAULT_CHECKIN_MARGIN_MINUTES,
      maxRuntime: monitor.maxRuntimeMinutes ?? DEFAULT_MAX_RUNTIME_MINUTES,
      // One bad night is worth an email; one good night closes it.
      failureIssueThreshold: 1,
      recoveryThreshold: 1,
    }
  )

  let status: 'ok' | 'error' = 'ok'
  try {
    const result = await job()
    if (failed(result)) status = 'error'
    return result
  } catch (error) {
    status = 'error'
    throw error
  } finally {
    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: monitor.slug,
      status,
      duration: (Date.now() - startedAt) / 1000,
    })
    waitUntil(Sentry.flush(2000))
  }
}

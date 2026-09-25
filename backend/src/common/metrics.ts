/**
 * Business events: the numbers that explain a duration.
 *
 * A trace says an import took nine seconds; only the import can say it
 * was 1 200 rows, 40 of them duplicates, and three model calls. So the
 * operations that matter record one event each, with their counts and
 * their own duration, and the event goes to two places at once:
 *
 * - the log, as one line (JSON in production, so Vercel indexes each
 *   field; readable at a desk), where it can be searched and counted;
 * - the active Sentry span, as attributes, so the trace of a slow
 *   request carries the volumes that made it slow.
 *
 * Counts, durations, names of banks and models, opaque ids. Never a
 * label, an amount, a prompt.
 */
import type { Logger } from '@nestjs/common'
import * as Sentry from '@sentry/nestjs'
import { logFormat } from './logging'
import type { LogFormat } from './logging'

export type MetricValue = string | number | boolean | null | undefined
export type MetricFields = Record<string, MetricValue>

const FORMAT = logFormat(process.env)

/** JSON keeps the fields; a person gets `event key=value …`. */
export function formatEvent(
  event: string,
  fields: MetricFields,
  format: LogFormat
): Record<string, MetricValue> | string {
  if (format === 'json') return { event, ...fields }
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key, value]) => {
      const text = String(value)
      return `${key}=${/\s/.test(text) ? JSON.stringify(text) : text}`
    })
  return parts.length === 0 ? event : `${event} ${parts.join(' ')}`
}

/** Span attributes take strings, numbers and booleans; nothing else. */
export function spanAttributes(
  event: string,
  fields: MetricFields
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) {
      attributes[`app.${event}.${key}`] = value
    }
  }
  return attributes
}

export function recordEvent(
  logger: Logger,
  event: string,
  fields: MetricFields
): void {
  logger.log(formatEvent(event, fields, FORMAT))
  Sentry.getActiveSpan()?.setAttributes(spanAttributes(event, fields))
}

/**
 * Run `fn` as a span of its own and measure it. The span shows up in the
 * trace under the request; the duration comes back for the event line.
 * Without a DSN the span is a no-op and only the stopwatch remains.
 */
export async function timed<T>(
  op: string,
  name: string,
  fn: () => Promise<T>
): Promise<{ result: T; durationMs: number }> {
  return Sentry.startSpan({ op: `app.${op}`, name }, async () => {
    const startedAt = process.hrtime.bigint()
    const result = await fn()
    const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e6
    return { result, durationMs: Math.round(elapsed * 10) / 10 }
  })
}

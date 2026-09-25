/**
 * One log line per HTTP request, and an id to find it by.
 *
 * Plain Express middleware rather than a Nest interceptor, on purpose: an
 * interceptor only wraps the handler, so a request refused by a guard (401)
 * or the throttler (429) never reaches it and leaves no trace. Middleware
 * runs first and writes on `finish`, whatever happened in between.
 *
 * The id is Vercel's own when there is one (`x-vercel-id`, the value the
 * Vercel dashboard indexes its logs by), so a line here and a line there
 * are the same request. Elsewhere a UUID is minted. Either way it comes
 * back on the response as `x-request-id`, and the exception filter puts it
 * in a 500 body, so what a user reads in a toast can be found in the logs.
 *
 * The line carries what a person needs to triage and nothing that would
 * make the logs a copy of the data: method, path without its query string,
 * status, duration, user id, and — when the request failed — the message
 * the exception filter chose to answer with. Never the body, never the
 * headers, never the query.
 */
import { Logger } from '@nestjs/common'
import { randomUUID } from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import type { LogFormat } from './logging'

export const REQUEST_ID_HEADER = 'x-request-id'

/** Vercel ids look like `cdg1::abcde-1712345678901-0123456789ab`. */
const SAFE_ID = /^[A-Za-z0-9._:-]{1,128}$/

type HeaderValue = string | string[] | undefined

/**
 * The id this request is known by: Vercel's, else a caller's if it is
 * shaped like an id (a header is attacker-controlled and ends up in a log
 * line, so anything else is dropped), else a fresh one.
 */
export function requestIdOf(
  headers: Record<string, HeaderValue>,
  generate: () => string = randomUUID
): string {
  for (const name of ['x-vercel-id', REQUEST_ID_HEADER]) {
    const raw = headers[name]
    const value = Array.isArray(raw) ? raw[0] : raw
    if (value && SAFE_ID.test(value)) return value
  }
  return generate()
}

export interface RequestLogEntry {
  method: string
  path: string
  status: number
  durationMs: number
  requestId: string
  userId?: string
  /** The message the exception filter answered with, on a failed request. */
  error?: string
}

export type RequestLogLevel = 'debug' | 'log' | 'warn' | 'error'

/**
 * Failures stand out; a healthy `/health` probe every few minutes does not
 * deserve a line in production at all, only in a debug tail.
 */
export function requestLogLevel(entry: RequestLogEntry): RequestLogLevel {
  if (entry.status >= 500) return 'error'
  if (entry.status >= 400) return 'warn'
  if (entry.path === '/health') return 'debug'
  return 'log'
}

/** JSON keeps the fields; a person gets one readable line. */
export function formatRequestLog(
  entry: RequestLogEntry,
  format: LogFormat
): RequestLogEntry | string {
  if (format === 'json') return entry
  const who = entry.userId ? ` user=${entry.userId}` : ''
  const why = entry.error ? ` — ${entry.error}` : ''
  return (
    `${entry.method} ${entry.path} ${entry.status} ` +
    `${entry.durationMs}ms${who} id=${entry.requestId}${why}`
  )
}

/** What the guard leaves on the request, seen from here. */
interface MaybeAuthenticated {
  user?: { id?: string } | undefined
}

export function requestLogger(
  format: LogFormat,
  logger: Logger = new Logger('HTTP')
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint()
    const requestId = requestIdOf(req.headers)
    res.locals.requestId = requestId
    res.setHeader(REQUEST_ID_HEADER, requestId)

    res.on('finish', () => {
      const elapsed = Number(process.hrtime.bigint() - startedAt) / 1e6
      const entry: RequestLogEntry = {
        method: req.method,
        path: req.originalUrl.split('?')[0] ?? req.originalUrl,
        status: res.statusCode,
        durationMs: Math.round(elapsed * 10) / 10,
        requestId,
      }
      const userId = (req as MaybeAuthenticated).user?.id
      if (userId) entry.userId = userId
      const error: unknown = res.locals.error
      if (typeof error === 'string') entry.error = error

      logger[requestLogLevel(entry)](formatRequestLog(entry, format))
    })

    next()
  }
}

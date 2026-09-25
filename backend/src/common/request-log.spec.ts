import { describe, expect, it, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import type { Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import {
  REQUEST_ID_HEADER,
  formatRequestLog,
  requestIdOf,
  requestLogLevel,
  requestLogger,
} from './request-log'
import type { RequestLogEntry } from './request-log'

const entry = (over: Partial<RequestLogEntry> = {}): RequestLogEntry => ({
  method: 'GET',
  path: '/transactions',
  status: 200,
  durationMs: 12.3,
  requestId: 'cdg1::abc-123',
  ...over,
})

describe('requestIdOf', () => {
  const fresh = (): string => 'generated'

  it("prefers Vercel's own id, so the line matches the dashboard", () => {
    expect(
      requestIdOf(
        { 'x-vercel-id': 'cdg1::abcde-1712345678901-0123456789ab' },
        fresh
      )
    ).toBe('cdg1::abcde-1712345678901-0123456789ab')
  })

  it('accepts a well-formed id a caller sends', () => {
    expect(requestIdOf({ [REQUEST_ID_HEADER]: 'trace-42' }, fresh)).toBe(
      'trace-42'
    )
  })

  it('takes the first value of a repeated header', () => {
    expect(requestIdOf({ 'x-vercel-id': ['one', 'two'] }, fresh)).toBe('one')
  })

  it('mints one when nothing usable was sent', () => {
    expect(requestIdOf({}, fresh)).toBe('generated')
    expect(requestIdOf({ [REQUEST_ID_HEADER]: '' }, fresh)).toBe('generated')
  })

  it('refuses an id that could carry anything else into a log line', () => {
    expect(requestIdOf({ [REQUEST_ID_HEADER]: 'a b\n[FAKE]' }, fresh)).toBe(
      'generated'
    )
    expect(requestIdOf({ [REQUEST_ID_HEADER]: 'x'.repeat(129) }, fresh)).toBe(
      'generated'
    )
  })

  it('mints a UUID by default', () => {
    expect(requestIdOf({})).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    )
  })
})

describe('requestLogLevel', () => {
  it('grades by status', () => {
    expect(requestLogLevel(entry({ status: 200 }))).toBe('log')
    expect(requestLogLevel(entry({ status: 302 }))).toBe('log')
    expect(requestLogLevel(entry({ status: 401 }))).toBe('warn')
    expect(requestLogLevel(entry({ status: 429 }))).toBe('warn')
    expect(requestLogLevel(entry({ status: 500 }))).toBe('error')
    expect(requestLogLevel(entry({ status: 503 }))).toBe('error')
  })

  it('keeps a healthy probe out of the production logs', () => {
    expect(requestLogLevel(entry({ path: '/health' }))).toBe('debug')
  })

  it('but not a failing one', () => {
    expect(requestLogLevel(entry({ path: '/health', status: 503 }))).toBe(
      'error'
    )
  })
})

describe('formatRequestLog', () => {
  it('hands the fields over untouched for JSON', () => {
    const e = entry({ userId: 'u1', error: 'nope' })
    expect(formatRequestLog(e, 'json')).toBe(e)
  })

  it('writes one readable line otherwise', () => {
    expect(formatRequestLog(entry(), 'pretty')).toBe(
      'GET /transactions 200 12.3ms id=cdg1::abc-123'
    )
    expect(
      formatRequestLog(
        entry({ status: 404, userId: 'u1', error: 'Record not found' }),
        'pretty'
      )
    ).toBe(
      'GET /transactions 404 12.3ms user=u1 id=cdg1::abc-123 — Record not found'
    )
  })
})

describe('requestLogger', () => {
  interface Fakes {
    req: Request
    res: Response & EventEmitter
    logger: Record<'debug' | 'log' | 'warn' | 'error', ReturnType<typeof vi.fn>>
    next: ReturnType<typeof vi.fn>
  }

  function fakes(over: {
    headers?: Record<string, string>
    url?: string
    status?: number
    user?: { id: string }
    error?: string
  }): Fakes {
    const req = {
      method: 'GET',
      originalUrl: over.url ?? '/transactions?page=2&search=secret',
      headers: over.headers ?? {},
      user: over.user,
    } as unknown as Request
    const res = Object.assign(new EventEmitter(), {
      statusCode: over.status ?? 200,
      locals: {},
      setHeader: vi.fn(),
    }) as unknown as Response & EventEmitter
    if (over.error) (res.locals as Record<string, unknown>).error = over.error
    const logger = {
      debug: vi.fn(),
      log: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }
    return { req, res, logger, next: vi.fn() }
  }

  function run(over: Parameters<typeof fakes>[0] = {}): Fakes {
    const f = fakes(over)
    requestLogger('json', f.logger as unknown as Logger)(f.req, f.res, f.next)
    f.res.emit('finish')
    return f
  }

  it('lets the request through and stamps the id on the response', () => {
    const f = run({ headers: { 'x-vercel-id': 'cdg1::abc' } })
    expect(f.next).toHaveBeenCalledOnce()
    expect(f.res.setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'cdg1::abc')
    expect(f.res.locals.requestId).toBe('cdg1::abc')
  })

  it('logs one line on finish, without the query string', () => {
    const f = run({ headers: { 'x-vercel-id': 'cdg1::abc' } })
    expect(f.logger.log).toHaveBeenCalledOnce()
    const line = f.logger.log.mock.calls[0]?.[0] as RequestLogEntry
    expect(line).toMatchObject({
      method: 'GET',
      path: '/transactions',
      status: 200,
      requestId: 'cdg1::abc',
    })
    expect(line.durationMs).toBeGreaterThanOrEqual(0)
    expect(line).not.toHaveProperty('userId')
    expect(line).not.toHaveProperty('error')
    expect(JSON.stringify(line)).not.toContain('secret')
  })

  it('names the user once the guard has identified one', () => {
    const f = run({ user: { id: 'user-1' } })
    expect(f.logger.log.mock.calls[0]?.[0]).toMatchObject({ userId: 'user-1' })
  })

  it('carries the reason the exception filter left behind, at warn', () => {
    const f = run({ status: 401, error: 'No token provided' })
    expect(f.logger.log).not.toHaveBeenCalled()
    expect(f.logger.warn.mock.calls[0]?.[0]).toMatchObject({
      status: 401,
      error: 'No token provided',
    })
  })

  it('reports a 5xx as an error', () => {
    const f = run({ status: 500 })
    expect(f.logger.error).toHaveBeenCalledOnce()
  })

  it('demotes a healthy probe to debug', () => {
    const f = run({ url: '/health' })
    expect(f.logger.debug).toHaveBeenCalledOnce()
    expect(f.logger.log).not.toHaveBeenCalled()
  })
})

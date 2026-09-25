import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Logger } from '@nestjs/common'
import { formatEvent, recordEvent, spanAttributes, timed } from './metrics'

const { setAttributes, getActiveSpan, startSpan } = vi.hoisted(() => ({
  setAttributes: vi.fn(),
  getActiveSpan: vi.fn(),
  startSpan: vi.fn(
    (_options: unknown, fn: () => Promise<unknown>): Promise<unknown> => fn()
  ),
}))

vi.mock('@sentry/nestjs', () => ({ getActiveSpan, startSpan }))

describe('formatEvent', () => {
  it('keeps the fields as an object for JSON', () => {
    expect(
      formatEvent('csv_import', { rows: 12, imported: 10 }, 'json')
    ).toEqual({ event: 'csv_import', rows: 12, imported: 10 })
  })

  it('writes one readable line otherwise, quoting what has spaces', () => {
    expect(
      formatEvent(
        'bank_sync',
        { bank: 'Crédit Agricole', inserted: 3, skipped: null, x: undefined },
        'pretty'
      )
    ).toBe('bank_sync bank="Crédit Agricole" inserted=3')
    expect(formatEvent('tick', {}, 'pretty')).toBe('tick')
  })
})

describe('spanAttributes', () => {
  it('prefixes every field and drops the empty ones', () => {
    expect(
      spanAttributes('csv_import', { rows: 12, forced: false, gone: null })
    ).toEqual({ 'app.csv_import.rows': 12, 'app.csv_import.forced': false })
  })
})

describe('recordEvent', () => {
  const logger = { log: vi.fn() } as unknown as Logger

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs the event and annotates the active span', () => {
    getActiveSpan.mockReturnValue({ setAttributes })
    recordEvent(logger, 'csv_import', { rows: 3 })
    expect(logger.log).toHaveBeenCalledOnce()
    expect(setAttributes).toHaveBeenCalledWith({ 'app.csv_import.rows': 3 })
  })

  it('still logs when no span is active', () => {
    getActiveSpan.mockReturnValue(undefined)
    recordEvent(logger, 'csv_import', { rows: 3 })
    expect(logger.log).toHaveBeenCalledOnce()
    expect(setAttributes).not.toHaveBeenCalled()
  })
})

describe('timed', () => {
  it('opens a span named after the work and measures it', async () => {
    const { result, durationMs } = await timed('import', 'csv import', () =>
      Promise.resolve(42)
    )
    expect(result).toBe(42)
    expect(durationMs).toBeGreaterThanOrEqual(0)
    expect(startSpan).toHaveBeenCalledWith(
      { op: 'app.import', name: 'csv import' },
      expect.any(Function)
    )
  })

  it('lets a failure through, span or not', async () => {
    await expect(
      timed('import', 'csv import', () => Promise.reject(new Error('no')))
    ).rejects.toThrow('no')
  })
})

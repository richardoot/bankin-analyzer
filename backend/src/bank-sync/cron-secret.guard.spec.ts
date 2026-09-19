import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common'
import type { ExecutionContext } from '@nestjs/common'
import { CronSecretGuard } from './cron-secret.guard'

function contextWith(authorization?: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        headers: authorization ? { authorization } : {},
      }),
    }),
  } as unknown as ExecutionContext
}

describe('CronSecretGuard', () => {
  const savedSecret = process.env.CRON_SECRET

  beforeEach(() => {
    process.env.CRON_SECRET = 'the-secret'
  })

  afterEach(() => {
    if (savedSecret) process.env.CRON_SECRET = savedSecret
    else delete process.env.CRON_SECRET
  })

  it('lets the bearer of the secret in', () => {
    const guard = new CronSecretGuard()
    expect(guard.canActivate(contextWith('Bearer the-secret'))).toBe(true)
  })

  it('refuses a wrong secret, and no header at all', () => {
    const guard = new CronSecretGuard()
    expect(() => guard.canActivate(contextWith('Bearer nope'))).toThrow(
      UnauthorizedException
    )
    expect(() => guard.canActivate(contextWith())).toThrow(
      UnauthorizedException
    )
  })

  it('is closed by default: no configured secret means 503, not open door', () => {
    delete process.env.CRON_SECRET
    const guard = new CronSecretGuard()
    expect(() => guard.canActivate(contextWith('Bearer anything'))).toThrow(
      ServiceUnavailableException
    )
  })
})

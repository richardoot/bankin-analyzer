import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RELOAD_GUARD_MS,
  installStaleDeployRecovery,
  isStaleChunkError,
  recoverFromStaleDeploy,
} from './stale-deploy'
import type { RecoveryDeps } from './stale-deploy'
import type { Router } from 'vue-router'

const { captureMessage } = vi.hoisted(() => ({ captureMessage: vi.fn() }))
vi.mock('@sentry/vue', () => ({ captureMessage }))

describe('isStaleChunkError', () => {
  it("recognises each browser's wording", () => {
    expect(
      isStaleChunkError(
        new TypeError(
          'Failed to fetch dynamically imported module: https://x/assets/a-1.js'
        )
      )
    ).toBe(true)
    expect(
      isStaleChunkError(new TypeError('Importing a module script failed.'))
    ).toBe(true)
    expect(
      isStaleChunkError(
        new TypeError('error loading dynamically imported module: x')
      )
    ).toBe(true)
    expect(isStaleChunkError('Unable to preload CSS for /assets/a.css')).toBe(
      true
    )
  })

  it('leaves every other error alone', () => {
    expect(isStaleChunkError(new Error('Network request failed'))).toBe(false)
    expect(isStaleChunkError(new TypeError('x is not a function'))).toBe(false)
    expect(isStaleChunkError(undefined)).toBe(false)
  })
})

describe('recoverFromStaleDeploy', () => {
  let store: Map<string, string>
  let deps: RecoveryDeps & { reload: ReturnType<typeof vi.fn<() => void>> }
  let clock: number

  beforeEach(() => {
    captureMessage.mockClear()
    store = new Map()
    clock = 1_000_000
    deps = {
      reload: vi.fn<() => void>(),
      storage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
      now: () => clock,
    }
  })

  it('reloads once and says so, quietly', () => {
    expect(recoverFromStaleDeploy(deps)).toBe(true)
    expect(deps.reload).toHaveBeenCalledOnce()
    expect(captureMessage).toHaveBeenCalledWith(
      'Stale deployment: reloading the tab',
      expect.objectContaining({ level: 'info' })
    )
  })

  it('refuses a second reload within the guard window: that is not staleness', () => {
    recoverFromStaleDeploy(deps)
    clock += RELOAD_GUARD_MS - 1
    expect(recoverFromStaleDeploy(deps)).toBe(false)
    expect(deps.reload).toHaveBeenCalledOnce()
  })

  it('reloads again once the window has passed', () => {
    recoverFromStaleDeploy(deps)
    clock += RELOAD_GUARD_MS
    expect(recoverFromStaleDeploy(deps)).toBe(true)
    expect(deps.reload).toHaveBeenCalledTimes(2)
  })

  it('still reloads without storage, and survives a storage that refuses', () => {
    expect(recoverFromStaleDeploy({ ...deps, storage: null })).toBe(true)
    const refusing = {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    }
    expect(recoverFromStaleDeploy({ ...deps, storage: refusing })).toBe(true)
  })
})

describe('installStaleDeployRecovery', () => {
  it('listens to Vite and to the router', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const onError = vi.fn()
    installStaleDeployRecovery({ onError } as unknown as Router)
    expect(addEventListener).toHaveBeenCalledWith(
      'vite:preloadError',
      expect.any(Function)
    )
    expect(onError).toHaveBeenCalledWith(expect.any(Function))
    addEventListener.mockRestore()
  })
})

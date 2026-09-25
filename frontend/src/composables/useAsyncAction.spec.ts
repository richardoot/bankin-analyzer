import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useAsyncAction } from './useAsyncAction'

const mockToastError = vi.fn()
const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }))

vi.mock('@sentry/vue', () => ({ captureException }))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({
    toasts: { value: [] },
    success: vi.fn(),
    error: mockToastError,
    info: vi.fn(),
    remove: vi.fn(),
  }),
}))

describe('useAsyncAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('run() sets isLoading during execution', async () => {
    const { run, isLoading } = useAsyncAction()
    let loadingDuringAction = false

    await run(async () => {
      loadingDuringAction = isLoading.value
      return 'done'
    }, 'error')

    expect(loadingDuringAction).toBe(true)
    expect(isLoading.value).toBe(false)
  })

  it('run() returns the action result on success', async () => {
    const { run } = useAsyncAction()
    const result = await run(async () => 'hello', 'error')
    expect(result).toBe('hello')
  })

  it('run() sets error on failure', async () => {
    const { run, error } = useAsyncAction()
    await run(async () => {
      throw new Error('boom')
    }, 'Fallback error')

    expect(error.value).toBe('boom')
  })

  it('run() returns null on failure', async () => {
    const { run } = useAsyncAction()
    const result = await run(async () => {
      throw new Error('boom')
    }, 'Fallback error')

    expect(result).toBeNull()
  })

  it('run() resets error on new call', async () => {
    const { run, error } = useAsyncAction()

    await run(async () => {
      throw new Error('first error')
    }, 'err')

    expect(error.value).toBe('first error')

    await run(async () => 'success', 'err')

    expect(error.value).toBeNull()
  })

  it('clearError() clears the error', async () => {
    const { run, error, clearError } = useAsyncAction()

    await run(async () => {
      throw new Error('some error')
    }, 'err')

    expect(error.value).toBe('some error')

    clearError()

    expect(error.value).toBeNull()
  })

  it('run() triggers error toast on failure', async () => {
    const { run } = useAsyncAction()

    await run(async () => {
      throw new Error('toast error')
    }, 'Fallback')

    expect(mockToastError).toHaveBeenCalledWith('toast error')
  })
})

describe('useAsyncAction — what Sentry hears about', () => {
  beforeEach(() => {
    captureException.mockClear()
  })

  it('reports the error behind a toast, so it is not lost with it', async () => {
    const { run } = useAsyncAction()
    const boom = new TypeError('Cannot read properties of undefined')
    await run(() => Promise.reject(boom), 'fallback')
    expect(captureException).toHaveBeenCalledWith(boom)
  })

  it('keeps a session problem out: the login flow owns it', async () => {
    const { run } = useAsyncAction()
    const expired = new Error('Session expiree')
    expired.name = 'AuthError'
    await run(() => Promise.reject(expired), 'fallback')
    expect(captureException).not.toHaveBeenCalled()
    expect(mockToastError).toHaveBeenCalledWith('Session expiree')
  })
})

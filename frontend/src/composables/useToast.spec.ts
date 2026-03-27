import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { useToast } from './useToast'

describe('useToast', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    // Clear any leftover toasts from previous tests
    const { toasts, remove } = useToast()
    toasts.value.forEach(t => remove(t.id))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('success() adds a success toast', () => {
    const { toasts, success } = useToast()
    success('Operation succeeded')

    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('success')
    expect(toasts.value[0].message).toBe('Operation succeeded')
  })

  it('error() adds an error toast', () => {
    const { toasts, error } = useToast()
    error('Something failed')

    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('error')
    expect(toasts.value[0].message).toBe('Something failed')
  })

  it('info() adds an info toast', () => {
    const { toasts, info } = useToast()
    info('FYI')

    expect(toasts.value).toHaveLength(1)
    expect(toasts.value[0].type).toBe('info')
    expect(toasts.value[0].message).toBe('FYI')
  })

  it('remove() removes a toast by id', () => {
    const { toasts, success, remove } = useToast()
    success('Toast 1')
    const id = toasts.value[0].id
    remove(id)

    expect(toasts.value).toHaveLength(0)
  })

  it('auto-removes toast after duration', () => {
    const { toasts, success } = useToast()
    success('Temporary')

    expect(toasts.value).toHaveLength(1)

    vi.advanceTimersByTime(4000)

    expect(toasts.value).toHaveLength(0)
  })

  it('multiple toasts can coexist', () => {
    const { toasts, success, error, info } = useToast()
    success('First')
    error('Second')
    info('Third')

    expect(toasts.value).toHaveLength(3)
  })

  it('each toast has a unique id', () => {
    const { toasts, success } = useToast()
    success('A')
    success('B')
    success('C')

    const ids = toasts.value.map(t => t.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(3)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RouteLocationNormalized } from 'vue-router'

// The guard reads three things from the auth store; nothing else in the
// store matters here, and the real one drags in the Supabase client.
const authState = {
  loading: false,
  isAuthenticated: false,
  $subscribe: vi.fn(),
}
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))
vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import router from './index'

describe('router guard', () => {
  beforeEach(async () => {
    authState.isAuthenticated = false
    // Pushing the route the router already stands on is a no-op that skips
    // the guard; start every case from a public page nothing redirects.
    await router.push('/terms')
  })

  it('lets a visitor read the public homepage', async () => {
    await router.push('/')

    expect(router.currentRoute.value.name).toBe('home')
  })

  it('sends a signed-in user from the homepage to their dashboard', async () => {
    authState.isAuthenticated = true

    await router.push('/')

    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('sends a signed-in user from the login page to their dashboard', async () => {
    authState.isAuthenticated = true

    await router.push('/login')

    expect(router.currentRoute.value.name).toBe('dashboard')
  })

  it('sends a visitor from a private page to the login page, remembering where they were going', async () => {
    await router.push('/transactions?type=expense')

    expect(router.currentRoute.value.name).toBe('login')
    expect(router.currentRoute.value.query.redirect).toBe(
      '/transactions?type=expense'
    )
  })

  it('keeps the password reset reachable whether signed in or not', async () => {
    await router.push('/reset-password')
    expect(router.currentRoute.value.name).toBe('reset-password')

    authState.isAuthenticated = true
    await router.push('/terms')
    await router.push('/reset-password')
    expect(router.currentRoute.value.name).toBe('reset-password')
  })

  it('sends the old query-string recap to the history', async () => {
    authState.isAuthenticated = true
    await router.push('/import/recap?imported=3')
    expect(router.currentRoute.value.name).toBe('import-history')

    await router.push('/import/recap/abc')
    expect(router.currentRoute.value.name).toBe('import-recap')
    expect(router.currentRoute.value.params.id).toBe('abc')
  })

  it('keeps the legal pages public', async () => {
    await router.push('/privacy')

    expect(router.currentRoute.value.name).toBe('privacy')
  })
})

describe('router scroll', () => {
  const scroll = router.options.scrollBehavior
  // The scroll hook takes normalized locations; a resolved one carries the
  // same path and query, which is all it reads.
  const at = (path: string) =>
    router.resolve(path) as unknown as RouteLocationNormalized

  it('opens a new page at its top', () => {
    expect(scroll?.(at('/budget'), at('/transactions'), null)).toEqual({
      top: 0,
    })
  })

  it('returns where the user was on back and forward', () => {
    expect(
      scroll?.(at('/transactions'), at('/budget'), { left: 0, top: 640 })
    ).toEqual({ left: 0, top: 640 })
  })

  it('leaves the scroll alone when only the query changes', () => {
    expect(
      scroll?.(at('/transactions?page=2'), at('/transactions'), null)
    ).toBe(false)
  })
})

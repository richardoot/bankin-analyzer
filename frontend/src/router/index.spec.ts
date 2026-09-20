import { describe, it, expect, vi, beforeEach } from 'vitest'

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

  it('keeps the legal pages public', async () => {
    await router.push('/privacy')

    expect(router.currentRoute.value.name).toBe('privacy')
  })
})

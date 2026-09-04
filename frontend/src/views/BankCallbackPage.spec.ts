import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import BankCallbackPage from './BankCallbackPage.vue'

vi.mock('@/lib/api', () => ({
  api: { completeBankAuthorization: vi.fn() },
}))

import { api } from '@/lib/api'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div />' } },
    { path: '/bank-callback', component: BankCallbackPage },
    {
      path: '/settings/banks',
      name: 'settings-banks',
      component: { template: '<div>Banques</div>' },
    },
  ],
})

async function arriveWith(query: string) {
  await router.push(`/bank-callback${query}`)
  await router.isReady()
  const wrapper = mount(BankCallbackPage, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useRealTimers()
})

describe('BankCallbackPage', () => {
  it('finishes the authorization on arrival, without waiting for a click', async () => {
    // The code is single-use and short-lived; a button would routinely be
    // pressed too late.
    vi.mocked(api.completeBankAuthorization).mockResolvedValue({
      id: 'conn-1',
      aspspName: 'Boursorama Banque',
      aspspCountry: 'FR',
      status: 'ACTIVE',
      consentValidUntil: null,
      lastSyncAt: null,
      action: 'fetch',
      reason: 'due',
      daysUntilConsentExpires: 180,
      accounts: [],
    })

    const wrapper = await arriveWith('?code=abc-123&state=xyz')

    expect(api.completeBankAuthorization).toHaveBeenCalledWith('abc-123')
    expect(wrapper.get('[data-testid="callback-done"]').text()).toContain(
      'Boursorama Banque'
    )
  })

  it('says nothing is read yet, since every account starts off', async () => {
    vi.mocked(api.completeBankAuthorization).mockResolvedValue({
      id: 'conn-1',
      aspspName: 'CIC',
      aspspCountry: 'FR',
      status: 'ACTIVE',
      consentValidUntil: null,
      lastSyncAt: null,
      action: 'fetch',
      reason: 'due',
      daysUntilConsentExpires: null,
      accounts: [],
    })

    const wrapper = await arriveWith('?code=abc-123')

    expect(wrapper.text()).toContain("Aucun compte n'est lu")
  })

  it('shows the server’s own words when the exchange fails', async () => {
    // A code already spent, a session gone, a redirect the bank refuses: each
    // needs something different, and none is guessable from the browser.
    vi.mocked(api.completeBankAuthorization).mockRejectedValue(
      new Error('This authorization code has already been exchanged.')
    )

    const wrapper = await arriveWith('?code=spent')

    expect(wrapper.find('[data-testid="callback-failed"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('already been exchanged')
  })

  it('does not call the API when no code came back', async () => {
    const wrapper = await arriveWith('')

    expect(api.completeBankAuthorization).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="callback-nothing"]').exists()).toBe(true)
  })

  it('surfaces the reason the bank gave for refusing', async () => {
    const wrapper = await arriveWith('?error=access_denied')

    expect(wrapper.text()).toContain('access_denied')
  })
})

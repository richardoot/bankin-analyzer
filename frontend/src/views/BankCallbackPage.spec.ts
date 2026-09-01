import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import BankCallbackPage from './BankCallbackPage.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
    {
      path: '/bank-callback',
      name: 'bank-callback',
      component: BankCallbackPage,
    },
  ],
})

async function mountAt(query: string) {
  await router.push(`/bank-callback${query}`)
  await router.isReady()
  const wrapper = mount(BankCallbackPage, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

const writeText = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  writeText.mockClear()
  // `navigator.clipboard` is getter-only in jsdom, so it has to be redefined
  // rather than assigned.
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText },
    configurable: true,
  })
})

describe('BankCallbackPage', () => {
  it('shows the authorization code the bank sent back', async () => {
    const wrapper = await mountAt('?code=abc-123&state=xyz')

    const input = wrapper.get('[data-testid="bank-callback-code"]')
    expect((input.element as HTMLInputElement).value).toBe('abc-123')
    expect(wrapper.text()).toContain('Banque autorisee')
  })

  it('builds the command with the code already in it', async () => {
    const wrapper = await mountAt('?code=abc-123')

    expect(wrapper.text()).toContain(
      'spike-enable-banking-fetch.ts --code abc-123'
    )
  })

  it('copies the code to the clipboard', async () => {
    const wrapper = await mountAt('?code=abc-123')

    await wrapper.get('[aria-label="Copier le code"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith('abc-123')
  })

  it('copies the whole command', async () => {
    const wrapper = await mountAt('?code=abc-123')

    await wrapper.get('[aria-label="Copier la commande"]').trigger('click')

    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('--code abc-123')
    )
  })

  it('says so when no code came back, rather than showing an empty box', async () => {
    const wrapper = await mountAt('')

    expect(wrapper.text()).toContain('Aucun code recu')
    expect(wrapper.find('[data-testid="bank-callback-code"]').exists()).toBe(
      false
    )
  })

  it('surfaces the error the bank returned', async () => {
    const wrapper = await mountAt('?error=access_denied')

    expect(wrapper.text()).toContain('access_denied')
  })
})

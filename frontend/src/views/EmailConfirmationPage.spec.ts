import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import EmailConfirmationPage from './EmailConfirmationPage.vue'

const authState = vi.hoisted(() => ({ resendConfirmation: vi.fn() }))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/login', component: { template: '<div />' } },
    { path: '/email-confirmation', component: EmailConfirmationPage },
  ],
})

describe('EmailConfirmationPage', () => {
  beforeEach(async () => {
    vi.useFakeTimers()
    authState.resendConfirmation.mockReset()
    await router.push('/email-confirmation?email=moi@exemple.com')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resends the confirmation once, then rests for a minute', async () => {
    authState.resendConfirmation.mockResolvedValue(undefined)
    const wrapper = mount(EmailConfirmationPage, {
      global: { plugins: [router] },
    })

    const button = () => wrapper.find('[data-testid="email-resend"]')
    expect(button().attributes('disabled')).toBeUndefined()

    await button().trigger('click')
    await flushPromises()
    expect(authState.resendConfirmation).toHaveBeenCalledWith('moi@exemple.com')
    expect(wrapper.find('[data-testid="email-resent"]').exists()).toBe(true)

    // The anti-bounce: disabled, counting down, and a second click is inert.
    expect(button().attributes('disabled')).toBeDefined()
    expect(button().text()).toMatch(/60 s/)
    await button().trigger('click')
    expect(authState.resendConfirmation).toHaveBeenCalledTimes(1)

    vi.advanceTimersByTime(60_000)
    await flushPromises()
    expect(button().attributes('disabled')).toBeUndefined()
    expect(button().text()).toBe("Renvoyer l'e-mail")
  })

  it('says when the resend failed', async () => {
    authState.resendConfirmation.mockRejectedValue(new Error('Rate limit'))
    const wrapper = mount(EmailConfirmationPage, {
      global: { plugins: [router] },
    })

    await wrapper.find('[data-testid="email-resend"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="email-resend-error"]').text()).toContain(
      'Rate limit'
    )
    expect(
      wrapper.find('[data-testid="email-resend"]').attributes('disabled')
    ).toBeUndefined()
  })
})

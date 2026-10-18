import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ForgotPasswordPage from './ForgotPasswordPage.vue'

// Reactive, so an error the store sets reaches the page as it would live.
const authState = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return reactive({
    loading: false,
    error: null as string | null,
    clearError: vi.fn(),
    requestPasswordReset: vi.fn(),
  })
})
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/login', component: { template: '<div />' } },
  ],
})

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    authState.error = null
    authState.requestPasswordReset.mockReset()
  })

  it('asks Supabase for a reset link and says so without naming who exists', async () => {
    authState.requestPasswordReset.mockResolvedValue(undefined)
    const wrapper = mount(ForgotPasswordPage, { global: { plugins: [router] } })

    await wrapper
      .find('[data-testid="forgot-password-email"]')
      .setValue('  moi@exemple.com ')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(authState.requestPasswordReset).toHaveBeenCalledWith(
      'moi@exemple.com'
    )
    const sent = wrapper.find('[data-testid="forgot-password-sent"]')
    expect(sent.exists()).toBe(true)
    expect(sent.text()).toContain('Si un compte existe')
    expect(wrapper.find('form').exists()).toBe(false)
  })

  it('refuses an empty address without calling the server', async () => {
    const wrapper = mount(ForgotPasswordPage, { global: { plugins: [router] } })
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(authState.requestPasswordReset).not.toHaveBeenCalled()
    expect(
      wrapper.find('[data-testid="forgot-password-error"]').text()
    ).toContain('adresse')
  })

  it('shows the store error when the request fails', async () => {
    authState.requestPasswordReset.mockImplementation(async () => {
      authState.error = 'Trop de demandes'
      throw new Error('Trop de demandes')
    })
    const wrapper = mount(ForgotPasswordPage, { global: { plugins: [router] } })
    await wrapper
      .find('[data-testid="forgot-password-email"]')
      .setValue('moi@exemple.com')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(
      wrapper.find('[data-testid="forgot-password-error"]').text()
    ).toContain('Trop de demandes')
    expect(wrapper.find('[data-testid="forgot-password-sent"]').exists()).toBe(
      false
    )
  })
})

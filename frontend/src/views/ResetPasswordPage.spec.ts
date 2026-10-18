import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import ResetPasswordPage from './ResetPasswordPage.vue'

const authState = vi.hoisted(() => ({
  loading: false,
  error: null as string | null,
  isAuthenticated: true,
  passwordRecovery: true,
  clearError: vi.fn(),
  updatePassword: vi.fn(),
}))
vi.mock('@/stores/auth', () => ({ useAuthStore: () => authState }))

const mockToast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('@/composables/useToast', () => ({ useToast: () => mockToast }))

const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/dashboard', component: { template: '<div />' } },
    { path: '/forgot-password', component: { template: '<div />' } },
  ],
})

async function fill(
  wrapper: ReturnType<typeof mount>,
  password: string,
  confirm: string
) {
  await wrapper.find('[data-testid="reset-password-input"]').setValue(password)
  await wrapper.find('[data-testid="reset-password-confirm"]').setValue(confirm)
  await wrapper.find('form').trigger('submit')
  await flushPromises()
}

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    authState.error = null
    authState.isAuthenticated = true
    authState.passwordRecovery = true
    authState.updatePassword.mockReset()
    mockToast.success.mockReset()
  })

  it('sets the new password on the recovered session and carries on signed in', async () => {
    authState.updatePassword.mockResolvedValue(undefined)
    const push = vi.spyOn(router, 'push')
    const wrapper = mount(ResetPasswordPage, { global: { plugins: [router] } })
    expect(
      wrapper.find('[data-testid="reset-password-intro"]').text()
    ).toContain('lien a bien été reconnu')

    await fill(wrapper, 'nouveau-mdp', 'nouveau-mdp')

    expect(authState.updatePassword).toHaveBeenCalledWith('nouveau-mdp')
    expect(mockToast.success).toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/dashboard')
  })

  it('checks the length and the confirmation before calling the server', async () => {
    const wrapper = mount(ResetPasswordPage, { global: { plugins: [router] } })

    await fill(wrapper, 'abc', 'abc')
    expect(
      wrapper.find('[data-testid="reset-password-error"]').text()
    ).toContain('au moins 6')

    await fill(wrapper, 'abcdefg', 'abcdefh')
    expect(
      wrapper.find('[data-testid="reset-password-error"]').text()
    ).toContain('ne correspondent pas')
    expect(authState.updatePassword).not.toHaveBeenCalled()
  })

  it('says the link is spent when no session came with it', () => {
    authState.isAuthenticated = false
    const wrapper = mount(ResetPasswordPage, { global: { plugins: [router] } })

    expect(
      wrapper.find('[data-testid="reset-password-expired"]').exists()
    ).toBe(true)
    expect(wrapper.find('form').exists()).toBe(false)
    expect(wrapper.find('a[href="/forgot-password"]').exists()).toBe(true)
  })
})

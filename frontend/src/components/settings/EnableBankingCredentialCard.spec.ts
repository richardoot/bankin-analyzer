import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import EnableBankingCredentialCard from './EnableBankingCredentialCard.vue'

vi.mock('@/lib/api', () => ({
  api: {
    getEnableBankingCredential: vi.fn(),
    saveEnableBankingCredential: vi.fn(),
    removeEnableBankingCredential: vi.fn(),
  },
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn() }),
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

async function mountCard(applicationId: string | null = null) {
  vi.mocked(api.getEnableBankingCredential).mockResolvedValue({
    applicationId,
  })
  const wrapper = mount(EnableBankingCredentialCard)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EnableBankingCredentialCard', () => {
  it('offers the form when this user has no application yet', async () => {
    const wrapper = await mountCard(null)

    expect(wrapper.find('[data-testid="application-id-input"]').exists()).toBe(
      true
    )
    expect(
      wrapper
        .find('[data-testid="enable-banking-credential-configured"]')
        .exists()
    ).toBe(false)
  })

  it('shows the application id, never the key, once configured', async () => {
    const wrapper = await mountCard('app-123')

    expect(wrapper.text()).toContain('app-123')
    expect(wrapper.find('[data-testid="application-id-input"]').exists()).toBe(
      false
    )
  })

  it('keeps the save button off until both fields are filled', async () => {
    const wrapper = await mountCard(null)

    const button = wrapper.find('[data-testid="save-credential-button"]')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)

    await wrapper.find('[data-testid="application-id-input"]').setValue('app-1')
    expect((button.element as HTMLButtonElement).disabled).toBe(true)
  })

  it('saves the application id and file, then reports success', async () => {
    vi.mocked(api.saveEnableBankingCredential).mockResolvedValue({
      applicationId: 'app-1',
    })
    const wrapper = await mountCard(null)

    await wrapper.find('[data-testid="application-id-input"]').setValue('app-1')

    const file = new File(['pem-content'], 'key.pem', {
      type: 'application/x-pem-file',
    })
    const fileInput = wrapper.find('[data-testid="private-key-file-input"]')
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')

    await wrapper
      .find('[data-testid="save-credential-button"]')
      .trigger('click')
    await flushPromises()

    expect(api.saveEnableBankingCredential).toHaveBeenCalledWith('app-1', file)
    expect(toastSuccess).toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toBeTruthy()
    expect(wrapper.text()).toContain('app-1')
  })

  it('reports the server’s refusal rather than a generic message', async () => {
    vi.mocked(api.saveEnableBankingCredential).mockRejectedValue(
      new Error('This private key cannot be used to sign a request.')
    )
    const wrapper = await mountCard(null)

    await wrapper.find('[data-testid="application-id-input"]').setValue('app-1')
    const file = new File(['not-a-pem'], 'key.pem')
    const fileInput = wrapper.find('[data-testid="private-key-file-input"]')
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await wrapper
      .find('[data-testid="save-credential-button"]')
      .trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(
      'This private key cannot be used to sign a request.'
    )
    expect(wrapper.emitted('changed')).toBeFalsy()
  })

  it('removes a configured application', async () => {
    vi.mocked(api.removeEnableBankingCredential).mockResolvedValue(undefined)
    const wrapper = await mountCard('app-1')

    await wrapper
      .find('[data-testid="remove-credential-button"]')
      .trigger('click')
    await flushPromises()

    expect(api.removeEnableBankingCredential).toHaveBeenCalled()
    expect(wrapper.emitted('changed')).toBeTruthy()
    expect(wrapper.find('[data-testid="application-id-input"]').exists()).toBe(
      true
    )
  })

  it('carries the mini tutorial, mentioning the redirect URL this instance uses', async () => {
    const wrapper = await mountCard(null)

    expect(wrapper.text()).toContain('/bank-callback')
  })

  it('links to the Enable Banking sign-in page in the tutorial', async () => {
    const wrapper = await mountCard(null)

    const link = wrapper.find(
      '[data-testid="enable-banking-tutorial"] a[href="https://enablebanking.com/sign-in/"]'
    )
    expect(link.exists()).toBe(true)
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })
})

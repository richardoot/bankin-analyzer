import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountsSettingsPage from './AccountsSettingsPage.vue'
import type { AccountDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getAccounts: vi.fn(),
    updateAccount: vi.fn(),
  },
}))

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError }),
}))

import { api } from '@/lib/api'
import { nth } from '@/test/nth'

enableAutoUnmount(afterEach)

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: 'acc-1',
    name: 'Compte courant',
    type: 'STANDARD',
    divisor: 1,
    isExcludedFromBudget: false,
    isExcludedFromStats: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

async function mountPage(accounts: AccountDto[]) {
  vi.mocked(api.getAccounts).mockResolvedValue(accounts)
  const wrapper = mount(AccountsSettingsPage, {
    global: { stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('AccountsSettingsPage', () => {
  it('lists every account as a card', async () => {
    const wrapper = await mountPage([
      account(),
      account({ id: 'acc-2', name: 'Livret A' }),
    ])

    expect(wrapper.findAll('[data-testid="account-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Compte courant')
    expect(wrapper.text()).toContain('Livret A')
  })

  it('summarises a joint account with a divisor badge without expanding it', async () => {
    const wrapper = await mountPage([
      account({ type: 'JOINT', divisor: 2, isExcludedFromBudget: true }),
    ])

    expect(wrapper.text()).toContain('Joint ÷2')
    expect(wrapper.text()).toContain('Hors budget')
  })

  it('renames an account and clears the draft', async () => {
    const wrapper = await mountPage([account()])
    vi.mocked(api.updateAccount).mockResolvedValue(
      account({ name: 'Compte perso' })
    )

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    await wrapper.find('input[type="text"]').setValue('Compte perso')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(api.updateAccount).toHaveBeenCalledWith('acc-1', {
      name: 'Compte perso',
    })
    expect(toastSuccess).toHaveBeenCalledWith(
      'Compte renommé en « Compte perso »'
    )
  })

  it('surfaces a rename conflict next to the input', async () => {
    const wrapper = await mountPage([account()])
    vi.mocked(api.updateAccount).mockRejectedValue(
      new Error('An account named "Livret A" already exists.')
    )

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    await wrapper.find('input[type="text"]').setValue('Livret A')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="rename-error"]').text()).toContain(
      'already exists'
    )
  })

  it('switches the account type', async () => {
    const wrapper = await mountPage([account()])
    vi.mocked(api.updateAccount).mockResolvedValue(
      account({ type: 'JOINT', divisor: 2 })
    )

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    const typeButtons = wrapper
      .findAll('button')
      .filter(b => b.text() === 'Joint')
    await nth(typeButtons, 0).trigger('click')
    await flushPromises()

    expect(api.updateAccount).toHaveBeenCalledWith('acc-1', { type: 'JOINT' })
  })

  it('rejects an out-of-range divisor without calling the API', async () => {
    const wrapper = await mountPage([account()])

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    const divisorInput = wrapper.find('input[type="number"]')
    await divisorInput.setValue('42')
    await divisorInput.trigger('change')
    await flushPromises()

    expect(api.updateAccount).not.toHaveBeenCalled()
    expect(toastError).toHaveBeenCalledWith(
      'Le diviseur doit être compris entre 1 et 10'
    )
  })

  it('excludes an account from statistics through the switch', async () => {
    const wrapper = await mountPage([account()])
    vi.mocked(api.updateAccount).mockResolvedValue(
      account({ isExcludedFromStats: true })
    )

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    const switches = wrapper.findAll('button[role="switch"]')
    await nth(switches, 0).trigger('click')
    await flushPromises()

    expect(api.updateAccount).toHaveBeenCalledWith('acc-1', {
      isExcludedFromStats: true,
    })
  })

  it('shows an empty state when no account exists', async () => {
    const wrapper = await mountPage([])

    expect(wrapper.text()).toContain('Aucun compte disponible')
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import DeleteBankAccountModal from './DeleteBankAccountModal.vue'

vi.mock('@/lib/api', () => ({
  api: {
    getAccounts: vi.fn(),
    updateAccount: vi.fn(),
    getAccountDeletionSummary: vi.fn(),
    deleteBankAccount: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const mockedApi = vi.mocked(api)

const account = {
  id: 'acc-1',
  name: 'Compte Joint',
  type: 'JOINT' as const,
  divisor: 2,
  isExcludedFromBudget: false,
  isExcludedFromStats: false,
  createdAt: '',
  updatedAt: '',
}

const summary = {
  accountId: 'acc-1',
  accountName: 'Compte Joint',
  transactionCount: 128,
  firstTransactionDate: '2024-01-05T00:00:00.000Z',
  lastTransactionDate: '2024-06-30T00:00:00.000Z',
  reimbursementCount: 2,
  settlementCount: 1,
}

enableAutoUnmount(() => {})

async function mountModal() {
  const wrapper = mount(DeleteBankAccountModal, {
    props: { account },
    // Stubbed so the dialog renders inside the wrapper rather than in <body>.
    global: { stubs: { Teleport: true } },
  })
  await flushPromises()
  return wrapper
}

const confirmButton = (wrapper: Awaited<ReturnType<typeof mountModal>>) =>
  wrapper.get('[data-testid="confirm-delete-account"]')

describe('DeleteBankAccountModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedApi.getAccountDeletionSummary.mockResolvedValue(summary)
    mockedApi.deleteBankAccount.mockResolvedValue({ deletedTransactions: 128 })
  })

  it('spells out what the deletion would take away', async () => {
    const wrapper = await mountModal()

    const impact = wrapper.get('[data-testid="deletion-impact"]').text()
    expect(impact).toContain('128')
    expect(impact).toContain('transactions seront supprimées')
    expect(impact).toContain('2')
    expect(impact).toContain('1')
    expect(mockedApi.getAccountDeletionSummary).toHaveBeenCalledWith('acc-1')
  })

  it('keeps the delete button locked until the account name is typed back', async () => {
    const wrapper = await mountModal()

    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('input').setValue('Compte')
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()

    await wrapper.get('input').setValue('  compte joint  ')
    expect(confirmButton(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('never calls the API while the confirmation is wrong', async () => {
    const wrapper = await mountModal()

    await wrapper.get('input').setValue('autre compte')
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockedApi.deleteBankAccount).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('deletes and reports the account once confirmed', async () => {
    const wrapper = await mountModal()

    await wrapper.get('input').setValue('Compte Joint')
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(mockedApi.deleteBankAccount).toHaveBeenCalledWith('acc-1')
    expect(wrapper.emitted('deleted')?.[0]).toEqual([
      { account, deletedTransactions: 128 },
    ])
  })

  it('shows the server error in place and stays open', async () => {
    mockedApi.deleteBankAccount.mockRejectedValue(
      new Error('Account acc-1 not found')
    )
    const wrapper = await mountModal()

    await wrapper.get('input').setValue('Compte Joint')
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="deletion-error"]').text()).toBe(
      'Account acc-1 not found'
    )
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('resets the typed confirmation when it is pointed at another account', async () => {
    const wrapper = await mountModal()
    await wrapper.get('input').setValue('Compte Joint')

    await wrapper.setProps({
      account: { ...account, id: 'acc-2', name: 'Livret A' },
    })
    await flushPromises()

    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('')
    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
  })
})

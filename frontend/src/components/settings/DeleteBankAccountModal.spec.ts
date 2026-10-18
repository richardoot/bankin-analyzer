import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
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

// The links to the Transactions page need a router behind RouterLink.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

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

enableAutoUnmount(afterEach)

afterEach(() => {
  document.body.innerHTML = ''
})

// The dialog teleports to <body> and the typed name lives in a brick of
// its own, so the spec reads the document rather than stubbing the Teleport
// (a stubbed one remounts its subtree on every render and loses the text).
const q = <T extends Element>(selector: string): T => {
  const el = document.body.querySelector<T>(selector)
  if (!el) throw new Error(`no element matches ${selector}`)
  return el
}

const typedInput = () =>
  q<HTMLInputElement>('[data-testid="delete-bank-account-confirmation"]')

async function type(value: string): Promise<void> {
  const input = typedInput()
  input.value = value
  input.dispatchEvent(new Event('input'))
  await flushPromises()
}

async function mountModal() {
  const wrapper = mount(DeleteBankAccountModal, {
    global: { plugins: [router] },
    props: { account },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const confirmButton = () =>
  q<HTMLButtonElement>('[data-testid="confirm-delete-account"]')

describe('DeleteBankAccountModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    mockedApi.getAccountDeletionSummary.mockResolvedValue(summary)
    mockedApi.deleteBankAccount.mockResolvedValue({ deletedTransactions: 128 })
  })

  it('spells out what the deletion would take away', async () => {
    await mountModal()

    const impact = q('[data-testid="deletion-impact"]').textContent ?? ''
    expect(impact).toContain('128')
    expect(impact).toContain('transactions seront supprimées')
    expect(impact).toContain('2')
    expect(impact).toContain('1')
    expect(mockedApi.getAccountDeletionSummary).toHaveBeenCalledWith('acc-1')
  })

  it('opens as a destructive dialog named after the account', async () => {
    await mountModal()

    const dialog = q('[role="dialog"]')
    const id = dialog.getAttribute('aria-labelledby') ?? ''
    expect(document.getElementById(id)?.textContent).toContain('Compte Joint')
    expect(dialog.querySelector('[data-testid="modal-tone"]')).not.toBeNull()
  })

  it('keeps the delete button locked until the account name is typed back', async () => {
    await mountModal()

    expect(confirmButton().disabled).toBe(true)

    await type('Compte')
    expect(confirmButton().disabled).toBe(true)

    await type('  compte joint  ')
    expect(confirmButton().disabled).toBe(false)
  })

  it('never calls the API while the confirmation is wrong', async () => {
    const wrapper = await mountModal()

    await type('autre compte')
    confirmButton().click()
    await flushPromises()

    expect(mockedApi.deleteBankAccount).not.toHaveBeenCalled()
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('deletes and reports the account once confirmed', async () => {
    const wrapper = await mountModal()

    await type('Compte Joint')
    confirmButton().click()
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

    await type('Compte Joint')
    confirmButton().click()
    await flushPromises()

    expect(q('[data-testid="deletion-error"]').textContent?.trim()).toBe(
      'Account acc-1 not found'
    )
    expect(wrapper.emitted('deleted')).toBeUndefined()
  })

  it('resets the typed confirmation when it is pointed at another account', async () => {
    const wrapper = await mountModal()
    await type('Compte Joint')
    expect(confirmButton().disabled).toBe(false)

    await wrapper.setProps({
      account: { ...account, id: 'acc-2', name: 'Livret A' },
    })
    await flushPromises()

    expect(typedInput().value).toBe('')
    expect(confirmButton().disabled).toBe(true)
  })

  it('offers the rows it would delete, and closes on the way there', async () => {
    const wrapper = await mountModal()

    const link = q<HTMLAnchorElement>(
      '[data-testid="deletion-transactions-link"]'
    )
    expect(link.getAttribute('href')).toContain(
      `/transactions?account=${encodeURIComponent(account.name).replace(/%20/g, '+')}`
    )
    link.click()
    await flushPromises()

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BankAccountLink from './BankAccountLink.vue'
import type { AccountDto, DiscoveredAccountDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { updateAccount: vi.fn() },
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}))

function account(overrides: Partial<AccountDto> = {}): AccountDto {
  return {
    id: 'acc-1',
    name: 'Perso Bourso',
    type: 'STANDARD',
    divisor: 1,
    isExcludedFromBudget: false,
    isExcludedFromStats: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

function discoveredAccount(
  overrides: Partial<DiscoveredAccountDto> = {}
): DiscoveredAccountDto {
  return {
    linkId: 'link-1',
    externalAccountId: 'bank-1',
    accountName: 'M BOILLEY RICHARD',
    product: 'CAV - BOURSOBANK',
    cashAccountType: 'CACC',
    iban: 'FR7640618803300004080870294',
    accountId: null,
    accountLabel: null,
    isIngested: false,
    suggestion: null,
    warning: null,
    ...overrides,
  }
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('BankAccountLink', () => {
  it('renders the full account card when identified', () => {
    const wrapper = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount({ accountId: 'acc-1' }),
        account: account(),
        bankName: 'Boursorama Banque',
        expanded: false,
        saving: false,
        accountOptions: [account()],
      },
    })

    expect(wrapper.find('[data-testid="account-card"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="bank-account"]').exists()).toBe(false)
    expect(wrapper.text()).toContain('Boursorama Banque')
  })

  it('renders the lighter assign UI when not identified', () => {
    const wrapper = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount(),
        account: null,
        bankName: 'Boursorama Banque',
        expanded: false,
        saving: false,
        accountOptions: [account()],
      },
    })

    expect(wrapper.find('[data-testid="bank-account"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="account-card"]').exists()).toBe(false)
  })

  it('disables the ingestion toggle for a card account, identified or not', () => {
    const unidentified = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount({ cashAccountType: 'CARD' }),
        account: null,
        bankName: 'CIC',
        expanded: false,
        saving: false,
        accountOptions: [],
      },
    })
    expect(
      unidentified.get('[data-testid="ingest-toggle"]').attributes('disabled')
    ).toBeDefined()

    const identified = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount({
          accountId: 'acc-1',
          cashAccountType: 'CARD',
        }),
        account: account(),
        bankName: 'CIC',
        expanded: false,
        saving: false,
        accountOptions: [account()],
      },
    })
    expect(
      identified.get('[data-testid="ingest-toggle"]').attributes('disabled')
    ).toBeDefined()
  })

  it('emits assign with the chosen account id', async () => {
    const wrapper = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount(),
        account: null,
        bankName: 'Boursorama Banque',
        expanded: false,
        saving: false,
        accountOptions: [account(), account({ id: 'acc-2', name: 'CJ Fixe' })],
      },
    })

    await wrapper.get('[data-testid="account-select"]').setValue('acc-2')

    expect(wrapper.emitted('assign')?.[0]).toEqual(['acc-2'])
  })

  it('emits toggle-ingestion when the toggle is pressed', async () => {
    const wrapper = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount(),
        account: null,
        bankName: 'Boursorama Banque',
        expanded: false,
        saving: false,
        accountOptions: [],
      },
    })

    await wrapper.get('[data-testid="ingest-toggle"]').trigger('click')

    expect(wrapper.emitted('toggle-ingestion')).toHaveLength(1)
  })

  it('emits ask-delete from the identified card', async () => {
    const wrapper = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount({ accountId: 'acc-1' }),
        account: account(),
        bankName: 'Boursorama Banque',
        expanded: true,
        saving: false,
        accountOptions: [account()],
      },
    })

    await wrapper.get('[data-testid="delete-account"]').trigger('click')

    expect(wrapper.emitted('ask-delete')).toHaveLength(1)
  })

  it('states a suggestion against the evidence when unidentified', () => {
    const wrapper = mount(BankAccountLink, {
      props: {
        discovered: discoveredAccount({
          suggestion: {
            accountId: 'acc-1',
            accountLabel: 'Perso Bourso',
            matches: 560,
          },
        }),
        account: null,
        bankName: 'Boursorama Banque',
        expanded: false,
        saving: false,
        accountOptions: [account()],
      },
    })

    const suggestion = wrapper.get('[data-testid="account-suggestion"]')
    expect(suggestion.text()).toContain('560 transactions')
    expect(suggestion.text()).toContain('Perso Bourso')
  })
})

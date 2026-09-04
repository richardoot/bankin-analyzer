import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import BanksSettingsPage from './BanksSettingsPage.vue'
import type { BankConnectionDto, DiscoveredAccountDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getBankSyncStatus: vi.fn(),
    getBankConnections: vi.fn(),
    getBanks: vi.fn(),
    startBankAuthorization: vi.fn(),
    updateBankAccountLink: vi.fn(),
    syncBankConnection: vi.fn(),
    getAccounts: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/stores/accounts', () => ({
  useAccountsStore: () => ({
    load: vi.fn(),
    sortedAccounts: [
      { id: 'acc-1', name: 'Perso Bourso' },
      { id: 'acc-2', name: 'CJ Fixe' },
    ],
  }),
}))

const toastError = vi.fn()
const toastSuccess = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ error: toastError, success: toastSuccess, info: vi.fn() }),
}))

import { api } from '@/lib/api'

function account(
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

function connection(
  overrides: Partial<BankConnectionDto> = {}
): BankConnectionDto {
  return {
    id: 'conn-1',
    aspspName: 'Boursorama Banque',
    aspspCountry: 'FR',
    status: 'ACTIVE',
    consentValidUntil: null,
    lastSyncAt: null,
    action: 'fetch',
    reason: 'due',
    daysUntilConsentExpires: 120,
    accounts: [account()],
    ...overrides,
  }
}

async function mountWith(connections: BankConnectionDto[], configured = true) {
  vi.mocked(api.getBankSyncStatus).mockResolvedValue({ configured })
  vi.mocked(api.getBankConnections).mockResolvedValue(connections)
  vi.mocked(api.getBanks).mockResolvedValue([
    { name: 'Boursorama Banque', country: 'FR', beta: false },
    { name: 'CIC Banque Privée', country: 'FR', beta: true },
  ])
  const wrapper = mount(BanksSettingsPage)
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

describe('BanksSettingsPage', () => {
  it('offers nothing when the server cannot sync', async () => {
    // A button that only produces a puzzling failure is worse than no button.
    const wrapper = await mountWith([], false)

    expect(
      wrapper.find('[data-testid="bank-sync-unconfigured"]').exists()
    ).toBe(true)
    expect(api.getBankConnections).not.toHaveBeenCalled()
  })

  it('shows a connected bank and its accounts', async () => {
    const wrapper = await mountWith([connection()])

    expect(wrapper.text()).toContain('Boursorama Banque')
    expect(wrapper.text()).toContain('M BOILLEY RICHARD')
    expect(wrapper.text()).toContain('Expire dans 120 jours')
  })

  it('shows the IBAN, which is what tells two identical names apart', async () => {
    const wrapper = await mountWith([connection()])
    expect(wrapper.text()).toContain('FR7640618803300004080870294')
  })

  it('disables the sync button and says why', async () => {
    const wrapper = await mountWith([
      connection({ action: 'reconnect', reason: 'the consent has lapsed' }),
    ])

    const button = wrapper.get('[data-testid="sync-button"]')
    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="sync-reason"]').text()).toContain(
      'consent has lapsed'
    )
  })

  it('reads the bank when the button is pressed', async () => {
    vi.mocked(api.syncBankConnection).mockResolvedValue({
      connectionId: 'conn-1',
      fetched: 40,
      claimed: 30,
      inserted: 8,
      skippedDuplicates: 2,
      skippedAmbiguous: 0,
      accountsRead: 1,
    })
    const wrapper = await mountWith([connection()])

    await wrapper.get('[data-testid="sync-button"]').trigger('click')
    await flushPromises()

    expect(api.syncBankConnection).toHaveBeenCalledWith('conn-1')
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('8'))
  })

  it('cannot switch on a card account', async () => {
    // Its purchases are already reported by the account it settles onto.
    const wrapper = await mountWith([
      connection({
        accounts: [
          account({ cashAccountType: 'CARD', warning: 'counts each twice' }),
        ],
      }),
    ])

    expect(
      wrapper.get('[data-testid="ingest-toggle"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.get('[data-testid="account-warning"]').text()).toContain(
      'counts each twice'
    )
  })

  it('states a suggestion against the evidence, and applies it', async () => {
    vi.mocked(api.updateBankAccountLink).mockResolvedValue(account())
    const wrapper = await mountWith([
      connection({
        accounts: [
          account({
            suggestion: {
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
              matches: 560,
            },
          }),
        ],
      }),
    ])

    const suggestion = wrapper.get('[data-testid="account-suggestion"]')
    expect(suggestion.text()).toContain('560 transactions')
    expect(suggestion.text()).toContain('Perso Bourso')

    await suggestion.get('button').trigger('click')
    await flushPromises()

    expect(api.updateBankAccountLink).toHaveBeenCalledWith('link-1', {
      accountId: 'acc-1',
    })
  })

  it('says nothing about a suggestion once the account is identified', async () => {
    const wrapper = await mountWith([
      connection({
        accounts: [
          account({
            accountId: 'acc-1',
            accountLabel: 'Perso Bourso',
            suggestion: {
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
              matches: 560,
            },
          }),
        ],
      }),
    ])

    expect(wrapper.find('[data-testid="account-suggestion"]').exists()).toBe(
      false
    )
  })

  it('shows the server’s own words when it refuses', async () => {
    vi.mocked(api.updateBankAccountLink).mockRejectedValue(
      new Error('its transactions have nowhere to go')
    )
    const wrapper = await mountWith([connection()])

    await wrapper.get('[data-testid="ingest-toggle"]').trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(
      'its transactions have nowhere to go'
    )
  })
})

describe('BanksSettingsPage — connecting a bank', () => {
  it('offers the banks to choose from, flagging the beta ones', async () => {
    // Hidden rather than flagged, a missing bank is a mystery; flagged, it is
    // a caveat.
    const wrapper = await mountWith([])

    const options = wrapper.get('[data-testid="bank-picker"]').findAll('option')
    expect(options.map(o => o.text())).toEqual([
      '— choisir —',
      'Boursorama Banque',
      'CIC Banque Privée (beta)',
    ])
  })

  it('cannot connect before a bank is chosen', async () => {
    const wrapper = await mountWith([])
    expect(
      wrapper.get('[data-testid="connect-button"]').attributes('disabled')
    ).toBeDefined()
  })

  it('sends the user to their bank, coming back to this application', async () => {
    vi.mocked(api.startBankAuthorization).mockResolvedValue({
      url: 'https://tilisy.enablebanking.com/ais/start?sessionid=x',
      state: 'st',
    })
    const wrapper = await mountWith([])

    await wrapper
      .get('[data-testid="bank-picker"]')
      .setValue('Boursorama Banque')
    await wrapper.get('[data-testid="connect-button"]').trigger('click')
    await flushPromises()

    expect(api.startBankAuthorization).toHaveBeenCalledWith({
      aspspName: 'Boursorama Banque',
      redirectUrl: expect.stringContaining('/bank-callback'),
    })
  })

  it('shows why a bank refused rather than redirecting anyway', async () => {
    vi.mocked(api.startBankAuthorization).mockRejectedValue(
      new Error('Redirect URI not allowed')
    )
    const wrapper = await mountWith([])

    await wrapper
      .get('[data-testid="bank-picker"]')
      .setValue('Boursorama Banque')
    await wrapper.get('[data-testid="connect-button"]').trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('Redirect URI not allowed')
  })
})

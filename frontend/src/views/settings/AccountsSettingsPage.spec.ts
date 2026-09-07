import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import AccountsSettingsPage from './AccountsSettingsPage.vue'
import type {
  AccountDto,
  BankConnectionDto,
  DiscoveredAccountDto,
} from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getAccounts: vi.fn(),
    updateAccount: vi.fn(),
    getBankSyncStatus: vi.fn(),
    getBankConnections: vi.fn(),
    getBankSyncNeedsReview: vi.fn(),
    getBanks: vi.fn(),
    startBankAuthorization: vi.fn(),
    updateBankAccountLink: vi.fn(),
    previewLinkReassignment: vi.fn(),
    reassignLink: vi.fn(),
    syncBankConnection: vi.fn(),
    getEnableBankingCredential: vi.fn(),
    saveEnableBankingCredential: vi.fn(),
    removeEnableBankingCredential: vi.fn(),
  },
}))

const TRIVIAL_REASSIGNMENT_PREVIEW = {
  moved: 0,
  merged: 0,
  unlinked: 0,
  blockedByWork: 0,
  ambiguous: 0,
}

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: toastError, info: vi.fn() }),
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
    accounts: [discoveredAccount()],
    ...overrides,
  }
}

async function mountPage(
  options: {
    accounts?: AccountDto[]
    configured?: boolean
    connections?: BankConnectionDto[]
    needsReview?: { accountId: string; accountLabel: string; count: number }[]
    banks?: {
      name: string
      country: string
      beta: boolean
      logo: string | null
    }[]
  } = {}
) {
  vi.mocked(api.getAccounts).mockResolvedValue(options.accounts ?? [])
  vi.mocked(api.getBankSyncStatus).mockResolvedValue({
    configured: options.configured ?? false,
  })
  vi.mocked(api.getBankConnections).mockResolvedValue(options.connections ?? [])
  vi.mocked(api.getBankSyncNeedsReview).mockResolvedValue(
    options.needsReview ?? []
  )
  vi.mocked(api.getBanks).mockResolvedValue(options.banks ?? [])
  vi.mocked(api.getEnableBankingCredential).mockResolvedValue({
    applicationId: null,
  })
  // Most tests care about the reassignment itself, not the preview step in
  // front of it — a trivial outcome lets a change go straight through.
  vi.mocked(api.previewLinkReassignment).mockResolvedValue(
    TRIVIAL_REASSIGNMENT_PREVIEW
  )
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

describe('AccountsSettingsPage — accounts', () => {
  it('lists every account as a card', async () => {
    const wrapper = await mountPage({
      accounts: [account(), account({ id: 'acc-2', name: 'Livret A' })],
    })

    expect(wrapper.findAll('[data-testid="account-card"]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Compte courant')
    expect(wrapper.text()).toContain('Livret A')
  })

  it('badges an account still carrying rows a sync lost the reference to', async () => {
    const wrapper = await mountPage({
      configured: true,
      accounts: [account()],
      needsReview: [
        { accountId: 'acc-1', accountLabel: 'Compte courant', count: 8 },
      ],
    })

    expect(wrapper.text()).toContain('8 à réaffecter')
  })

  it('summarises a joint account with a divisor badge without expanding it', async () => {
    const wrapper = await mountPage({
      accounts: [
        account({ type: 'JOINT', divisor: 2, isExcludedFromBudget: true }),
      ],
    })

    expect(wrapper.text()).toContain('Joint ÷2')
    expect(wrapper.text()).toContain('Hors budget')
  })

  it('renames an account and clears the draft', async () => {
    const wrapper = await mountPage({ accounts: [account()] })
    vi.mocked(api.updateAccount).mockResolvedValue(
      account({ name: 'Compte perso' })
    )

    const card = wrapper.find('[data-testid="account-card"]')
    await card.find('button').trigger('click')
    await card.find('input[type="text"]').setValue('Compte perso')
    await card.find('form').trigger('submit')
    await flushPromises()

    expect(api.updateAccount).toHaveBeenCalledWith('acc-1', {
      name: 'Compte perso',
    })
    expect(toastSuccess).toHaveBeenCalledWith(
      'Compte renommé en « Compte perso »'
    )
  })

  it('surfaces a rename conflict next to the input', async () => {
    const wrapper = await mountPage({ accounts: [account()] })
    vi.mocked(api.updateAccount).mockRejectedValue(
      new Error('An account named "Livret A" already exists.')
    )

    const card = wrapper.find('[data-testid="account-card"]')
    await card.find('button').trigger('click')
    await card.find('input[type="text"]').setValue('Livret A')
    await card.find('form').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="rename-error"]').text()).toContain(
      'already exists'
    )
  })

  it('switches the account type', async () => {
    const wrapper = await mountPage({ accounts: [account()] })
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
    const wrapper = await mountPage({ accounts: [account()] })

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
    const wrapper = await mountPage({ accounts: [account()] })
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
    const wrapper = await mountPage({ accounts: [] })

    expect(wrapper.text()).toContain('Aucun compte disponible')
  })

  it('offers nothing bank-related when this user has no Enable Banking application', async () => {
    // A button that only produces a puzzling failure is worse than no button.
    // The accounts themselves stay fully manageable either way.
    const wrapper = await mountPage({
      accounts: [account()],
      configured: false,
    })

    expect(
      wrapper.find('[data-testid="enable-banking-credential-card"]').exists()
    ).toBe(true)
    expect(wrapper.find('[data-testid="bank-picker"]').exists()).toBe(false)
    expect(api.getBankConnections).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="account-card"]').exists()).toBe(true)
  })
})

describe('AccountsSettingsPage — grouped under a bank connection', () => {
  it('shows a connected bank, and its linked account as a full card', async () => {
    const wrapper = await mountPage({
      accounts: [account({ id: 'acc-1', name: 'Perso Bourso' })],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
            }),
          ],
        }),
      ],
    })

    expect(wrapper.text()).toContain('Boursorama Banque')
    expect(wrapper.text()).toContain('Perso Bourso')
    expect(wrapper.findAll('[data-testid="account-card"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="bank-account"]').exists()).toBe(false)
  })

  it('shows the IBAN and the ingestion toggle without expanding the card', async () => {
    const wrapper = await mountPage({
      accounts: [account({ id: 'acc-1', name: 'Perso Bourso' })],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
              isIngested: true,
            }),
          ],
        }),
      ],
    })

    expect(wrapper.text()).toContain('FR7640618803300004080870294')
    expect(wrapper.get('[data-testid="ingest-toggle"]').text()).toBe('Lu')
  })

  it("shows the bank's logo next to its name, resized rather than shipped full-size", async () => {
    const wrapper = await mountPage({
      configured: true,
      connections: [connection({ aspspName: 'CIC' })],
      banks: [
        {
          name: 'CIC',
          country: 'FR',
          beta: false,
          logo: 'https://enablebanking.com/brands/FR/CIC/',
        },
      ],
    })

    expect(wrapper.get('img').attributes('src')).toBe(
      'https://enablebanking.com/brands/FR/CIC/-/preview/64x64/'
    )
  })

  it('shows no logo when the bank did not offer one', async () => {
    const wrapper = await mountPage({
      configured: true,
      connections: [connection()],
      banks: [
        { name: 'Boursorama Banque', country: 'FR', beta: false, logo: null },
      ],
    })

    expect(wrapper.find('img').exists()).toBe(false)
  })

  it('disables the sync button and says why', async () => {
    const wrapper = await mountPage({
      configured: true,
      connections: [
        connection({ action: 'reconnect', reason: 'the consent has lapsed' }),
      ],
    })

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
      skippedTooOld: 0,
      accountsRead: 1,
    })
    const wrapper = await mountPage({
      configured: true,
      connections: [connection()],
    })

    await wrapper.get('[data-testid="sync-button"]').trigger('click')
    await flushPromises()

    expect(api.syncBankConnection).toHaveBeenCalledWith('conn-1')
    expect(toastSuccess).toHaveBeenCalledWith(expect.stringContaining('8'))
  })

  it('folds a card account under "Comptes masqués" instead of showing it inline', async () => {
    // It is always ignored — its purchases are already reported by the
    // account it settles onto — so it starts out of the way rather than
    // shown the same way as an account someone might act on.
    const wrapper = await mountPage({
      configured: true,
      connections: [
        connection({
          accounts: [discoveredAccount({ cashAccountType: 'CARD' })],
        }),
      ],
    })

    expect(wrapper.find('[data-testid="bank-account"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="ingest-toggle"]').exists()).toBe(false)
    expect(
      wrapper.get('[data-testid="hidden-accounts-toggle"]').text()
    ).toContain('1')
  })

  it('cannot switch on a card account, once revealed', async () => {
    const wrapper = await mountPage({
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              cashAccountType: 'CARD',
              warning: 'counts each twice',
            }),
          ],
        }),
      ],
    })

    await wrapper.get('[data-testid="hidden-accounts-toggle"]').trigger('click')

    expect(
      wrapper.get('[data-testid="ingest-toggle"]').attributes('disabled')
    ).toBeDefined()
    expect(wrapper.get('[data-testid="account-warning"]').text()).toContain(
      'counts each twice'
    )
  })

  it('shows an unidentified bank account with the lighter assign UI', async () => {
    const wrapper = await mountPage({
      configured: true,
      connections: [connection({ accounts: [discoveredAccount()] })],
    })

    expect(wrapper.find('[data-testid="bank-account"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="account-card"]').exists()).toBe(false)
  })

  it('states a suggestion against the evidence, and applies it', async () => {
    vi.mocked(api.reassignLink).mockResolvedValue(TRIVIAL_REASSIGNMENT_PREVIEW)
    const wrapper = await mountPage({
      accounts: [account({ id: 'acc-1', name: 'Perso Bourso' })],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              suggestion: {
                accountId: 'acc-1',
                accountLabel: 'Perso Bourso',
                matches: 560,
              },
            }),
          ],
        }),
      ],
    })

    const suggestion = wrapper.get('[data-testid="account-suggestion"]')
    expect(suggestion.text()).toContain('560 transactions')
    expect(suggestion.text()).toContain('Perso Bourso')

    await suggestion.get('button').trigger('click')
    await flushPromises()

    expect(api.previewLinkReassignment).toHaveBeenCalledWith('link-1', 'acc-1')
    expect(api.reassignLink).toHaveBeenCalledWith('link-1', 'acc-1')
  })

  it('reassigns an identified account through the expanded card', async () => {
    vi.mocked(api.reassignLink).mockResolvedValue(TRIVIAL_REASSIGNMENT_PREVIEW)
    const wrapper = await mountPage({
      accounts: [
        account({ id: 'acc-1', name: 'Perso Bourso' }),
        account({ id: 'acc-2', name: 'CJ Fixe' }),
      ],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
            }),
          ],
        }),
      ],
    })

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    await wrapper.get('[data-testid="account-select"]').setValue('acc-2')
    await flushPromises()

    expect(api.reassignLink).toHaveBeenCalledWith('link-1', 'acc-2')
  })

  it('asks before correcting a link a sync has already touched', async () => {
    const wrapper = await mountPage({
      accounts: [
        account({ id: 'acc-1', name: 'Perso Bourso' }),
        account({ id: 'acc-2', name: 'CJ Fixe' }),
      ],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
            }),
          ],
        }),
      ],
    })
    // Set after mounting: `mountPage` itself defaults this to a trivial
    // outcome, which would otherwise overwrite it.
    vi.mocked(api.previewLinkReassignment).mockResolvedValue({
      moved: 2,
      merged: 1,
      unlinked: 1,
      blockedByWork: 0,
      ambiguous: 0,
    })

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    await wrapper.get('[data-testid="account-select"]').setValue('acc-2')
    await flushPromises()

    // Nothing applied yet — a person has to see this first.
    expect(api.reassignLink).not.toHaveBeenCalled()
    const modal = wrapper.get('[data-testid="reassign-modal"]')
    expect(modal.text()).toContain('CJ Fixe')
    expect(wrapper.get('[data-testid="reassign-line-moved"]').text()).toContain(
      '2'
    )
    expect(
      wrapper.get('[data-testid="reassign-line-merged"]').text()
    ).toContain('1')

    await wrapper.get('[data-testid="reassign-confirm"]').trigger('click')
    await flushPromises()

    expect(api.reassignLink).toHaveBeenCalledWith('link-1', 'acc-2')
  })

  it('applies nothing when the correction dialog is cancelled', async () => {
    const wrapper = await mountPage({
      accounts: [
        account({ id: 'acc-1', name: 'Perso Bourso' }),
        account({ id: 'acc-2', name: 'CJ Fixe' }),
      ],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
            }),
          ],
        }),
      ],
    })
    // Set after mounting: `mountPage` itself defaults this to a trivial
    // outcome, which would otherwise overwrite it.
    vi.mocked(api.previewLinkReassignment).mockResolvedValue({
      moved: 1,
      merged: 0,
      unlinked: 0,
      blockedByWork: 0,
      ambiguous: 0,
    })

    await wrapper.find('[data-testid="account-card"] button').trigger('click')
    await wrapper.get('[data-testid="account-select"]').setValue('acc-2')
    await flushPromises()

    await wrapper.get('[data-testid="reassign-cancel"]').trigger('click')
    await flushPromises()

    expect(api.reassignLink).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="reassign-modal"]').exists()).toBe(false)
  })

  it('shows the server’s own words when the ingestion toggle refuses', async () => {
    vi.mocked(api.updateBankAccountLink).mockRejectedValue(
      new Error('its transactions have nowhere to go')
    )
    const wrapper = await mountPage({
      configured: true,
      connections: [connection()],
    })

    await wrapper.get('[data-testid="ingest-toggle"]').trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith(
      'its transactions have nowhere to go'
    )
  })

  it('lists an account no bank has linked under "Comptes sans banque"', async () => {
    const wrapper = await mountPage({
      accounts: [
        account({ id: 'acc-1', name: 'Perso Bourso' }),
        account({ id: 'acc-2', name: 'Espèces' }),
      ],
      configured: true,
      connections: [
        connection({
          accounts: [
            discoveredAccount({
              accountId: 'acc-1',
              accountLabel: 'Perso Bourso',
            }),
          ],
        }),
      ],
    })

    expect(wrapper.text()).toContain('Comptes sans banque')
    expect(wrapper.findAll('[data-testid="account-card"]')).toHaveLength(2)
  })
})

describe('AccountsSettingsPage — connecting a bank', () => {
  it('offers the banks to choose from, flagging the beta ones', async () => {
    // Hidden rather than flagged, a missing bank is a mystery; flagged, it is
    // a caveat.
    const wrapper = await mountPage({
      configured: true,
      banks: [
        { name: 'Boursorama Banque', country: 'FR', beta: false, logo: null },
        { name: 'CIC Banque Privée', country: 'FR', beta: true, logo: null },
      ],
    })

    const options = wrapper.get('[data-testid="bank-picker"]').findAll('option')
    expect(options.map(o => o.text())).toEqual([
      '— choisir —',
      'Boursorama Banque',
      'CIC Banque Privée (beta)',
    ])
  })

  it('cannot connect before a bank is chosen', async () => {
    const wrapper = await mountPage({ configured: true })
    expect(
      wrapper.get('[data-testid="connect-button"]').attributes('disabled')
    ).toBeDefined()
  })

  it('sends the user to their bank, coming back to this application', async () => {
    vi.mocked(api.startBankAuthorization).mockResolvedValue({
      url: 'https://tilisy.enablebanking.com/ais/start?sessionid=x',
      state: 'st',
    })
    const wrapper = await mountPage({
      configured: true,
      banks: [
        { name: 'Boursorama Banque', country: 'FR', beta: false, logo: null },
      ],
    })

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
    const wrapper = await mountPage({
      configured: true,
      banks: [
        { name: 'Boursorama Banque', country: 'FR', beta: false, logo: null },
      ],
    })

    await wrapper
      .get('[data-testid="bank-picker"]')
      .setValue('Boursorama Banque')
    await wrapper.get('[data-testid="connect-button"]').trigger('click')
    await flushPromises()

    expect(toastError).toHaveBeenCalledWith('Redirect URI not allowed')
  })
})

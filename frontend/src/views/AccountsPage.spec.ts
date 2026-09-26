import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { createRouter, createWebHistory } from 'vue-router'
import AccountsPage from './AccountsPage.vue'
import { api } from '@/lib/api'
import type { AccountDto, BankConnectionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getBankSyncStatus: vi.fn(),
    getBankConnections: vi.fn(),
    getLatestImportDate: vi.fn(),
    getAccounts: vi.fn(),
    getBanks: vi.fn(),
    syncBankConnection: vi.fn(),
    startBankAuthorization: vi.fn(),
  },
}))

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/accounts', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
    { path: '/import', component: { template: '<div />' } },
    { path: '/import/history', component: { template: '<div />' } },
    { path: '/bank-sync/history', component: { template: '<div />' } },
    { path: '/settings/accounts', component: { template: '<div />' } },
  ],
})

const account = (id: string, name: string): AccountDto => ({
  id,
  name,
  type: 'STANDARD',
  divisor: 1,
  isExcludedFromBudget: false,
  isExcludedFromStats: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
})

const connection = (
  overrides: Partial<BankConnectionDto> & { id: string }
): BankConnectionDto => ({
  aspspName: 'Boursorama',
  aspspCountry: 'FR',
  status: 'ACTIVE',
  consentValidUntil: null,
  lastSyncAt: '2026-09-12T08:00:00.000Z',
  lastSyncError: null,
  lastSyncErrorAt: null,
  action: 'fetch',
  reason: '',
  daysUntilConsentExpires: 120,
  accounts: [],
  ...overrides,
})

const outcome = {
  connectionId: 'c1',
  fetched: 5,
  claimed: 2,
  inserted: 3,
  skippedDuplicates: 0,
  skippedAmbiguous: 0,
  skippedTooOld: 0,
  accountsRead: 1,
}

async function mountPage() {
  const wrapper = mount(AccountsPage, {
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

describe('AccountsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getBankSyncStatus).mockResolvedValue({ configured: true })
    vi.mocked(api.getLatestImportDate).mockResolvedValue({ date: null })
    vi.mocked(api.getAccounts).mockResolvedValue([])
    vi.mocked(api.getBankConnections).mockResolvedValue([])
    vi.mocked(api.getBanks).mockResolvedValue([])
  })

  it('groups linked accounts under their bank, the rest under CSV/manuels', async () => {
    vi.mocked(api.getAccounts).mockResolvedValue([
      account('a1', 'Compte courant'),
      account('a2', 'PEL'),
    ])
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({
        id: 'c1',
        accounts: [
          {
            linkId: 'l1',
            externalAccountId: 'ext1',
            accountName: 'CC',
            product: null,
            cashAccountType: 'CACC',
            iban: null,
            accountId: 'a1',
            accountLabel: 'Compte courant',
            isIngested: true,
            balance: null,
            suggestion: null,
            warning: null,
          },
        ],
      }),
    ])

    const wrapper = await mountPage()

    const bankCard = wrapper.get('[data-testid="connection-c1"]')
    expect(bankCard.text()).toContain('Compte courant')
    expect(bankCard.text()).not.toContain('PEL')

    const manualCard = wrapper.get('[data-testid="manual-accounts"]')
    expect(manualCard.text()).toContain('PEL')
    expect(manualCard.text()).not.toContain('Compte courant')
  })

  it('leaves bank connections out while sync is not configured', async () => {
    vi.mocked(api.getBankSyncStatus).mockResolvedValue({ configured: false })
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({ id: 'c1' }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="connection-c1"]').exists()).toBe(false)
  })

  it('links an account row to its filtered transactions', async () => {
    vi.mocked(api.getAccounts).mockResolvedValue([account('a2', 'PEL')])

    const wrapper = await mountPage()

    const link = wrapper
      .get('[data-testid="manual-accounts"]')
      .findAll('a')
      .find(a => a.text().includes('PEL'))
    expect(link?.attributes('href')).toBe('/transactions?account=PEL')
  })

  it('syncs one connection and shows the outcome on its card', async () => {
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({ id: 'c1' }),
    ])
    vi.mocked(api.syncBankConnection).mockResolvedValue(outcome)

    const wrapper = await mountPage()
    await wrapper.get('[data-testid="sync-one-button"]').trigger('click')
    await flushPromises()

    expect(api.syncBankConnection).toHaveBeenCalledWith('c1')
    expect(wrapper.get('[data-testid="sync-outcome"]').text()).toContain(
      '3 nouvelle(s)'
    )
  })

  it('« Tout synchroniser » only touches the connections the policy allows', async () => {
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({ id: 'c1' }),
      connection({
        id: 'c2',
        aspspName: 'Crédit Agricole',
        action: 'skip',
        reason: '3 fetches already made today',
      }),
      connection({
        id: 'c3',
        aspspName: 'BNP',
        action: 'reconnect',
        reason: 'the consent has lapsed',
      }),
    ])
    vi.mocked(api.syncBankConnection).mockResolvedValue(outcome)

    const wrapper = await mountPage()
    await wrapper.get('[data-testid="sync-all-button"]').trigger('click')
    await flushPromises()

    expect(api.syncBankConnection).toHaveBeenCalledTimes(1)
    expect(api.syncBankConnection).toHaveBeenCalledWith('c1')
  })

  it('a failing bank does not stop the ones after it', async () => {
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({ id: 'c1' }),
      connection({ id: 'c2', aspspName: 'BNP' }),
    ])
    vi.mocked(api.syncBankConnection)
      .mockRejectedValueOnce(new Error('bank said no'))
      .mockResolvedValueOnce({ ...outcome, connectionId: 'c2' })

    const wrapper = await mountPage()
    await wrapper.get('[data-testid="sync-all-button"]').trigger('click')
    await flushPromises()

    expect(api.syncBankConnection).toHaveBeenCalledTimes(2)
    expect(api.syncBankConnection).toHaveBeenLastCalledWith('c2')
  })

  it('shows the policy reason for a waiting bank, and Reconnecter for a lapsed one', async () => {
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({
        id: 'c2',
        action: 'skip',
        reason: '3 fetches already made today',
      }),
      connection({
        id: 'c3',
        aspspName: 'BNP',
        action: 'reconnect',
        reason: 'the consent has lapsed',
      }),
    ])

    const wrapper = await mountPage()

    expect(wrapper.get('[data-testid="skip-reason"]').text()).toContain(
      '3 fetches already made today'
    )
    expect(wrapper.get('[data-testid="reconnect-button"]').text()).toContain(
      'Reconnecter'
    )
    // Nothing is fetchable: the global button has no work to offer.
    expect(wrapper.find('[data-testid="sync-all-button"]').exists()).toBe(false)
  })

  it('shows the bank logo in its tile, or the initial when there is none', async () => {
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({ id: 'c1' }),
      connection({ id: 'c2', aspspName: 'Banque Sans Logo' }),
    ])
    vi.mocked(api.getBanks).mockResolvedValue([
      {
        name: 'Boursorama',
        country: 'FR',
        beta: false,
        logo: 'https://cdn.example/logo/',
      },
    ])

    const wrapper = await mountPage()
    await flushPromises()

    const withLogo = wrapper.get('[data-testid="connection-c1"]')
    expect(
      withLogo.get('[data-testid="bank-logo-tile"] img').attributes('src')
    ).toBe('https://cdn.example/logo/-/preview/96x96/')

    const withoutLogo = wrapper.get('[data-testid="connection-c2"]')
    expect(
      withoutLogo.find('[data-testid="bank-logo-tile"] img').exists()
    ).toBe(false)
    expect(withoutLogo.get('[data-testid="bank-logo-tile"]').text()).toBe('B')
  })

  it('shows the synced balance on the linked account, nothing on CSV accounts', async () => {
    vi.mocked(api.getAccounts).mockResolvedValue([
      account('a1', 'Compte courant'),
      account('a2', 'PEL'),
    ])
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({
        id: 'c1',
        accounts: [
          {
            linkId: 'l1',
            externalAccountId: 'ext1',
            accountName: 'CC',
            product: null,
            cashAccountType: 'CACC',
            iban: null,
            accountId: 'a1',
            accountLabel: 'Compte courant',
            isIngested: true,
            balance: {
              amount: -1234.56,
              currency: 'EUR',
              at: '2026-09-16T00:00:00.000Z',
            },
            suggestion: null,
            warning: null,
          },
        ],
      }),
    ])

    const wrapper = await mountPage()

    const balance = wrapper.get('[data-testid="balance-Compte courant"]')
    expect(balance.text()).toMatch(/1\s?234,56/)
    expect(balance.text()).toContain('au 16 sept')
    // Negative balances read as such.
    expect(balance.find('.text-red-600').exists()).toBe(true)
    // A CSV account never claims a balance it cannot know.
    expect(wrapper.find('[data-testid="balance-PEL"]').exists()).toBe(false)
  })

  it('surfaces the last sync failure on the connection card', async () => {
    vi.mocked(api.getBankConnections).mockResolvedValue([
      connection({
        id: 'c1',
        action: 'reconnect',
        reason: 'the consent has lapsed',
        lastSyncError: 'Enable Banking answered 401',
        lastSyncErrorAt: '2026-09-19T04:31:00.000Z',
      }),
    ])

    const wrapper = await mountPage()

    const alert = wrapper.get('[data-testid="sync-error"]')
    expect(alert.text()).toContain('Dernière synchronisation en échec')
    expect(alert.text()).toContain('Enable Banking answered 401')
    // The way out stands right next to the explanation.
    expect(wrapper.get('[data-testid="reconnect-button"]').text()).toContain(
      'Reconnecter'
    )
  })
})

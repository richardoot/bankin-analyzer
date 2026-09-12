import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import BankSyncHistoryPage from './BankSyncHistoryPage.vue'
import type { BankSyncRunDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getBankSyncRuns: vi.fn(),
    previewUndoBankSyncRun: vi.fn(),
    undoBankSyncRun: vi.fn(),
  },
}))

import { api } from '@/lib/api'

function run(overrides: Partial<BankSyncRunDto> = {}): BankSyncRunDto {
  return {
    id: 'run-1',
    aspspName: 'CIC',
    fetchedAt: '2026-09-01T10:00:00.000Z',
    inserted: 3,
    claimed: 1,
    undoneAt: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

async function mountPage(runs: BankSyncRunDto[] = [run()]) {
  vi.mocked(api.getBankSyncRuns).mockResolvedValue(runs)
  const wrapper = mount(BankSyncHistoryPage, {
    global: { stubs: { RouterLink: true } },
  })
  await flushPromises()
  return wrapper
}

describe('BankSyncHistoryPage', () => {
  it('lists a run with its counts', async () => {
    const wrapper = await mountPage([run({ inserted: 3, claimed: 1 })])

    expect(wrapper.text()).toContain('CIC')
    expect(wrapper.text()).toContain('3')
    expect(wrapper.text()).toContain('1')
  })

  it('shows an empty state when nothing has synced yet', async () => {
    const wrapper = await mountPage([])

    expect(
      wrapper.find('[data-testid="bank-sync-history-empty"]').exists()
    ).toBe(true)
  })

  it('badges an active run and offers to undo it', async () => {
    const wrapper = await mountPage([run({ undoneAt: null })])

    expect(wrapper.get('[data-testid="run-status-badge"]').text()).toContain(
      'Active'
    )
    expect(wrapper.find('[data-testid="ask-undo"]').exists()).toBe(true)
  })

  it('badges an already-undone run and hides its undo button', async () => {
    const wrapper = await mountPage([
      run({ undoneAt: '2026-09-02T10:00:00.000Z' }),
    ])

    expect(wrapper.get('[data-testid="run-status-badge"]').text()).toContain(
      'Annulée'
    )
    expect(wrapper.find('[data-testid="ask-undo"]').exists()).toBe(false)
  })

  it('previews before confirming, and shows the blocked count when there is one', async () => {
    vi.mocked(api.previewUndoBankSyncRun).mockResolvedValue({
      deleted: 3,
      unlinked: 1,
      blocked: 2,
    })
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="ask-undo"]').trigger('click')
    await flushPromises()

    expect(api.previewUndoBankSyncRun).toHaveBeenCalledWith('run-1')
    expect(api.undoBankSyncRun).not.toHaveBeenCalled()
    const confirmation = wrapper.get('[data-testid="undo-confirmation"]')
    expect(confirmation.text()).toContain('3')
    expect(confirmation.text()).toContain('1')
    expect(wrapper.get('[data-testid="undo-blocked-note"]').text()).toContain(
      '2'
    )
  })

  it('cancelling the preview applies nothing', async () => {
    vi.mocked(api.previewUndoBankSyncRun).mockResolvedValue({
      deleted: 3,
      unlinked: 1,
      blocked: 0,
    })
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="ask-undo"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="cancel-undo"]').trigger('click')

    expect(wrapper.find('[data-testid="undo-confirmation"]').exists()).toBe(
      false
    )
    expect(api.undoBankSyncRun).not.toHaveBeenCalled()
  })

  it('confirms by calling undoBankSyncRun and reloading the list', async () => {
    vi.mocked(api.previewUndoBankSyncRun).mockResolvedValue({
      deleted: 3,
      unlinked: 1,
      blocked: 0,
    })
    vi.mocked(api.undoBankSyncRun).mockResolvedValue({
      deleted: 3,
      unlinked: 1,
      blocked: 0,
    })
    const wrapper = await mountPage()
    vi.mocked(api.getBankSyncRuns).mockResolvedValue([
      run({ inserted: 0, claimed: 0, undoneAt: '2026-09-02T10:00:00.000Z' }),
    ])

    await wrapper.get('[data-testid="ask-undo"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="confirm-undo"]').trigger('click')
    await flushPromises()

    expect(api.undoBankSyncRun).toHaveBeenCalledWith('run-1')
    expect(api.getBankSyncRuns).toHaveBeenCalledTimes(2)
    expect(wrapper.get('[data-testid="run-status-badge"]').text()).toContain(
      'Annulée'
    )
  })

  it('shows an inline error banner rather than crashing the list', async () => {
    vi.mocked(api.getBankSyncRuns).mockRejectedValue(new Error('boom'))
    const wrapper = mount(BankSyncHistoryPage, {
      global: { stubs: { RouterLink: true } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('boom')
    expect(wrapper.find('[data-testid="bank-sync-run"]').exists()).toBe(false)
  })
})

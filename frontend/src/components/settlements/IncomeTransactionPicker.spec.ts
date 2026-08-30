import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import IncomeTransactionPicker from './IncomeTransactionPicker.vue'
import type { TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getTransactions: vi.fn(),
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
  },
}))

import { api } from '@/lib/api'

enableAutoUnmount(afterEach)

const income = (overrides: Partial<TransactionDto> = {}): TransactionDto => ({
  id: 'tx-1',
  date: '2026-08-14',
  description: 'VIR ALICE MARTIN',
  amount: 45,
  type: 'INCOME',
  accountId: 'acc-1',
  account: 'Checking',
  isPointed: false,
  categoryId: null,
  categoryName: undefined,
  subcategory: null,
  subcategoryId: null,
  subcategoryName: null,
  note: null,
  createdAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
})

const page = (data: TransactionDto[], total = data.length) => ({
  data,
  meta: {
    total,
    page: 1,
    limit: 100,
    totalPages: 1,
    hasNextPage: false,
    hasPreviousPage: false,
  },
})

/** The search term each call carried, in call order. */
function searchTerms(): (string | undefined)[] {
  return vi
    .mocked(api.getTransactions)
    .mock.calls.map(([params]) => params?.search)
}

async function mountPicker(personName = 'Alice Martin') {
  const wrapper = mount(IncomeTransactionPicker, {
    props: { context: { personName, pendingTotals: [45] } },
  })
  await flushPromises()
  return wrapper
}

beforeEach(() => {
  // Call history leaks between tests otherwise, and every assertion here reads
  // the calls the mount made.
  vi.clearAllMocks()
  vi.mocked(api.getCategories).mockResolvedValue([])
  vi.mocked(api.getSubcategories).mockResolvedValue([])
  vi.mocked(api.getTransactions).mockResolvedValue(page([income()]))
})

describe('IncomeTransactionPicker candidate set', () => {
  it("asks the server for the person's receipts, not just the recent page", async () => {
    // The bottleneck this covers: replayed over the production ledger, the
    // recent page alone held the receipt being looked for 57 times out of 108.
    // A debt a year old is repaid by a transfer a year old, and no amount of
    // ranking can promote a row that was never fetched.
    await mountPicker()

    expect(searchTerms()).toEqual([undefined, 'Martin', 'Alice'])
  })

  it('merges the pages and keeps each receipt once', async () => {
    const recent = income({ id: 'tx-recent', description: 'VIR PAUL' })
    const named = income({ id: 'tx-named', date: '2025-03-02' })

    vi.mocked(api.getTransactions)
      // The recent page, then one response per name term. The named receipt is
      // returned twice, as it would be whenever it is also recent.
      .mockResolvedValueOnce(page([recent, named], 300))
      .mockResolvedValueOnce(page([named]))
      .mockResolvedValueOnce(page([named]))

    const wrapper = await mountPicker()

    expect(
      wrapper.findAll('[data-testid="settlement-transaction"]')
    ).toHaveLength(2)
  })

  it('carries the active filters onto the name queries', async () => {
    // Otherwise the name results would ignore a period the user just set, and
    // reappear under a filter that excluded them.
    const wrapper = await mountPicker()
    vi.mocked(api.getTransactions).mockClear()

    await wrapper
      .get('[data-testid="settlement-toggle-filters"]')
      .trigger('click')
    await wrapper
      .get('[data-testid="settlement-start-date"]')
      .setValue('2025-01-01')
    await vi.waitFor(() => expect(api.getTransactions).toHaveBeenCalled())
    await flushPromises()

    const calls = vi.mocked(api.getTransactions).mock.calls
    expect(calls).toHaveLength(3)
    for (const [params] of calls) expect(params?.startDate).toBe('2025-01-01')
  })

  it('lets a typed search stand alone', async () => {
    // What the user typed is the query. Widening it with the name would hand
    // back the rows they just excluded.
    const wrapper = await mountPicker()
    vi.mocked(api.getTransactions).mockClear()

    await wrapper.get('[data-testid="settlement-search"]').setValue('airbnb')
    await vi.waitFor(() => expect(api.getTransactions).toHaveBeenCalled())
    await flushPromises()

    expect(searchTerms()).toEqual(['airbnb'])
  })

  it('falls back to the recent page for a person with no searchable name', async () => {
    await mountPicker('Moi')

    expect(searchTerms()).toEqual([undefined])
  })

  it('warns that rows are missing when any query hit the cap', async () => {
    // The truncation can come from the name query alone: 41 of the 108
    // production searches returned more than one page.
    vi.mocked(api.getTransactions)
      .mockResolvedValueOnce(page([income()], 12))
      .mockResolvedValueOnce(page([income()], 140))
      .mockResolvedValueOnce(page([income()], 3))

    const wrapper = await mountPicker()

    expect(wrapper.find('[data-testid="settlement-truncated"]').exists()).toBe(
      true
    )
    expect(wrapper.text()).toContain('Alice Martin')
  })

  it('stays quiet when every query fit in one page', async () => {
    const wrapper = await mountPicker()

    expect(wrapper.find('[data-testid="settlement-truncated"]').exists()).toBe(
      false
    )
  })
})

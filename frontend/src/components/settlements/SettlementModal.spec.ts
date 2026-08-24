import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import SettlementModal from './SettlementModal.vue'
import type { ReimbursementDto, TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getTransactions: vi.fn(),
    createSettlement: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const PERSON = { id: 'person-1', name: 'Alice Martin' }

/** Two pending lines in the same category — the case the old modal could not split. */
const monoprix: ReimbursementDto = {
  id: 'r-monoprix',
  transactionId: 'tx-monoprix',
  personId: PERSON.id,
  personName: PERSON.name,
  categoryId: 'cat-courses',
  categoryName: 'R Courses',
  expenseCategoryId: null,
  expenseCategoryName: null,
  amount: 15,
  amountReceived: 0,
  amountRemaining: 15,
  status: 'PENDING',
  note: null,
  createdAt: '2026-08-05T10:00:00.000Z',
  updatedAt: '2026-08-05T10:00:00.000Z',
  transaction: {
    id: 'tx-monoprix',
    date: '2026-08-05',
    description: 'Monoprix',
    amount: -15,
  },
}

const carrefour: ReimbursementDto = {
  ...monoprix,
  id: 'r-carrefour',
  transactionId: 'tx-carrefour',
  amount: 30,
  amountRemaining: 30,
  createdAt: '2026-08-12T10:00:00.000Z',
  updatedAt: '2026-08-12T10:00:00.000Z',
  transaction: {
    id: 'tx-carrefour',
    date: '2026-08-12',
    description: 'Carrefour',
    amount: -30,
  },
}

const netflix: ReimbursementDto = {
  ...monoprix,
  id: 'r-netflix',
  transactionId: 'tx-netflix',
  categoryId: 'cat-abos',
  categoryName: 'R Abonnements',
  expenseCategoryId: null,
  expenseCategoryName: null,
  amount: 12,
  amountRemaining: 12,
  createdAt: '2026-08-01T10:00:00.000Z',
  updatedAt: '2026-08-01T10:00:00.000Z',
  transaction: {
    id: 'tx-netflix',
    date: '2026-08-01',
    description: 'Netflix',
    amount: -12,
  },
}

const makeIncome = (
  overrides: Partial<TransactionDto> = {}
): TransactionDto => ({
  id: 'tx-income',
  date: '2026-08-14',
  description: 'VIR ALICE MARTIN',
  amount: 45,
  type: 'INCOME',
  accountId: 'acc-1',
  account: 'Checking',
  isPointed: false,
  categoryId: 'cat-courses',
  categoryName: 'R Courses',
  subcategory: null,
  subcategoryId: null,
  subcategoryName: null,
  note: null,
  createdAt: '2026-08-14T10:00:00.000Z',
  ...overrides,
})

async function mountModal(options: {
  pending?: ReimbursementDto[]
  income?: TransactionDto[]
  focusReimbursementId?: string | null
  /** What the server says it has, which may exceed the page returned. */
  total?: number
}) {
  vi.mocked(api.getTransactions).mockResolvedValue({
    data: options.income ?? [makeIncome()],
    meta: {
      total: options.total ?? (options.income ?? [makeIncome()]).length,
      page: 1,
      limit: 100,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  })

  const wrapper = mount(SettlementModal, {
    props: {
      isOpen: false,
      personId: PERSON.id,
      personName: PERSON.name,
      pendingReimbursements: options.pending ?? [monoprix, carrefour, netflix],
      focusReimbursementId: options.focusReimbursementId ?? null,
    },
    global: { stubs: { Teleport: true } },
  })

  // The transaction list loads on open, so flip the prop after mounting.
  await wrapper.setProps({ isOpen: true })
  await flushPromises()

  return wrapper
}

/** Step 1 lists transactions as buttons; pick the first one on offer. */
async function pickFirstTransaction(wrapper: VueWrapper): Promise<void> {
  const candidates = wrapper
    .findAll('button')
    .filter(button => button.text().includes('+'))
  await candidates[0]?.trigger('click')
  await flushPromises()
}

/** Amount fields are addressed by label, so DOM ordering stays an implementation detail. */
async function setAmount(
  wrapper: VueWrapper,
  label: string,
  value: string
): Promise<void> {
  const input = wrapper.find(`input[aria-label="Montant affecte a ${label}"]`)
  await input.setValue(value)
  await input.trigger('change')
  await flushPromises()
}

function submittedLines() {
  return vi.mocked(api.createSettlement).mock.calls[0]?.[0].reimbursements
}

describe('SettlementModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.createSettlement).mockResolvedValue({
      id: 'settlement-1',
    } as never)
  })

  it('loads income transactions when it opens and ranks the matching one first', async () => {
    const wrapper = await mountModal({
      income: [
        makeIncome({
          id: 'tx-cpam',
          description: 'REMBOURSEMENT CPAM',
          amount: 84.2,
          categoryName: 'Sante',
        }),
        makeIncome(),
      ],
    })

    expect(api.getTransactions).toHaveBeenCalledWith({
      type: 'INCOME',
      limit: 100,
    })
    // The person's own transfer wins on name + category, CPAM lands in the
    // secondary list rather than being hidden.
    expect(wrapper.text()).toContain('Suggestions')
    expect(wrapper.text()).toContain('VIR ALICE MARTIN')
    expect(wrapper.text()).toContain('REMBOURSEMENT CPAM')
  })

  describe('finding an old receipt', () => {
    /** The debounce is real, so the tests drive the clock rather than wait. */
    async function typeAndSettle(
      wrapper: VueWrapper,
      testId: string,
      value: string
    ): Promise<void> {
      vi.useFakeTimers()
      await wrapper.get(`[data-testid="${testId}"]`).setValue(value)
      await vi.advanceTimersByTimeAsync(400)
      vi.useRealTimers()
      await flushPromises()
    }

    it('asks the server instead of filtering the page it already holds', async () => {
      // The receipt for a year-old expense is precisely the one absent from
      // the hundred most recent, so a local filter could never find it.
      const wrapper = await mountModal({})
      vi.mocked(api.getTransactions).mockClear()

      await typeAndSettle(wrapper, 'settlement-search', 'cpam')

      expect(api.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'INCOME', search: 'cpam' })
      )
    })

    it('forwards the date window and the amount range', async () => {
      const wrapper = await mountModal({})
      await wrapper
        .get('[data-testid="settlement-toggle-filters"]')
        .trigger('click')
      vi.mocked(api.getTransactions).mockClear()

      await typeAndSettle(wrapper, 'settlement-start-date', '2025-01-01')

      expect(api.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ startDate: '2025-01-01' })
      )

      vi.mocked(api.getTransactions).mockClear()
      await typeAndSettle(wrapper, 'settlement-amount-min', '40')

      expect(api.getTransactions).toHaveBeenCalledWith(
        expect.objectContaining({ amountMin: 40 })
      )
    })

    it('leaves a cleared field out of the query rather than sending zero', async () => {
      const wrapper = await mountModal({})
      await wrapper
        .get('[data-testid="settlement-toggle-filters"]')
        .trigger('click')
      await typeAndSettle(wrapper, 'settlement-amount-min', '40')
      vi.mocked(api.getTransactions).mockClear()

      await typeAndSettle(wrapper, 'settlement-amount-min', '')

      const [params] = vi.mocked(api.getTransactions).mock.calls[0] ?? []
      expect(params?.amountMin).toBeUndefined()
    })

    it('says when the page does not hold every match', async () => {
      const wrapper = await mountModal({ total: 412 })

      expect(
        wrapper.get('[data-testid="settlement-truncated"]').text()
      ).toContain('412')
    })

    it('stays quiet when the page holds everything', async () => {
      const wrapper = await mountModal({})

      expect(
        wrapper.find('[data-testid="settlement-truncated"]').exists()
      ).toBe(false)
    })
  })

  describe('suggestions', () => {
    /** Five receipts that all match on the person's name. */
    const manyMatches = Array.from({ length: 5 }, (_, i) =>
      makeIncome({ id: `tx-${i}`, description: `VIR ALICE MARTIN ${i}` })
    )

    it('shows only the first three', async () => {
      const wrapper = await mountModal({ income: manyMatches })

      const shown = wrapper
        .findAll('button')
        .filter(b => b.text().includes('VIR ALICE MARTIN'))
      expect(shown).toHaveLength(3)
      expect(
        wrapper.get('[data-testid="settlement-more-suggestions"]').text()
      ).toContain('2')
    })

    it('reveals the rest on demand', async () => {
      const wrapper = await mountModal({ income: manyMatches })

      await wrapper
        .get('[data-testid="settlement-more-suggestions"]')
        .trigger('click')

      expect(
        wrapper
          .findAll('button')
          .filter(b => b.text().includes('VIR ALICE MARTIN'))
      ).toHaveLength(5)
      expect(
        wrapper.find('[data-testid="settlement-more-suggestions"]').exists()
      ).toBe(false)
    })

    it('offers no such link when three is all there is', async () => {
      const wrapper = await mountModal({ income: manyMatches.slice(0, 2) })

      expect(
        wrapper.find('[data-testid="settlement-more-suggestions"]').exists()
      ).toBe(false)
    })
  })

  it('settles a whole category in two clicks when the income covers it', async () => {
    const wrapper = await mountModal({})
    await pickFirstTransaction(wrapper)

    // 45 EUR filed under "R Courses" pre-fills exactly that category's lines.
    expect(wrapper.text()).toContain('Tout est affecte')

    await wrapper.find('button[class*="bg-emerald-600"]').trigger('click')
    await flushPromises()

    expect(submittedLines()).toEqual([
      { reimbursementId: 'r-monoprix', amountSettled: 15 },
      { reimbursementId: 'r-carrefour', amountSettled: 30 },
    ])
  })

  it('settles a single transaction of a category when seeded on one line', async () => {
    const wrapper = await mountModal({ focusReimbursementId: 'r-carrefour' })
    await pickFirstTransaction(wrapper)

    await wrapper.find('button[class*="bg-emerald-600"]').trigger('click')
    await flushPromises()

    // This is the case the category-level modal could not express: one line
    // settled in full, its sibling left completely alone.
    expect(submittedLines()).toEqual([
      { reimbursementId: 'r-carrefour', amountSettled: 30 },
    ])
  })

  it('leaves the unallocated cash available on the transaction', async () => {
    const wrapper = await mountModal({ focusReimbursementId: 'r-carrefour' })
    await pickFirstTransaction(wrapper)

    expect(wrapper.text()).toContain('resteront')
  })

  it('settles a category partially by editing its total', async () => {
    const wrapper = await mountModal({
      income: [makeIncome({ amount: 100, categoryName: undefined })],
    })
    await pickFirstTransaction(wrapper)

    await setAmount(wrapper, 'R Courses', '20')

    await wrapper.find('button[class*="bg-emerald-600"]').trigger('click')
    await flushPromises()

    // 20 EUR cascades onto the oldest line, then spills 5 onto the next.
    expect(submittedLines()).toEqual(
      expect.arrayContaining([
        { reimbursementId: 'r-monoprix', amountSettled: 15 },
        { reimbursementId: 'r-carrefour', amountSettled: 5 },
      ])
    )
  })

  it('settles one transaction partially and flags it as closed', async () => {
    const wrapper = await mountModal({
      pending: [carrefour],
      income: [makeIncome({ amount: 100, categoryName: undefined })],
    })
    await pickFirstTransaction(wrapper)

    await setAmount(wrapper, 'Carrefour', '18')

    await wrapper.find('input[aria-label="Solder Carrefour"]').trigger('change')
    await flushPromises()

    await wrapper.find('button[class*="bg-emerald-600"]').trigger('click')
    await flushPromises()

    expect(submittedLines()).toEqual([
      {
        reimbursementId: 'r-carrefour',
        amountSettled: 18,
        forceComplete: true,
      },
    ])
  })

  it('never allocates more than the transaction holds', async () => {
    const wrapper = await mountModal({
      income: [makeIncome({ amount: 20, categoryName: undefined })],
    })
    await pickFirstTransaction(wrapper)

    await wrapper.find('button[class*="bg-emerald-600"]').trigger('click')
    await flushPromises()

    const total = (submittedLines() ?? []).reduce(
      (sum, line) => sum + line.amountSettled,
      0
    )
    expect(total).toBeLessThanOrEqual(20)
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import SingleSettlementModal from './SingleSettlementModal.vue'
import type {
  ReimbursementDto,
  TransactionDto,
  CategoryDto,
  SubcategoryDto,
} from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getTransactions: vi.fn(),
    createSettlement: vi.fn(),
    getCategories: vi.fn(),
    getSubcategories: vi.fn(),
  },
}))

import { api } from '@/lib/api'

const PERSON = { id: 'person-1', name: 'Alice Martin' }

const carrefour: ReimbursementDto = {
  id: 'r-carrefour',
  transactionId: 'tx-carrefour',
  personId: PERSON.id,
  personName: PERSON.name,
  expenseCategoryId: 'cat-courses',
  expenseCategoryName: 'R Courses',
  amount: 30,
  amountReceived: 0,
  amountRemaining: 30,
  status: 'PENDING',
  note: null,
  createdAt: '2026-08-12T10:00:00.000Z',
  updatedAt: '2026-08-12T10:00:00.000Z',
  transaction: {
    id: 'tx-carrefour',
    date: '2026-08-12',
    description: 'Carrefour',
    amount: -30,
  },
}

const CATEGORIES: CategoryDto[] = [
  {
    id: 'cat-refunds',
    name: 'Remboursements',
    type: 'INCOME',
    icon: null,
    isExcludedFromBudget: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
]

const SUBCATEGORIES: SubcategoryDto[] = []

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

async function mountModal(
  options: {
    reimbursement?: ReimbursementDto
    income?: TransactionDto[]
  } = {}
) {
  const income = options.income ?? [makeIncome()]
  vi.mocked(api.getTransactions).mockResolvedValue({
    data: income,
    meta: {
      total: income.length,
      page: 1,
      limit: 100,
      totalPages: 1,
      hasNextPage: false,
      hasPreviousPage: false,
    },
  })

  const wrapper = mount(SingleSettlementModal, {
    props: {
      isOpen: false,
      reimbursement: options.reimbursement ?? carrefour,
    },
    global: { stubs: { Teleport: true } },
  })

  await wrapper.setProps({ isOpen: true })
  await flushPromises()

  return wrapper
}

/** The receipts are listed as buttons carrying their available amount. */
async function pickFirstTransaction(wrapper: VueWrapper): Promise<void> {
  const candidates = wrapper
    .findAll('button')
    .filter(button => button.text().includes('+'))
  await candidates[0]?.trigger('click')
  await flushPromises()
}

function confirmButton(wrapper: VueWrapper) {
  return wrapper.get('[data-testid="single-settlement-confirm"]')
}

function submittedLines() {
  return vi.mocked(api.createSettlement).mock.calls[0]?.[0].reimbursements
}

describe('SingleSettlementModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(api.createSettlement).mockResolvedValue({
      id: 'settlement-1',
    } as never)
    vi.mocked(api.getCategories).mockResolvedValue(CATEGORIES)
    vi.mocked(api.getSubcategories).mockResolvedValue(SUBCATEGORIES)
  })

  it('opens straight on the receipt search, with no step to walk', async () => {
    const wrapper = await mountModal()

    // No stepper, no selection: the line is already known.
    expect(wrapper.text()).not.toContain('etape 1 sur 2')
    expect(api.getTransactions).toHaveBeenCalledWith({
      type: 'INCOME',
      limit: 100,
    })
    expect(
      wrapper.get('[data-testid="single-settlement-line"]').text()
    ).toContain('Carrefour')
    expect(
      wrapper.get('[data-testid="single-settlement-line"]').text()
    ).toContain('30,00')
  })

  it('will not settle until a receipt is named', async () => {
    const wrapper = await mountModal()

    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('ranks a receipt matching the line amount exactly', async () => {
    const wrapper = await mountModal({
      income: [
        makeIncome({ id: 'tx-odd', description: 'VIREMENT', amount: 30 }),
      ],
    })

    expect(wrapper.text()).toContain('montant exact')
  })

  it('credits the whole debt when the receipt covers it', async () => {
    const wrapper = await mountModal()

    await pickFirstTransaction(wrapper)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(api.createSettlement).toHaveBeenCalledWith({
      personId: PERSON.id,
      incomeTransactionId: 'tx-income',
      reimbursements: [{ reimbursementId: 'r-carrefour', amountSettled: 30 }],
    })
  })

  it('caps the credit at what the receipt still holds', async () => {
    const wrapper = await mountModal({
      income: [makeIncome({ amount: 18 })],
    })

    await pickFirstTransaction(wrapper)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(submittedLines()).toEqual([
      { reimbursementId: 'r-carrefour', amountSettled: 18 },
    ])
  })

  it('offers to close the line despite the shortfall', async () => {
    const wrapper = await mountModal({
      income: [makeIncome({ amount: 18 })],
    })

    await pickFirstTransaction(wrapper)

    const solder = wrapper.get('input[aria-label="Solder Carrefour"]')
    await solder.setValue(true)
    await flushPromises()

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(submittedLines()).toEqual([
      {
        reimbursementId: 'r-carrefour',
        amountSettled: 18,
        forceComplete: true,
      },
    ])
  })

  it('keeps the shortfall control away when the debt is fully covered', async () => {
    const wrapper = await mountModal()

    await pickFirstTransaction(wrapper)

    expect(wrapper.find('input[aria-label="Solder Carrefour"]').exists()).toBe(
      false
    )
  })

  it('forgets the chosen receipt when reopened', async () => {
    const wrapper = await mountModal()
    await pickFirstTransaction(wrapper)
    expect(confirmButton(wrapper).attributes('disabled')).toBeUndefined()

    await wrapper.setProps({ isOpen: false })
    await wrapper.setProps({ isOpen: true })
    await flushPromises()

    expect(confirmButton(wrapper).attributes('disabled')).toBeDefined()
  })

  it('surfaces a failed settlement instead of closing on it', async () => {
    vi.mocked(api.createSettlement).mockRejectedValue(new Error('Solde epuise'))
    const wrapper = await mountModal()

    await pickFirstTransaction(wrapper)
    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Solde epuise')
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  it('never credits more than the line owes', async () => {
    const wrapper = await mountModal({
      income: [makeIncome({ amount: 500 })],
    })

    await pickFirstTransaction(wrapper)
    const field = wrapper.get('#single-settlement-amount')
    await field.setValue('120')
    await field.trigger('change')
    await flushPromises()

    await confirmButton(wrapper).trigger('click')
    await flushPromises()

    expect(submittedLines()).toEqual([
      { reimbursementId: 'r-carrefour', amountSettled: 30 },
    ])
  })
})

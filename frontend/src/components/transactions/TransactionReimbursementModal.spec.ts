import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import TransactionReimbursementModal from './TransactionReimbursementModal.vue'
import { api } from '@/lib/api'
import type { TransactionDto, PersonDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    createReimbursement: vi.fn(),
  },
}))

const mockTransaction = (
  overrides: Partial<TransactionDto> = {}
): TransactionDto => ({
  id: 'tx-1',
  date: '2026-04-15',
  description: 'Pharmacie',
  amount: -50,
  type: 'EXPENSE',
  accountId: 'acc-1',
  account: 'Checking',
  isPointed: false,
  categoryId: 'cat-sante',
  categoryName: 'Sante',
  categoryIcon: '🩺',
  subcategory: null,
  subcategoryId: null,
  subcategoryName: null,
  note: null,
  createdAt: '2026-04-15T10:00:00.000Z',
  ...overrides,
})

const mockPersons: PersonDto[] = [
  {
    id: 'person-1',
    name: 'Alice',
    email: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  },
]

const mountModal = (overrides: Partial<{ transaction: TransactionDto }> = {}) =>
  mount(TransactionReimbursementModal, {
    props: {
      isOpen: true,
      transaction: overrides.transaction ?? mockTransaction(),
      persons: mockPersons,
      remainingAmount: 50,
    },
    global: {
      stubs: { Teleport: true },
    },
  })

describe('TransactionReimbursementModal', () => {
  enableAutoUnmount(afterEach)

  it('no longer asks for an income category', () => {
    const wrapper = mountModal()

    // The field existed because the old model routed a refund back to an
    // expense through a category pairing. The deduction now attaches to the
    // expense transaction, which already knows its category. One select
    // remains — the person owing the money.
    expect(wrapper.findAll('select')).toHaveLength(1)
    expect(wrapper.text()).not.toContain('Categorie')
  })

  it('creates the debt from the person, the amount and the note alone', async () => {
    const wrapper = mountModal()
    vi.mocked(api.createReimbursement).mockResolvedValue({
      id: 'reimb-1',
    } as Awaited<ReturnType<typeof api.createReimbursement>>)

    const vm = wrapper.vm as unknown as {
      form: { personId: string; amount: number; note: string }
    }
    vm.form.personId = 'person-1'
    vm.form.amount = 30
    vm.form.note = 'moitie'
    await wrapper.vm.$nextTick()
    const submit = wrapper
      .findAll('button')
      .find(b => b.text().includes('Confirmer'))
    if (!submit) throw new Error('no submit button rendered')
    await submit.trigger('click')
    await flushPromises()

    expect(api.createReimbursement).toHaveBeenCalledWith({
      transactionId: 'tx-1',
      personId: 'person-1',
      amount: 30,
      note: 'moitie',
    })
  })
})

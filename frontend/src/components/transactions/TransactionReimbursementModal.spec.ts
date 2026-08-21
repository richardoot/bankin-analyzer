import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import { setActivePinia, createPinia } from 'pinia'
import TransactionReimbursementModal from './TransactionReimbursementModal.vue'
import { useCategoryAssociationsStore } from '@/stores/categoryAssociations'
import type { TransactionDto, PersonDto, CategoryDto } from '@/lib/api'

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

const mockIncomeCategories: CategoryDto[] = [
  {
    id: 'cat-remb-mutuelle',
    name: 'Remboursement Mutuelle',
    type: 'INCOME',
    icon: '💊',
    isExcludedFromBudget: false,
    createdAt: '2026-01-01',
  },
  {
    id: 'cat-remb-amis',
    name: 'Remboursement amis',
    type: 'INCOME',
    icon: '👥',
    isExcludedFromBudget: false,
    createdAt: '2026-01-01',
  },
]

const mountModal = (overrides: Partial<{ transaction: TransactionDto }> = {}) =>
  mount(TransactionReimbursementModal, {
    props: {
      isOpen: true,
      transaction: overrides.transaction ?? mockTransaction(),
      persons: mockPersons,
      incomeCategories: mockIncomeCategories,
      remainingAmount: 50,
    },
    global: {
      stubs: { Teleport: true },
    },
  })

describe('TransactionReimbursementModal — default category from associations', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('defaults the category to the income category associated with the expense category', async () => {
    const store = useCategoryAssociationsStore()
    store.associations = [
      {
        id: 'a1',
        expenseCategoryId: 'cat-sante',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-remb-mutuelle',
        incomeCategoryName: 'Remboursement Mutuelle',
      },
    ]

    const wrapper = mountModal()
    const vm = wrapper.vm as unknown as {
      resetForm?: () => void
      form?: { categoryId: string }
    }
    vm.resetForm?.()
    await wrapper.vm.$nextTick()
    await flushPromises()

    // Verify via the underlying form ref (most reliable check)
    expect(vm.form?.categoryId).toBe('cat-remb-mutuelle')
  })

  it('leaves the category empty when no association exists for the transaction category', async () => {
    const store = useCategoryAssociationsStore()
    store.associations = []

    const wrapper = mountModal()
    const vm = wrapper.vm as unknown as {
      resetForm: () => void
      form: { categoryId: string }
    }
    vm.resetForm()
    await flushPromises()

    expect(vm.form.categoryId).toBe('')
  })

  it('leaves the category empty when the transaction has no category', async () => {
    const store = useCategoryAssociationsStore()
    store.associations = [
      {
        id: 'a1',
        expenseCategoryId: 'cat-sante',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-remb-mutuelle',
        incomeCategoryName: 'Remboursement Mutuelle',
      },
    ]

    const wrapper = mountModal({
      transaction: mockTransaction({ categoryId: null }),
    })
    const vm = wrapper.vm as unknown as {
      resetForm: () => void
      form: { categoryId: string }
    }
    vm.resetForm()
    await flushPromises()

    expect(vm.form.categoryId).toBe('')
  })

  it('auto-resets the form when isOpen transitions from false to true (mirrors real parent flow)', async () => {
    const store = useCategoryAssociationsStore()
    store.associations = [
      {
        id: 'a1',
        expenseCategoryId: 'cat-sante',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-remb-mutuelle',
        incomeCategoryName: 'Remboursement Mutuelle',
      },
    ]

    // Mount with isOpen=false and no transaction (modal not yet visible)
    const wrapper = mount(TransactionReimbursementModal, {
      props: {
        isOpen: false,
        transaction: null,
        persons: mockPersons,
        incomeCategories: mockIncomeCategories,
        remainingAmount: 0,
      },
      global: { stubs: { Teleport: true } },
    })

    // Now simulate the parent's openReimbursementModal: set transaction +
    // open the modal. The watcher should run resetForm AFTER the prop is
    // updated, so getDefaultCategoryId reads the right transaction.
    await wrapper.setProps({
      isOpen: true,
      transaction: mockTransaction(),
      remainingAmount: 50,
    })
    await flushPromises()

    const vm = wrapper.vm as unknown as { form: { categoryId: string } }
    expect(vm.form.categoryId).toBe('cat-remb-mutuelle')
  })

  it('leaves the category empty when the associated income category is not in the available list', async () => {
    const store = useCategoryAssociationsStore()
    // Association references an income category that is not in props.incomeCategories
    store.associations = [
      {
        id: 'a1',
        expenseCategoryId: 'cat-sante',
        expenseCategoryName: 'Sante',
        incomeCategoryId: 'cat-remb-hidden',
        incomeCategoryName: 'Remboursement cache',
      },
    ]

    const wrapper = mountModal()
    const vm = wrapper.vm as unknown as {
      resetForm: () => void
      form: { categoryId: string }
    }
    vm.resetForm()
    await flushPromises()

    expect(vm.form.categoryId).toBe('')
  })
})

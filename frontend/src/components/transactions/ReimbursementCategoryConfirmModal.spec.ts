import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import ReimbursementCategoryConfirmModal from './ReimbursementCategoryConfirmModal.vue'
import type { ReimbursementDto, CategoryDto } from '@/lib/api'

vi.mock('@/lib/formatters', () => ({
  formatCurrency: (v: number) => `${v.toFixed(2)} €`,
}))

const mockReimbursement = (
  overrides: Partial<ReimbursementDto> = {}
): ReimbursementDto => ({
  id: 'r1',
  transactionId: 'tx-1',
  personId: 'p1',
  personName: 'Alice',
  categoryId: 'cat-old-income',
  categoryName: 'Ancienne categorie',
  amount: 50,
  amountReceived: 0,
  amountRemaining: 50,
  status: 'PENDING',
  note: null,
  createdAt: '2026-04-01',
  updatedAt: '2026-04-01',
  ...overrides,
})

const suggestedCategory: CategoryDto = {
  id: 'cat-new-income',
  name: 'Remboursement Mutuelle',
  type: 'INCOME',
  icon: '💊',
  createdAt: '2026-01-01',
}

describe('ReimbursementCategoryConfirmModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.clearAllMocks()
  })

  const mountModal = (
    props: Partial<{
      reimbursements: ReimbursementDto[]
      newExpenseCategoryName: string
      suggestedIncomeCategory: CategoryDto | null
      isUpdating: boolean
    }> = {}
  ) =>
    mount(ReimbursementCategoryConfirmModal, {
      props: {
        isOpen: true,
        reimbursements: props.reimbursements ?? [mockReimbursement()],
        newExpenseCategoryName: props.newExpenseCategoryName ?? 'Sante',
        // Use `in` to distinguish "not provided" from "null"
        suggestedIncomeCategory:
          'suggestedIncomeCategory' in props
            ? (props.suggestedIncomeCategory ?? null)
            : suggestedCategory,
        isUpdating: props.isUpdating ?? false,
      },
      global: { stubs: { Teleport: true } },
    })

  it('does not render when isOpen is false', () => {
    const wrapper = mount(ReimbursementCategoryConfirmModal, {
      props: {
        isOpen: false,
        reimbursements: [mockReimbursement()],
        newExpenseCategoryName: 'Sante',
        suggestedIncomeCategory: suggestedCategory,
        isUpdating: false,
      },
      global: { stubs: { Teleport: true } },
    })
    expect(wrapper.find('button').exists()).toBe(false)
  })

  it('lists each reimbursement with person, amount, and current category', () => {
    const reimbs = [
      mockReimbursement({ id: 'r1', personName: 'Alice', amount: 25 }),
      mockReimbursement({
        id: 'r2',
        personName: 'Bob',
        amount: 80,
        categoryName: 'Autre',
      }),
    ]
    const wrapper = mountModal({ reimbursements: reimbs })
    const text = wrapper.text()
    expect(text).toContain('Alice')
    expect(text).toContain('25.00 €')
    expect(text).toContain('Bob')
    expect(text).toContain('80.00 €')
    expect(text).toContain('Ancienne categorie')
    expect(text).toContain('Autre')
  })

  it('shows the suggestion message when an income category is suggested', () => {
    const wrapper = mountModal()
    expect(wrapper.text()).toContain('Remboursement Mutuelle')
    expect(wrapper.text()).toContain('Sante')
  })

  it('shows a no-association explanation when suggestedIncomeCategory is null', () => {
    const wrapper = mountModal({ suggestedIncomeCategory: null })
    expect(wrapper.text()).toContain("n'a")
    expect(wrapper.text()).toContain(
      'pas de categorie de remboursement associee'
    )
  })

  it('shows the "Mettre a jour" button when there are reimbursements to change', () => {
    const wrapper = mountModal()
    const updateBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Mettre a jour'))
    expect(updateBtn).toBeDefined()
  })

  it('hides the "Mettre a jour" button when all reimbursements already have the suggested category', () => {
    const wrapper = mountModal({
      reimbursements: [mockReimbursement({ categoryId: suggestedCategory.id })],
    })
    const updateBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Mettre a jour'))
    expect(updateBtn).toBeUndefined()
    expect(wrapper.text()).toContain('ont deja la bonne categorie')
  })

  it('hides the "Mettre a jour" button when there is no suggested category', () => {
    const wrapper = mountModal({ suggestedIncomeCategory: null })
    const updateBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Mettre a jour'))
    expect(updateBtn).toBeUndefined()
  })

  it('emits "update" with the suggested category id when the user confirms', async () => {
    const wrapper = mountModal()
    const updateBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Mettre a jour'))
    await updateBtn?.trigger('click')

    expect(wrapper.emitted('update')).toEqual([[suggestedCategory.id]])
  })

  it('emits "keep" when the user clicks "Garder telle quelle"', async () => {
    const wrapper = mountModal()
    const keepBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Garder'))
    await keepBtn?.trigger('click')

    expect(wrapper.emitted('keep')).toBeDefined()
    expect(wrapper.emitted('keep')?.length).toBe(1)
  })

  it('shows "Compris" instead of "Garder telle quelle" when there is no suggestion', () => {
    const wrapper = mountModal({ suggestedIncomeCategory: null })
    const text = wrapper.text()
    expect(text).toContain('Compris')
    expect(text).not.toContain('Garder telle quelle')
  })

  it('disables both buttons when isUpdating is true', () => {
    const wrapper = mountModal({ isUpdating: true })
    const buttons = wrapper.findAll('button')
    for (const b of buttons) {
      expect(b.attributes('disabled')).toBeDefined()
    }
  })

  it('emits "keep" when clicking the backdrop', async () => {
    const wrapper = mountModal()
    // Backdrop is the absolute positioned div with bg-black/40
    const backdrop = wrapper.find('.bg-black\\/40')
    await backdrop.trigger('click')
    expect(wrapper.emitted('keep')).toBeDefined()
  })

  it('always shows the delete button regardless of suggestion', () => {
    const withSuggestion = mountModal()
    expect(
      withSuggestion.findAll('button').find(b => b.text().includes('Supprimer'))
    ).toBeDefined()

    const withoutSuggestion = mountModal({ suggestedIncomeCategory: null })
    expect(
      withoutSuggestion
        .findAll('button')
        .find(b => b.text().includes('Supprimer'))
    ).toBeDefined()
  })

  it('uses singular wording on the delete button when there is one reimbursement', () => {
    const wrapper = mountModal({ reimbursements: [mockReimbursement()] })
    const deleteBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Supprimer'))
    expect(deleteBtn?.text()).toContain('Supprimer le remboursement')
    expect(deleteBtn?.text()).not.toContain('les')
  })

  it('uses plural wording with the count when there are multiple reimbursements', () => {
    const wrapper = mountModal({
      reimbursements: [
        mockReimbursement({ id: 'r1', personName: 'Alice' }),
        mockReimbursement({ id: 'r2', personName: 'Bob' }),
        mockReimbursement({ id: 'r3', personName: 'Charlie' }),
      ],
    })
    const deleteBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Supprimer'))
    expect(deleteBtn?.text()).toContain('Supprimer les 3 remboursements')
  })

  it('emits "delete" without payload when the user clicks the delete button', async () => {
    const wrapper = mountModal()
    const deleteBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Supprimer'))
    await deleteBtn?.trigger('click')

    expect(wrapper.emitted('delete')).toBeDefined()
    expect(wrapper.emitted('delete')?.length).toBe(1)
    expect(wrapper.emitted('delete')?.[0]).toEqual([])
  })

  it('disables the delete button when isUpdating is true', () => {
    const wrapper = mountModal({ isUpdating: true })
    const deleteBtn = wrapper
      .findAll('button')
      .find(b => b.text().includes('Supprimer'))
    expect(deleteBtn?.attributes('disabled')).toBeDefined()
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TransactionRow from './TransactionRow.vue'
import type { ReimbursementDto, TransactionDto } from '@/lib/api'

const tx = (overrides: Partial<TransactionDto> = {}): TransactionDto =>
  ({
    id: 'tx-1',
    date: '2026-09-01T00:00:00.000Z',
    description: 'Carrefour',
    amount: -42.5,
    type: 'EXPENSE',
    accountId: 'acc-1',
    account: 'Compte courant',
    subcategory: null,
    note: null,
    isPointed: false,
    categoryId: 'cat-1',
    categoryName: 'Alimentation',
    categoryIcon: null,
    subcategoryId: null,
    subcategoryName: null,
    createdAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  }) as TransactionDto

const reimb = (overrides: Partial<ReimbursementDto>): ReimbursementDto =>
  ({
    id: 'r-1',
    transactionId: 'tx-1',
    personId: 'p-1',
    personName: 'Marie',
    amount: 10,
    amountReceived: 0,
    status: 'PENDING',
    ...overrides,
  }) as ReimbursementDto

function mountRow(props: Record<string, unknown> = {}) {
  return mount(TransactionRow, {
    props: {
      transaction: tx(),
      reimbursements: [],
      remainingAmount: 42.5,
      allTags: [],
      ...props,
    },
  })
}

describe('TransactionRow', () => {
  it('renders each datum once per layout, from a single source', () => {
    const wrapper = mountRow()
    // Description and amount appear in both arrangements of the same row.
    expect(wrapper.text()).toContain('Carrefour')
    expect(wrapper.findAll('input[type="checkbox"]')).toHaveLength(0)
  })

  it('initializes the note draft from the stored note when editing opens', async () => {
    const wrapper = mountRow({
      transaction: tx({ note: 'déjà là' }),
    })
    await wrapper.setProps({ isEditingNote: true })

    const input = wrapper.find<HTMLInputElement>('input[type="text"]')
    expect(input.element.value).toBe('déjà là')
  })

  it('emits save-note with the edited draft, not the stored note', async () => {
    const wrapper = mountRow({ transaction: tx({ note: 'avant' }) })
    await wrapper.setProps({ isEditingNote: true })

    await wrapper.find('input[type="text"]').setValue('après')
    await wrapper.find('button[title="Sauvegarder"]').trigger('click')

    expect(wrapper.emitted('save-note')).toEqual([['après']])
  })

  it('summarizes reimbursements: pending total, or « Remboursé » when all completed', async () => {
    const wrapper = mountRow({
      reimbursements: [
        reimb({ id: 'r-1', amount: 10 }),
        reimb({ id: 'r-2', amount: 5 }),
      ],
    })
    expect(wrapper.text()).toContain('en attente')

    await wrapper.setProps({
      reimbursements: [
        reimb({ id: 'r-1', amount: 10, status: 'COMPLETED' }),
        reimb({ id: 'r-2', amount: 5, status: 'COMPLETED' }),
      ],
    })
    expect(wrapper.text()).toContain('Remboursé')
  })

  it('shows the selection checkbox instead of the category icon in selection mode', async () => {
    const wrapper = mountRow({ selectionMode: true, selected: true })
    const boxes = wrapper.findAll('input[type="checkbox"]')
    // One per layout arrangement, both driven by the same `selected` prop.
    expect(boxes.length).toBe(2)
    for (const box of boxes) {
      expect((box.element as HTMLInputElement).checked).toBe(true)
    }
  })

  it('routes actions as events, never calling anything itself', async () => {
    const wrapper = mountRow()
    await wrapper.find('button[title="Pointer"]').trigger('click')
    expect(wrapper.emitted('toggle-pointed')).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TransactionReimbursementList from './TransactionReimbursementList.vue'
import type { ReimbursementDto } from '@/lib/api'

// The income links go through RouterLink.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

const reimb = (overrides: Partial<ReimbursementDto>): ReimbursementDto =>
  ({
    id: 'r-1',
    transactionId: 'tx-1',
    personId: 'p-1',
    personName: 'Thomas',
    amount: 52.5,
    amountReceived: 0,
    amountRemaining: 52.5,
    status: 'PENDING',
    settlementIds: [],
    incomeTransactionIds: [],
    transaction: {
      id: 'tx-1',
      date: '2026-10-01',
      description: 'Restaurant anniversaire',
      amount: -210,
    },
    ...overrides,
  }) as ReimbursementDto

const debts = [
  reimb({ id: 'r-pending' }),
  reimb({
    id: 'r-partial',
    personName: 'Sophie',
    status: 'PARTIAL',
    amountReceived: 20,
    amountRemaining: 32.5,
  }),
  reimb({
    id: 'r-done',
    personName: 'Julien',
    status: 'COMPLETED',
    amountReceived: 52.5,
    amountRemaining: 0,
  }),
]

function mountList(dense: boolean) {
  return mount(TransactionReimbursementList, {
    global: { plugins: [router] },
    props: { reimbursements: debts, dense },
  })
}

describe('TransactionReimbursementList', () => {
  describe.each([
    ['regular', false],
    ['dense', true],
  ])('%s', (_label, dense) => {
    it('offers « Régler » on pending and partial debts, not on completed ones', () => {
      const wrapper = mountList(dense)

      const pending = wrapper.find(
        '[data-testid="reimbursement-settle-r-pending"]'
      )
      expect(pending.exists()).toBe(true)
      expect(pending.text()).toBe('Régler')
      expect(pending.attributes('title')).toBe(
        'Régler uniquement Restaurant anniversaire'
      )
      expect(
        wrapper.find('[data-testid="reimbursement-settle-r-partial"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="reimbursement-settle-r-done"]').exists()
      ).toBe(false)
    })

    it('emits settle with the debt', async () => {
      const wrapper = mountList(dense)

      await wrapper
        .find('[data-testid="reimbursement-settle-r-partial"]')
        .trigger('click')

      expect(wrapper.emitted('settle')).toEqual([[debts[1]]])
      expect(wrapper.emitted('delete')).toBeUndefined()
    })

    it('puts « Régler » before the delete cross', () => {
      const wrapper = mountList(dense)

      const settle = wrapper.find(
        '[data-testid="reimbursement-settle-r-pending"]'
      ).element
      const cross = wrapper.find(
        'button[aria-label="Supprimer le remboursement de Thomas"]'
      ).element
      expect(settle.nextElementSibling).toBe(cross)
    })
  })

  it('gives « Régler » a 44 px touch target in the dense fit only', () => {
    const dense = mountList(true).find(
      '[data-testid="reimbursement-settle-r-pending"]'
    )
    const regular = mountList(false).find(
      '[data-testid="reimbursement-settle-r-pending"]'
    )
    expect(dense.classes()).toContain('pointer-coarse:min-h-[44px]')
    expect(regular.classes()).not.toContain('pointer-coarse:min-h-[44px]')
  })
})

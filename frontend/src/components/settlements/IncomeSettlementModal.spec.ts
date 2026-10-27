import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createRouter, createMemoryHistory } from 'vue-router'
import { mount, flushPromises, enableAutoUnmount } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import IncomeSettlementModal from './IncomeSettlementModal.vue'
import type { ReimbursementDto, SettlementDto, TransactionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: { createSettlement: vi.fn() },
}))

import { api } from '@/lib/api'

// The links beside the debt lines need a router to resolve.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', component: { template: '<div />' } },
    { path: '/transactions', component: { template: '<div />' } },
  ],
})

function debt(
  id: string,
  overrides: Partial<ReimbursementDto> & {
    date?: string
    description?: string
  } = {}
): ReimbursementDto {
  const { date = '2026-02-14', description = id, ...rest } = overrides
  return {
    id,
    transactionId: `tx-${id}`,
    personId: 'p-thomas',
    personName: 'Thomas',
    expenseCategoryId: 'cat-resto',
    expenseCategoryName: 'Restaurants',
    amount: 52.5,
    amountReceived: 0,
    amountRemaining: 52.5,
    status: 'PENDING',
    note: null,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    settlementIds: [],
    incomeTransactionIds: [],
    transaction: { id: `tx-${id}`, date, description, amount: -105 },
    ...rest,
  }
}

const resto = debt('r-resto', { description: 'Restaurant anniversaire' })
const hotel = debt('r-hotel', {
  personId: 'p-sophie',
  personName: 'Sophie',
  expenseCategoryId: 'cat-logement',
  expenseCategoryName: 'Logement',
  amount: 306,
  amountRemaining: 306,
  description: 'Hôtel Firenze 4 nuits',
  date: '2025-11-10',
})
const train = debt('r-train', {
  personId: 'p-sophie',
  personName: 'Sophie',
  expenseCategoryId: 'cat-logement',
  expenseCategoryName: 'Logement',
  amount: 120,
  amountRemaining: 120,
  description: 'Train Florence Rome',
  date: '2025-11-12',
})

function income(overrides: Partial<TransactionDto> = {}): TransactionDto {
  return {
    id: 'tx-income',
    date: '2026-10-15',
    description: 'Virement Thomas resto',
    amount: 52.5,
    type: 'INCOME',
    accountId: 'acc-1',
    account: 'Compte Courant',
    isPointed: false,
    categoryId: 'cat-refunds',
    categoryName: 'Remboursements',
    subcategory: null,
    subcategoryId: null,
    subcategoryName: null,
    note: null,
    createdAt: '2026-10-15T10:00:00.000Z',
    settlements: [],
    ...overrides,
  }
}

const SETTLEMENT: SettlementDto = {
  id: 's-1',
  personId: 'p-thomas',
  personName: 'Thomas',
  incomeTransactionId: 'tx-income',
  incomeTransactionDescription: 'Virement Thomas resto',
  incomeTransactionDate: '2026-10-15',
  incomeTransactionAmount: 52.5,
  amountUsed: 52.5,
  note: null,
  createdAt: '2026-10-27T10:00:00.000Z',
  reimbursements: [],
}

async function mountModal(
  options: {
    transaction?: TransactionDto
    pending?: ReimbursementDto[]
    preselect?: { personId: string; reimbursementIds: string[] } | null
  } = {}
) {
  const wrapper = mount(IncomeSettlementModal, {
    props: {
      isOpen: false,
      transaction: options.transaction ?? income(),
      pendingReimbursements: options.pending ?? [hotel, train, resto],
      preselect: options.preselect ?? null,
    },
    global: { plugins: [router], stubs: { Teleport: true } },
  })
  await wrapper.setProps({ isOpen: true })
  await flushPromises()
  return wrapper
}

async function tick(wrapper: VueWrapper, label: string): Promise<void> {
  await wrapper
    .get(`input[aria-label="Sélectionner ${label}"]`)
    .trigger('change')
}

function checked(wrapper: VueWrapper, label: string): boolean {
  return (
    wrapper.get(`input[aria-label="Sélectionner ${label}"]`)
      .element as HTMLInputElement
  ).checked
}

function groupOrder(wrapper: VueWrapper): string[] {
  return wrapper
    .findAll('[data-testid^="income-settlement-group-"]')
    .map(g =>
      (g.attributes('data-testid') ?? '').replace(
        'income-settlement-group-',
        ''
      )
    )
}

function amountField(wrapper: VueWrapper, label: string) {
  const field = wrapper
    .findAll('label')
    .find(l => l.text() === `Montant imputé à ${label}`)
  if (!field) throw new Error(`No amount field for ${label}`)
  return wrapper.get(`#${CSS.escape(field.attributes('for') ?? '')}`)
}

async function setAmount(
  wrapper: VueWrapper,
  label: string,
  value: string
): Promise<void> {
  const input = amountField(wrapper, label)
  await input.setValue(value)
  await input.trigger('change')
  await flushPromises()
}

describe('IncomeSettlementModal', () => {
  enableAutoUnmount(afterEach)

  beforeEach(() => {
    vi.mocked(api.createSettlement).mockReset()
    vi.mocked(api.createSettlement).mockResolvedValue(SETTLEMENT)
  })

  it('heads with the income, what it received and what is still available', async () => {
    const wrapper = await mountModal({
      transaction: income({
        amount: 100,
        settlements: [
          { id: 's-0', personId: 'p-x', personName: 'X', amountUsed: 47.5 },
        ],
      }),
    })

    expect(wrapper.text()).toContain('Régler avec ce revenu')
    expect(wrapper.text()).toContain(
      'Virement Thomas resto · 15/10/2026 · quelle dette règle-t-il ?'
    )
    const receipt = wrapper.get('[data-testid="income-settlement-receipt"]')
    expect(receipt.text()).toContain('Reçu sur Compte Courant')
    expect(receipt.text()).toMatch(/100,00\s€/)
    expect(
      wrapper.get('[data-testid="income-settlement-available"]').text()
    ).toMatch(/52,50\s€ disponibles/)
  })

  it('ranks the people, the likeliest first and unfolded, with the reasons written', async () => {
    const wrapper = await mountModal()

    expect(groupOrder(wrapper)).toEqual(['p-thomas', 'p-sophie'])
    const thomas = wrapper.get(
      '[data-testid="income-settlement-group-p-thomas"]'
    )
    expect(thomas.text()).toContain('nom dans le libellé')
    expect(thomas.text()).toMatch(/1 ligne\(s\) · dû 52,50\s€/)
    expect(
      thomas.get('[data-testid="income-settlement-line-r-resto"]').text()
    ).toContain('montant exact')
    // Sophie's group stays folded.
    expect(
      wrapper.find('[data-testid="income-settlement-line-r-hotel"]').exists()
    ).toBe(false)
    expect(
      wrapper.get('[data-testid="income-settlement-group-p-sophie"]').text()
    ).not.toContain('nom dans le libellé')
  })

  it('opens on what the row pre-selected', async () => {
    const wrapper = await mountModal({
      preselect: { personId: 'p-thomas', reimbursementIds: ['r-resto'] },
    })

    expect(checked(wrapper, 'Restaurant anniversaire')).toBe(true)
    expect(
      wrapper.get('[data-testid="income-settlement-selection-total"]').text()
    ).toMatch(
      /1 remboursement\(s\) sélectionné\(s\)\s*·\s*52,50\s€ sur 52,50\s€ disponibles/
    )
    expect(
      wrapper
        .get('[data-testid="income-settlement-confirm"]')
        .attributes('disabled')
    ).toBeUndefined()
  })

  it('opens empty and disabled without a pre-selection', async () => {
    const wrapper = await mountModal()

    expect(checked(wrapper, 'Restaurant anniversaire')).toBe(false)
    expect(
      wrapper
        .get('[data-testid="income-settlement-confirm"]')
        .attributes('disabled')
    ).toBeDefined()
  })

  it('replaces the selection when a debt of another person is ticked, and says so', async () => {
    const wrapper = await mountModal({
      transaction: income({ amount: 500 }),
      preselect: { personId: 'p-thomas', reimbursementIds: ['r-resto'] },
    })
    expect(
      wrapper.get('[data-testid="income-settlement-one-person"]').text()
    ).toContain("Un règlement ne concerne qu'une personne")

    await wrapper.get('[aria-label="Déplier Sophie"]').trigger('click')
    await tick(wrapper, 'Hôtel Firenze 4 nuits')

    expect(checked(wrapper, 'Hôtel Firenze 4 nuits')).toBe(true)
    expect(checked(wrapper, 'Restaurant anniversaire')).toBe(false)

    // Ticking the person's own other debt adds to it.
    await tick(wrapper, 'Train Florence Rome')
    expect(checked(wrapper, 'Hôtel Firenze 4 nuits')).toBe(true)
    expect(checked(wrapper, 'Train Florence Rome')).toBe(true)
  })

  it('ticks a whole person through the group box, replacing another person', async () => {
    const wrapper = await mountModal({
      transaction: income({ amount: 500 }),
      preselect: { personId: 'p-thomas', reimbursementIds: ['r-resto'] },
    })

    await tick(wrapper, 'Sophie')

    expect(checked(wrapper, 'Hôtel Firenze 4 nuits')).toBe(true)
    expect(checked(wrapper, 'Train Florence Rome')).toBe(true)
    expect(checked(wrapper, 'Restaurant anniversaire')).toBe(false)
  })

  it('confirms directly when the income covers the selection, each line settled in full', async () => {
    const wrapper = await mountModal({
      preselect: { personId: 'p-thomas', reimbursementIds: ['r-resto'] },
    })

    await wrapper
      .get('[data-testid="income-settlement-confirm"]')
      .trigger('click')
    await flushPromises()

    expect(api.createSettlement).toHaveBeenCalledWith({
      personId: 'p-thomas',
      incomeTransactionId: 'tx-income',
      reimbursements: [{ reimbursementId: 'r-resto', amountSettled: 52.5 }],
    })
    expect(wrapper.emitted('confirm')?.[0]).toEqual([SETTLEMENT])
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('keeps the server refusal in the modal', async () => {
    vi.mocked(api.createSettlement).mockRejectedValue(
      new Error('Montant supérieur au disponible')
    )
    const wrapper = await mountModal({
      preselect: { personId: 'p-thomas', reimbursementIds: ['r-resto'] },
    })

    await wrapper
      .get('[data-testid="income-settlement-confirm"]')
      .trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Montant supérieur au disponible')
    expect(wrapper.emitted('confirm')).toBeUndefined()
    expect(wrapper.emitted('close')).toBeUndefined()
  })

  describe('when the selection owes more than the income holds', () => {
    const short = income({ description: 'VIR SOPHIE', amount: 300 })

    async function atAllocation() {
      const wrapper = await mountModal({ transaction: short })
      await tick(wrapper, 'Sophie')
      await wrapper
        .get('[data-testid="income-settlement-continue"]')
        .trigger('click')
      await flushPromises()
      return wrapper
    }

    it('offers « Continuer » instead of confirming', async () => {
      const wrapper = await mountModal({ transaction: short })
      await tick(wrapper, 'Sophie')

      expect(
        wrapper.find('[data-testid="income-settlement-confirm"]').exists()
      ).toBe(false)
      expect(
        wrapper.find('[data-testid="income-settlement-continue"]').exists()
      ).toBe(true)
    })

    it('cascades the income oldest first, with the step trail and the date', async () => {
      const wrapper = await atAllocation()

      expect(wrapper.find('[aria-current="step"]').text()).toContain(
        'Répartition'
      )
      expect(wrapper.text()).toContain('Sophie · comment répartir les')
      expect(wrapper.text()).toMatch(/426,00\s€ dus/)
      expect(
        (
          amountField(wrapper, 'Hôtel Firenze 4 nuits')
            .element as HTMLInputElement
        ).value
      ).toBe('300')
      expect(
        (
          amountField(wrapper, 'Train Florence Rome')
            .element as HTMLInputElement
        ).value
      ).toBe('0')
      expect(wrapper.text()).toContain('reste en attente')
      expect(wrapper.text()).toMatch(/Solder malgré 6,00\s€/)
      expect(wrapper.text()).toContain("Le règlement est daté d'aujourd'hui")
      expect(
        wrapper.get('[data-testid="income-settlement-allocated-total"]').text()
      ).toMatch(/Total imputé\s*300,00\s€\s*sur 300,00\s€ · reste 0,00\s€/)
    })

    it('switches to prorata', async () => {
      const wrapper = await atAllocation()

      const prorata = wrapper
        .findAll('[role="radio"]')
        .find(option => option.text() === 'Au prorata')
      await prorata?.trigger('click')
      await flushPromises()

      // 306 / 426 × 300 = 215.49, the last line takes the rounding.
      expect(
        (
          amountField(wrapper, 'Hôtel Firenze 4 nuits')
            .element as HTMLInputElement
        ).value
      ).toBe('215,49')
      expect(
        (
          amountField(wrapper, 'Train Florence Rome')
            .element as HTMLInputElement
        ).value
      ).toBe('84,51')
    })

    it('bounds a line by what it owes and by what the income has left', async () => {
      const wrapper = await atAllocation()

      // Nothing left for the train while the hotel takes everything.
      await setAmount(wrapper, 'Train Florence Rome', '50')
      expect(
        (
          amountField(wrapper, 'Train Florence Rome')
            .element as HTMLInputElement
        ).value
      ).toBe('0')

      await setAmount(wrapper, 'Hôtel Firenze 4 nuits', '200')
      await setAmount(wrapper, 'Train Florence Rome', '150')
      // The line owes 120: the ceiling is the line before the income's 100.
      expect(
        (
          amountField(wrapper, 'Train Florence Rome')
            .element as HTMLInputElement
        ).value
      ).toBe('100')
    })

    it('sends the split, with the shortfall settled when asked', async () => {
      const wrapper = await atAllocation()

      await wrapper
        .get('input[aria-label="Solder Hôtel Firenze 4 nuits"]')
        .setValue(true)
      await wrapper
        .get('[data-testid="income-settlement-confirm"]')
        .trigger('click')
      await flushPromises()

      expect(api.createSettlement).toHaveBeenCalledWith({
        personId: 'p-sophie',
        incomeTransactionId: 'tx-income',
        reimbursements: [
          {
            reimbursementId: 'r-hotel',
            amountSettled: 300,
            forceComplete: true,
          },
        ],
      })
      expect(wrapper.emitted('confirm')).toHaveLength(1)
      expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('goes back to the selection with the back arrow', async () => {
      const wrapper = await atAllocation()

      await wrapper
        .get('[data-testid="income-settlement-back"]')
        .trigger('click')

      expect(
        wrapper.find('[data-testid="income-settlement-step-select"]').exists()
      ).toBe(true)
      expect(checked(wrapper, 'Hôtel Firenze 4 nuits')).toBe(true)
    })
  })
})

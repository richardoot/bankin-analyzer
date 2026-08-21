import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import SuggestedSettlements from './SuggestedSettlements.vue'
import SuggestedSettlementRow from './SuggestedSettlementRow.vue'
import { api } from '@/lib/api'
import type { SettlementSuggestionDto } from '@/lib/api'

vi.mock('@/lib/api', () => ({
  api: {
    getSettlementSuggestions: vi.fn(),
    createSettlement: vi.fn(),
  },
}))

const suggestion = (
  overrides: Partial<SettlementSuggestionDto> = {}
): SettlementSuggestionDto => ({
  transactionId: 'tx-virement',
  date: '2026-02-15',
  description: 'VIR ALICE MARTIN',
  availableAmount: 600,
  personId: 'person-alice',
  personName: 'Alice Martin',
  score: 7,
  reasons: ['name', 'category', 'amount'],
  coverage: 600,
  debts: [
    {
      reimbursementId: 'reimb-dentiste',
      description: 'Cabinet dentaire',
      expenseDate: '2026-01-12',
      categoryId: 'cat-sante',
      categoryName: 'Sante',
      amountRemaining: 600,
    },
  ],
  ...overrides,
})

describe('SuggestedSettlements', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([])
  })

  async function mountComponent() {
    // The modal is teleported to <body>, which would put it outside the
    // wrapper's DOM; stubbing the teleport keeps it queryable in place.
    const wrapper = mount(SuggestedSettlements, {
      global: { stubs: { teleport: true } },
    })
    await flushPromises()
    return wrapper
  }

  function openAll(wrapper: ReturnType<typeof mount>) {
    const trigger = wrapper
      .findAll('button')
      .find(b => b.text().includes('Voir les'))
    if (!trigger) throw new Error('no "see all" button rendered')
    return trigger.trigger('click')
  }

  it('stays out of the way when there is nothing to match', async () => {
    const wrapper = await mountComponent()

    expect(wrapper.find('section').exists()).toBe(false)
  })

  it('names the payer, the amount and what it would cover', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([suggestion()])

    const wrapper = await mountComponent()

    expect(wrapper.text()).toContain('VIR ALICE MARTIN')
    expect(wrapper.text()).toContain('Alice Martin')
    expect(wrapper.text()).toContain('1 depense')
  })

  it('says these are guesses, not recorded reimbursements', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([suggestion()])

    const wrapper = await mountComponent()

    // The section sits above a list of things the user entered themselves, so
    // it has to disown its own contents loudly.
    expect(wrapper.text()).toContain('Suggestions')
    expect(wrapper.text()).toContain('devines')
    expect(wrapper.text()).toContain("Rien n'est enregistre")
    // The action confirms a proposal; it does not state a fact.
    expect(wrapper.find('button').text()).toBe('Confirmer')
  })

  it('explains how a suggestion is arrived at', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([suggestion()])

    const wrapper = await mountComponent()
    const help = wrapper.find('details')

    expect(help.exists()).toBe(true)
    // Including the rule that decides what appears at all.
    expect(help.text()).toContain('deux indices doivent concorder')
  })

  it('shows why the transfer was suggested', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([suggestion()])

    const wrapper = await mountComponent()

    // The reasoning is what makes the guess reviewable.
    expect(wrapper.text()).toContain('nom du payeur')
    expect(wrapper.text()).toContain('categorie associee')
    expect(wrapper.text()).toContain('montant')
  })

  it('keeps one row per transfer, the best-scoring person', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([
      suggestion(),
      suggestion({
        personId: 'person-bruno',
        personName: 'Bruno Petit',
        score: 1,
        reasons: ['amount'],
      }),
    ])

    const wrapper = await mountComponent()

    expect(
      wrapper.findAll('li').filter(li => li.text().includes('Rembourserait'))
    ).toHaveLength(1)
    expect(wrapper.text()).toContain('Alice Martin')
    expect(wrapper.text()).not.toContain('Bruno Petit')
  })

  describe('the five-row preview', () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, i) =>
        suggestion({ transactionId: `tx-${i}`, personName: `Payeur ${i}` })
      )

    function rows(wrapper: ReturnType<typeof mount>) {
      return wrapper.findAllComponents(SuggestedSettlementRow)
    }

    it('shows everything when it fits', async () => {
      vi.mocked(api.getSettlementSuggestions).mockResolvedValue(many(4))

      const wrapper = await mountComponent()

      expect(rows(wrapper)).toHaveLength(4)
      expect(wrapper.text()).not.toContain('Voir les')
    })

    it('caps the section at five and offers the rest', async () => {
      vi.mocked(api.getSettlementSuggestions).mockResolvedValue(many(36))

      const wrapper = await mountComponent()

      expect(rows(wrapper)).toHaveLength(5)
      expect(wrapper.text()).toContain('Voir les 36 suggestions')
      expect(wrapper.text()).toContain('31 de plus')
    })

    it('lists them all in the modal', async () => {
      vi.mocked(api.getSettlementSuggestions).mockResolvedValue(many(36))

      const wrapper = await mountComponent()
      await openAll(wrapper)

      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
      // The five in the section, plus the full list in the modal.
      expect(rows(wrapper)).toHaveLength(5 + 36)
    })

    it('closes the modal once nothing is left to suggest', async () => {
      vi.mocked(api.getSettlementSuggestions).mockResolvedValue(many(36))
      const wrapper = await mountComponent()
      await openAll(wrapper)
      expect(wrapper.find('[role="dialog"]').exists()).toBe(true)

      // Everything got settled elsewhere; an empty dialog over the page is
      // worse than no dialog.
      vi.mocked(api.getSettlementSuggestions).mockResolvedValue([])
      await (wrapper.vm as unknown as { load: () => Promise<void> }).load()
      await flushPromises()

      expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
    })
  })

  it('settles the debts oldest first when confirmed', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([
      suggestion({
        availableAmount: 400,
        coverage: 400,
        debts: [
          {
            reimbursementId: 'older',
            description: 'Cabinet dentaire',
            expenseDate: '2026-01-12',
            categoryId: 'cat-sante',
            categoryName: 'Sante',
            amountRemaining: 300,
          },
          {
            reimbursementId: 'recent',
            description: 'Pharmacie',
            expenseDate: '2026-02-01',
            categoryId: 'cat-sante',
            categoryName: 'Sante',
            amountRemaining: 300,
          },
        ],
      }),
    ])
    vi.mocked(api.createSettlement).mockResolvedValue(
      {} as Awaited<ReturnType<typeof api.createSettlement>>
    )

    const wrapper = await mountComponent()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    // 400 of cash over two 300 debts: the older one is closed, the rest goes
    // to the next — the same waterfall the manual modal applies.
    expect(api.createSettlement).toHaveBeenCalledWith({
      personId: 'person-alice',
      incomeTransactionId: 'tx-virement',
      reimbursements: [
        { reimbursementId: 'older', amountSettled: 300 },
        { reimbursementId: 'recent', amountSettled: 100 },
      ],
    })
  })

  it('tells the parent so it can refresh what is owed', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([suggestion()])
    vi.mocked(api.createSettlement).mockResolvedValue(
      {} as Awaited<ReturnType<typeof api.createSettlement>>
    )

    const wrapper = await mountComponent()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.emitted('settled')).toHaveLength(1)
  })

  it('reports a failure instead of pretending it worked', async () => {
    vi.mocked(api.getSettlementSuggestions).mockResolvedValue([suggestion()])
    vi.mocked(api.createSettlement).mockRejectedValue(new Error('boom'))

    const wrapper = await mountComponent()
    await wrapper.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Le rapprochement a echoue')
    expect(wrapper.emitted('settled')).toBeUndefined()
  })

  it('surfaces a loading failure', async () => {
    vi.mocked(api.getSettlementSuggestions).mockRejectedValue(new Error('boom'))

    const wrapper = await mountComponent()

    expect(wrapper.text()).toContain('Impossible de charger')
  })
})

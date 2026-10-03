import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import SpendingStructureCard from './SpendingStructureCard.vue'
import type { SpendingStructureDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const actual: SpendingStructureDto = {
  essential: 1000,
  pleasure: 500,
  unknownNature: 0,
  committed: 900,
  variable: 600,
  unknownRhythm: 0,
  total: 1500,
}

const everyday: SpendingStructureDto = {
  essential: 1000,
  pleasure: 200,
  unknownNature: 0,
  committed: 900,
  variable: 300,
  unknownRhythm: 0,
  total: 1200,
}

function mountCard(
  overrides: Partial<InstanceType<typeof SpendingStructureCard>['$props']> = {}
) {
  return mount(SpendingStructureCard, {
    props: {
      actual,
      everyday,
      savingsTransfers: 300,
      pendingReceivables: 0,
      savingsRate: 0.15,
      remainingToLive: 800,
      periodMonths: 1,
      ...overrides,
    },
  })
}

describe('SpendingStructureCard', () => {
  it('opens on the everyday reading and shares each axis out', () => {
    const wrapper = mountCard()

    const nature = wrapper.find('[data-testid="axis-nature"]')
    expect(nature.text()).toContain('Essentiel')
    expect(nature.text()).toContain('83 %')
    expect(nature.text()).toContain('Plaisir')
    expect(nature.text()).toContain('17 %')

    const rhythm = wrapper.find('[data-testid="axis-rhythm"]')
    expect(rhythm.text()).toContain('Engagé')
    expect(rhythm.text()).toContain('75 %')
  })

  it('switches to the month as it was', async () => {
    const wrapper = mountCard()

    await wrapper.find('[data-testid="reading-actual"]').trigger('click')

    const nature = wrapper.find('[data-testid="axis-nature"]')
    expect(nature.text()).toContain('67 %')
    expect(nature.text()).toContain('33 %')
  })

  it('reads the savings: amount, share of income, free money', () => {
    const wrapper = mountCard()

    const savings = wrapper.find('[data-testid="savings-reading"]').text()
    expect(savings).toContain('300')
    expect(savings).toContain('15 %')
    expect(savings).toContain('900')
    expect(savings).toContain('800')
  })

  it('shows what is still owed as a stock, not per month', () => {
    const wrapper = mountCard({ pendingReceivables: 3700, periodMonths: 3 })

    const owed = wrapper.find('[data-testid="pending-receivables"]').text()
    expect(owed).toContain('Avancé, en attente de retour')
    expect(owed).toContain('3')
    expect(owed).toContain('700')
    expect(owed).not.toContain('/ mois')
  })

  it('divides by the months of the period', () => {
    const wrapper = mountCard({ periodMonths: 3 })

    expect(wrapper.find('[data-testid="savings-reading"]').text()).toContain(
      '100'
    )
  })

  it('names what is still waiting for the migration', () => {
    const wrapper = mountCard({
      everyday: { ...everyday, unknownNature: 400, unknownRhythm: 400 },
    })

    expect(wrapper.find('[data-testid="unknown-hint"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="axis-nature"]').text()).toContain(
      'À migrer'
    )
  })

  it('shows a dash for the free money without income', () => {
    const wrapper = mountCard({ remainingToLive: null, savingsRate: null })

    const savings = wrapper.find('[data-testid="savings-reading"]').text()
    expect(savings).toContain('—')
    expect(savings).not.toContain('des revenus')
  })
})

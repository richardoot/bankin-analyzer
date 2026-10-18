import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, RouterLinkStub } from '@vue/test-utils'
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
  recurring: 0,
  total: 1500,
}

const everyday: SpendingStructureDto = {
  essential: 1000,
  pleasure: 200,
  unknownNature: 0,
  committed: 900,
  variable: 300,
  unknownRhythm: 0,
  recurring: 0,
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
      reading: 'everyday',
      ...overrides,
    },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('SpendingStructureCard', () => {
  it('names the recurring share of the committed spending and links to the list', () => {
    const wrapper = mountCard({
      everyday: { ...everyday, recurring: 240 },
      periodMonths: 2,
    })

    const line = wrapper.find('[data-testid="recurring-share"]')
    expect(line.text()).toContain('dont abonnements et charges récurrentes')
    expect(line.text()).toContain('120,00')
    expect(wrapper.findComponent(RouterLinkStub).props('to')).toBe(
      '/recurrences'
    )
  })

  it('says nothing about recurrences when none was detected', () => {
    const wrapper = mountCard()

    expect(wrapper.find('[data-testid="recurring-share"]').exists()).toBe(false)
  })

  it('reads the everyday structure when told to, and shares each axis out', () => {
    const wrapper = mountCard()
    expect(wrapper.text()).toContain('vie courante')

    const nature = wrapper.find('[data-testid="axis-nature"]')
    expect(nature.text()).toContain('Essentiel')
    expect(nature.text()).toContain('83 %')
    expect(nature.text()).toContain('Plaisir')
    expect(nature.text()).toContain('17 %')

    const rhythm = wrapper.find('[data-testid="axis-rhythm"]')
    expect(rhythm.text()).toContain('Engagé')
    expect(rhythm.text()).toContain('75 %')
  })

  it('reads the month as it was when the page says so', async () => {
    // No control of its own: the reading is the page's, set once for all.
    const wrapper = mountCard()
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false)

    await wrapper.setProps({ reading: 'actual' })

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

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import TagFamilyPage from './TagFamilyPage.vue'
import { api } from '@/lib/api'
import type { TagFamilyAnalysisDto, TagFamilyAnalysisTagDto } from '@/lib/api'
import { transactionsLink } from '@/lib/transactionsLink'

vi.mock('vue3-apexcharts/core', () => ({
  default: {
    name: 'VueApexCharts',
    props: ['type', 'height', 'options', 'series'],
    template: '<div class="apexcharts-mock"></div>',
  },
}))

vi.mock('vue-router', async importOriginal => ({
  ...(await importOriginal<typeof import('vue-router')>()),
  useRoute: () => ({ params: { id: 'fam-1' } }),
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/api', () => ({
  api: { getTagFamilyAnalysis: vi.fn() },
}))

/** formatCurrency uses narrow no-break spaces; normalise before matching. */
const norm = (text: string): string => text.replace(/\s+/g, ' ')

const edition = (
  id: string,
  name: string,
  extra: Partial<TagFamilyAnalysisTagDto> = {}
): TagFamilyAnalysisTagDto => ({
  id,
  name,
  color: null,
  icon: null,
  isExceptional: true,
  status: 'past',
  eventStartDate: '2026-03-14',
  eventEndDate: '2026-03-15',
  days: 2,
  spent: 300,
  spentPerDay: 150,
  surplus: 280,
  budgetAmount: null,
  transactionCount: 3,
  isPartial: false,
  ...extra,
})

const analysis: TagFamilyAnalysisDto = {
  family: {
    id: 'fam-1',
    name: 'HYROX',
    color: '#f97316',
    icon: null,
    annualBudget: null,
  },
  basis: 'event',
  year: null,
  availableYears: [2025, 2026],
  totalExpenses: 520,
  totalIncome: 0,
  net: -520,
  transactionCount: 6,
  totalSurplus: 470,
  byCategory: [
    {
      categoryId: 'c-sport',
      categoryName: 'Sport',
      categoryIcon: null,
      type: 'EXPENSE',
      amount: 520,
      transactionCount: 6,
    },
  ],
  byYear: [
    { year: 2025, expenses: 220, income: 0, transactionCount: 3 },
    { year: 2026, expenses: 300, income: 0, transactionCount: 3 },
  ],
  tags: [
    edition('lyon', 'HYROX Lyon 2026'),
    edition('nice', 'HYROX Nice 2025', {
      eventStartDate: '2025-10-04',
      eventEndDate: '2025-10-04',
      days: 1,
      spent: 220,
      spentPerDay: 220,
      surplus: 190,
    }),
  ],
  comparison: {
    editionCount: 2,
    averageSpent: 260,
    medianSpent: 260,
    averagePerDay: 173.33,
    mostExpensive: { id: 'lyon', name: 'HYROX Lyon 2026', spent: 300 },
    leastExpensive: { id: 'nice', name: 'HYROX Nice 2025', spent: 220 },
  },
}

async function mountPage(): Promise<VueWrapper> {
  const wrapper = mount(TagFamilyPage, {
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return wrapper
}

/** The `to` of the link carrying this test id. */
function linkTo(wrapper: VueWrapper, testId: string): unknown {
  return wrapper
    .findAllComponents(RouterLinkStub)
    .find(s => s.attributes('data-testid') === testId)
    ?.props('to')
}

describe('TagFamilyPage', () => {
  beforeEach(() => {
    vi.mocked(api.getTagFamilyAnalysis).mockReset()
    vi.mocked(api.getTagFamilyAnalysis).mockResolvedValue(analysis)
  })

  it('reads the whole family in event basis first', async () => {
    const wrapper = await mountPage()

    expect(api.getTagFamilyAnalysis).toHaveBeenCalledWith('fam-1', {
      year: null,
      basis: 'event',
    })
    expect(wrapper.get('[data-testid="family-name"]').text()).toBe('HYROX')
    expect(norm(wrapper.get('[data-testid="family-total"]').text())).toBe(
      '520,00 €'
    )
    expect(norm(wrapper.get('[data-testid="family-surplus"]').text())).toBe(
      '470,00 €'
    )
    // No envelope on the family: nothing said about one.
    expect(wrapper.find('[data-testid="family-envelope"]').exists()).toBe(false)
  })

  it('lists each edition with its period, days, spending and surplus', async () => {
    const wrapper = await mountPage()

    const row = wrapper.get('[data-testid="family-edition-lyon"]')
    const cells = row.findAll('td').map(td => norm(td.text()))
    expect(row.get('[data-testid="tag-status-badge"]').text()).toBe('Passé')
    expect(cells.slice(0, 6)).toEqual([
      'HYROX Lyon 2026Passé',
      '14 mars 2026 – 15 mars 2026',
      '2',
      '300,00 €',
      '150,00 €',
      '+280,00 €',
    ])
    expect(linkTo(wrapper, 'family-edition-link-lyon')).toEqual({
      name: 'tag-analysis',
      params: { id: 'lyon' },
    })
    expect(linkTo(wrapper, 'family-edition-transactions-lyon')).toEqual(
      transactionsLink({
        tagId: 'lyon',
        gross: true,
        label: 'HYROX Lyon 2026',
      })
    )
    // A one-day edition reads as one date.
    expect(
      norm(wrapper.get('[data-testid="family-edition-nice"]').text())
    ).toContain('4 oct. 2025')
  })

  it('weighs the editions against each other', async () => {
    const wrapper = await mountPage()

    const block = wrapper.get('[data-testid="family-comparison"]')
    const terms = block.findAll('dt').map(dt => norm(dt.text()))
    const values = block.findAll('dd').map(dd => norm(dd.text()))
    expect(terms.map((term, i) => [term, values[i]])).toEqual([
      ['Moyenne par édition', '260,00 €'],
      ['Médiane', '260,00 €'],
      ['Par jour d’événement', '173,33 €'],
      ['Éditions', '2'],
      ['La plus chère', 'HYROX Lyon 2026 · 300,00 €'],
      ['La moins chère', 'HYROX Nice 2025 · 220,00 €'],
    ])
  })

  it('says nothing of a comparison when there is no edition', async () => {
    vi.mocked(api.getTagFamilyAnalysis).mockResolvedValue({
      ...analysis,
      tags: [],
      comparison: null,
    })
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="family-comparison"]').exists()).toBe(
      false
    )
    expect(wrapper.find('[data-testid="family-empty"]').exists()).toBe(true)
  })

  it('reads a year again from the server, then the other basis', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="family-year-2026"]').trigger('click')
    await flushPromises()
    expect(api.getTagFamilyAnalysis).toHaveBeenLastCalledWith('fam-1', {
      year: 2026,
      basis: 'event',
    })

    await wrapper.get('[data-testid="family-basis-cash"]').trigger('click')
    await flushPromises()
    expect(api.getTagFamilyAnalysis).toHaveBeenLastCalledWith('fam-1', {
      year: 2026,
      basis: 'cash',
    })

    await wrapper.get('[data-testid="family-year-all"]').trigger('click')
    await flushPromises()
    expect(api.getTagFamilyAnalysis).toHaveBeenLastCalledWith('fam-1', {
      year: null,
      basis: 'cash',
    })
  })

  it('opens a year from its row in the yearly breakdown', async () => {
    const wrapper = await mountPage()

    await wrapper.get('[data-testid="family-year-row-2025"]').trigger('click')
    await flushPromises()

    expect(api.getTagFamilyAnalysis).toHaveBeenLastCalledWith('fam-1', {
      year: 2025,
      basis: 'event',
    })
  })

  it('links the family’s transactions of the year, saying the list reads payments', async () => {
    const wrapper = await mountPage()

    expect(linkTo(wrapper, 'family-transactions-link')).toEqual(
      transactionsLink({ tagFamilyId: 'fam-1', gross: true, label: 'HYROX' })
    )
    expect(
      wrapper.find('[data-testid="family-transactions-cash-note"]').exists()
    ).toBe(false)

    await wrapper.get('[data-testid="family-year-2026"]').trigger('click')
    await flushPromises()

    expect(linkTo(wrapper, 'family-transactions-link')).toEqual(
      transactionsLink({
        tagFamilyId: 'fam-1',
        from: '2026-01-01',
        to: '2026-12-31',
        gross: true,
        label: 'HYROX · 2026',
      })
    )
    // In event basis the list cannot follow: it says so rather than hiding.
    expect(
      wrapper.find('[data-testid="family-transactions-cash-note"]').exists()
    ).toBe(true)

    await wrapper.get('[data-testid="family-basis-cash"]').trigger('click')
    await flushPromises()
    expect(
      wrapper.find('[data-testid="family-transactions-cash-note"]').exists()
    ).toBe(false)
  })

  it('weighs the year’s spending against the annual envelope', async () => {
    vi.mocked(api.getTagFamilyAnalysis).mockResolvedValue({
      ...analysis,
      family: { ...analysis.family, annualBudget: 1000 },
    })
    const wrapper = await mountPage()

    const envelope = (): string =>
      norm(wrapper.get('[data-testid="family-envelope"]').text())
    expect(envelope()).toContain('Enveloppe annuelle 1 000,00 €')
    expect(envelope()).toContain('Choisissez une année')

    vi.mocked(api.getTagFamilyAnalysis).mockResolvedValue({
      ...analysis,
      family: { ...analysis.family, annualBudget: 1000 },
      year: 2026,
      totalExpenses: 300,
    })
    await wrapper.get('[data-testid="family-year-2026"]').trigger('click')
    await flushPromises()

    expect(envelope()).toContain('2026 : 300,00 € dépensés · reste 700,00 €')
  })

  it('offers a retry when the analysis fails to load', async () => {
    vi.mocked(api.getTagFamilyAnalysis)
      .mockRejectedValueOnce(new Error('Impossible'))
      .mockResolvedValueOnce(analysis)
    const wrapper = await mountPage()

    expect(wrapper.find('[data-testid="family-analysis-error"]').exists()).toBe(
      true
    )
    await wrapper.get('[data-testid="family-analysis-retry"]').trigger('click')
    await flushPromises()

    expect(wrapper.get('[data-testid="family-name"]').text()).toBe('HYROX')
  })
})

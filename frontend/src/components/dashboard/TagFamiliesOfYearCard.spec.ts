import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TagFamiliesOfYearCard from './TagFamiliesOfYearCard.vue'
import YearColumnsChart from '@/components/charts/YearColumnsChart.vue'
import type { TagFamilyOfYearDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const travel: TagFamilyOfYearDto = {
  id: 'fam-travel',
  name: 'Voyages',
  color: '#22c55e',
  icon: null,
  year: 2026,
  spent: 1250.5,
  // 2025 spent nothing: the chart draws it at 0.
  spentByYear: [
    { year: 2023, spent: 900 },
    { year: 2024, spent: 1100 },
    { year: 2026, spent: 1250.5 },
  ],
  annualBudget: 1000,
  remaining: -250.5,
  transactionCount: 5,
  tagCount: 2,
}

const hyrox: TagFamilyOfYearDto = {
  id: 'fam-hyrox',
  name: 'HYROX',
  color: null,
  icon: null,
  year: 2026,
  spent: 600,
  spentByYear: [{ year: 2026, spent: 600 }],
  annualBudget: 1500,
  remaining: 900,
  transactionCount: 3,
  tagCount: 1,
}

const concerts: TagFamilyOfYearDto = {
  id: 'fam-concerts',
  name: 'Concerts',
  color: null,
  icon: null,
  year: 2026,
  spent: 45,
  // Every year since 2018: only the six most recent are drawn.
  spentByYear: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map(
    year => ({ year, spent: year === 2026 ? 45 : 30 })
  ),
  annualBudget: null,
  remaining: null,
  transactionCount: 1,
  tagCount: 1,
}

async function mountCard(
  families: TagFamilyOfYearDto[] = [travel, hyrox, concerts],
  realExpenses: number | null = 10000,
  exceptionalExpenses: number | null = 2500
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/dashboard')
  const wrapper = mount(TagFamiliesOfYearCard, {
    props: { families, realExpenses, exceptionalExpenses },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

const text = (s: string) => s.replace(/\s+/g, ' ').trim()

const widthOf = (el: { attributes: (n: string) => string | undefined }) =>
  parseFloat(/width:\s*([\d.]+)%/.exec(el.attributes('style') ?? '')?.[1] ?? '')

describe('TagFamiliesOfYearCard', () => {
  it('titles the card with the year and lists one line per family, in order', async () => {
    const wrapper = await mountCard()

    expect(wrapper.find('h2').text()).toBe("Épisodes de l'année 2026")
    expect(
      wrapper.findAll('li').map(li => li.attributes('data-testid'))
    ).toEqual([
      'family-of-year-fam-travel',
      'family-of-year-fam-hyrox',
      'family-of-year-fam-concerts',
    ])
  })

  it('says the families’ total, their share of the exceptional and of the real', async () => {
    const wrapper = await mountCard()

    // 1 895,50 over 2 500 and over 10 000.
    expect(
      text(wrapper.get('[data-testid="families-of-year-header"]').text())
    ).toMatch(
      /^1\s895,50\s€ d'épisodes cette année · 76 % de l'exceptionnel de l'année \(2\s500,00\s€\) · 19 % du réel$/
    )
  })

  it('draws one slice per family over the exceptional, the rest as its complement', async () => {
    const wrapper = await mountCard()

    const stack = wrapper.get('[data-testid="families-of-year-stack"]')
    expect(stack.attributes('role')).toBe('img')
    expect(stack.attributes('aria-label')).toBe(
      "Voyages 50 %, HYROX 24 %, Concerts 2 % des dépenses exceptionnelles de l'année, 24 % sans famille"
    )

    const slice = wrapper.get(
      '[data-testid="families-of-year-stack-slice-fam-travel"]'
    )
    expect(widthOf(slice)).toBeCloseTo((1250.5 / 2500) * 100)
    expect(slice.attributes('style')).toContain('min-width: 3px')
    expect(text(slice.attributes('title') ?? '')).toMatch(
      /^Voyages : 1\s250,50\s€, 50 % de l'exceptionnel$/
    )
    // A family without a color reads gray.
    expect(
      wrapper
        .get('[data-testid="families-of-year-stack-slice-fam-hyrox"]')
        .attributes('style')
    ).toContain('background-color: #9ca3af')

    // 2 500 − 1 895,50.
    expect(
      text(
        wrapper
          .get('[data-testid="families-of-year-stack-rest"]')
          .attributes('title') ?? ''
      )
    ).toMatch(/^Sans famille : 604,50\s€$/)
    expect(text(wrapper.text())).toMatch(
      /Le gris : 604,50\s€ d'exceptionnel sans famille\./
    )
  })

  it('bounds a slice at the whole bar and drops the rest when nothing is left', async () => {
    const wrapper = await mountCard([travel], 10000, 1000)

    expect(
      widthOf(
        wrapper.get('[data-testid="families-of-year-stack-slice-fam-travel"]')
      )
    ).toBe(100)
    expect(
      wrapper.find('[data-testid="families-of-year-stack-rest"]').exists()
    ).toBe(false)
    expect(wrapper.text()).not.toContain('Le gris')
  })

  it('draws neither bar nor share without exceptional expenses', async () => {
    const wrapper = await mountCard([hyrox], 10000, null)

    expect(
      wrapper.find('[data-testid="families-of-year-stack"]').exists()
    ).toBe(false)
    const header = text(
      wrapper.get('[data-testid="families-of-year-header"]').text()
    )
    expect(header).not.toContain("l'exceptionnel")
    expect(header).toContain('6 % du réel')
    expect(
      wrapper.get('[data-testid="family-of-year-details-fam-hyrox"]').text()
    ).not.toContain("l'exceptionnel")
  })

  it('leaves the real share out when there is nothing to divide by', async () => {
    const wrapper = await mountCard([hyrox], null)

    expect(
      wrapper.get('[data-testid="families-of-year-header"]').text()
    ).not.toContain('du réel')
  })

  it('reads a first year, its share and an envelope with its remainder', async () => {
    const wrapper = await mountCard()

    expect(
      text(
        wrapper.get('[data-testid="family-of-year-details-fam-hyrox"]').text()
      )
    ).toMatch(
      /^24 % de l'exceptionnel · 1 étiquette · 3 transactions · première année · reste 900,00\s€ sur 1\s500\s€ par an$/
    )
    expect(
      wrapper.get('[data-testid="family-of-year-spent-fam-hyrox"]').classes()
    ).toContain('text-gray-900')
  })

  it('averages the past years that spent, and says nothing of an envelope it lacks', async () => {
    const wrapper = await mountCard()

    // Eight past years at 30 €; below one percent said so.
    const details = text(
      wrapper.get('[data-testid="family-of-year-details-fam-concerts"]').text()
    )
    expect(details).toMatch(
      /^2 % de l'exceptionnel · 1 étiquette · 1 transaction · 30\s€ par an jusqu'ici$/
    )
    expect(details).not.toContain('reste')
  })

  it('keeps the figure in ink on an overrun and says it in words, in amber', async () => {
    const wrapper = await mountCard()

    const spent = wrapper.get('[data-testid="family-of-year-spent-fam-travel"]')
    expect(spent.classes()).toContain('text-gray-900')
    expect(wrapper.html()).not.toMatch(/text-red-/)
    const details = wrapper.get(
      '[data-testid="family-of-year-details-fam-travel"]'
    )
    // 900 and 1 100: 2025 spent nothing and does not count.
    expect(text(details.text())).toMatch(
      /^50 % de l'exceptionnel · 2 étiquettes · 5 transactions · 1\s000\s€ par an jusqu'ici · dépassement de 250,50\s€ sur 1\s000\s€ par an$/
    )
    expect(details.get('.text-amber-700').text()).toMatch(
      /dépassement de 250,50/
    )
    expect(details.text()).not.toContain('reste')
  })

  it('hands the chart continuous years, a gap at 0, and the envelope', async () => {
    const wrapper = await mountCard()

    const chart = wrapper
      .get('[data-testid="family-of-year-years-fam-travel"]')
      .findComponent(YearColumnsChart)
    expect(chart.props()).toMatchObject({
      years: [
        { year: 2023, amount: 900 },
        { year: 2024, amount: 1100 },
        { year: 2025, amount: 0 },
        { year: 2026, amount: 1250.5 },
      ],
      currentYear: 2026,
      color: '#22c55e',
      envelope: 1000,
    })
    expect(text(chart.props('label'))).toMatch(
      /^Voyages : 2023 900,00\s€, 2024 1\s100,00\s€, 2026 1\s250,50\s€, enveloppe 1\s000\s€ par an$/
    )
  })

  it('draws six years at most, the most recent, and no envelope without one', async () => {
    const wrapper = await mountCard()

    const chart = wrapper
      .get('[data-testid="family-of-year-years-fam-concerts"]')
      .findComponent(YearColumnsChart)
    expect(
      (chart.props('years') as { year: number }[]).map(y => y.year)
    ).toEqual([2021, 2022, 2023, 2024, 2025, 2026])
    expect(chart.props('envelope')).toBeUndefined()
    expect(chart.props('color')).toBe('#9ca3af')
  })

  it('no longer draws a bar per family', async () => {
    const wrapper = await mountCard()

    expect(wrapper.find('[data-testid^="family-of-year-bar-"]').exists()).toBe(
      false
    )
  })

  it('links the name to the family page and the arrow to its rows of the year', async () => {
    const wrapper = await mountCard()

    expect(
      wrapper
        .get('[data-testid="family-of-year-link-fam-travel"]')
        .attributes('href')
    ).toBe('/tags/families/fam-travel')

    const rows = wrapper.get(
      '[data-testid="family-of-year-transactions-link-fam-travel"]'
    )
    const href = new URL(rows.attributes('href') ?? '', 'http://x')
    expect(href.pathname).toBe('/transactions')
    expect(Object.fromEntries(href.searchParams)).toEqual({
      family: 'fam-travel',
      from: '2026-01-01',
      to: '2026-12-31',
      label: 'Voyages · 2026',
      gross: '1',
    })
    expect(rows.attributes('aria-label')).toBe(
      'Voir les transactions de la famille Voyages en 2026'
    )
  })
})

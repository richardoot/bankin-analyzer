import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount, flushPromises } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import TagFamiliesOfYearCard from './TagFamiliesOfYearCard.vue'
import type { TagFamilyOfYearDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const travel: TagFamilyOfYearDto = {
  id: 'fam-travel',
  name: 'Voyages',
  color: '#22c55e',
  icon: null,
  year: 2026,
  spent: 1250.5,
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
  annualBudget: null,
  remaining: null,
  transactionCount: 1,
  tagCount: 1,
}

async function mountCard(
  families: TagFamilyOfYearDto[] = [travel, hyrox, concerts],
  realExpenses: number | null = 10000
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
  await router.push('/dashboard')
  const wrapper = mount(TagFamiliesOfYearCard, {
    props: { families, realExpenses },
    global: { plugins: [router] },
  })
  await flushPromises()
  return wrapper
}

const text = (s: string) => s.replace(/\s+/g, ' ')

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

  it('names each family’s share of the year’s real expenses', async () => {
    const wrapper = await mountCard()

    const details = ['fam-travel', 'fam-hyrox', 'fam-concerts'].map(id =>
      text(wrapper.get(`[data-testid="family-of-year-details-${id}"]`).text())
    )
    // 1 250,50 / 10 000, 600 / 10 000, and below one percent said so.
    expect(details.map(d => d.split(' du réel')[0])).toEqual([
      '13 %',
      '6 %',
      '< 1 %',
    ])
  })

  it('leaves the share out when there is nothing to divide by', async () => {
    const wrapper = await mountCard([hyrox], null)

    expect(
      wrapper.get('[data-testid="family-of-year-details-fam-hyrox"]').text()
    ).not.toContain('du réel')
  })

  it('reads an envelope and its remainder, and says nothing of one it lacks', async () => {
    const wrapper = await mountCard()

    const hyroxDetails = text(
      wrapper.get('[data-testid="family-of-year-details-fam-hyrox"]').text()
    )
    expect(hyroxDetails).toMatch(/sur 1\s500\s€ par an/)
    expect(hyroxDetails).toMatch(/reste 900,00\s€/)
    expect(
      wrapper.get('[data-testid="family-of-year-spent-fam-hyrox"]').classes()
    ).not.toContain('text-red-600')

    const concertDetails = wrapper
      .get('[data-testid="family-of-year-details-fam-concerts"]')
      .text()
    expect(concertDetails).not.toContain('par an')
    expect(concertDetails).not.toContain('reste')
  })

  it('turns red on an overrun and says it in words', async () => {
    const wrapper = await mountCard()

    expect(
      wrapper.get('[data-testid="family-of-year-spent-fam-travel"]').classes()
    ).toContain('text-red-600')
    const details = text(
      wrapper.get('[data-testid="family-of-year-details-fam-travel"]').text()
    )
    expect(details).toMatch(/dépassement de 250,50\s€/)
    expect(details).not.toContain('reste')
    // The bar is decoration: the figures are in the text.
    const bar = wrapper.get('[data-testid="family-of-year-bar-fam-travel"]')
    expect(bar.attributes('aria-hidden')).toBe('true')
    expect(bar.find('.bg-red-500').exists()).toBe(true)
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

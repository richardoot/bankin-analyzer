import { describe, it, expect, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import EventsPanel from './EventsPanel.vue'
import type { ExceptionalCategoryDto, ExceptionalEventDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }],
})

const EVENTS: ExceptionalEventDto[] = [
  {
    id: 'tag-japon',
    name: 'Japon',
    color: '#ef4444',
    icon: null,
    familyId: 'fam-voyages',
    familyName: 'Voyages',
    familyColor: '#3b82f6',
    amount: 2400,
  },
  {
    id: 'tag-mariage',
    name: 'Mariage',
    color: '#10b981',
    icon: null,
    familyId: null,
    familyName: null,
    familyColor: null,
    amount: 427,
  },
]

const category = (name: string, amount: number): ExceptionalCategoryDto => ({
  categoryId: `cat-${name}`,
  category: name,
  icon: null,
  amount,
})

function mountPanel(
  overrides: Partial<InstanceType<typeof EventsPanel>['$props']> = {}
) {
  return mount(EventsPanel, {
    props: {
      events: EVENTS,
      byCategory: [category('Transport', 1500), category('Logement', 1327)],
      window: { from: '2025-11-01', to: '2026-10-31' },
      ...overrides,
    },
    global: { plugins: [router] },
  })
}

/** Normalises the narrow no-break spaces the formatters write. */
const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ').trim()

describe('EventsPanel', () => {
  it('lists each event with its family, its cost, its analysis and its transactions', () => {
    const wrapper = mountPanel()

    const row = wrapper.get('[data-testid="events-panel-row-tag-japon"]')
    expect(norm(row.text())).toContain('Japon')
    expect(norm(row.text())).toContain('2 400 €')
    expect(
      norm(row.get('[data-testid="events-panel-family-tag-japon"]').text())
    ).toBe('Voyages')
    expect(
      row
        .get('[data-testid="events-panel-analysis-tag-japon"]')
        .attributes('href')
    ).toBe('/tags/tag-japon')
    const href =
      row
        .get('[data-testid="events-panel-link-tag-japon"]')
        .attributes('href') ?? ''
    expect(href).toContain('tag=tag-japon')
    expect(href).toContain('from=2025-11-01')
    expect(href).toContain('gross=1')
  })

  it("dots each event in its family's color, the tag's own without a family", () => {
    const wrapper = mountPanel()

    expect(
      wrapper
        .get('[data-testid="events-panel-dot-tag-japon"]')
        .attributes('style')
    ).toContain('background-color: #3b82f6')
    expect(
      wrapper
        .get('[data-testid="events-panel-dot-tag-mariage"]')
        .attributes('style')
    ).toContain('background-color: #10b981')
    expect(
      norm(
        wrapper.get('[data-testid="events-panel-family-tag-mariage"]').text()
      )
    ).toBe('—')
  })

  it('opens every exceptional expense of the period from its head', () => {
    const wrapper = mountPanel()

    const link = wrapper.get('[data-testid="events-panel-all-link"]')
    expect(norm(link.text())).toContain(
      'Toutes les transactions exceptionnelles'
    )
    const href = link.attributes('href') ?? ''
    expect(href).toContain('exceptional=only')
    expect(href).toContain('type=EXPENSE')
    expect(href).toContain('to=2026-10-31')
  })

  it('says where the money went by category, and the way to the whole year', () => {
    const wrapper = mountPanel()

    expect(
      norm(wrapper.get('[data-testid="events-panel-by-category"]').text())
    ).toBe('Par catégorie : Transport 1 500 €, Logement 1 327 €')
    expect(
      wrapper.get('[data-testid="events-panel-year-link"]').attributes('href')
    ).toBe('/tags')
  })

  it('names five categories, then how many more', () => {
    const wrapper = mountPanel({
      byCategory: ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map((n, i) =>
        category(n, 700 - i * 100)
      ),
    })

    expect(
      norm(wrapper.get('[data-testid="events-panel-by-category"]').text())
    ).toBe(
      'Par catégorie : A 700 €, B 600 €, C 500 €, D 400 €, E 300 € et 2 autres'
    )
  })

  it('leaves the categories out when there are none', () => {
    const wrapper = mountPanel({ byCategory: [] })

    expect(
      wrapper.find('[data-testid="events-panel-by-category"]').exists()
    ).toBe(false)
    expect(
      wrapper.find('[data-testid="events-panel-year-link"]').exists()
    ).toBe(true)
  })

  it('asks to be folded on Échap', async () => {
    const wrapper = mountPanel()

    await wrapper
      .get('[data-testid="events-panel"]')
      .trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

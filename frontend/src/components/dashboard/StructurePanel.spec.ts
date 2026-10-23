import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import StructurePanel from './StructurePanel.vue'
import type { StructureCategoryDto } from '@/lib/api'

enableAutoUnmount(afterEach)

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:any(.*)*', component: { template: '<div />' } }],
})

const row = (
  name: string,
  amount: number,
  averagePerMonth: number
): StructureCategoryDto => ({
  categoryId: `cat-${name}`,
  category: name,
  icon: null,
  amount,
  averagePerMonth,
})

/** Twelve months, November 2025 to October 2026, the current one last. */
const MONTHS = [
  '2025-11',
  '2025-12',
  '2026-01',
  '2026-02',
  '2026-03',
  '2026-04',
  '2026-05',
  '2026-06',
  '2026-07',
  '2026-08',
  '2026-09',
  '2026-10',
]

const EVERYDAY = [
  row('Restaurants', 2200, 200),
  row('Loisirs', 1100, 100),
  row('Shopping', 550, 50),
]
const REAL = [
  row('Voyages', 3300, 300),
  row('Restaurants', 2200, 200),
  row('Loisirs', 1100, 100),
  row('Shopping', 550, 50),
]

function mountPanel(
  overrides: Partial<InstanceType<typeof StructurePanel>['$props']> = {}
) {
  return mount(StructurePanel, {
    props: {
      segment: 'pleasure',
      label: 'Plaisir',
      filter: { nature: 'PLEASURE' },
      reading: 'everyday',
      everydayCategories: EVERYDAY,
      realCategories: REAL,
      share: [40, 38, 36, 38, 41, 37, 38, 38, 35, 40, 31, 20],
      monthLabels: MONTHS,
      window: { from: '2025-11-01', to: '2026-10-31' },
      ...overrides,
    },
    global: { plugins: [router] },
  })
}

/** Normalises the narrow no-break spaces the formatters write. */
const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ').trim()

describe('StructurePanel', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-23T10:00:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('says the segment in both readings, and links to all its transactions', () => {
    const wrapper = mountPanel()

    expect(
      norm(
        wrapper.get('[data-testid="structure-panel-header-pleasure"]').text()
      )
    ).toBe(
      'Plaisir · 350 € par mois en vie courante · 3 850 € sur 12 mois · 650 € par mois tout compris, événements inclus'
    )
    const link = wrapper.get('[data-testid="structure-panel-link-pleasure"]')
    expect(norm(link.text())).toContain('Toutes les transactions Plaisir')
    const href = link.attributes('href') ?? ''
    expect(href).toContain('nature=PLEASURE')
    expect(href).toContain('from=2025-11-01')
    expect(href).toContain('gross=1')
    expect(href).not.toContain('exceptional')
  })

  it('lists the categories of the reading, each with its part of the segment, its average and its link', () => {
    const wrapper = mountPanel()

    const rows = wrapper.findAll('[data-testid^="structure-panel-row-"]')
    expect(rows.map(r => r.attributes('data-testid'))).toEqual([
      'structure-panel-row-cat-Restaurants',
      'structure-panel-row-cat-Loisirs',
      'structure-panel-row-cat-Shopping',
    ])
    const first = rows[0]
    expect(norm(first?.text() ?? '')).toContain('Restaurants')
    expect(norm(first?.text() ?? '')).toContain('57 %')
    expect(
      norm(
        wrapper
          .get('[data-testid="structure-panel-average-cat-Restaurants"]')
          .text()
      )
    ).toBe('200 €/mois')
    expect(
      wrapper
        .get('[data-testid="structure-panel-fill-cat-Restaurants"]')
        .classes()
    ).toContain('bg-blue-400')
    const href =
      wrapper
        .get('[data-testid="structure-panel-link-cat-Restaurants"]')
        .attributes('href') ?? ''
    expect(href).toContain('category=cat-Restaurants')
    expect(href).toContain('nature=PLEASURE')
    expect(href).toContain('exceptional=exclude')
  })

  it('follows « Tout »: the events back in the composition', () => {
    const wrapper = mountPanel({ reading: 'real' })

    expect(
      wrapper.find('[data-testid="structure-panel-row-cat-Voyages"]').exists()
    ).toBe(true)
    expect(
      wrapper
        .get('[data-testid="structure-panel-link-cat-Voyages"]')
        .attributes('href')
    ).not.toContain('exceptional')
  })

  it('reads the last closed month against the habit, drawn dashed', () => {
    const wrapper = mountPanel()

    const share = wrapper.get('[data-testid="structure-panel-share-pleasure"]')
    // September against the median of March to August; October is not closed.
    expect(
      norm(
        share
          .get('[data-testid="structure-panel-share-sentence-pleasure"]')
          .text()
      )
    ).toBe("31 % en septembre, contre 38 % d'habitude")
    expect(
      share
        .find('[data-testid="structure-panel-share-habit-pleasure"]')
        .exists()
    ).toBe(true)
    const svg = share.get('svg')
    expect(svg.attributes('width')).toBe('320')
    expect(svg.attributes('height')).toBe('110')
    expect(norm(svg.attributes('aria-label') ?? '')).toContain('septembre 31 %')
    // The axis in tens around the points and the habit.
    expect(norm(svg.text())).toContain('50 %')
    expect(norm(svg.text())).toContain('30 %')
  })

  it('says the month alone when the period is too short for a habit', () => {
    const wrapper = mountPanel({
      share: [36, 31, 20],
      monthLabels: ['2026-08', '2026-09', '2026-10'],
    })

    expect(
      norm(
        wrapper
          .get('[data-testid="structure-panel-share-sentence-pleasure"]')
          .text()
      )
    ).toBe('31 % en septembre')
    expect(
      wrapper
        .find('[data-testid="structure-panel-share-habit-pleasure"]')
        .exists()
    ).toBe(false)
  })

  it('shows the composition alone without a share to draw', () => {
    const wrapper = mountPanel({ share: null })

    expect(
      wrapper.find('[data-testid="structure-panel-share-pleasure"]').exists()
    ).toBe(false)
    expect(
      wrapper.findAll('[data-testid^="structure-panel-row-"]')
    ).toHaveLength(3)
  })

  it('says so when the segment holds nothing', () => {
    const wrapper = mountPanel({ everydayCategories: [], realCategories: [] })

    expect(
      norm(wrapper.get('[data-testid="structure-panel-empty-pleasure"]').text())
    ).toBe('Aucune dépense Plaisir sur la période.')
  })

  it('asks to be folded on Échap', async () => {
    const wrapper = mountPanel()

    await wrapper
      .get('[data-testid="structure-panel-pleasure"]')
      .trigger('keydown', { key: 'Escape' })

    expect(wrapper.emitted('close')).toHaveLength(1)
  })
})

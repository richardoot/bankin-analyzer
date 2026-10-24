import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import StructureLines from './StructureLines.vue'
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
  pleasure: 250,
  unknownNature: 0,
  committed: 750,
  variable: 500,
  unknownRhythm: 0,
  recurring: 300,
  total: 1250,
}

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/transactions', component: { template: '<div />' } },
      { path: '/recurrences', component: { template: '<div />' } },
    ],
  })
}

function mountLines(
  overrides: Partial<InstanceType<typeof StructureLines>['$props']> = {},
  router = makeRouter()
) {
  return mount(StructureLines, {
    props: {
      actual,
      everyday,
      reading: 'everyday',
      periodMonths: 3,
      window: { from: '2026-01-01', to: '2026-03-31' },
      ...overrides,
    },
    global: { plugins: [router] },
  })
}

/** Normalises the narrow no-break spaces the formatters write. */
const norm = (text: string) => text.replace(/[\s\u202f\u00a0]+/g, ' ').trim()

/** A label as it reads: its name, then its share. */
function side(wrapper: ReturnType<typeof mountLines>, key: string): string {
  return norm(
    wrapper
      .get(`[data-testid="structure-toggle-${key}"]`)
      .findAll('span')
      .map(s => s.text())
      .join(' ')
  )
}

describe('StructureLines', () => {
  it('reads the two lines as two shares of one whole, in the reading', () => {
    const wrapper = mountLines()

    expect(side(wrapper, 'essential')).toBe('Essentiel 80 %')
    expect(side(wrapper, 'pleasure')).toBe('Plaisir 20 %')
    expect(
      wrapper.get('[data-testid="structure-fill-nature"]').attributes('style')
    ).toContain('width: 80%')
    expect(
      norm(
        wrapper
          .get('[data-testid="structure-track-nature"]')
          .attributes('aria-label') ?? ''
      )
    ).toBe('Essentiel 80 %, Plaisir 20 %')

    expect(side(wrapper, 'committed')).toBe('Engagé 60 %')
    expect(side(wrapper, 'variable')).toBe('Variable 40 %')
  })

  it('follows « Tout »: the events back in', () => {
    const wrapper = mountLines({ reading: 'real' })

    expect(side(wrapper, 'essential')).toBe('Essentiel 67 %')
    expect(side(wrapper, 'pleasure')).toBe('Plaisir 33 %')
  })

  it('draws both fills in the one data hue', () => {
    const wrapper = mountLines()
    for (const key of ['nature', 'rhythm']) {
      expect(
        wrapper.get(`[data-testid="structure-fill-${key}"]`).classes()
      ).toContain('bg-blue-400')
    }
  })

  it('puts both labels on one line and the bar under them on a phone', () => {
    const wrapper = mountLines()
    for (const key of ['nature', 'rhythm']) {
      const line = wrapper.get(`[data-testid="structure-line-${key}"]`)
      expect(line.classes()).toEqual(
        expect.arrayContaining([
          'grid-cols-2',
          'sm:grid-cols-[150px_minmax(0,1fr)_150px]',
        ])
      )
      expect(
        wrapper.get(`[data-testid="structure-track-${key}"]`).classes()
      ).toEqual(
        expect.arrayContaining(['col-span-2', 'row-start-2', 'sm:col-start-2'])
      )
    }
  })

  it('says the committed spending per month, its recurring part, and links to the list', () => {
    const wrapper = mountLines()

    const note = wrapper.get('[data-testid="committed-note"]')
    // 750 € over 3 months, 300 € of it recurring.
    expect(norm(note.text())).toContain('Engagé : 250 € par mois')
    expect(norm(note.text())).toContain(
      "dont 100 € d'abonnements et charges récurrentes"
    )
    expect(
      wrapper.get('[data-testid="recurring-link"]').attributes('href')
    ).toBe('/recurrences')
  })

  it('leaves the recurring part out when there is none', () => {
    const wrapper = mountLines({ everyday: { ...everyday, recurring: 0 } })
    expect(wrapper.get('[data-testid="committed-note"]').text()).not.toContain(
      'abonnements'
    )
  })

  it('links each side to its expenses, the events left out in « Vie courante »', () => {
    const wrapper = mountLines()

    const href = wrapper
      .get('[data-testid="structure-link-nature-pleasure"]')
      .attributes('href')
    expect(href).toContain('nature=PLEASURE')
    expect(href).toContain('exceptional=exclude')
    expect(href).toContain('from=2026-01-01')
    expect(href).toContain('gross=1')
    expect(
      wrapper
        .get('[data-testid="structure-link-rhythm-committed"]')
        .attributes('href')
    ).toContain('rhythm=COMMITTED')
    for (const id of [
      'structure-link-nature-essential',
      'structure-link-rhythm-variable',
    ]) {
      expect(wrapper.find(`[data-testid="${id}"]`).exists(), id).toBe(true)
    }

    const real = mountLines({ reading: 'real' })
    expect(
      real
        .get('[data-testid="structure-link-nature-pleasure"]')
        .attributes('href')
    ).not.toContain('exceptional')
  })

  describe('unfolding a segment', () => {
    const row = (categoryId: string, amount: number) => ({
      categoryId,
      category: categoryId,
      icon: null,
      amount,
      averagePerMonth: amount / 3,
    })
    const segments = (rows: ReturnType<typeof row>[]) => ({
      essential: rows,
      pleasure: rows,
      committed: rows,
      variable: rows,
    })
    const breakdown = {
      everyday: segments([row('Restaurants', 150), row('Loisirs', 100)]),
      real: segments([row('Voyages', 250), row('Restaurants', 150)]),
    }
    const series = [null, 30, 40] as (number | null)[]
    const shareByMonth = {
      everyday: {
        essential: series,
        pleasure: series,
        committed: series,
        variable: series,
      },
      real: {
        essential: series,
        pleasure: series,
        committed: series,
        variable: series,
      },
    }
    const unfolded = (
      overrides: Partial<InstanceType<typeof StructureLines>['$props']> = {},
      router = makeRouter()
    ) =>
      mountLines(
        {
          breakdown,
          shareByMonth,
          monthLabels: ['2026-01', '2026-02', '2026-03'],
          ...overrides,
        },
        router
      )
    const toggle = (wrapper: ReturnType<typeof mountLines>, key: string) =>
      wrapper.get(`[data-testid="structure-toggle-${key}"]`)

    it('keeps every panel folded on load, each label controlling its line', () => {
      const wrapper = unfolded()

      const buttons = wrapper.findAll('button[aria-expanded]')
      expect(buttons).toHaveLength(4)
      for (const button of buttons) {
        expect(button.attributes('aria-expanded')).toBe('false')
      }
      expect(wrapper.find('[data-testid^="structure-panel-"]').exists()).toBe(
        false
      )
      // The region a label controls is there, empty, folded or not.
      const controls = toggle(wrapper, 'pleasure').attributes('aria-controls')
      expect(controls).toBe('structure-panel-region-nature')
      expect(
        wrapper.get('[data-testid="structure-region-nature"]').attributes('id')
      ).toBe(controls)
      expect(toggle(wrapper, 'committed').attributes('aria-controls')).toBe(
        'structure-panel-region-rhythm'
      )
    })

    it('opens the segment under its own line, in place, without leaving the page', async () => {
      const router = makeRouter()
      const push = vi.spyOn(router, 'push')
      const wrapper = unfolded({}, router)

      await toggle(wrapper, 'pleasure').trigger('click')

      expect(push).not.toHaveBeenCalled()
      expect(toggle(wrapper, 'pleasure').attributes('aria-expanded')).toBe(
        'true'
      )
      const region = wrapper.get('[data-testid="structure-region-nature"]')
      const panel = region.get('[data-testid="structure-panel-pleasure"]')
      expect(
        panel.find('[data-testid="structure-panel-row-Restaurants"]').exists()
      ).toBe(true)
      expect(
        wrapper
          .get('[data-testid="structure-region-rhythm"]')
          .find('[data-testid^="structure-panel-"]')
          .exists()
      ).toBe(false)
    })

    it('opens one panel per line: the other side takes its place, a second press folds it', async () => {
      const wrapper = unfolded()

      await toggle(wrapper, 'pleasure').trigger('click')
      await toggle(wrapper, 'essential').trigger('click')
      expect(
        wrapper.findAll('[data-testid="structure-region-nature"] > *')
      ).toHaveLength(1)
      expect(
        wrapper.find('[data-testid="structure-panel-essential"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="structure-panel-pleasure"]').exists()
      ).toBe(false)
      expect(toggle(wrapper, 'pleasure').attributes('aria-expanded')).toBe(
        'false'
      )
      expect(toggle(wrapper, 'essential').attributes('aria-expanded')).toBe(
        'true'
      )

      // The other line opens on its own, the first stays open.
      await toggle(wrapper, 'variable').trigger('click')
      expect(
        wrapper.find('[data-testid="structure-panel-variable"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="structure-panel-essential"]').exists()
      ).toBe(true)

      await toggle(wrapper, 'essential').trigger('click')
      expect(
        wrapper.find('[data-testid="structure-panel-essential"]').exists()
      ).toBe(false)
      expect(toggle(wrapper, 'essential').attributes('aria-expanded')).toBe(
        'false'
      )
    })

    it('lists the composition of the reading', async () => {
      const wrapper = unfolded({ reading: 'real' })

      await toggle(wrapper, 'pleasure').trigger('click')
      expect(
        wrapper.find('[data-testid="structure-panel-row-Voyages"]').exists()
      ).toBe(true)
      expect(
        wrapper.find('[data-testid="structure-panel-row-Loisirs"]').exists()
      ).toBe(false)
    })

    it('folds on Échap and gives the focus back to the label', async () => {
      const wrapper = mount(StructureLines, {
        props: {
          actual,
          everyday,
          reading: 'everyday',
          periodMonths: 3,
          breakdown,
          shareByMonth,
          monthLabels: ['2026-01', '2026-02', '2026-03'],
        },
        global: { plugins: [makeRouter()] },
        attachTo: document.body,
      })

      await toggle(wrapper, 'pleasure').trigger('click')
      await wrapper
        .get('[data-testid="structure-panel-pleasure"]')
        .trigger('keydown', { key: 'Escape' })
      await nextTick()

      expect(
        wrapper.find('[data-testid="structure-panel-pleasure"]').exists()
      ).toBe(false)
      expect(document.activeElement).toBe(toggle(wrapper, 'pleasure').element)
    })
  })

  it('says what is still to migrate, only when some is', () => {
    expect(mountLines().find('[data-testid="unknown-hint"]').exists()).toBe(
      false
    )

    const wrapper = mountLines({
      everyday: { ...everyday, unknownNature: 300, unknownRhythm: 300 },
    })
    const hint = wrapper.get('[data-testid="unknown-hint"]')
    expect(norm(hint.text())).toContain('« À migrer » : 100 € par mois')
    // Out of the shares: Essentiel and Plaisir still make one whole.
    expect(side(wrapper, 'essential')).toBe('Essentiel 80 %')
  })
})

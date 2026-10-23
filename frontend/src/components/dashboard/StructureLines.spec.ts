import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount, enableAutoUnmount } from '@vue/test-utils'
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

  it('makes each label a folded button that opens its expenses until it unfolds', async () => {
    const router = makeRouter()
    const push = vi.spyOn(router, 'push')
    const wrapper = mountLines({}, router)

    const buttons = wrapper.findAll('button[aria-expanded]')
    expect(buttons).toHaveLength(4)
    for (const button of buttons) {
      expect(button.attributes('aria-expanded')).toBe('false')
    }

    await wrapper
      .get('[data-testid="structure-toggle-variable"]')
      .trigger('click')
    expect(push).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/transactions',
        query: expect.objectContaining({
          type: 'EXPENSE',
          rhythm: 'VARIABLE',
          exceptional: 'exclude',
        }),
      })
    )
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

import { describe, it, expect, afterEach, vi } from 'vitest'
import { ref } from 'vue'
import { mount, enableAutoUnmount, RouterLinkStub } from '@vue/test-utils'
import type { DashboardMonthDto } from '@/lib/api'
import MonthBand from './MonthBand.vue'

const phone = vi.hoisted(() => ({ value: false }))
vi.mock('@/composables/useMediaQuery', () => ({
  useMediaQuery: () => ref(phone.value),
}))

enableAutoUnmount(afterEach)

afterEach(() => {
  phone.value = false
})

/** October 2026 on its 23rd: 1 000 € spent against a 1 625 € habit. */
const OCTOBER: DashboardMonthDto = {
  month: '2026-10',
  asOfDay: 23,
  daysInMonth: 31,
  spent: 1000,
  spentSeries: [1500, 1700, 1600, 1400, 1800, 1650, 1000],
  habit: 1625,
  habitToDate: 1205.65,
  habitMonths: 6,
  incomeReceived: 0,
  incomeExpected: 2500,
  incomeSeries: [2500, 2500, 2500, 2600, 2500, 2500],
  upcoming: [
    {
      id: 'rent',
      name: 'Loyer',
      amount: 700,
      nextExpected: '2026-10-05',
      categoryId: null,
    },
    {
      id: 'edf',
      name: 'EDF',
      amount: 80,
      nextExpected: '2026-10-23',
      categoryId: null,
    },
    {
      id: 'netflix',
      name: 'Netflix',
      amount: 13.49,
      nextExpected: '2026-10-28',
      categoryId: null,
    },
    {
      id: 'spotify',
      name: 'Spotify',
      amount: 10.99,
      nextExpected: '2026-10-30',
      categoryId: null,
    },
  ],
  upcomingTotal: 804.48,
  remainingToLive: 695.52,
  remainingShare: 0.2782,
}

/** Spaces as one plain space: the formatters use narrow no-break ones. */
const text = (s: string): string => s.replace(/\s+/g, ' ').trim()

function mountBand(
  props: Partial<InstanceType<typeof MonthBand>['$props']> = {}
) {
  return mount(MonthBand, {
    props: { data: OCTOBER, reading: 'everyday', ...props },
    global: { stubs: { RouterLink: RouterLinkStub } },
  })
}

describe('MonthBand', () => {
  it('names the month and the day it is read at', () => {
    const wrapper = mountBand()

    expect(wrapper.get('[data-testid="month-band-title"]').text()).toBe(
      'Ce mois-ci · octobre, au 23'
    )
    expect(wrapper.text()).toContain(
      "L'habitude est la médiane des six mois clos précédents"
    )
  })

  it('says « au 1er » on the first day', () => {
    const wrapper = mountBand({ data: { ...OCTOBER, asOfDay: 1 } })

    expect(wrapper.get('[data-testid="month-band-title"]').text()).toBe(
      'Ce mois-ci · octobre, au 1er'
    )
  })

  it('lays out four tiles, two per row on a phone, four from md', () => {
    const wrapper = mountBand()

    for (const tile of ['spent', 'income', 'upcoming', 'remaining']) {
      expect(wrapper.find(`[data-testid="month-tile-${tile}"]`).exists()).toBe(
        true
      )
    }
    const grid = wrapper.get('[data-testid="month-tile-spent"]').element
      .parentElement as HTMLElement
    expect(grid.className).toContain('grid-cols-2')
    expect(grid.className).toContain('md:grid-cols-4')
  })

  describe('the spending tile', () => {
    it('reads the everyday spending under the habit at this point of the month, in teal', () => {
      const wrapper = mountBand()
      const tile = wrapper.get('[data-testid="month-tile-spent"]')

      expect(tile.find('h3').text()).toBe('Vie courante')
      expect(
        text(wrapper.get('[data-testid="month-value-spent"]').text())
      ).toBe('1 000 €')
      const badge = wrapper.get('[data-testid="month-badge-spent"]')
      // 1 000 against 1 205,65: −17 %.
      expect(text(badge.text())).toBe('−17 %')
      expect(badge.attributes('data-tone')).toBe('under')
      expect(badge.classes()).toContain('bg-teal-50')
      expect(tile.text()).toContain('à ce stade du mois')
      expect(
        text(wrapper.get('[data-testid="month-detail-spent"]').text())
      ).toBe("1 206 € attendus au 23 · 1 625 € par mois d'habitude")
    })

    it('turns amber over the habit, and grey within 5 %', () => {
      const over = mountBand({ data: { ...OCTOBER, spent: 1400 } })
      const overBadge = over.get('[data-testid="month-badge-spent"]')
      expect(text(overBadge.text())).toBe('+16 %')
      expect(overBadge.attributes('data-tone')).toBe('over')
      expect(overBadge.classes()).toContain('bg-amber-50')

      const near = mountBand({ data: { ...OCTOBER, spent: 1250 } })
      const nearBadge = near.get('[data-testid="month-badge-spent"]')
      expect(nearBadge.text()).toBe("dans l'habitude")
      expect(nearBadge.attributes('data-tone')).toBe('neutral')
    })

    it('never colours a figure, and never uses red', () => {
      const wrapper = mountBand({
        data: { ...OCTOBER, spent: 3000, remainingToLive: -1300 },
      })

      expect(
        wrapper.get('[data-testid="month-value-spent"]').classes()
      ).toContain('text-gray-900')
      expect(wrapper.html()).not.toMatch(/(text|bg|border)-red-/)
    })

    it('says « Dépenses » in the « Tout » reading', () => {
      const wrapper = mountBand({ reading: 'real' })

      expect(wrapper.get('[data-testid="month-tile-spent"] h3').text()).toBe(
        'Dépenses'
      )
    })

    it('draws the months with the habit as its reference, from zero', () => {
      const wrapper = mountBand()
      const spark = wrapper.findAllComponents({ name: 'SparklineChart' })[0]

      expect(spark?.props('data')).toEqual(OCTOBER.spentSeries)
      expect(spark?.props('reference')).toBe(1625)
      expect(spark?.props('baseline')).toBe('zero')
      expect(
        wrapper.find('[data-testid="month-sparkline-spent"]').exists()
      ).toBe(true)
    })
  })

  describe('the income tile', () => {
    it('says what is expected while the salary has not landed', () => {
      const wrapper = mountBand()

      expect(
        text(wrapper.get('[data-testid="month-value-income"]').text())
      ).toBe('0 €')
      expect(
        text(wrapper.get('[data-testid="month-badge-income"]').text())
      ).toBe('2 500 € attendus')
      expect(
        wrapper.find('[data-testid="month-sparkline-income"]').exists()
      ).toBe(true)
    })

    it('says the gap once 80 % of it is in', () => {
      const landed = mountBand({ data: { ...OCTOBER, incomeReceived: 2500 } })
      expect(landed.get('[data-testid="month-badge-income"]').text()).toBe(
        "dans l'habitude"
      )

      const more = mountBand({ data: { ...OCTOBER, incomeReceived: 2900 } })
      expect(text(more.get('[data-testid="month-badge-income"]').text())).toBe(
        '+16 %'
      )

      const less = mountBand({ data: { ...OCTOBER, incomeReceived: 2100 } })
      expect(text(less.get('[data-testid="month-badge-income"]').text())).toBe(
        '−16 %'
      )
    })
  })

  describe('the upcoming tile', () => {
    it('sums what is still to come, counts it to the month end and names the first three', () => {
      const wrapper = mountBand()

      expect(
        text(wrapper.get('[data-testid="month-value-upcoming"]').text())
      ).toBe('804 €')
      expect(wrapper.get('[data-testid="month-badge-upcoming"]').text()).toBe(
        "4 prélèvements d'ici le 31"
      )
      const names = wrapper
        .findAll('[data-testid="month-upcoming-names"] li')
        .map(li => text(li.text()))
      // The late one says when it was expected.
      expect(names).toEqual([
        'Loyer · attendu le 5',
        'EDF',
        'Netflix',
        'et 1 autre',
      ])
      expect(wrapper.getComponent(RouterLinkStub).props('to')).toBe(
        '/recurrences'
      )
    })

    it('says when nothing is left to come', () => {
      const wrapper = mountBand({
        data: { ...OCTOBER, upcoming: [], upcomingTotal: 0 },
      })

      expect(wrapper.get('[data-testid="month-badge-upcoming"]').text()).toBe(
        "rien d'ici le 31"
      )
      expect(
        wrapper.find('[data-testid="month-upcoming-names"]').exists()
      ).toBe(false)
    })
  })

  describe('the remaining tile', () => {
    it('reads what is left as a share of the expected income', () => {
      const wrapper = mountBand()

      expect(
        text(wrapper.get('[data-testid="month-value-remaining"]').text())
      ).toBe('696 €')
      expect(
        text(wrapper.get('[data-testid="month-badge-remaining"]').text())
      ).toBe('28 % du revenu attendu')
      expect(
        wrapper.get('[data-testid="month-tile-remaining"]').text()
      ).toContain('Revenus attendus − dépensé − à venir')
    })

    it('says « dépassé » in amber when the month is over it', () => {
      const wrapper = mountBand({
        data: { ...OCTOBER, remainingToLive: -120, remainingShare: -0.048 },
      })

      const value = wrapper.get('[data-testid="month-value-remaining"]')
      expect(text(value.text())).toBe('-120 €')
      expect(value.classes()).toContain('text-amber-700')
      const badge = wrapper.get('[data-testid="month-badge-remaining"]')
      expect(badge.text()).toBe('dépassé')
      expect(badge.attributes('data-tone')).toBe('over')
    })
  })

  describe('a short history', () => {
    const SHORT: DashboardMonthDto = {
      ...OCTOBER,
      habit: null,
      habitToDate: null,
      habitMonths: 2,
      incomeExpected: null,
      spentSeries: [1800, 1650, 1000],
      incomeSeries: [2500, 2500],
      remainingToLive: null,
      remainingShare: null,
    }

    it('keeps the figures and says there is no habit yet', () => {
      const wrapper = mountBand({ data: SHORT })

      expect(
        text(wrapper.get('[data-testid="month-value-spent"]').text())
      ).toBe('1 000 €')
      for (const badge of ['spent', 'income', 'remaining']) {
        expect(wrapper.get(`[data-testid="month-badge-${badge}"]`).text()).toBe(
          "pas encore d'habitude"
        )
      }
      expect(wrapper.get('[data-testid="month-value-remaining"]').text()).toBe(
        '—'
      )
      expect(
        wrapper.get('[data-testid="month-tile-spent"]').text()
      ).not.toContain('à ce stade du mois')
      // The upcoming charges need no habit.
      expect(
        text(wrapper.get('[data-testid="month-value-upcoming"]').text())
      ).toBe('804 €')
    })
  })

  describe('loading and failure', () => {
    it('shows the band shape on the first load', () => {
      const wrapper = mountBand({ data: null, isLoading: true })

      expect(wrapper.find('[data-testid="month-loading"]').exists()).toBe(true)
      expect(wrapper.get('[data-testid="month-band-title"]').text()).toBe(
        'Ce mois-ci'
      )
    })

    it('says the month could not be read and offers to try again', async () => {
      const wrapper = mountBand({
        data: null,
        error: "La lecture du mois n'a pas pu être chargée",
      })

      expect(text(wrapper.get('[data-testid="month-error"]').text())).toBe(
        "La lecture du mois n'a pas pu être chargée · Réessayer"
      )
      expect(wrapper.find('[data-testid="month-tile-spent"]').exists()).toBe(
        false
      )
      await wrapper.get('[data-testid="month-retry"]').trigger('click')
      expect(wrapper.emitted('retry')).toHaveLength(1)
    })

    it('keeps the last figures under the failure of a refresh', () => {
      const wrapper = mountBand({ error: 'boom' })

      expect(wrapper.find('[data-testid="month-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="month-tile-spent"]').exists()).toBe(
        true
      )
    })
  })

  describe('on a phone', () => {
    it('stands the tiles two by two, the figures at 22px, the notes at 11px', () => {
      phone.value = true
      const wrapper = mountBand()

      const grid = wrapper.get('[data-testid="month-tile-spent"]').element
        .parentElement as HTMLElement
      expect(grid.className).toContain('grid-cols-2')
      expect(grid.className).toContain('md:grid-cols-4')
      const value = wrapper.get('[data-testid="month-value-spent"]')
      expect(value.classes()).toEqual(
        expect.arrayContaining(['text-[22px]', 'sm:text-2xl'])
      )
      expect(
        wrapper.get('[data-testid="month-detail-spent"]').classes()
      ).toEqual(expect.arrayContaining(['text-[11px]', 'sm:text-xs']))
    })

    it('narrows the sparklines to the tile', () => {
      phone.value = true
      const wrapper = mountBand()

      for (const id of ['month-sparkline-spent', 'month-sparkline-income']) {
        expect(wrapper.get(`[data-testid="${id}"]`).attributes('width')).toBe(
          '100'
        )
      }
    })

    it('keeps the 120px sparklines on a desk', () => {
      const wrapper = mountBand()

      expect(
        wrapper.get('[data-testid="month-sparkline-spent"]').attributes('width')
      ).toBe('120')
    })
  })
})

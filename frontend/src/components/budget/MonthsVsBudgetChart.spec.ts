import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthsVsBudgetChart from './MonthsVsBudgetChart.vue'

const months = ['2026-06', '2026-07', '2026-08', '2026-09', '2026-10']
const values = [120, 150, 90, 140, 60]

function mountChart(props: Record<string, unknown> = {}) {
  return mount(MonthsVsBudgetChart, {
    props: {
      values,
      months,
      budget: 133,
      label: '5 mois, 2 au-dessus de l’enveloppe de 133 €, octobre en cours',
      ...props,
    },
  })
}

function columns(wrapper: ReturnType<typeof mountChart>) {
  return wrapper.findAll('[data-testid="months-chart-column"]')
}

describe('MonthsVsBudgetChart', () => {
  it('draws one column per month, from zero on a shared scale', () => {
    const wrapper = mountChart()
    const cols = columns(wrapper)
    expect(cols.map(c => c.attributes('data-month'))).toEqual(months)
    // 120 px over 5 months: 24 px slots, 16.8 px columns, centered.
    expect(cols[0]?.attributes()).toMatchObject({
      x: '3.6',
      width: '16.8',
    })
    // The tallest month (150) reaches the top padding; every column ends
    // on the floor.
    expect(cols[1]?.attributes('y')).toBe('2')
    for (const col of cols) {
      expect(
        Number(col.attributes('y')) + Number(col.attributes('height'))
      ).toBeCloseTo(28, 1)
    }
  })

  it('paints only the months above the envelope in the state red', () => {
    const cols = columns(mountChart())
    const over = cols.map(c => c.attributes('data-over') === 'true')
    expect(over).toEqual([false, true, false, true, false])
    for (const [i, col] of cols.entries()) {
      if (over[i]) {
        expect(col.classes()).toContain('fill-red-500')
        expect(col.classes()).toContain('dark:fill-red-400')
      } else {
        expect(col.classes()).toContain('fill-gray-500')
        expect(col.classes()).toContain('dark:fill-slate-400')
      }
    }
  })

  it('draws the envelope as a dashed line in the text ink, at its height', () => {
    const line = mountChart().find('[data-testid="months-chart-budget"]')
    // 133 on a 0–150 scale of 26 usable pixels: 28 − 133/150 × 26.
    expect(line.attributes()).toMatchObject({
      x1: '0',
      x2: '120',
      y1: '4.9',
      y2: '4.9',
    })
    expect(line.attributes('stroke-dasharray')).toBeTruthy()
    expect(line.classes()).toContain('stroke-gray-900')
    expect(line.classes()).toContain('dark:stroke-gray-100')
  })

  it('keeps an envelope above every month in view', () => {
    const wrapper = mountChart({ budget: 300 })
    expect(
      wrapper.find('[data-testid="months-chart-budget"]').attributes('y1')
    ).toBe('2')
    expect(
      columns(wrapper).every(c => c.attributes('data-over') === undefined)
    ).toBe(true)
  })

  it('draws the columns alone when there is no envelope', () => {
    const wrapper = mountChart({ budget: 0 })
    expect(wrapper.find('[data-testid="months-chart-budget"]').exists()).toBe(
      false
    )
    for (const col of columns(wrapper)) {
      expect(col.attributes('data-over')).toBeUndefined()
      expect(col.classes()).toContain('fill-gray-500')
    }
  })

  it('draws the running month lighter', () => {
    const cols = columns(mountChart({ runningMonth: '2026-10' }))
    expect(cols[4]?.attributes('data-running')).toBe('true')
    expect(cols[4]?.classes()).toContain('opacity-40')
    expect(cols[3]?.attributes('data-running')).toBeUndefined()
    expect(cols[3]?.classes()).not.toContain('opacity-40')
  })

  it('sets the isolated month on a band', () => {
    const wrapper = mountChart({ selectedMonth: '2026-08' })
    const bands = wrapper.findAll('[data-testid="months-chart-selected-band"]')
    expect(bands).toHaveLength(1)
    expect(bands[0]?.attributes()).toMatchObject({ x: '48', width: '24' })
    expect(columns(wrapper)[2]?.attributes('data-selected')).toBe('true')
  })

  it('has no band when no month is isolated', () => {
    expect(
      mountChart().find('[data-testid="months-chart-selected-band"]').exists()
    ).toBe(false)
  })

  it('says what it shows in words', () => {
    const svg = mountChart().find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe(
      '5 mois, 2 au-dessus de l’enveloppe de 133 €, octobre en cours'
    )
  })

  it('renders nothing without a month', () => {
    expect(mountChart({ values: [], months: [] }).find('svg').exists()).toBe(
      false
    )
  })
})

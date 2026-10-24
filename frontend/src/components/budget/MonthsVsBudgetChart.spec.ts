import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import MonthsVsBudgetChart from './MonthsVsBudgetChart.vue'
import { DATA_HUE, STATE_COLORS } from '@/lib/stateTints'

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

  it('draws the months in the data hue, those above the envelope in amber', () => {
    const cols = columns(mountChart())
    expect(cols.map(c => c.attributes('data-over') === 'true')).toEqual([
      false,
      true,
      false,
      true,
      false,
    ])
    expect(cols.map(c => c.attributes('fill'))).toEqual([
      DATA_HUE,
      STATE_COLORS.over,
      DATA_HUE,
      STATE_COLORS.over,
      DATA_HUE,
    ])
    // No red, no class colour left on a column.
    expect(cols.map(c => c.attributes('class') ?? '')).toEqual(
      cols.map(() => '')
    )
  })

  it('draws the envelope as a dashed ink line, at its height', () => {
    const line = mountChart().find('[data-testid="months-chart-budget"]')
    // 133 on a 0–150 scale of 26 usable pixels: 28 − 133/150 × 26.
    expect(line.attributes()).toMatchObject({
      x1: '0',
      x2: '120',
      y1: '4.9',
      y2: '4.9',
    })
    expect(line.attributes('stroke-dasharray')).toBeTruthy()
    expect(line.classes()).toContain('stroke-gray-700')
    expect(line.classes()).toContain('dark:stroke-slate-300')
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
      expect(col.attributes('fill')).toBe(DATA_HUE)
    }
  })

  it('draws the running month in a lighter blue', () => {
    const cols = columns(mountChart({ runningMonth: '2026-10' }))
    expect(cols.map(c => c.attributes('data-running'))).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
      'true',
    ])
    expect(cols.map(c => c.attributes('fill')).at(-1)).toBe('#93c5fd')
    expect(cols.map(c => c.attributes('fill')).at(0)).toBe(DATA_HUE)
  })

  it('keeps a running month above the envelope in amber', () => {
    const cols = columns(
      mountChart({ runningMonth: '2026-10', values: [120, 150, 90, 140, 200] })
    )
    expect(cols.map(c => c.attributes('fill')).at(-1)).toBe(STATE_COLORS.over)
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

import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import YearColumnsChart from './YearColumnsChart.vue'
import { formatCurrency } from '@/lib/formatters'

const COLOR = '#0ea5e9'

function mountChart(
  props: Partial<{
    years: { year: number; amount: number }[]
    currentYear: number
    envelope: number
    label: string
  }> = {}
) {
  return mount(YearColumnsChart, {
    props: {
      years: [
        { year: 2024, amount: 300 },
        { year: 2025, amount: 600 },
      ],
      currentYear: 2025,
      color: COLOR,
      label: 'Voyages, 2 années',
      ...props,
    },
  })
}

function column(wrapper: ReturnType<typeof mountChart>, year: number) {
  return wrapper.find(`[data-testid="year-column-${year}"]`)
}

describe('YearColumnsChart', () => {
  it('draws heights proportional to the amounts, from the floor', () => {
    const wrapper = mountChart()
    // 600 is the max: the full 48 px plot; 300 is half of it.
    expect(column(wrapper, 2025).attributes()).toMatchObject({
      height: '48',
      y: '0',
      width: '30',
      rx: '3',
    })
    expect(column(wrapper, 2024).attributes()).toMatchObject({
      height: '24',
      y: '24',
    })
  })

  it('keeps a year at 0 as a 2 px sliver on the floor', () => {
    const wrapper = mountChart({
      years: [
        { year: 2024, amount: 0 },
        { year: 2025, amount: 500 },
      ],
    })
    expect(column(wrapper, 2024).attributes()).toMatchObject({
      height: '2',
      y: '46',
    })
  })

  it('colors the current year and leaves the others gray', () => {
    const wrapper = mountChart()
    const current = column(wrapper, 2025)
    const past = column(wrapper, 2024)
    expect(current.attributes('fill')).toBe(COLOR)
    expect(past.attributes('fill')).toBeUndefined()
    expect(past.classes()).toContain('fill-gray-400')
    expect(past.classes()).toContain('dark:fill-slate-500')

    const labels = wrapper.findAll('text')
    const currentLabel = labels.find(t => t.text() === '2025')
    const pastLabel = labels.find(t => t.text() === '2024')
    expect(currentLabel?.attributes('font-weight')).toBe('600')
    expect(pastLabel?.attributes('font-weight')).toBeUndefined()
    expect(currentLabel?.attributes('text-anchor')).toBe('middle')
  })

  it('titles each column with its year and amount', () => {
    const wrapper = mountChart()
    expect(column(wrapper, 2024).find('title').text()).toBe(
      `2024 : ${formatCurrency(300)}`
    )
  })

  it('draws no envelope without the prop', () => {
    const wrapper = mountChart()
    expect(wrapper.find('[data-testid="year-envelope"]').exists()).toBe(false)
    expect(wrapper.find('line').exists()).toBe(false)
    expect(wrapper.find('[data-testid^="year-column-over-"]').exists()).toBe(
      false
    )
  })

  it('draws the envelope as a dashed line with its amount', () => {
    const wrapper = mountChart({ envelope: 300 })
    const envelope = wrapper.find('[data-testid="year-envelope"]')
    const line = envelope.find('line')
    // 300 of a 600 scale: halfway up the 48 px plot, which starts under a
    // 14 px margin, across the 72 px chart.
    expect(line.attributes()).toMatchObject({
      x1: '0',
      x2: '72',
      y1: '38',
      y2: '38',
      'stroke-dasharray': '3 3',
    })
    // Its name sits in the margin, from the left: the chart is narrower
    // than the name, which runs over the row's free space.
    const text = envelope.find('text')
    expect(text.text()).toMatch(/^enveloppe 300\s€$/)
    expect(text.attributes()).toMatchObject({
      x: '0',
      y: '10',
      'text-anchor': 'start',
    })
  })

  it('lets an envelope above every year set the scale', () => {
    const wrapper = mountChart({ envelope: 1200 })
    expect(column(wrapper, 2025).attributes('height')).toBe('24')
    expect(column(wrapper, 2024).attributes('height')).toBe('12')
    // At the very top of the plot, under the margin.
    expect(
      wrapper.find('[data-testid="year-envelope"] line').attributes('y1')
    ).toBe('14')
  })

  it('redraws in red only the part above the line, only where it is crossed', () => {
    const wrapper = mountChart({
      years: [
        { year: 2024, amount: 300 },
        { year: 2025, amount: 600 },
      ],
      envelope: 400,
    })
    expect(wrapper.find('[data-testid="year-column-over-2024"]').exists()).toBe(
      false
    )
    const over = wrapper.find('[data-testid="year-column-over-2025"]')
    // 200 over, on a 600 scale: the top 16 px of the 48 px column, which
    // starts under the envelope's margin.
    expect(over.attributes()).toMatchObject({
      y: '14',
      height: '16',
      fill: '#f59e0b', // amber-500: an overrun is a state, never red
    })
    expect(over.find('title').text()).toBe(
      `2025 : dépassement de ${formatCurrency(200)}`
    )
  })

  it('carries its label for screen readers', () => {
    const svg = mountChart({ label: 'Hyrox, 3 années' }).find('svg')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Hyrox, 3 années')
  })

  it('widens with the number of years', () => {
    const one = mountChart({ years: [{ year: 2025, amount: 10 }] })
    expect(one.find('svg').attributes()).toMatchObject({
      width: '30',
      height: '64',
    })
    // The envelope's margin is only taken when there is one to name.
    expect(
      mountChart({ years: [{ year: 2025, amount: 10 }], envelope: 20 })
        .find('svg')
        .attributes('height')
    ).toBe('78')
    const three = mountChart({
      years: [
        { year: 2023, amount: 1 },
        { year: 2024, amount: 2 },
        { year: 2025, amount: 3 },
      ],
    })
    expect(three.find('svg').attributes('width')).toBe('114')
  })

  it('renders nothing without a year', () => {
    expect(mountChart({ years: [] }).find('svg').exists()).toBe(false)
  })
})

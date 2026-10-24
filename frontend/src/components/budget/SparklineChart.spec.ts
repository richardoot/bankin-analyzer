import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import SparklineChart from './SparklineChart.vue'

/** The `y` of every point of the line, in order. */
function lineYs(wrapper: ReturnType<typeof mount>): number[] {
  const points = wrapper.find('polyline').attributes('points') ?? ''
  return points.split(' ').map(p => Number(p.split(',')[1]))
}

describe('SparklineChart', () => {
  it('stretches the series between its own min and max by default', () => {
    const wrapper = mount(SparklineChart, { props: { data: [10, 20, 30] } })
    // 96 × 28, two pixels of air: the min sits at 26, the max at 2.
    expect(wrapper.find('polyline').attributes('points')).toBe(
      '0,26 48,14 96,2'
    )
    expect(wrapper.find('polygon').attributes('points')).toBe(
      '0,26 48,14 96,2 96,28 0,28'
    )
    expect(wrapper.find('polygon').attributes('fill-opacity')).toBe('0.14')
    expect(wrapper.find('circle').attributes()).toMatchObject({
      cx: '96',
      cy: '2',
      fill: '#60a5fa',
    })
    expect(wrapper.find('line').exists()).toBe(false)
  })

  it('draws a constant series from zero as a flat line', () => {
    const wrapper = mount(SparklineChart, {
      props: { data: [50, 50, 50, 50], baseline: 'zero' },
    })
    const ys = lineYs(wrapper)
    expect(new Set(ys).size).toBe(1)
    expect(wrapper.find('polygon').exists()).toBe(false)
  })

  it('measures from zero, so a small series stays low', () => {
    const wrapper = mount(SparklineChart, {
      props: { data: [0, 15, 0], baseline: 'zero', reference: 60 },
    })
    // Zero on the floor (26), 15 a quarter of the way to 60 (at 2).
    expect(lineYs(wrapper)).toEqual([26, 20, 26])
  })

  it('draws the reference as a dashed line at its height', () => {
    const wrapper = mount(SparklineChart, {
      props: {
        data: [0, 100],
        baseline: 'zero',
        reference: 50,
        endColor: '#111827',
      },
    })
    const line = wrapper.find('[data-testid="sparkline-reference"]')
    expect(line.attributes()).toMatchObject({
      x1: '0',
      x2: '96',
      y1: '14',
      y2: '14',
      stroke: '#111827',
    })
    expect(line.attributes('stroke-dasharray')).toBeTruthy()
    expect(wrapper.find('circle').attributes('fill')).toBe('#111827')
    expect(wrapper.find('polyline').attributes('stroke')).toBe('#60a5fa')
  })

  it('keeps a reference above the series in view', () => {
    const wrapper = mount(SparklineChart, {
      props: { data: [10, 20], baseline: 'zero', reference: 40 },
    })
    expect(
      wrapper.find('[data-testid="sparkline-reference"]').attributes('y1')
    ).toBe('2')
    expect(lineYs(wrapper)).toEqual([20, 14])
  })

  it('renders nothing for fewer than two points', () => {
    expect(
      mount(SparklineChart, { props: { data: [42] } })
        .find('svg')
        .exists()
    ).toBe(false)
    expect(
      mount(SparklineChart, { props: { data: [] } })
        .find('svg')
        .exists()
    ).toBe(false)
  })

  it('is hidden from screen readers unless given a label', () => {
    const hidden = mount(SparklineChart, { props: { data: [1, 2] } })
    expect(hidden.find('svg').attributes('aria-hidden')).toBe('true')
    expect(hidden.find('svg').attributes('aria-label')).toBeUndefined()

    const labelled = mount(SparklineChart, {
      props: { data: [1, 2], label: 'Alimentation, 6 mois, stable' },
    })
    const svg = labelled.find('svg')
    expect(svg.attributes('aria-label')).toBe('Alimentation, 6 mois, stable')
    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-hidden')).toBeUndefined()
  })
})

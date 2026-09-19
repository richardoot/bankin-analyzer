import { describe, it, expect, vi, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import FilterDisclosure from './FilterDisclosure.vue'

/** happy-dom answers `isVisible()` true through a v-show, so read the style. */
const isFolded = (el: { attributes: (n: string) => string | undefined }) =>
  (el.attributes('style') ?? '').includes('display: none')

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    value: vi.fn(() => ({
      matches,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
    writable: true,
    configurable: true,
  })
}

const originalMatchMedia = window.matchMedia

afterEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    value: originalMatchMedia,
    writable: true,
    configurable: true,
  })
})

function mountBar(props: Record<string, unknown> = {}) {
  return mount(FilterDisclosure, {
    props,
    slots: {
      search: '<input data-testid="search" />',
      default: '<select data-testid="control"></select>',
      summary: '12 résultats',
      actions: '<button data-testid="action">Go</button>',
    },
  })
}

describe('FilterDisclosure', () => {
  it('shows the controls straight away on a desk', () => {
    stubMatchMedia(false)
    const wrapper = mountBar()
    expect(wrapper.find('[data-testid="search"]').exists()).toBe(true)
    expect(
      isFolded(wrapper.get('[data-testid="filter-disclosure-panel"]'))
    ).toBe(false)
    expect(wrapper.text()).toContain('12 résultats')
    expect(wrapper.find('[data-testid="action"]').exists()).toBe(true)
  })

  it('folds the controls behind the button on a phone', async () => {
    stubMatchMedia(true)
    const wrapper = mountBar()
    const panel = wrapper.get('[data-testid="filter-disclosure-panel"]')
    const toggle = wrapper.get('[data-testid="filter-disclosure-toggle"]')

    expect(isFolded(panel)).toBe(true)
    expect(toggle.attributes('aria-expanded')).toBe('false')
    expect(toggle.attributes('aria-controls')).toBe(panel.attributes('id'))

    await toggle.trigger('click')
    expect(isFolded(panel)).toBe(false)
    expect(toggle.attributes('aria-expanded')).toBe('true')
  })

  it('keeps the search field reachable while folded', () => {
    stubMatchMedia(true)
    const wrapper = mountBar()
    expect(wrapper.find('[data-testid="search"]').exists()).toBe(true)
    expect(
      wrapper.get('[data-testid="search"]').attributes('style')
    ).toBeUndefined()
  })

  it('counts the active filters on the button', () => {
    stubMatchMedia(true)
    expect(
      mountBar({ activeCount: 3 })
        .get('[data-testid="filter-disclosure-count"]')
        .text()
    ).toBe('3')
    expect(
      mountBar().find('[data-testid="filter-disclosure-count"]').exists()
    ).toBe(false)
  })

  it('honours an initial expanded state from the parent', () => {
    stubMatchMedia(true)
    const wrapper = mountBar({ expanded: true })
    expect(
      isFolded(wrapper.get('[data-testid="filter-disclosure-panel"]'))
    ).toBe(false)
  })
})

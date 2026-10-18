import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChartTheme } from './useChartTheme'

function fakeMatchMedia(reduce: boolean): typeof window.matchMedia {
  return ((query: string) => ({
    matches: reduce && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
}

describe('useChartTheme', () => {
  const original = window.matchMedia

  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    window.matchMedia = original
  })

  it('lets the chart move by default', () => {
    window.matchMedia = fakeMatchMedia(false)
    const { chartAnimations, prefersReducedMotion } = useChartTheme()
    expect(prefersReducedMotion.value).toBe(false)
    expect(chartAnimations.value?.enabled).toBe(true)
    expect(chartAnimations.value?.dynamicAnimation?.enabled).toBe(true)
  })

  it('stops every chart animation when the system asks for less motion', () => {
    window.matchMedia = fakeMatchMedia(true)
    const { chartAnimations, prefersReducedMotion } = useChartTheme()
    expect(prefersReducedMotion.value).toBe(true)
    expect(chartAnimations.value?.enabled).toBe(false)
    expect(chartAnimations.value?.animateGradually?.enabled).toBe(false)
    expect(chartAnimations.value?.dynamicAnimation?.enabled).toBe(false)
  })
})

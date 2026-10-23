import { describe, it, expect } from 'vitest'
import { DATA_HUE, STATE_BADGE_CLASSES, STATE_COLORS } from './stateTints'

/**
 * The dashboard's sources, read as text: the rule of the state tints
 * (agent-os/product/design-system.md) holds in the code, not only in the
 * components a spec happens to mount.
 */
const dashboardSources = import.meta.glob<string>(
  [
    '../components/dashboard/*.vue',
    '../views/DashboardPage.vue',
    '../components/charts/IncomeExpensesChart.vue',
    '../components/charts/YearColumnsChart.vue',
  ],
  { query: '?raw', import: 'default', eager: true }
)

describe('the state tints', () => {
  it('say three states, teal, amber and grey', () => {
    expect(STATE_BADGE_CLASSES.under).toContain('bg-teal-50')
    expect(STATE_BADGE_CLASSES.over).toContain('bg-amber-50')
    expect(STATE_BADGE_CLASSES.neutral).toContain('bg-gray-100')
    expect(STATE_COLORS).toEqual({
      under: '#14b8a6',
      over: '#f59e0b',
      neutral: '#9ca3af',
    })
    expect(DATA_HUE).toBe('#60a5fa')
  })

  it('reads the dashboard sources it guards', () => {
    expect(Object.keys(dashboardSources)).toEqual(
      expect.arrayContaining([
        '../views/DashboardPage.vue',
        '../components/dashboard/MonthBand.vue',
      ])
    )
  })

  it.each(Object.entries(dashboardSources))(
    'keeps red, green and the old KPI borders off the figures in %s',
    (_path, source) => {
      expect(source).not.toMatch(
        /\b(?:text|bg|border|fill|stroke)-(?:red|green|emerald)-\d/
      )
      expect(source).not.toMatch(/\bborder-l-4\b/)
      // red-500, green-500, emerald-500: no hex way around the rule.
      expect(source.toLowerCase()).not.toMatch(/#(?:ef4444|22c55e|10b981)\b/)
    }
  )
})

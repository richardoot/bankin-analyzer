import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import type { ApexOptions } from 'apexcharts'
import { useMediaQuery } from '@/composables/useMediaQuery'

type ChartAnimations = NonNullable<
  NonNullable<ApexOptions['chart']>['animations']
>

/**
 * What every chart shares: the theme's colors, and whether it may move.
 * The global reduced-motion rule in style.css stops CSS animations, but an
 * ApexCharts animation is driven from JavaScript and never sees it — so
 * the preference is read here and handed to the chart's own options.
 */
export function useChartTheme() {
  const themeStore = useThemeStore()

  const isDark = computed(() => themeStore.isDark)

  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

  /** `chart.animations` honoring the system's « less motion ». */
  const chartAnimations = computed<ChartAnimations>(() => {
    const enabled = !prefersReducedMotion.value
    return {
      enabled,
      easing: 'easeinout',
      speed: 600,
      animateGradually: { enabled, delay: 100 },
      dynamicAnimation: { enabled, speed: 300 },
    }
  })

  // Common chart theme options based on current theme
  const chartTheme = computed<Partial<ApexOptions>>(() => ({
    theme: {
      mode: isDark.value ? 'dark' : 'light',
    },
    chart: {
      background: 'transparent',
      foreColor: isDark.value ? '#e2e8f0' : '#374151',
    },
    tooltip: {
      theme: isDark.value ? 'dark' : 'light',
    },
    grid: {
      borderColor: isDark.value ? '#334155' : '#e5e7eb',
    },
  }))

  // Colors for axes labels
  const labelColor = computed(() => (isDark.value ? '#94a3b8' : '#6b7280'))

  // Colors for donut stroke (border between segments)
  const strokeColor = computed(() => (isDark.value ? '#1e293b' : '#ffffff'))

  // Colors for donut labels
  const donutNameColor = computed(() => (isDark.value ? '#94a3b8' : '#6b7280'))
  const donutValueColor = computed(() => (isDark.value ? '#f1f5f9' : '#111827'))

  return {
    isDark,
    prefersReducedMotion,
    chartAnimations,
    chartTheme,
    labelColor,
    strokeColor,
    donutNameColor,
    donutValueColor,
  }
}

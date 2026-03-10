import { computed } from 'vue'
import { useThemeStore } from '@/stores/theme'
import type { ApexOptions } from 'apexcharts'

export function useChartTheme() {
  const themeStore = useThemeStore()

  const isDark = computed(() => themeStore.isDark)

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
    chartTheme,
    labelColor,
    strokeColor,
    donutNameColor,
    donutValueColor,
  }
}

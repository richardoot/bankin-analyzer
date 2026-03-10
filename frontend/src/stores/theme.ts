import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

type ThemeMode = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'bankin-analyzer-theme'

export const useThemeStore = defineStore('theme', () => {
  // User preference: 'light', 'dark', or 'system'
  const mode = ref<ThemeMode>('system')

  // Resolved theme (what's actually applied)
  const resolvedTheme = ref<'light' | 'dark'>('light')

  // Computed: is dark mode active
  const isDark = computed(() => resolvedTheme.value === 'dark')

  // Detect system preference
  function getSystemPreference(): 'light' | 'dark' {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    return 'light'
  }

  // Apply theme to document
  function applyTheme() {
    const theme = mode.value === 'system' ? getSystemPreference() : mode.value

    resolvedTheme.value = theme

    if (typeof document !== 'undefined') {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark')
      } else {
        document.documentElement.classList.remove('dark')
      }
    }
  }

  // Initialize from localStorage
  function initFromStorage() {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored && ['light', 'dark', 'system'].includes(stored)) {
        mode.value = stored as ThemeMode
      }
    }
    applyTheme()
  }

  // Save to localStorage
  function saveToStorage() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, mode.value)
    }
  }

  // Set theme mode
  function setMode(newMode: ThemeMode) {
    mode.value = newMode
    saveToStorage()
    applyTheme()
  }

  // Toggle between light and dark (ignoring system)
  function toggle() {
    setMode(resolvedTheme.value === 'dark' ? 'light' : 'dark')
  }

  // Watch for system preference changes
  function setupSystemPreferenceListener() {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
      mediaQuery.addEventListener('change', () => {
        if (mode.value === 'system') {
          applyTheme()
        }
      })
    }
  }

  // Initialize
  function initialize() {
    initFromStorage()
    setupSystemPreferenceListener()
  }

  return {
    mode,
    resolvedTheme,
    isDark,
    setMode,
    toggle,
    initialize,
  }
})

import {
  computed,
  getCurrentScope,
  onScopeDispose,
  reactive,
  ref,
  toValue,
  watchEffect,
  type ComputedRef,
  type MaybeRefOrGetter,
} from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

/**
 * Navigation below lg: a tab bar at the bottom for the four screens of
 * every day, and the menu (opened from its « Plus » tab, or from the top
 * hamburger on the pages that have no tab bar) for everything else.
 *
 * The state lives here, at module level, because two components share it:
 * the Navbar draws the menu, the tab bar opens it — one menu, two doors
 * that are never shown at the same time.
 */

/** The four tabs, in the order they sit; « Plus » comes last. */
export const TAB_BAR_LINKS = [
  { to: '/dashboard', label: 'Dashboard', testId: 'tab-bar-dashboard' },
  {
    to: '/transactions',
    label: 'Transactions',
    testId: 'tab-bar-transactions',
  },
  { to: '/budget', label: 'Budget', testId: 'tab-bar-budget' },
  { to: '/recurrences', label: 'Récurrences', testId: 'tab-bar-recurrences' },
] as const

/** True when a route path lives under one of the four tabs. */
export function isTabBarPath(path: string): boolean {
  return TAB_BAR_LINKS.some(link => path.startsWith(link.to))
}

const isMenuOpen = ref(false)

/** The mobile menu, whichever door opened it. */
export function useMobileMenu(): {
  isOpen: typeof isMenuOpen
  open: () => void
  close: () => void
  toggle: () => void
} {
  return {
    isOpen: isMenuOpen,
    open: () => (isMenuOpen.value = true),
    close: () => (isMenuOpen.value = false),
    toggle: () => (isMenuOpen.value = !isMenuOpen.value),
  }
}

/**
 * Pages that bring their own action bar to the bottom of a phone — the
 * selection bar of Transactions, the edit bar of Budget — take the tab
 * bar's place for as long as they show it, the way a mail app swaps its
 * tabs for a toolbar in edit mode. Stacked, the two bars would eat a fifth
 * of the screen, and a tab would only lead away from a selection or a
 * draft that leaving would drop (or stop on a confirmation).
 */
const suppressors = reactive(new Set<symbol>())

export function useSuppressTabBar(when: MaybeRefOrGetter<boolean>): void {
  const id = Symbol('tab-bar-suppressor')
  watchEffect(() => {
    if (toValue(when)) suppressors.add(id)
    else suppressors.delete(id)
  })
  if (getCurrentScope()) onScopeDispose(() => suppressors.delete(id))
}

/** True while some page mode has taken the tab bar's place. */
export function isTabBarSuppressed(): boolean {
  return suppressors.size > 0
}

/**
 * Whether the current page has a tab bar (`belongs`: a signed-in page of
 * the product, not the pitch, the login, the legal pages, the bank
 * callback or a page that opts out with `meta.tabBar: false`), and whether
 * it is drawn right now (`shown`: no page mode has taken its place).
 * Below lg only — the bar itself carries `lg:hidden`.
 */
export function useTabBar(): {
  belongs: ComputedRef<boolean>
  shown: ComputedRef<boolean>
} {
  const route = useRoute()
  const authStore = useAuthStore()
  const belongs = computed(
    () =>
      authStore.isAuthenticated &&
      route.meta.requiresAuth === true &&
      route.meta.tabBar !== false
  )
  const shown = computed(() => belongs.value && !isTabBarSuppressed())
  return { belongs, shown }
}

/** Test seam: forget every suppressor and close the menu. */
export function resetMobileNavigation(): void {
  suppressors.clear()
  isMenuOpen.value = false
}

import { describe, it, expect, beforeEach } from 'vitest'
import { effectScope, nextTick, ref } from 'vue'
import {
  TAB_BAR_LINKS,
  isTabBarPath,
  isTabBarSuppressed,
  resetMobileNavigation,
  useMobileMenu,
  useSuppressTabBar,
} from './useMobileNavigation'

describe('useMobileNavigation', () => {
  beforeEach(resetMobileNavigation)

  it('puts the four screens of every day in the tabs, in that order', () => {
    expect(TAB_BAR_LINKS.map(link => link.to)).toEqual([
      '/dashboard',
      '/transactions',
      '/budget',
      '/recurrences',
    ])
  })

  it('knows which paths live under a tab, deep pages included', () => {
    expect(isTabBarPath('/budget')).toBe(true)
    expect(isTabBarPath('/transactions')).toBe(true)
    expect(isTabBarPath('/reimbursements')).toBe(false)
    expect(isTabBarPath('/settings/general')).toBe(false)
  })

  it('shares one menu between every caller', () => {
    const fromNavbar = useMobileMenu()
    const fromTabBar = useMobileMenu()

    fromTabBar.toggle()
    expect(fromNavbar.isOpen.value).toBe(true)
    fromNavbar.close()
    expect(fromTabBar.isOpen.value).toBe(false)
  })

  it('keeps the bar away while any page mode asks, and lets go with its scope', async () => {
    const selecting = ref(false)
    const editing = ref(false)
    const first = effectScope()
    const second = effectScope()
    first.run(() => useSuppressTabBar(selecting))
    second.run(() => useSuppressTabBar(() => editing.value))

    expect(isTabBarSuppressed()).toBe(false)

    selecting.value = true
    editing.value = true
    await nextTick()
    expect(isTabBarSuppressed()).toBe(true)

    selecting.value = false
    await nextTick()
    expect(isTabBarSuppressed()).toBe(true)

    second.stop()
    expect(isTabBarSuppressed()).toBe(false)
    first.stop()
  })
})

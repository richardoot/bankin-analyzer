<script setup lang="ts">
  import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
  import { useRoute } from 'vue-router'
  import {
    TAB_BAR_LINKS,
    isTabBarPath,
    useMobileMenu,
    useTabBar,
  } from '@/composables/useMobileNavigation'
  import { useMediaQuery } from '@/composables/useMediaQuery'
  import IconSquares from '@/components/icons/IconSquares.vue'
  import IconArrowsRightLeft from '@/components/icons/IconArrowsRightLeft.vue'
  import IconChartPie from '@/components/icons/IconChartPie.vue'
  import IconArrowPath from '@/components/icons/IconArrowPath.vue'
  import IconDots from '@/components/icons/IconDots.vue'

  /**
   * The bottom tab bar below lg: the four screens of every day one tap
   * away, « Plus » for the rest (the same menu the hamburger opens on the
   * pages without this bar). Opaque, above the home indicator, never under
   * a modal (BaseModal teleports after it at the same z-50) nor over a
   * toast (z-60, lifted by `--tab-bar-space`).
   *
   * Its presence is what reserves the room under the page: style.css
   * gives `--tab-bar-space` a height while `[data-tab-bar]` is in the
   * document, and the layout pads by it. Hidden while a text field has the
   * focus on a touch screen, so it never rides up on the virtual keyboard —
   * hidden, not removed: the reserved room stays and the page does not
   * jump.
   */
  const route = useRoute()
  const { shown } = useTabBar()
  const menu = useMobileMenu()

  const ICONS = {
    '/dashboard': IconSquares,
    '/transactions': IconArrowsRightLeft,
    '/budget': IconChartPie,
    '/recurrences': IconArrowPath,
  } as const

  const tabs = TAB_BAR_LINKS.map(link => ({ ...link, icon: ICONS[link.to] }))

  const isActive = (path: string): boolean => route.path.startsWith(path)

  /**
   * « Plus » reads as where you are when the page lives in the menu, and
   * while the menu is open — the current tab then steps back to gray (it
   * keeps `aria-current`: it is still the page), so one tab is lit at a time.
   */
  const isMoreActive = computed(
    () => menu.isOpen.value || !isTabBarPath(route.path)
  )

  const isTouch = useMediaQuery('(pointer: coarse)')
  const isTyping = ref(false)

  const NON_TEXT_INPUTS = new Set([
    'button',
    'checkbox',
    'color',
    'file',
    'image',
    'radio',
    'range',
    'reset',
    'submit',
  ])

  function opensKeyboard(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false
    if (target.isContentEditable || target.tagName === 'TEXTAREA') return true
    if (target instanceof HTMLInputElement) {
      return !NON_TEXT_INPUTS.has(target.type)
    }
    return false
  }

  const onFocusIn = (event: FocusEvent): void => {
    isTyping.value = opensKeyboard(event.target)
  }
  const onFocusOut = (event: FocusEvent): void => {
    isTyping.value = opensKeyboard(event.relatedTarget)
  }

  onMounted(() => {
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
  })
  onBeforeUnmount(() => {
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('focusout', onFocusOut)
  })

  const tabClass = (active: boolean): string =>
    active
      ? 'text-primary-700 dark:text-primary-400'
      : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100'
</script>

<template>
  <nav
    v-if="shown"
    v-show="!(isTouch && isTyping)"
    data-tab-bar
    data-testid="tab-bar"
    aria-label="Onglets"
    class="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-700 dark:bg-slate-900"
  >
    <!-- 3.5rem with its top border, the room style.css reserves. -->
    <ul class="mx-auto flex h-[calc(3.5rem-1px)] max-w-xl items-stretch">
      <li v-for="tab in tabs" :key="tab.to" class="flex-1">
        <RouterLink
          :to="tab.to"
          :data-testid="tab.testId"
          :aria-current="isActive(tab.to) ? 'page' : undefined"
          class="flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
          :class="tabClass(isActive(tab.to) && !menu.isOpen.value)"
          @click="menu.close()"
        >
          <component :is="tab.icon" class="h-6 w-6" />
          {{ tab.label }}
        </RouterLink>
      </li>
      <li class="flex-1">
        <button
          type="button"
          data-testid="tab-bar-more"
          aria-controls="mobile-menu"
          :aria-expanded="menu.isOpen.value"
          class="flex h-full min-h-[44px] w-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium leading-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-500"
          :class="tabClass(isMoreActive)"
          @click="menu.toggle()"
        >
          <IconDots class="h-6 w-6" />
          Plus
        </button>
      </li>
    </ul>
  </nav>
</template>

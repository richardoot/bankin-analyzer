import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/**
 * A reactive answer to one CSS media query. Layout still belongs to
 * Tailwind's responsive classes; this is for the few places where the
 * *behavior* differs by width — a filter bar that starts collapsed on a
 * phone and open on a desk. Without `matchMedia` (tests, SSR) it answers
 * `false`, so a component falls back to its desktop behavior there.
 */
export function useMediaQuery(query: string): Ref<boolean> {
  // Read synchronously so the first render is already right — a phone must
  // never paint the desktop layout for a frame before folding it.
  const list: MediaQueryList | null =
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia(query)
      : null
  const matches = ref(list?.matches ?? false)

  const update = (event: { matches: boolean }): void => {
    matches.value = event.matches
  }

  onMounted(() => {
    list?.addEventListener('change', update)
  })

  onBeforeUnmount(() => {
    list?.removeEventListener('change', update)
  })

  return matches
}

/** Tailwind's `md` breakpoint, from the other side: true below 768px. */
export function useIsMobile(): Ref<boolean> {
  return useMediaQuery('(max-width: 767.98px)')
}

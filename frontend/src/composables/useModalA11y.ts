import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue'

/**
 * Keyboard and focus behavior every modal owes its user, in one place:
 *
 * - Escape closes the dialog,
 * - focus moves into the dialog when it opens,
 * - Tab cycles inside it instead of reaching the page behind,
 * - focus returns to the element that opened it when it closes,
 * - the page behind stops scrolling while it is open.
 *
 * Sixteen modal layers each reimplemented their markup; none implemented any
 * of this. The composable carries the behavior so a modal only declares its
 * panel element and its close callback.
 *
 * Dialogs stack (a settlement modal can open a confirmation on top), so a
 * module-level stack decides which dialog Escape and Tab belong to: always
 * the topmost, never both.
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/** Open dialogs, bottom to top. */
const stack: symbol[] = []

/** One scroll lock shared by all open dialogs. */
let scrollLocks = 0
let previousBodyOverflow = ''

function lockScroll(): void {
  if (scrollLocks === 0) {
    previousBodyOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
  }
  scrollLocks++
}

function unlockScroll(): void {
  scrollLocks = Math.max(0, scrollLocks - 1)
  if (scrollLocks === 0) {
    document.body.style.overflow = previousBodyOverflow
  }
}

export interface ModalA11yOptions {
  /** Whether the dialog is currently open. */
  isOpen: () => boolean
  /** Asked to close (Escape). The dialog decides whether it may. */
  onClose: () => void
  /** The dialog panel; focus is kept inside this element. */
  panel: Ref<HTMLElement | null>
}

export function useModalA11y(options: ModalA11yOptions): void {
  const id = Symbol('modal')
  let opener: HTMLElement | null = null
  let active = false

  function focusables(): HTMLElement[] {
    const panel = options.panel.value
    if (!panel) return []
    return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      el => el.offsetParent !== null || el === document.activeElement
    )
  }

  function handleKeydown(event: KeyboardEvent): void {
    // Only the topmost dialog listens; a stacked confirmation must not close
    // the modal underneath it with the same keypress.
    if (stack[stack.length - 1] !== id) return

    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      options.onClose()
      return
    }

    if (event.key === 'Tab') {
      const items = focusables()
      if (items.length === 0) {
        event.preventDefault()
        return
      }
      const first = items[0]
      const last = items[items.length - 1]
      const current = document.activeElement as HTMLElement | null
      const inside = current !== null && items.includes(current)

      if (!inside) {
        event.preventDefault()
        first?.focus()
      } else if (event.shiftKey && current === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && current === last) {
        event.preventDefault()
        first?.focus()
      }
    }
  }

  function activate(): void {
    if (active) return
    active = true
    stack.push(id)
    opener = document.activeElement as HTMLElement | null
    lockScroll()
    document.addEventListener('keydown', handleKeydown, true)
    // The panel renders behind a v-if, so it only exists after this tick.
    void nextTick(() => {
      const items = focusables()
      const target = items[0] ?? options.panel.value
      target?.focus?.()
    })
  }

  function deactivate(): void {
    if (!active) return
    active = false
    const index = stack.indexOf(id)
    if (index !== -1) stack.splice(index, 1)
    document.removeEventListener('keydown', handleKeydown, true)
    unlockScroll()
    // Give the keyboard back where it was taken from — if that element is
    // still on the page.
    if (opener && document.contains(opener)) {
      opener.focus()
    }
    opener = null
  }

  watch(options.isOpen, open => (open ? activate() : deactivate()), {
    immediate: true,
  })

  // A dialog unmounted while open (route change under it) must still release
  // the scroll lock and the listener.
  onBeforeUnmount(deactivate)
}

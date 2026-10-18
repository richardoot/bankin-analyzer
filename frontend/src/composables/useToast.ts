import { ref } from 'vue'

export interface Toast {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

const toasts = ref<Toast[]>([])
let nextId = 0

/**
 * How long a toast stays, by what it says. A confirmation is glanced at; an
 * error has to be read — often a sentence from the server — so it stays
 * twice as long, and any message gets more time as it grows.
 */
const BASE_DURATION: Record<Toast['type'], number> = {
  success: 4000,
  info: 6000,
  error: 8000,
}
const SHORT_MESSAGE = 60
const MS_PER_EXTRA_CHAR = 60
const MAX_DURATION = 15000

export function toastDuration(type: Toast['type'], message: string): number {
  const extra = Math.max(0, message.length - SHORT_MESSAGE) * MS_PER_EXTRA_CHAR
  return Math.min(BASE_DURATION[type] + extra, MAX_DURATION)
}

/** The countdown of each toast, so hovering one can hold it. */
interface Countdown {
  remaining: number
  startedAt: number
  timer: ReturnType<typeof setTimeout> | null
}
const countdowns = new Map<number, Countdown>()

function start(id: number): void {
  const countdown = countdowns.get(id)
  if (!countdown || countdown.timer !== null) return
  countdown.startedAt = Date.now()
  countdown.timer = setTimeout(() => removeToast(id), countdown.remaining)
}

function addToast(
  message: string,
  type: Toast['type'] = 'info',
  duration = toastDuration(type, message)
): void {
  const id = nextId++
  toasts.value.push({ id, message, type })
  countdowns.set(id, { remaining: duration, startedAt: 0, timer: null })
  start(id)
}

function removeToast(id: number): void {
  const countdown = countdowns.get(id)
  if (countdown?.timer) clearTimeout(countdown.timer)
  countdowns.delete(id)
  toasts.value = toasts.value.filter(t => t.id !== id)
}

/** Hold a toast while the pointer or the focus is on it. */
function pauseToast(id: number): void {
  const countdown = countdowns.get(id)
  if (!countdown || countdown.timer === null) return
  clearTimeout(countdown.timer)
  countdown.timer = null
  countdown.remaining = Math.max(
    0,
    countdown.remaining - (Date.now() - countdown.startedAt)
  )
}

/** Let it go again, for what was left of its time. */
function resumeToast(id: number): void {
  start(id)
}

export function useToast() {
  return {
    toasts,
    success: (message: string) => addToast(message, 'success'),
    error: (message: string) => addToast(message, 'error'),
    info: (message: string) => addToast(message, 'info'),
    remove: removeToast,
    pause: pauseToast,
    resume: resumeToast,
  }
}

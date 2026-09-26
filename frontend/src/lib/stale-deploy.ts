/**
 * A tab that outlived its deployment.
 *
 * Every screen is loaded on demand from a file named after a hash of its
 * content. A deployment renames them all and the CDN forgets the old
 * ones; a tab opened before it still holds the old names, and the first
 * screen it has not visited yet fails with "Failed to fetch dynamically
 * imported module". Nothing is wrong with the code — the tab is stale.
 *
 * The remedy is a reload: the tab fetches the new index and the new
 * names, and the navigation goes through. Once, guarded, so a CDN that is
 * genuinely down produces one reload and then the error, not a loop.
 *
 * Two ways the failure surfaces, both handled: Vite dispatches
 * `vite:preloadError` from its import helper (preventDefault stops it
 * from throwing), and vue-router reports what still escapes to
 * `onError`.
 */
import * as Sentry from '@sentry/vue'
import type { Router } from 'vue-router'

/** Chrome, Firefox and Safari each word it differently. */
const STALE_CHUNK_MESSAGE =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i

export function isStaleChunkError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : ''
  return STALE_CHUNK_MESSAGE.test(message)
}

const RELOAD_MARK = 'stale-deploy-reloaded-at'
/** A second failure within this window is not staleness; let it show. */
export const RELOAD_GUARD_MS = 30_000

export interface RecoveryDeps {
  reload: () => void
  storage: Pick<Storage, 'getItem' | 'setItem'> | null
  now: () => number
}

function browserDeps(): RecoveryDeps {
  let storage: RecoveryDeps['storage'] = null
  try {
    storage = window.sessionStorage
  } catch {
    // Private mode or blocked storage: recover without the guard's memory,
    // which means at most one reload per page lifetime anyway.
  }
  return {
    reload: () => window.location.reload(),
    storage,
    now: () => Date.now(),
  }
}

/**
 * Reload once, unless we just did. Returns whether a reload was started,
 * so the caller can swallow the error it is about to replace.
 */
export function recoverFromStaleDeploy(
  deps: RecoveryDeps = browserDeps()
): boolean {
  const last = Number(deps.storage?.getItem(RELOAD_MARK) ?? 0)
  if (last && deps.now() - last < RELOAD_GUARD_MS) return false
  try {
    deps.storage?.setItem(RELOAD_MARK, String(deps.now()))
  } catch {
    // Storage full or refused: still reload; the guard is best effort.
  }
  // Counted, not alarmed: a deployment produces a few of these by nature.
  Sentry.captureMessage('Stale deployment: reloading the tab', {
    level: 'info',
    fingerprint: ['stale-deploy-reload'],
  })
  deps.reload()
  return true
}

export function installStaleDeployRecovery(router: Router): void {
  window.addEventListener('vite:preloadError', event => {
    if (recoverFromStaleDeploy()) event.preventDefault()
  })
  router.onError(error => {
    if (isStaleChunkError(error)) recoverFromStaleDeploy()
  })
}

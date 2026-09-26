/**
 * The first screen's code, fetched while the session is being checked.
 *
 * Every screen is loaded on demand, and vue-router only asks for one
 * once its guards have let the navigation through. The auth guard waits
 * for Supabase to confirm the session, so on a cold load the screen's
 * file is requested only after that answer: two waits in a row that
 * could be one. Resolving the current URL against the route table gives
 * the very loader the router will call; calling it now warms the module
 * cache, and the router's own call resolves at once.
 *
 * A URL that only redirects matches nothing and preloads nothing. A
 * screen the guard then refuses costs one unused file. A fetch that
 * fails is left to the router, which reports it — through the
 * stale-deploy recovery when that is what it was.
 */
import type { RouteComponent, Router } from 'vue-router'

/** vue-router's own distinction between a component and its loader. */
function isLoader(
  component: RouteComponent | (() => Promise<unknown>)
): component is () => Promise<unknown> {
  return (
    typeof component === 'function' &&
    !('displayName' in component) &&
    !('props' in component) &&
    !('__vccOpts' in component)
  )
}

export function preloadRouteComponents(router: Router, location: string): void {
  for (const record of router.resolve(location).matched) {
    for (const component of Object.values(record.components ?? {})) {
      if (isLoader(component)) {
        void component().catch(() => undefined)
      }
    }
  }
}

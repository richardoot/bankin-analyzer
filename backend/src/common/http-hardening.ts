/**
 * What the HTTP layer promises the browser, decided in one place.
 *
 * Two decisions live here, and they are really one decision:
 *
 * - Whether Swagger is served. `/api/docs` publishes the complete map of the
 *   API — every route, every DTO — to anyone who asks, unauthenticated. That
 *   is a gift in development and a reconnaissance report in production, so it
 *   is served only outside production, with `API_DOCS=1` as the explicit
 *   override for the day a production instance genuinely needs it.
 *
 * - What helmet sends. The strict profile is what an API should say: a CSP
 *   that forbids everything (these responses are JSON, nothing needs to
 *   execute), plus helmet's defaults. Swagger UI is the one page that cannot
 *   live under that CSP — it is an HTML app served from the API origin — so
 *   the relaxed profile exists for exactly as long as the docs do, and the
 *   two switch together on the same flag.
 *
 * Pure functions over `process.env`-shaped input, so the policy is assertable
 * in a spec without booting Nest.
 */
import type { HelmetOptions } from 'helmet'

export interface HardeningEnv {
  NODE_ENV?: string | undefined
  API_DOCS?: string | undefined
}

/** Whether `/api/docs` (and the relaxed CSP it drags in) is served. */
export function apiDocsEnabled(env: HardeningEnv): boolean {
  if (env.API_DOCS === '1') return true
  return env.NODE_ENV !== 'production'
}

/**
 * The helmet profile matching that decision.
 *
 * With docs off, everything is JSON and the CSP can deny all sources — its
 * only work on an API is neutralising a response that somehow gets rendered.
 * With docs on, CSP and COEP go back off, which is the configuration this
 * backend always ran with in development.
 */
export function helmetOptions(docsEnabled: boolean): HelmetOptions {
  if (docsEnabled) {
    return {
      contentSecurityPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginEmbedderPolicy: false,
    }
  }
  return {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
      },
    },
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  }
}

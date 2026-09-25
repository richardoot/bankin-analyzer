import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { fileURLToPath, URL } from 'node:url'

/**
 * HTTPS is opt-in, enabled with `VITE_HTTPS=1 pnpm dev`.
 *
 * The bank authorization flow (Enable Banking) only accepts an `https://`
 * redirect URL, so `/bank-callback` needs TLS to be reachable at all. Turning
 * it on for every dev session would be the wrong trade: `http://localhost:5173`
 * is what the Supabase OAuth redirect and the backend's CORS allowlist are
 * registered against, and switching schemes breaks the login instead.
 *
 * The certificate is self-signed, so the browser warns once per session. That
 * is expected and harmless here — the redirect only carries an authorization
 * code back to a page running on the developer's own machine.
 */
const useHttps = process.env.VITE_HTTPS === '1'

/**
 * The port is overridable because 5173 is not always free: the podman stack
 * publishes the built frontend there through nginx. Running the dev server on
 * another port lets the two coexist instead of forcing the container down.
 */
const port = Number(process.env.VITE_PORT ?? 5173)

/**
 * Under TLS the whole stack has to be reachable over TLS.
 *
 * A page served over https may not call an http API — the browser blocks it as
 * mixed content, which is what made the first callback page render nothing at
 * all. So `VITE_HTTPS=1` also moves the API and Supabase to their TLS ports,
 * unless the environment says otherwise: Kong already listens on 8443, and the
 * backend does once started with `BACKEND_HTTPS=1`.
 */
const httpsDefines = useHttps
  ? {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        process.env.VITE_API_URL ?? 'https://localhost:3443'
      ),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        process.env.VITE_SUPABASE_URL ?? 'https://localhost:8443'
      ),
    }
  : {}

/**
 * Source maps go to Sentry, never to the CDN.
 *
 * With SENTRY_AUTH_TOKEN set (the Vercel build), the build emits hidden
 * maps, the plugin uploads them under the deployment's commit as release
 * name — the same value the SDK reports at runtime — and deletes them from
 * dist before Vercel publishes it. Without the token (a desk, a CI without
 * secrets) no map is produced at all, so nothing can be served by mistake.
 */
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

function sentryPlugins(): PluginOption[] {
  const authToken = process.env.SENTRY_AUTH_TOKEN
  if (!authToken) return []
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  if (!org || !project) {
    // Loudly, at build time: a token without a destination would upload
    // nothing and say nothing, and the first stack trace would be minified.
    throw new Error(
      'SENTRY_AUTH_TOKEN is set but SENTRY_ORG or SENTRY_PROJECT is missing.'
    )
  }
  const commit = process.env.VERCEL_GIT_COMMIT_SHA
  return [
    sentryVitePlugin({
      org,
      project,
      authToken,
      ...(commit ? { release: { name: commit } } : {}),
      sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
      telemetry: false,
    }),
  ]
}

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    ...(useHttps ? [basicSsl()] : []),
    // Last, as its documentation asks.
    ...sentryPlugins(),
  ],
  define: httpsDefines,
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port,
    // Fail rather than hop to the next free port. A silent hop would serve the
    // app somewhere the bank's registered redirect URL does not point, and the
    // authorization would come back to nothing.
    strictPort: true,
  },
})

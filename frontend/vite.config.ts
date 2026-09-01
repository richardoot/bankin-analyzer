import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import basicSsl from '@vitejs/plugin-basic-ssl'
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

export default defineConfig({
  plugins: [vue(), tailwindcss(), ...(useHttps ? [basicSsl()] : [])],
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

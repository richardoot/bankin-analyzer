import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { installSentry, setSentryUser } from './lib/sentry'
import { installStaleDeployRecovery } from './lib/stale-deploy'
import { preloadRouteComponents } from './lib/route-preload'
// Import supabase early to validate environment variables at startup
import './lib/supabase'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

// Before the router is installed, so that the first navigation is traced.
installSentry(app, router)

// A tab opened before a deployment asks for screens that no longer exist
// under their old names; reload it once instead of leaving it stuck.
installStaleDeployRecovery(router)

app.use(pinia)
app.use(router)

// Initialize theme store (applies dark mode class)
const themeStore = useThemeStore()
themeStore.initialize()

// Initialize auth store before mounting
const authStore = useAuthStore()

// Sentry knows the user as an id, from sign-in to sign-out.
watch(
  () => authStore.user?.id,
  id => setSentryUser(id),
  { immediate: true }
)
// The first screen's code downloads while Supabase confirms the session,
// instead of after.
preloadRouteComponents(router, router.options.history.location)

authStore.initialize().then(() => {
  app.mount('#app')
})

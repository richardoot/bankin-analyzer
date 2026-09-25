import { createApp, watch } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
import { useThemeStore } from './stores/theme'
import { installSentry, setSentryUser } from './lib/sentry'
// Import supabase early to validate environment variables at startup
import './lib/supabase'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

// Before the router is installed, so that the first navigation is traced.
installSentry(app, router)

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
authStore.initialize().then(() => {
  app.mount('#app')
})

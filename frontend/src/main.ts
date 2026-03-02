import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'
// Import supabase early to validate environment variables at startup
import './lib/supabase'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Initialize auth store before mounting
const authStore = useAuthStore()
authStore.initialize().then(() => {
  app.mount('#app')
})

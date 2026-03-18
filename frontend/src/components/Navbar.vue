<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import { useThemeStore } from '@/stores/theme'
  import UserDropdown from '@/components/UserDropdown.vue'

  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()
  const themeStore = useThemeStore()

  const isMobileMenuOpen = ref(false)

  const isAuthenticated = computed(() => authStore.isAuthenticated)
  const userEmail = computed(() => authStore.user?.email)
  const loading = computed(() => authStore.loading)

  // Navigation principale (réduite - les autres liens sont dans le dropdown profil)
  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/import', label: 'Import' },
    { to: '/reimbursements', label: 'Remboursements' },
  ]

  // Liens supplémentaires pour le menu mobile (inclus dans le dropdown sur desktop)
  const accountLinks = [
    { to: '/profile', label: 'Mon profil' },
    { to: '/preferences', label: 'Preferences' },
    { to: '/import/history', label: 'Historique des imports' },
  ]

  const isActiveRoute = (path: string): boolean => {
    if (path === '/import') {
      return route.path === '/import'
    }
    return route.path.startsWith(path)
  }

  const toggleMobileMenu = (): void => {
    isMobileMenuOpen.value = !isMobileMenuOpen.value
  }

  const closeMobileMenu = (): void => {
    isMobileMenuOpen.value = false
  }

  const handleSignOut = async (): Promise<void> => {
    await authStore.signOut()
    closeMobileMenu()
    await router.push('/')
  }
</script>

<template>
  <nav
    class="sticky top-0 z-50 bg-white dark:bg-slate-900 shadow-sm dark:shadow-slate-800/20 transition-colors"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <!-- Logo + Navigation -->
        <div class="flex items-center gap-8">
          <!-- Logo -->
          <RouterLink
            to="/"
            class="flex items-center gap-2"
            @click="closeMobileMenu"
          >
            <svg
              class="h-8 w-8 text-emerald-600 dark:text-emerald-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
            <span
              class="text-xl font-semibold text-slate-900 dark:text-slate-100"
              >Finance Analyzer</span
            >
          </RouterLink>

          <!-- Desktop Navigation Links -->
          <div v-if="isAuthenticated" class="hidden items-center gap-1 md:flex">
            <RouterLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="rounded-md px-3 py-2 text-sm font-medium transition-colors"
              :class="
                isActiveRoute(link.to)
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              "
            >
              {{ link.label }}
            </RouterLink>
          </div>
        </div>

        <!-- Desktop User Actions -->
        <div class="hidden items-center gap-4 md:flex">
          <!-- Theme Toggle -->
          <button
            type="button"
            class="rounded-md p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            aria-label="Changer le theme"
            @click="themeStore.toggle()"
          >
            <!-- Sun icon (shown in dark mode) -->
            <svg
              v-if="themeStore.isDark"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <!-- Moon icon (shown in light mode) -->
            <svg
              v-else
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          </button>

          <template v-if="isAuthenticated">
            <UserDropdown />
          </template>
          <template v-else>
            <RouterLink
              to="/login"
              class="rounded-md px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Se connecter
            </RouterLink>
            <RouterLink
              to="/login?signup=true"
              class="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
            >
              S'inscrire
            </RouterLink>
          </template>
        </div>

        <!-- Mobile menu button -->
        <div class="flex items-center gap-2 md:hidden">
          <!-- Mobile Theme Toggle -->
          <button
            type="button"
            class="rounded-md p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            aria-label="Changer le theme"
            @click="themeStore.toggle()"
          >
            <svg
              v-if="themeStore.isDark"
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
              />
            </svg>
            <svg
              v-else
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
              />
            </svg>
          </button>

          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md p-2 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            @click="toggleMobileMenu"
          >
            <span class="sr-only">Ouvrir le menu</span>
            <svg
              v-if="!isMobileMenuOpen"
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <svg
              v-else
              class="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <div
      v-if="isMobileMenuOpen"
      class="border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 md:hidden"
    >
      <div class="px-4 py-3">
        <template v-if="isAuthenticated">
          <!-- User info -->
          <div
            class="border-b border-slate-100 dark:border-slate-800 px-3 py-3 mb-2"
          >
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
              Connecte en tant que
            </p>
            <p class="truncate text-sm text-slate-500 dark:text-slate-400">
              {{ userEmail }}
            </p>
          </div>

          <!-- Navigation links -->
          <div class="space-y-1">
            <RouterLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              class="block rounded-md px-3 py-2 text-base font-medium transition-colors"
              :class="
                isActiveRoute(link.to)
                  ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              "
              @click="closeMobileMenu"
            >
              {{ link.label }}
            </RouterLink>
          </div>

          <!-- Account section -->
          <div
            class="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800"
          >
            <p
              class="px-3 mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500"
            >
              Mon compte
            </p>
            <div class="space-y-1">
              <RouterLink
                v-for="link in accountLinks"
                :key="link.to"
                :to="link.to"
                class="block rounded-md px-3 py-2 text-base font-medium transition-colors"
                :class="
                  isActiveRoute(link.to)
                    ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                "
                @click="closeMobileMenu"
              >
                {{ link.label }}
              </RouterLink>
            </div>
          </div>

          <!-- Sign out -->
          <button
            type="button"
            :disabled="loading"
            class="mt-4 w-full rounded-md border border-slate-200 dark:border-slate-700 px-3 py-2 text-base font-medium text-red-600 dark:text-red-400 transition-colors hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50"
            @click="handleSignOut"
          >
            Deconnexion
          </button>
        </template>
        <template v-else>
          <RouterLink
            to="/login"
            class="block rounded-md px-3 py-2 text-base font-medium text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            @click="closeMobileMenu"
          >
            Se connecter
          </RouterLink>
          <RouterLink
            to="/login?signup=true"
            class="mt-2 block rounded-md bg-emerald-600 px-3 py-2 text-center text-base font-medium text-white transition-colors hover:bg-emerald-700"
            @click="closeMobileMenu"
          >
            S'inscrire
          </RouterLink>
        </template>
      </div>
    </div>
  </nav>
</template>

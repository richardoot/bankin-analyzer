<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const route = useRoute()
  const authStore = useAuthStore()

  const isMobileMenuOpen = ref(false)

  const isAuthenticated = computed(() => authStore.isAuthenticated)
  const userEmail = computed(() => authStore.user?.email)
  const loading = computed(() => authStore.loading)

  const navLinks = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/import', label: 'Import' },
    { to: '/import/history', label: 'Historique' },
    { to: '/reimbursements', label: 'Remboursements' },
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
  <nav class="sticky top-0 z-50 bg-white shadow-sm">
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
              class="h-8 w-8 text-emerald-600"
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
            <span class="text-xl font-semibold text-slate-900"
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
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              "
            >
              {{ link.label }}
            </RouterLink>
          </div>
        </div>

        <!-- Desktop User Actions -->
        <div class="hidden items-center gap-4 md:flex">
          <template v-if="isAuthenticated">
            <RouterLink
              to="/profile"
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-700"
            >
              <svg
                class="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {{ userEmail }}
            </RouterLink>
            <button
              type="button"
              :disabled="loading"
              class="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              @click="handleSignOut"
            >
              Deconnexion
            </button>
          </template>
          <template v-else>
            <RouterLink
              to="/login"
              class="rounded-md px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
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
        <div class="md:hidden">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md p-2 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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
      class="border-t border-slate-100 bg-white md:hidden"
    >
      <div class="space-y-1 px-4 py-3">
        <template v-if="isAuthenticated">
          <!-- User info -->
          <div class="border-b border-slate-100 px-3 py-3">
            <p class="text-sm font-medium text-slate-900">
              Connecte en tant que
            </p>
            <p class="truncate text-sm text-slate-500">{{ userEmail }}</p>
          </div>

          <!-- Navigation links -->
          <RouterLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="block rounded-md px-3 py-2 text-base font-medium transition-colors"
            :class="
              isActiveRoute(link.to)
                ? 'bg-emerald-50 text-emerald-700'
                : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            "
            @click="closeMobileMenu"
          >
            {{ link.label }}
          </RouterLink>

          <!-- Profile link -->
          <RouterLink
            to="/profile"
            class="block rounded-md px-3 py-2 text-base font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            @click="closeMobileMenu"
          >
            Mon profil
          </RouterLink>

          <!-- Sign out -->
          <button
            type="button"
            :disabled="loading"
            class="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-base font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50"
            @click="handleSignOut"
          >
            Deconnexion
          </button>
        </template>
        <template v-else>
          <RouterLink
            to="/login"
            class="block rounded-md px-3 py-2 text-base font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
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

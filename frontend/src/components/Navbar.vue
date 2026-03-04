<script setup lang="ts">
  import { ref, computed } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()

  const isMobileMenuOpen = ref(false)

  const isAuthenticated = computed(() => authStore.isAuthenticated)
  const userEmail = computed(() => authStore.user?.email)
  const loading = computed(() => authStore.loading)

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
  <nav class="bg-white border-b border-gray-200">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="flex h-16 items-center justify-between">
        <!-- Logo -->
        <div class="flex items-center">
          <RouterLink
            to="/"
            class="flex items-center gap-2"
            @click="closeMobileMenu"
          >
            <svg
              class="h-8 w-8 text-emerald-500"
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
            <span class="text-xl font-bold text-gray-900"
              >Finance Analyzer</span
            >
          </RouterLink>
        </div>

        <!-- Desktop Navigation -->
        <div class="hidden md:flex md:items-center md:gap-4">
          <template v-if="isAuthenticated">
            <span class="text-sm text-gray-600">{{ userEmail }}</span>
            <RouterLink
              to="/dashboard"
              class="rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            >
              Dashboard
            </RouterLink>
            <RouterLink
              to="/import"
              class="rounded-lg border border-indigo-500 bg-indigo-50 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            >
              Import CSV
            </RouterLink>
            <RouterLink
              to="/profile"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Mon profil
            </RouterLink>
            <button
              type="button"
              :disabled="loading"
              class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
              @click="handleSignOut"
            >
              Deconnexion
            </button>
          </template>
          <template v-else>
            <RouterLink
              to="/login"
              class="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Se connecter
            </RouterLink>
            <RouterLink
              to="/login?signup=true"
              class="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
            >
              S'inscrire
            </RouterLink>
          </template>
        </div>

        <!-- Mobile menu button -->
        <div class="md:hidden">
          <button
            type="button"
            class="inline-flex items-center justify-center rounded-md p-2 text-gray-700 hover:bg-gray-100"
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
    <div v-if="isMobileMenuOpen" class="md:hidden border-t border-gray-200">
      <div class="space-y-2 px-4 py-4">
        <template v-if="isAuthenticated">
          <p class="px-4 py-2 text-sm text-gray-600">{{ userEmail }}</p>
          <RouterLink
            to="/dashboard"
            class="block w-full rounded-lg border border-emerald-500 bg-emerald-50 px-4 py-2 text-center text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
            @click="closeMobileMenu"
          >
            Dashboard
          </RouterLink>
          <RouterLink
            to="/import"
            class="block w-full rounded-lg border border-indigo-500 bg-indigo-50 px-4 py-2 text-center text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
            @click="closeMobileMenu"
          >
            Import CSV
          </RouterLink>
          <RouterLink
            to="/profile"
            class="block w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            @click="closeMobileMenu"
          >
            Mon profil
          </RouterLink>
          <button
            type="button"
            :disabled="loading"
            class="w-full rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600 transition-colors disabled:opacity-50"
            @click="handleSignOut"
          >
            Deconnexion
          </button>
        </template>
        <template v-else>
          <RouterLink
            to="/login"
            class="block w-full rounded-lg border border-gray-300 px-4 py-2 text-center text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            @click="closeMobileMenu"
          >
            Se connecter
          </RouterLink>
          <RouterLink
            to="/login?signup=true"
            class="block w-full rounded-lg bg-emerald-500 px-4 py-2 text-center text-sm font-medium text-white hover:bg-emerald-600 transition-colors"
            @click="closeMobileMenu"
          >
            S'inscrire
          </RouterLink>
        </template>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
  import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
  import { useRouter, useRoute } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import { useThemeStore } from '@/stores/theme'
  import UserDropdown from '@/components/UserDropdown.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import IconSun from '@/components/icons/IconSun.vue'
  import IconMoon from '@/components/icons/IconMoon.vue'
  import IconMenu from '@/components/icons/IconMenu.vue'
  import IconClose from '@/components/icons/IconClose.vue'

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
    { to: '/dashboard', label: 'Dashboard', testId: 'nav-dashboard-link' },
    // « Comptes » : consulter ses comptes et synchroniser — couvre aussi
    // l'import CSV et les historiques, qui alimentent ces mêmes comptes.
    { to: '/accounts', label: 'Comptes', testId: 'nav-accounts-link' },
    {
      to: '/transactions',
      label: 'Transactions',
      testId: 'nav-transactions-link',
    },
    {
      to: '/reimbursements',
      label: 'Remboursements',
      testId: 'nav-reimbursements-link',
    },
    { to: '/budget', label: 'Budget', testId: 'nav-budget-link' },
    {
      to: '/recurrences',
      label: 'Récurrences',
      testId: 'nav-recurrences-link',
    },
    { to: '/tags', label: 'Étiquettes', testId: 'nav-tags-link' },
  ]

  // Liens supplémentaires pour le menu mobile (inclus dans le dropdown sur desktop)
  // Les historiques vivent sur la page Données, à côté de leurs sources.
  const accountLinks = [
    { to: '/profile', label: 'Mon profil' },
    { to: '/settings', label: 'Réglages' },
  ]

  const isActiveRoute = (path: string): boolean => {
    // Comptes couvre aussi ses pages profondes : import et historiques.
    if (path === '/accounts') {
      return (
        route.path.startsWith('/accounts') ||
        route.path.startsWith('/import') ||
        route.path.startsWith('/bank-sync')
      )
    }
    return route.path.startsWith(path)
  }

  const toggleMobileMenu = (): void => {
    isMobileMenuOpen.value = !isMobileMenuOpen.value
  }

  const closeMobileMenu = (): void => {
    isMobileMenuOpen.value = false
  }

  // The menu closes the way a phone user expects: Escape, a tap outside,
  // or simply arriving on the page they picked.
  watch(() => route.path, closeMobileMenu)
  const onKeydown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && isMobileMenuOpen.value) closeMobileMenu()
  }
  onMounted(() => document.addEventListener('keydown', onKeydown))
  onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))

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
        <div class="flex min-w-0 items-center gap-6 xl:gap-8">
          <!-- Logo -->
          <!-- The public homepage is for visitors; a signed-in user's home is
               their dashboard. -->
          <RouterLink
            :to="isAuthenticated ? '/dashboard' : '/'"
            data-testid="navbar-logo"
            class="flex shrink-0 items-center gap-2 whitespace-nowrap"
            @click="closeMobileMenu"
          >
            <svg
              class="h-8 w-8 text-primary-700 dark:text-primary-400"
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
              class="text-xl font-semibold text-slate-900 lg:max-xl:sr-only dark:text-slate-100"
              >Finance Analyzer</span
            >
          </RouterLink>

          <!-- Desktop Navigation Links -->
          <div
            v-if="isAuthenticated"
            class="hidden items-center gap-0.5 lg:flex xl:gap-1"
          >
            <RouterLink
              v-for="link in navLinks"
              :key="link.to"
              :to="link.to"
              :data-testid="link.testId"
              class="whitespace-nowrap rounded-md px-2.5 py-2 text-sm font-medium transition-colors xl:px-3"
              :class="
                isActiveRoute(link.to)
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
              "
            >
              {{ link.label }}
            </RouterLink>
          </div>
        </div>

        <!-- Desktop User Actions -->
        <div class="hidden items-center gap-4 lg:flex">
          <!-- Theme Toggle -->
          <BaseIconButton label="Changer le thème" @click="themeStore.toggle()">
            <IconSun v-if="themeStore.isDark" />
            <IconMoon v-else />
          </BaseIconButton>

          <template v-if="isAuthenticated">
            <UserDropdown />
          </template>
          <template v-else>
            <RouterLink
              to="/login"
              data-testid="nav-sign-in-link"
              class="rounded-md px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            >
              Se connecter
            </RouterLink>
            <BaseButton
              to="/login?signup=true"
              size="sm"
              data-testid="nav-sign-up-link"
            >
              S'inscrire
            </BaseButton>
          </template>
        </div>

        <!-- Mobile menu button -->
        <div class="flex items-center gap-2 lg:hidden">
          <!-- Mobile Theme Toggle -->
          <BaseIconButton label="Changer le thème" @click="themeStore.toggle()">
            <IconSun v-if="themeStore.isDark" />
            <IconMoon v-else />
          </BaseIconButton>

          <BaseIconButton
            data-testid="nav-mobile-menu-button"
            :aria-expanded="isMobileMenuOpen"
            aria-controls="mobile-menu"
            :label="isMobileMenuOpen ? 'Fermer le menu' : 'Ouvrir le menu'"
            @click="toggleMobileMenu"
          >
            <IconMenu v-if="!isMobileMenuOpen" class="h-6! w-6!" />
            <IconClose v-else class="h-6! w-6!" />
          </BaseIconButton>
        </div>
      </div>
    </div>

    <!-- Mobile menu -->
    <div
      v-if="isMobileMenuOpen"
      class="fixed inset-0 top-16 z-[-1] bg-black/30 lg:hidden"
      aria-hidden="true"
      @click="closeMobileMenu"
    />
    <div
      v-if="isMobileMenuOpen"
      id="mobile-menu"
      class="max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-t border-slate-100 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900"
    >
      <div class="px-4 py-3">
        <template v-if="isAuthenticated">
          <!-- User info -->
          <div
            class="border-b border-slate-100 dark:border-slate-800 px-3 py-3 mb-2"
          >
            <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
              Connecté en tant que
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
              class="block min-h-[44px] rounded-md px-3 py-2.5 text-base font-medium transition-colors"
              :class="
                isActiveRoute(link.to)
                  ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
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
                class="block min-h-[44px] rounded-md px-3 py-2.5 text-base font-medium transition-colors"
                :class="
                  isActiveRoute(link.to)
                    ? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100'
                "
                @click="closeMobileMenu"
              >
                {{ link.label }}
              </RouterLink>
            </div>
          </div>

          <!-- Sign out -->
          <BaseButton
            variant="danger-outline"
            block
            class="mt-4"
            :disabled="loading"
            @click="handleSignOut"
          >
            Déconnexion
          </BaseButton>
        </template>
        <template v-else>
          <RouterLink
            to="/login"
            class="block rounded-md px-3 py-2 text-base font-medium text-slate-600 dark:text-slate-400 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100"
            @click="closeMobileMenu"
          >
            Se connecter
          </RouterLink>
          <BaseButton
            to="/login?signup=true"
            block
            class="mt-2"
            @click="closeMobileMenu"
          >
            S'inscrire
          </BaseButton>
        </template>
      </div>
    </div>
  </nav>
</template>

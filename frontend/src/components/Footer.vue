<script setup lang="ts">
  const currentYear = new Date().getFullYear()
</script>

<template>
  <footer
    class="border-t border-gray-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-colors"
  >
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <!-- Logo and copyright -->
        <div class="flex items-center gap-2">
          <svg
            class="h-6 w-6 text-primary-500"
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
          <span class="text-sm text-gray-600 dark:text-gray-400">
            &copy; {{ currentYear }} Finance Analyzer. Tous droits réservés.
          </span>
        </div>

        <!-- The legal pages exist and are public: reachable from every page,
             not only from the Enable Banking tutorial that quotes them. -->
        <nav
          aria-label="Informations légales"
          class="flex items-center gap-6 text-sm"
        >
          <RouterLink
            to="/privacy"
            data-testid="footer-privacy-link"
            class="inline-flex min-h-[44px] items-center text-gray-600 hover:text-gray-900 hover:underline sm:min-h-0 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Confidentialité
          </RouterLink>
          <RouterLink
            to="/terms"
            data-testid="footer-terms-link"
            class="inline-flex min-h-[44px] items-center text-gray-600 hover:text-gray-900 hover:underline sm:min-h-0 dark:text-gray-400 dark:hover:text-gray-100"
          >
            Conditions d'utilisation
          </RouterLink>
        </nav>
      </div>
    </div>
  </footer>
</template>

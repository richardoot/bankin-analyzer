<script setup lang="ts">
  /**
   * Shell for the settings hub. Owns the page chrome — title, tab bar, page
   * width — so each tab only renders its own content and they all line up.
   */
  const tabs = [
    {
      to: '/settings/accounts',
      label: 'Comptes',
      testId: 'settings-tab-accounts',
    },
    {
      to: '/settings/categories',
      label: 'Catégories',
      testId: 'settings-tab-categories',
    },
    {
      to: '/settings/general',
      label: 'Général',
      testId: 'settings-tab-general',
    },
  ]
</script>

<template>
  <div
    class="min-h-[calc(100vh-4rem)] bg-gray-50 py-12 transition-colors dark:bg-slate-800"
  >
    <div class="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Réglages
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Vos comptes, vos catégories et vos préférences d'affichage
        </p>
      </div>

      <!-- Tab bar. Scrolls horizontally on narrow screens rather than wrapping,
           so the tabs keep reading as a single row. -->
      <nav
        class="mb-8 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        aria-label="Sections des réglages"
      >
        <ul
          class="inline-flex gap-1 rounded-xl border border-gray-200 bg-white p-1 dark:border-slate-700 dark:bg-slate-900"
        >
          <li v-for="tab in tabs" :key="tab.to">
            <RouterLink
              :to="tab.to"
              :data-testid="tab.testId"
              class="block whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors"
              active-class="bg-emerald-600 text-white dark:bg-emerald-600"
              exact-active-class="bg-emerald-600 text-white dark:bg-emerald-600"
              :class="
                $route.path.startsWith(tab.to)
                  ? ''
                  : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-800'
              "
            >
              {{ tab.label }}
            </RouterLink>
          </li>
        </ul>
      </nav>

      <RouterView />
    </div>
  </div>
</template>

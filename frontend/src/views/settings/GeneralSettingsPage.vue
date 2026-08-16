<script setup lang="ts">
  /**
   * The cross-cutting preferences that belong to neither accounts nor
   * categories: appearance, and the entry points to the pages that own the
   * user's data.
   */
  import { useThemeStore } from '@/stores/theme'
  import SettingsCard from '@/components/settings/SettingsCard.vue'

  const themeStore = useThemeStore()

  const THEME_MODES = [
    { value: 'light' as const, label: 'Clair', icon: '☀️' },
    { value: 'dark' as const, label: 'Sombre', icon: '🌙' },
    { value: 'system' as const, label: 'Système', icon: '💻' },
  ]

  const DATA_LINKS = [
    {
      to: '/import',
      label: 'Importer des transactions',
      description: 'Charger un nouvel export Bankin.',
    },
    {
      to: '/import/history',
      label: 'Historique des imports',
      description: 'Consulter et annuler un import passé.',
    },
    {
      to: '/profile',
      label: 'Mon profil',
      description: 'Votre compte utilisateur et sa suppression.',
    },
  ]
</script>

<template>
  <div class="space-y-8">
    <SettingsCard
      title="Apparence"
      description="Le thème est mémorisé sur cet appareil."
    >
      <div
        class="inline-flex flex-wrap gap-1 rounded-lg border border-gray-200 p-1 dark:border-slate-700"
        role="group"
        aria-label="Thème de l'interface"
      >
        <button
          v-for="mode in THEME_MODES"
          :key="mode.value"
          type="button"
          :aria-pressed="themeStore.mode === mode.value"
          class="rounded-md px-4 py-2 text-sm font-medium transition-colors"
          :class="
            themeStore.mode === mode.value
              ? 'bg-emerald-600 text-white'
              : 'text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-slate-700'
          "
          @click="themeStore.setMode(mode.value)"
        >
          <span class="mr-1">{{ mode.icon }}</span>
          {{ mode.label }}
        </button>
      </div>
    </SettingsCard>

    <SettingsCard
      title="Données"
      description="Vos transactions et votre compte utilisateur se gèrent depuis ces pages."
    >
      <ul class="space-y-2">
        <li v-for="link in DATA_LINKS" :key="link.to">
          <RouterLink
            :to="link.to"
            class="flex items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:bg-gray-50 dark:border-slate-700 dark:hover:bg-slate-800/50"
          >
            <span class="min-w-0 flex-1">
              <span
                class="block text-sm font-medium text-gray-900 dark:text-gray-100"
              >
                {{ link.label }}
              </span>
              <span class="block text-xs text-gray-500 dark:text-gray-400">
                {{ link.description }}
              </span>
            </span>
            <svg
              class="h-4 w-4 shrink-0 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </RouterLink>
        </li>
      </ul>
    </SettingsCard>
  </div>
</template>

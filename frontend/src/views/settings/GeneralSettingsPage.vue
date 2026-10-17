<script setup lang="ts">
  /**
   * The cross-cutting preferences that belong to neither accounts nor
   * categories: appearance, and the entry points to the pages that own the
   * user's data.
   */
  import { onMounted, ref } from 'vue'
  import { useThemeStore } from '@/stores/theme'
  import SettingsCard from '@/components/settings/SettingsCard.vue'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'
  import { api } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import SegmentedControl from '@/components/ui/SegmentedControl.vue'

  const themeStore = useThemeStore()
  const toast = useToast()

  // Read and written straight through the preferences endpoint rather than the
  // filters store: the update is partial, and this setting has nothing to do
  // with the dashboard's own filtering.
  const importCategoriesFromFile = ref(true)
  const isLoadingPreferences = ref(true)
  const isSavingPreference = ref(false)

  onMounted(async () => {
    try {
      const preferences = await api.getFilterPreferences()
      importCategoriesFromFile.value = preferences.importCategoriesFromFile
    } catch {
      // Leave the switch on its default rather than blocking the page: the
      // server keeps the truth, and a wrong reading here changes nothing until
      // the user actually toggles it.
    } finally {
      isLoadingPreferences.value = false
    }
  })

  async function setImportCategories(next: boolean): Promise<void> {
    const previous = importCategoriesFromFile.value
    importCategoriesFromFile.value = next
    isSavingPreference.value = true
    try {
      await api.updateFilterPreferences({ importCategoriesFromFile: next })
      toast.success(
        next
          ? 'Les catégories du fichier seront importées'
          : 'Les catégories seront déterminées automatiquement'
      )
    } catch {
      importCategoriesFromFile.value = previous
      toast.error('Impossible d’enregistrer ce réglage')
    } finally {
      isSavingPreference.value = false
    }
  }

  const THEME_MODES = [
    { value: 'light' as const, label: '☀️ Clair' },
    { value: 'dark' as const, label: '🌙 Sombre' },
    { value: 'system' as const, label: '💻 Système' },
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
      to: '/bank-sync/history',
      label: 'Historique des synchronisations',
      description: 'Consulter et annuler une synchronisation bancaire passée.',
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
      title="Import des catégories"
      description="Ce qui décide du classement des transactions importées."
    >
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <p class="text-sm font-medium text-gray-900 dark:text-gray-100">
            Utiliser les catégories du fichier
          </p>
          <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
            <template v-if="importCategoriesFromFile">
              Les catégories et sous-catégories écrites dans l’export sont
              reprises telles quelles, et créées si elles n’existent pas encore.
            </template>
            <template v-else>
              Les catégories du fichier sont ignorées. Chaque transaction est
              classée parmi vos catégories existantes, et aucune nouvelle
              catégorie n’est créée.
            </template>
          </p>
        </div>
        <ToggleSwitch
          :checked="importCategoriesFromFile"
          :disabled="isLoadingPreferences"
          :loading="isSavingPreference"
          label="Utiliser les catégories du fichier importé"
          data-testid="import-categories-toggle"
          @change="setImportCategories"
        />
      </div>
    </SettingsCard>

    <SettingsCard
      title="Apparence"
      description="Le thème est mémorisé sur cet appareil."
    >
      <SegmentedControl
        :model-value="themeStore.mode"
        label="Thème de l'interface"
        :options="THEME_MODES"
        @update:model-value="themeStore.setMode($event)"
      />
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

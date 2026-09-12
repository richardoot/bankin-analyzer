<script setup lang="ts">
  /**
   * The design reference: tokens and bricks side by side, so a visual
   * review has one page to look at and a new screen has one page to copy
   * from. Registered in dev builds only — it documents the system, it is
   * not part of the product.
   */
  import { ref } from 'vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import SkeletonBlock from '@/components/ui/SkeletonBlock.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import FilterChips from '@/components/ui/FilterChips.vue'
  import type { FilterChip } from '@/components/ui/FilterChips.vue'

  const PRIMARY_SHADES = [
    '50',
    '100',
    '200',
    '300',
    '400',
    '500',
    '600',
    '700',
    '800',
    '900',
    '950',
  ] as const

  const ROLES = [
    {
      hue: 'primary',
      cls: 'bg-primary-600',
      role: 'Action — boutons, focus, sélection, progression',
    },
    { hue: 'red', cls: 'bg-red-600', role: 'Dépenses, destruction, erreurs' },
    { hue: 'green', cls: 'bg-green-600', role: 'Revenus, succès' },
    {
      hue: 'amber',
      cls: 'bg-amber-500',
      role: 'Avertissements (et accent remboursements, séparation à venir)',
    },
    {
      hue: 'blue',
      cls: 'bg-blue-600',
      role: 'Information — toasts info, tuiles de stats',
    },
    {
      hue: 'indigo',
      cls: 'bg-indigo-500',
      role: 'Donnée — épargne, référence de comparaison. Jamais une action.',
    },
  ]

  const isModalOpen = ref(false)
  const isConfirmOpen = ref(false)
  const isButtonLoading = ref(false)
  const demoField = ref('')
  const demoFieldError = ref<string | undefined>(undefined)

  const demoChips = ref<FilterChip[]>([
    { key: 'type', label: 'Dépenses' },
    { key: 'category', label: 'Catégorie : Alimentation' },
    { key: 'q', label: '« carrefour »' },
  ])

  function simulateLoading(): void {
    isButtonLoading.value = true
    setTimeout(() => (isButtonLoading.value = false), 1500)
  }

  function toggleFieldError(): void {
    demoFieldError.value = demoFieldError.value
      ? undefined
      : 'Ce champ est requis'
  }
</script>

<template>
  <div class="min-h-screen bg-gray-50 py-8 transition-colors dark:bg-slate-800">
    <div class="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
      <PageHeader
        title="Référence design"
        subtitle="Jetons et briques, côte à côte — la page à copier pour tout nouvel écran"
      />

      <div class="space-y-8">
        <!-- Tokens -->
        <section
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <h2
            class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            Couleurs
          </h2>
          <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
            Échelle <code class="font-mono text-xs">primary-*</code> (définie
            dans <code class="font-mono text-xs">style.css</code>) :
          </p>
          <div class="mb-6 flex flex-wrap gap-1">
            <div
              v-for="shade in PRIMARY_SHADES"
              :key="shade"
              class="flex flex-col items-center gap-1"
            >
              <!-- Theme CSS variables, not dynamic classes: Tailwind only
                   generates class names it can read statically. -->
              <div
                class="h-10 w-12 rounded"
                :style="{ backgroundColor: `var(--color-primary-${shade})` }"
              ></div>
              <span class="font-mono text-[10px] text-gray-500">{{
                shade
              }}</span>
            </div>
          </div>
          <ul class="space-y-2">
            <li
              v-for="entry in ROLES"
              :key="entry.hue"
              class="flex items-center gap-3 text-sm"
            >
              <span class="h-4 w-4 shrink-0 rounded" :class="entry.cls"></span>
              <code class="w-16 shrink-0 font-mono text-xs">{{
                entry.hue
              }}</code>
              <span class="text-gray-600 dark:text-gray-400">{{
                entry.role
              }}</span>
            </li>
          </ul>
        </section>

        <!-- Buttons -->
        <section
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <h2
            class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            BaseButton
          </h2>
          <div class="flex flex-wrap items-center gap-3">
            <BaseButton>Primaire</BaseButton>
            <BaseButton variant="secondary">Secondaire</BaseButton>
            <BaseButton variant="danger">Danger</BaseButton>
            <BaseButton variant="danger-outline">Danger discret</BaseButton>
            <BaseButton variant="ghost">Fantôme</BaseButton>
            <BaseButton size="sm">Petit</BaseButton>
            <BaseButton disabled>Désactivé</BaseButton>
            <BaseButton :loading="isButtonLoading" @click="simulateLoading">
              {{ isButtonLoading ? 'Chargement…' : 'Simuler un chargement' }}
            </BaseButton>
          </div>
        </section>

        <!-- Modals -->
        <section
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <h2
            class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            BaseModal · ConfirmDialog
          </h2>
          <p class="mb-3 text-sm text-gray-600 dark:text-gray-400">
            Échap ferme, Tab reste dedans, le focus revient au déclencheur —
            fourni par la brique, jamais réécrit.
          </p>
          <div class="flex flex-wrap gap-3">
            <BaseButton variant="secondary" @click="isModalOpen = true">
              Ouvrir une BaseModal
            </BaseButton>
            <BaseButton variant="danger-outline" @click="isConfirmOpen = true">
              Ouvrir un ConfirmDialog
            </BaseButton>
          </div>
        </section>

        <!-- Fields & chips -->
        <section
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <h2
            class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            BaseField · FilterChips
          </h2>
          <div class="max-w-sm space-y-4">
            <BaseField
              v-model="demoField"
              label="Un champ avec erreur annoncée"
              placeholder="Tapez quelque chose…"
              :error="demoFieldError"
            />
            <BaseButton variant="secondary" size="sm" @click="toggleFieldError">
              Basculer l'erreur
            </BaseButton>
          </div>
          <div class="mt-6">
            <FilterChips
              :chips="demoChips"
              @remove="
                key => (demoChips = demoChips.filter(c => c.key !== key))
              "
              @clear="demoChips = []"
            />
            <p
              v-if="demoChips.length === 0"
              class="text-sm text-gray-500 dark:text-gray-400"
            >
              (toutes retirées — rechargez la page)
            </p>
          </div>
        </section>

        <!-- Empty & loading -->
        <section
          class="rounded-xl bg-white p-6 shadow-sm dark:bg-slate-900 dark:shadow-slate-900/20"
        >
          <h2
            class="mb-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            EmptyState · SkeletonBlock
          </h2>
          <div class="grid gap-6 md:grid-cols-2">
            <div
              class="rounded-lg border border-gray-200 dark:border-slate-700"
            >
              <EmptyState
                title="Aucun élément"
                description="Une page vide dit pourquoi, et offre une issue."
              >
                <template #icon>
                  <svg
                    class="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="1.5"
                      d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
                    />
                  </svg>
                </template>
                <template #action>
                  <BaseButton size="sm">L'issue</BaseButton>
                </template>
              </EmptyState>
            </div>
            <div class="space-y-3 p-4">
              <SkeletonBlock class="h-24 rounded-xl" />
              <SkeletonBlock :lines="3" />
            </div>
          </div>
        </section>
      </div>
    </div>

    <BaseModal
      :open="isModalOpen"
      title="Une BaseModal"
      @close="isModalOpen = false"
    >
      <p class="text-sm text-gray-600 dark:text-gray-400">
        Essayez Échap, Tab et Maj+Tab : le clavier ne quitte pas cette boîte, et
        le focus reviendra sur le bouton qui l'a ouverte.
      </p>
      <template #footer>
        <BaseButton variant="secondary" @click="isModalOpen = false">
          Fermer
        </BaseButton>
        <BaseButton @click="isModalOpen = false">Valider</BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="isConfirmOpen"
      title="Supprimer cet exemple ?"
      @confirm="isConfirmOpen = false"
      @cancel="isConfirmOpen = false"
    >
      La question destructrice standard : annuler discret à gauche, confirmer
      rouge à droite.
    </ConfirmDialog>
  </div>
</template>

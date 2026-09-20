<script setup lang="ts">
  /**
   * The public pitch. Only visitors ever see it — the router sends a
   * signed-in user to their dashboard — so the copy speaks to someone who
   * has not connected anything yet, and the one call to action is sign-up.
   *
   * Bank synchronisation leads: it is what changed since the page was first
   * written, and the CSV import is now the fallback, not the product.
   */
  const highlights = [
    {
      value: 'Chaque nuit',
      label: 'Vos transactions arrivent toutes seules',
    },
    {
      value: '0 €',
      label: 'Gratuit et open source',
    },
    {
      value: 'Aucun mot de passe',
      label: 'Connexion bancaire sécurisée (DSP2)',
    },
  ]
</script>

<template>
  <section
    class="bg-gradient-to-b from-white to-gray-50 dark:from-slate-900 dark:to-slate-800 py-20 sm:py-32 transition-colors"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="text-center">
        <!-- Badge -->
        <div class="mb-6">
          <span
            class="inline-flex items-center rounded-full bg-primary-50 dark:bg-primary-900/30 px-4 py-1.5 text-sm font-medium text-primary-700 dark:text-primary-400"
          >
            <svg
              class="mr-1.5 h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Nouveau : synchronisation bancaire automatique
          </span>
        </div>

        <!-- Title -->
        <h1
          class="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl md:text-6xl"
        >
          <span class="block">Vos comptes synchronisés,</span>
          <span
            class="block bg-gradient-to-r from-primary-500 to-primary-600 dark:from-primary-400 dark:to-primary-500 bg-clip-text text-transparent"
          >
            vos finances analysées
          </span>
        </h1>

        <!-- Subtitle -->
        <p
          class="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400 sm:text-xl"
        >
          Connectez votre banque : chaque nuit, vos transactions sont
          récupérées, classées d’après vos habitudes et vos soldes mis à jour.
          Il ne reste qu’à suivre votre budget, vos étiquettes et vos
          remboursements partagés.
        </p>

        <!-- CTA Buttons -->
        <div
          class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <RouterLink
            to="/login?signup=true"
            data-testid="hero-primary-cta"
            class="flex items-center gap-2 rounded-lg bg-primary-500 dark:bg-primary-600 px-6 py-3 text-base font-medium text-white shadow-lg shadow-primary-500/30 dark:shadow-primary-600/20 hover:bg-primary-600 dark:hover:bg-primary-500 transition-all hover:shadow-primary-500/40 dark:hover:shadow-primary-500/30"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Connecter ma banque
          </RouterLink>
          <a
            href="#fonctionnalites"
            data-testid="hero-secondary-cta"
            class="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              aria-hidden="true"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            Comment ça marche
          </a>
        </div>

        <p class="mt-4 text-sm text-gray-500 dark:text-gray-500">
          Pas de banque compatible ? L’import CSV Bankin reste disponible.
        </p>

        <!-- Highlights -->
        <div class="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div v-for="item in highlights" :key="item.value">
            <p
              class="text-3xl font-bold text-primary-500 dark:text-primary-400"
            >
              {{ item.value }}
            </p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {{ item.label }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

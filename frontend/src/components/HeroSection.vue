<script setup lang="ts">
  // No logic needed for now
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
            class="inline-flex items-center rounded-full bg-emerald-50 dark:bg-emerald-900/30 px-4 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            <svg class="mr-1.5 h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fill-rule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clip-rule="evenodd"
              />
            </svg>
            100% gratuit et open source
          </span>
        </div>

        <!-- Title -->
        <h1
          class="text-4xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-5xl md:text-6xl"
        >
          <span class="block">Analysez vos finances</span>
          <span
            class="block bg-gradient-to-r from-emerald-500 to-emerald-600 dark:from-emerald-400 dark:to-emerald-500 bg-clip-text text-transparent"
          >
            en toute simplicite
          </span>
        </h1>

        <!-- Subtitle -->
        <p
          class="mx-auto mt-6 max-w-2xl text-lg text-gray-600 dark:text-gray-400 sm:text-xl"
        >
          Importez vos exports CSV Bankin et visualisez instantanement vos
          depenses, revenus et remboursements. Aucune connexion bancaire
          requise.
        </p>

        <!-- CTA Buttons -->
        <div
          class="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row"
        >
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg bg-emerald-500 dark:bg-emerald-600 px-6 py-3 text-base font-medium text-white shadow-lg shadow-emerald-500/30 dark:shadow-emerald-600/20 hover:bg-emerald-600 dark:hover:bg-emerald-500 transition-all hover:shadow-emerald-500/40 dark:hover:shadow-emerald-500/30"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            Commencer gratuitement
          </button>
          <button
            type="button"
            class="flex items-center gap-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-6 py-3 text-base font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            <svg
              class="h-5 w-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            En savoir plus
          </button>
        </div>

        <!-- Stats -->
        <div class="mt-16 grid grid-cols-2 gap-8 sm:grid-cols-3">
          <div>
            <p
              class="text-3xl font-bold text-emerald-500 dark:text-emerald-400"
            >
              100%
            </p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Donnees locales
            </p>
          </div>
          <div>
            <p
              class="text-3xl font-bold text-emerald-500 dark:text-emerald-400"
            >
              0 €
            </p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Totalement gratuit
            </p>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <p
              class="text-3xl font-bold text-emerald-500 dark:text-emerald-400"
            >
              30s
            </p>
            <p class="mt-1 text-sm text-gray-600 dark:text-gray-400">
              Pour demarrer
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

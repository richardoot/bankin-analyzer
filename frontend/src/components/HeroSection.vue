<script setup lang="ts">
  // No logic needed for now
</script>

<template>
  <section class="bg-gradient-to-b from-white to-gray-50 py-20 sm:py-32">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <div class="text-center">
        <!-- Badge -->
        <div class="mb-6">
          <span
            class="inline-flex items-center rounded-full bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-700"
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
          class="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl md:text-6xl"
        >
          <span class="block">Analysez vos finances</span>
          <span
            class="block bg-gradient-to-r from-emerald-500 to-emerald-600 bg-clip-text text-transparent"
          >
            en toute simplicite
          </span>
        </h1>

        <!-- Subtitle -->
        <p class="mx-auto mt-6 max-w-2xl text-lg text-gray-600 sm:text-xl">
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
            class="flex items-center gap-2 rounded-lg bg-emerald-500 px-6 py-3 text-base font-medium text-white shadow-lg shadow-emerald-500/30 hover:bg-emerald-600 transition-all hover:shadow-emerald-500/40"
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
            class="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 py-3 text-base font-medium text-gray-700 hover:bg-gray-50 transition-colors"
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
            <p class="text-3xl font-bold text-emerald-500">100%</p>
            <p class="mt-1 text-sm text-gray-600">Donnees locales</p>
          </div>
          <div>
            <p class="text-3xl font-bold text-emerald-500">0 €</p>
            <p class="mt-1 text-sm text-gray-600">Totalement gratuit</p>
          </div>
          <div class="col-span-2 sm:col-span-1">
            <p class="text-3xl font-bold text-emerald-500">30s</p>
            <p class="mt-1 text-sm text-gray-600">Pour demarrer</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

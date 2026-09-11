<script setup lang="ts">
  interface Step {
    number: string
    title: string
    description: string
    icon: string
  }

  interface Feature {
    title: string
    description: string
    icon: string
    color: string
  }

  const steps: Step[] = [
    {
      number: '1',
      title: 'Connectez',
      description:
        'Synchronisez vos comptes bancaires, ou exportez votre historique au format CSV depuis Bankin',
      icon: 'download',
    },
    {
      number: '2',
      title: 'Importez',
      description:
        'Les transactions arrivent classées ; les doublons sont détectés et écartés automatiquement',
      icon: 'upload',
    },
    {
      number: '3',
      title: 'Analysez',
      description:
        'Visualisez instantanément vos dépenses par catégorie et par mois',
      icon: 'chart',
    },
  ]

  const features: Feature[] = [
    {
      title: 'Dashboard intuitif',
      description:
        'Visualisez vos dépenses et revenus avec des graphiques clairs et des statistiques détaillées.',
      icon: 'chart-bar',
      color: 'blue',
    },
    {
      title: 'Suivi des remboursements',
      description:
        'Gérez les dépenses partagées et générez des récapitulatifs de remboursement entre amis.',
      icon: 'users',
      color: 'purple',
    },
    {
      title: 'Budget prévisionnel',
      description:
        'Fixez un budget par catégorie, comparez-le au réel mois par mois et suivez votre épargne.',
      icon: 'target',
      color: 'emerald',
    },
    {
      title: 'Étiquettes d’analyse',
      description:
        'Regroupez des transactions par projet ou par événement — vacances, travaux — et isolez leur coût réel.',
      icon: 'tag',
      color: 'amber',
    },
  ]
</script>

<template>
  <section
    id="fonctionnalites"
    class="bg-white dark:bg-slate-900 py-20 transition-colors scroll-mt-16"
  >
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <!-- How it works -->
      <div class="text-center">
        <h2
          class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl"
        >
          Comment ça marche ?
        </h2>
        <p
          class="mx-auto mt-4 max-w-2xl text-lg text-gray-600 dark:text-gray-400"
        >
          Trois étapes simples pour analyser vos finances
        </p>
      </div>

      <!-- Steps -->
      <div class="mt-16 grid gap-8 sm:grid-cols-3">
        <div
          v-for="step in steps"
          :key="step.number"
          class="relative text-center"
        >
          <!-- Step number -->
          <div
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-2xl font-bold text-emerald-600 dark:text-emerald-400"
          >
            {{ step.number }}
          </div>

          <!-- Arrow (hidden on mobile, shown between steps on desktop) -->
          <div
            v-if="step.number !== '3'"
            class="absolute right-0 top-8 hidden -translate-y-1/2 translate-x-1/2 sm:block"
          >
            <svg
              class="h-6 w-6 text-gray-300 dark:text-gray-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </div>

          <h3
            class="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            {{ step.title }}
          </h3>
          <p class="mt-2 text-gray-600 dark:text-gray-400">
            {{ step.description }}
          </p>
        </div>
      </div>

      <!-- Features -->
      <div class="mt-24">
        <div class="text-center">
          <h2
            class="text-3xl font-bold tracking-tight text-gray-900 dark:text-gray-100 sm:text-4xl"
          >
            Fonctionnalités principales
          </h2>
        </div>

        <div class="mt-12 grid gap-8 sm:grid-cols-2">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-8 shadow-sm dark:shadow-slate-900/20 transition-shadow hover:shadow-md dark:hover:shadow-slate-900/30"
          >
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl"
              :class="{
                'bg-blue-100 dark:bg-blue-900/30': feature.color === 'blue',
                'bg-purple-100 dark:bg-purple-900/30':
                  feature.color === 'purple',
                'bg-emerald-100 dark:bg-emerald-900/30':
                  feature.color === 'emerald',
                'bg-amber-100 dark:bg-amber-900/30': feature.color === 'amber',
              }"
            >
              <!-- Chart icon -->
              <svg
                v-if="feature.icon === 'chart-bar'"
                class="h-6 w-6 text-blue-600 dark:text-blue-400"
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
              <!-- Users icon -->
              <svg
                v-if="feature.icon === 'users'"
                class="h-6 w-6 text-purple-600 dark:text-purple-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
              <!-- Target icon (budget) -->
              <svg
                v-if="feature.icon === 'target'"
                class="h-6 w-6 text-emerald-600 dark:text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
              <!-- Tag icon (labels) -->
              <svg
                v-if="feature.icon === 'tag'"
                class="h-6 w-6 text-amber-600 dark:text-amber-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
                />
              </svg>
            </div>

            <h3
              class="mt-4 text-xl font-semibold text-gray-900 dark:text-gray-100"
            >
              {{ feature.title }}
            </h3>
            <p class="mt-2 text-gray-600 dark:text-gray-400">
              {{ feature.description }}
            </p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

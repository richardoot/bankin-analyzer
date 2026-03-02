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
      title: 'Exportez',
      description:
        'Telechargez votre historique de transactions au format CSV depuis Bankin',
      icon: 'download',
    },
    {
      number: '2',
      title: 'Importez',
      description: 'Glissez-deposez votre fichier CSV dans Finance Analyzer',
      icon: 'upload',
    },
    {
      number: '3',
      title: 'Analysez',
      description:
        'Visualisez instantanement vos depenses par categorie et par mois',
      icon: 'chart',
    },
  ]

  const features: Feature[] = [
    {
      title: 'Dashboard intuitif',
      description:
        'Visualisez vos depenses et revenus avec des graphiques clairs et des statistiques detaillees.',
      icon: 'chart-bar',
      color: 'blue',
    },
    {
      title: 'Suivi des remboursements',
      description:
        'Gerez les depenses partagees et generez des recapitulatifs de remboursement entre amis.',
      icon: 'users',
      color: 'purple',
    },
  ]
</script>

<template>
  <section class="bg-white py-20">
    <div class="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
      <!-- How it works -->
      <div class="text-center">
        <h2 class="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
          Comment ca marche ?
        </h2>
        <p class="mx-auto mt-4 max-w-2xl text-lg text-gray-600">
          Trois etapes simples pour analyser vos finances
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
            class="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-2xl font-bold text-emerald-600"
          >
            {{ step.number }}
          </div>

          <!-- Arrow (hidden on mobile, shown between steps on desktop) -->
          <div
            v-if="step.number !== '3'"
            class="absolute right-0 top-8 hidden -translate-y-1/2 translate-x-1/2 sm:block"
          >
            <svg
              class="h-6 w-6 text-gray-300"
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

          <h3 class="mt-4 text-xl font-semibold text-gray-900">
            {{ step.title }}
          </h3>
          <p class="mt-2 text-gray-600">{{ step.description }}</p>
        </div>
      </div>

      <!-- Features -->
      <div class="mt-24">
        <div class="text-center">
          <h2
            class="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl"
          >
            Fonctionnalites principales
          </h2>
        </div>

        <div class="mt-12 grid gap-8 sm:grid-cols-2">
          <div
            v-for="feature in features"
            :key="feature.title"
            class="rounded-2xl border border-gray-200 bg-white p-8 shadow-sm transition-shadow hover:shadow-md"
          >
            <div
              class="flex h-12 w-12 items-center justify-center rounded-xl"
              :class="{
                'bg-blue-100': feature.color === 'blue',
                'bg-purple-100': feature.color === 'purple',
              }"
            >
              <!-- Chart icon -->
              <svg
                v-if="feature.icon === 'chart-bar'"
                class="h-6 w-6 text-blue-600"
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
                class="h-6 w-6 text-purple-600"
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
            </div>

            <h3 class="mt-4 text-xl font-semibold text-gray-900">
              {{ feature.title }}
            </h3>
            <p class="mt-2 text-gray-600">{{ feature.description }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

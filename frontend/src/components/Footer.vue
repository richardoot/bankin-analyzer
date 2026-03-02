<script setup lang="ts">
  const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="border-t border-gray-200 bg-white">
    <div class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div class="flex flex-col items-center justify-between gap-4 sm:flex-row">
        <!-- Logo and copyright -->
        <div class="flex items-center gap-2">
          <svg
            class="h-6 w-6 text-emerald-500"
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
          <span class="text-sm text-gray-600">
            &copy; {{ currentYear }} Finance Analyzer. Tous droits reserves.
          </span>
        </div>

        <!-- Links -->
        <div class="flex items-center gap-6">
          <a
            href="#"
            class="text-sm text-gray-600 hover:text-emerald-600 transition-colors"
          >
            Confidentialite
          </a>
          <a
            href="#"
            class="text-sm text-gray-600 hover:text-emerald-600 transition-colors"
          >
            Conditions
          </a>
          <a
            href="#"
            class="text-sm text-gray-600 hover:text-emerald-600 transition-colors"
          >
            Contact
          </a>
        </div>
      </div>
    </div>
  </footer>
</template>

<script setup lang="ts">
  import { ref, computed, onMounted, onUnmounted } from 'vue'
  import { useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'

  const router = useRouter()
  const authStore = useAuthStore()

  const isOpen = ref(false)
  const dropdownRef = ref<HTMLElement | null>(null)

  const userEmail = computed(() => authStore.user?.email ?? '')
  const userInitial = computed(() => userEmail.value.charAt(0).toUpperCase())
  const loading = computed(() => authStore.loading)

  const menuItems = [
    {
      to: '/profile',
      label: 'Mon profil',
      icon: 'user',
    },
    {
      to: '/preferences',
      label: 'Preferences',
      icon: 'settings',
    },
    {
      to: '/import/history',
      label: 'Historique des imports',
      icon: 'history',
    },
  ]

  function toggle() {
    isOpen.value = !isOpen.value
  }

  function close() {
    isOpen.value = false
  }

  function handleClickOutside(event: MouseEvent) {
    if (
      dropdownRef.value &&
      !dropdownRef.value.contains(event.target as Node)
    ) {
      close()
    }
  }

  async function handleSignOut() {
    close()
    await authStore.signOut()
    router.push('/')
  }

  function navigateTo(path: string) {
    close()
    router.push(path)
  }

  onMounted(() => document.addEventListener('click', handleClickOutside))
  onUnmounted(() => document.removeEventListener('click', handleClickOutside))
</script>

<template>
  <div ref="dropdownRef" class="relative">
    <!-- Trigger button -->
    <button
      type="button"
      aria-label="Menu utilisateur"
      aria-haspopup="menu"
      :aria-expanded="isOpen"
      class="flex items-center gap-2 rounded-full p-1 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
      @click="toggle"
    >
      <!-- Avatar with initial -->
      <div
        class="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-medium text-white"
      >
        {{ userInitial }}
      </div>
      <!-- Chevron -->
      <svg
        class="h-4 w-4 text-slate-500 dark:text-slate-400 transition-transform duration-200"
        :class="{ 'rotate-180': isOpen }"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2"
          d="M19 9l-7 7-7-7"
        />
      </svg>
    </button>

    <!-- Dropdown menu -->
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="isOpen"
        role="menu"
        class="absolute right-0 mt-2 w-64 origin-top-right rounded-lg bg-white dark:bg-slate-800 shadow-lg ring-1 ring-black/5 dark:ring-white/10"
      >
        <!-- User email header -->
        <div class="border-b border-slate-100 dark:border-slate-700 px-4 py-3">
          <p class="text-sm font-medium text-slate-900 dark:text-slate-100">
            Connecte en tant que
          </p>
          <p class="truncate text-sm text-slate-500 dark:text-slate-400">
            {{ userEmail }}
          </p>
        </div>

        <!-- Menu items -->
        <div class="py-1">
          <button
            v-for="item in menuItems"
            :key="item.to"
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
            @click="navigateTo(item.to)"
          >
            <!-- User icon -->
            <svg
              v-if="item.icon === 'user'"
              class="h-4 w-4 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
            <!-- Settings icon -->
            <svg
              v-else-if="item.icon === 'settings'"
              class="h-4 w-4 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            <!-- History icon -->
            <svg
              v-else-if="item.icon === 'history'"
              class="h-4 w-4 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {{ item.label }}
          </button>
        </div>

        <!-- Sign out -->
        <div class="border-t border-slate-100 dark:border-slate-700 py-1">
          <button
            type="button"
            role="menuitem"
            :disabled="loading"
            class="flex w-full items-center gap-3 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
            @click="handleSignOut"
          >
            <svg
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Deconnexion
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
  import { computed, ref } from 'vue'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import { useRouter } from 'vue-router'
  import { useAuthStore } from '@/stores/auth'
  import DeleteAccountModal from '@/components/DeleteAccountModal.vue'
  import { formatDate } from '@/lib/formatters'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'

  const router = useRouter()
  const authStore = useAuthStore()

  const user = computed(() => authStore.user)
  const loading = computed(() => authStore.loading)
  const isDeleteModalOpen = ref(false)
  const isDeleting = ref(false)

  const createdAt = computed(() => {
    if (!user.value?.created_at) {
      return null
    }
    return formatDate(user.value.created_at, 'long')
  })

  const handleSignOut = async (): Promise<void> => {
    await authStore.signOut()
    await router.push('/')
  }

  const handleDeleteAccount = async (): Promise<void> => {
    try {
      isDeleting.value = true
      await authStore.deleteAccount()
      isDeleteModalOpen.value = false
      await router.push('/login')
    } catch {
      // Error is handled in the store
    } finally {
      isDeleting.value = false
    }
  }
</script>

<template>
  <PageShell width="narrow">
    <!-- Profile Header -->
    <PageHeader
      title="Mon profil"
      subtitle="Gérez vos informations personnelles"
    />

    <!-- Profile Card -->
    <BaseCard variant="raised" padding="lg">
      <!-- Avatar and Name -->
      <div
        class="flex items-center gap-6 border-b border-gray-200 dark:border-slate-700 pb-8"
      >
        <div
          class="flex h-20 w-20 items-center justify-center rounded-full bg-primary-100 dark:bg-primary-900/30 text-2xl font-bold text-primary-700 dark:text-primary-400"
        >
          {{ user?.email?.charAt(0).toUpperCase() || '?' }}
        </div>
        <div>
          <h2 class="text-xl font-semibold text-gray-900 dark:text-gray-100">
            {{ user?.email || 'Utilisateur' }}
          </h2>
          <p class="text-gray-600 dark:text-gray-400">
            Membre Finance Analyzer
          </p>
        </div>
      </div>

      <!-- Profile Info -->
      <div class="space-y-6 py-8">
        <div>
          <p class="block text-sm font-medium text-gray-500 dark:text-gray-400">
            Adresse email
          </p>
          <p class="mt-1 text-lg text-gray-900 dark:text-gray-100">
            {{ user?.email }}
          </p>
        </div>

        <div>
          <p class="block text-sm font-medium text-gray-500 dark:text-gray-400">
            Identifiant unique
          </p>
          <p class="mt-1 font-mono text-sm text-gray-600 dark:text-gray-400">
            {{ user?.id }}
          </p>
        </div>

        <div v-if="createdAt">
          <p class="block text-sm font-medium text-gray-500 dark:text-gray-400">
            Membre depuis
          </p>
          <p class="mt-1 text-lg text-gray-900 dark:text-gray-100">
            {{ createdAt }}
          </p>
        </div>

        <div v-if="user?.email_confirmed_at">
          <p class="block text-sm font-medium text-gray-500 dark:text-gray-400">
            Statut du compte
          </p>
          <p
            class="mt-1 flex items-center gap-2 text-lg text-gray-900 dark:text-gray-100"
          >
            <span
              class="inline-flex h-2 w-2 rounded-full bg-primary-600"
            ></span>
            Email vérifié
          </p>
        </div>
      </div>

      <!-- Actions -->
      <div class="border-t border-gray-200 dark:border-slate-700 pt-8">
        <BaseButton
          variant="danger-outline"
          :loading="loading"
          @click="handleSignOut"
        >
          <span v-if="loading">Déconnexion...</span>
          <span v-else>Se déconnecter</span>
        </BaseButton>
      </div>
    </BaseCard>

    <!-- Quick Links -->
    <BaseCard variant="raised" padding="lg" class="mt-8">
      <h3 class="mb-4 text-lg font-semibold text-gray-900 dark:text-gray-100">
        Accès rapide
      </h3>
      <div class="grid gap-4 sm:grid-cols-2">
        <RouterLink
          to="/dashboard"
          class="flex items-center gap-3 rounded-lg border border-gray-200 dark:border-slate-700 p-4 transition-colors hover:bg-gray-50 dark:hover:bg-slate-800"
        >
          <div
            class="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-100 dark:bg-primary-900/30"
          >
            <svg
              class="h-5 w-5 text-primary-700 dark:text-primary-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
          </div>
          <div>
            <p class="font-medium text-gray-900 dark:text-gray-100">
              Dashboard
            </p>
            <p class="text-sm text-gray-600 dark:text-gray-400">
              Retour à vos finances
            </p>
          </div>
        </RouterLink>
      </div>
    </BaseCard>

    <!-- Danger Zone -->
    <div
      class="mt-8 rounded-2xl border-2 border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-8"
    >
      <h3 class="mb-2 text-lg font-semibold text-red-700 dark:text-red-400">
        Zone de danger
      </h3>
      <p class="mb-6 text-sm text-red-600 dark:text-red-400/80">
        Les actions dans cette zone sont irréversibles. Procédez avec
        précaution.
      </p>
      <BaseButton variant="danger" @click="isDeleteModalOpen = true">
        Supprimer mon compte
      </BaseButton>
    </div>

    <DeleteAccountModal
      :is-open="isDeleteModalOpen"
      :loading="isDeleting"
      @close="isDeleteModalOpen = false"
      @confirm="handleDeleteAccount"
    />
  </PageShell>
</template>

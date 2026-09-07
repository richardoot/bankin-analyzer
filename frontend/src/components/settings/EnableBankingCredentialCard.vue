<script setup lang="ts">
  /**
   * Every user brings their own Enable Banking application — its App ID and
   * the `.pem` private key downloaded once from the Control Panel. There is
   * no server-wide default to fall back to: without this, `GET
   * /bank-sync/status` answers `configured: false` and nothing bank-related
   * is offered.
   */
  import { onMounted, ref } from 'vue'
  import { api } from '@/lib/api'
  import { useToast } from '@/composables/useToast'

  const emit = defineEmits<{ changed: [] }>()

  const applicationId = ref<string | null>(null)
  const loading = ref(true)
  const applicationIdInput = ref('')
  const file = ref<File | null>(null)
  const saving = ref(false)
  const removing = ref(false)
  const tutorialOpen = ref(false)

  const toast = useToast()

  const redirectUrl = `${window.location.origin}/bank-callback`

  async function load(): Promise<void> {
    loading.value = true
    try {
      const status = await api.getEnableBankingCredential()
      applicationId.value = status.applicationId
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : 'Impossible de lire votre application Enable Banking'
      )
    } finally {
      loading.value = false
    }
  }

  onMounted(load)

  function onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement
    file.value = input.files?.[0] ?? null
  }

  async function save(): Promise<void> {
    if (!applicationIdInput.value || !file.value) return
    saving.value = true
    try {
      const result = await api.saveEnableBankingCredential(
        applicationIdInput.value,
        file.value
      )
      applicationId.value = result.applicationId
      applicationIdInput.value = ''
      file.value = null
      toast.success('Application Enable Banking enregistrée')
      emit('changed')
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Enregistrement impossible'
      )
    } finally {
      saving.value = false
    }
  }

  async function remove(): Promise<void> {
    removing.value = true
    try {
      await api.removeEnableBankingCredential()
      applicationId.value = null
      toast.success('Application Enable Banking supprimée')
      emit('changed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Suppression impossible')
    } finally {
      removing.value = false
    }
  }
</script>

<template>
  <div
    class="rounded-xl border border-gray-200 p-5 dark:border-slate-700"
    data-testid="enable-banking-credential-card"
  >
    <h3 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
      Votre application Enable Banking
    </h3>
    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">
      La synchronisation bancaire se fait au nom de votre propre application,
      pas de celle d'un tiers.
    </p>

    <p v-if="loading" class="mt-4 text-sm text-gray-500 dark:text-gray-400">
      Chargement…
    </p>

    <template v-else>
      <div
        v-if="applicationId"
        class="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-emerald-50 p-4 dark:bg-emerald-900/20"
        data-testid="enable-banking-credential-configured"
      >
        <p class="text-sm text-emerald-800 dark:text-emerald-200">
          Configurée — identifiant d'application :
          <code class="font-mono">{{ applicationId }}</code>
        </p>
        <button
          type="button"
          data-testid="remove-credential-button"
          :disabled="removing"
          class="rounded-lg border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-emerald-700 dark:text-emerald-200 dark:hover:bg-emerald-900/40"
          @click="remove"
        >
          {{ removing ? 'Suppression…' : 'Supprimer' }}
        </button>
      </div>

      <div v-else class="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label
            for="eb-app-id"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Identifiant d'application (App ID)
          </label>
          <input
            id="eb-app-id"
            v-model="applicationIdInput"
            type="text"
            data-testid="application-id-input"
            class="mt-1 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-gray-100"
            placeholder="ex. 3fae2b1c-…"
          />
        </div>
        <div>
          <label
            for="eb-key-file"
            class="text-sm font-medium text-gray-700 dark:text-gray-300"
          >
            Clé privée (fichier .pem)
          </label>
          <input
            id="eb-key-file"
            type="file"
            accept=".pem"
            data-testid="private-key-file-input"
            class="mt-1 w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium dark:text-gray-300 dark:file:bg-slate-800"
            @change="onFileChange"
          />
        </div>
        <div class="sm:col-span-2">
          <button
            type="button"
            data-testid="save-credential-button"
            :disabled="!applicationIdInput || !file || saving"
            class="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700"
            @click="save"
          >
            {{ saving ? 'Enregistrement…' : 'Enregistrer' }}
          </button>
        </div>
      </div>

      <details
        class="mt-4 rounded-lg bg-gray-50 p-4 text-sm dark:bg-slate-800"
        data-testid="enable-banking-tutorial"
        :open="tutorialOpen"
        @toggle="tutorialOpen = ($event.target as HTMLDetailsElement).open"
      >
        <summary
          class="cursor-pointer font-medium text-gray-700 dark:text-gray-300"
        >
          Comment créer une application Enable Banking ?
        </summary>
        <ol
          class="mt-3 list-decimal space-y-2 pl-5 text-gray-600 dark:text-gray-400"
        >
          <li>
            Rendez-vous sur
            <a
              href="https://enablebanking.com/sign-in/"
              target="_blank"
              rel="noopener noreferrer"
              class="text-emerald-700 underline hover:text-emerald-800 dark:text-emerald-400 dark:hover:text-emerald-300"
              >enablebanking.com/sign-in</a
            >
            — un compte est créé automatiquement à la première connexion.
            Créez-y ensuite une application.
          </li>
          <li>
            Lors de la création de l'application, indiquez cette URL de
            redirection — c'est celle par laquelle votre banque vous renverra
            ici une fois l'autorisation donnée :
            <code
              class="mt-1 block break-all rounded bg-gray-100 px-2 py-1 font-mono text-xs dark:bg-slate-900"
              >{{ redirectUrl }}</code
            >
          </li>
          <li>
            Une fois l'application créée, notez son
            <strong>identifiant (App ID)</strong> — il est affiché en clair dans
            le Control Panel, vous pourrez toujours le retrouver.
          </li>
          <li>
            Téléchargez la <strong>clé privée</strong> (fichier
            <code>.pem</code>) proposée à la création de l'application.
            <strong
              >Ce téléchargement est unique : le Control Panel ne la redonnera
              plus jamais ensuite</strong
            >, gardez-en une copie en lieu sûr.
          </li>
          <li>
            Renseignez les deux ci-dessus et cliquez sur « Enregistrer ». La clé
            est vérifiée avant d'être conservée : si elle est refusée,
            revérifiez le fichier téléchargé.
          </li>
        </ol>
      </details>
    </template>
  </div>
</template>

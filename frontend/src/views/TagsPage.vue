<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useRouter } from 'vue-router'
  import { useTagsStore } from '@/stores/tags'
  import type { TagDto } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import { formatCurrency } from '@/lib/formatters'

  const router = useRouter()
  const tagsStore = useTagsStore()
  const toast = useToast()

  /** Preset colors offered when creating/editing a tag. */
  const DEFAULT_COLOR = '#ef4444'
  const COLORS = [
    DEFAULT_COLOR,
    '#f97316',
    '#eab308',
    '#22c55e',
    '#14b8a6',
    '#06b6d4',
    '#6366f1',
    '#a855f7',
    '#ec4899',
    '#64748b',
  ]

  // Create form state
  const newName = ref('')
  const newColor = ref<string>(DEFAULT_COLOR)
  const newIsExceptional = ref(false)
  const newEventStart = ref('')
  const newEventEnd = ref('')
  const newBudget = ref('')
  const creating = ref(false)

  /**
   * The envelope is a total for the whole project, never a monthly amount —
   * a trip is decided once. Empty means "no envelope declared".
   */
  function parseBudget(raw: string): number | null {
    const trimmed = raw.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
  }

  /**
   * The event period is only meaningful for an exceptional tag, and only when
   * both bounds are known — a half-filled range would silently skew every
   * everyday average.
   */
  function eventPeriod(
    isExceptional: boolean,
    start: string,
    end: string
  ): { eventStartDate: string | null; eventEndDate: string | null } {
    if (isExceptional && start && end && start <= end) {
      return { eventStartDate: start, eventEndDate: end }
    }
    return { eventStartDate: null, eventEndDate: null }
  }

  async function createTag(): Promise<void> {
    const name = newName.value.trim()
    if (!name || creating.value) return
    creating.value = true
    const period = eventPeriod(
      newIsExceptional.value,
      newEventStart.value,
      newEventEnd.value
    )
    const created = await tagsStore.addTag({
      name,
      color: newColor.value,
      isExceptional: newIsExceptional.value,
      ...(period.eventStartDate && period.eventEndDate
        ? {
            eventStartDate: period.eventStartDate,
            eventEndDate: period.eventEndDate,
          }
        : {}),
      ...(newIsExceptional.value && parseBudget(newBudget.value) !== null
        ? { budgetAmount: parseBudget(newBudget.value) as number }
        : {}),
    })
    creating.value = false
    if (created) {
      newName.value = ''
      newColor.value = DEFAULT_COLOR
      newIsExceptional.value = false
      newEventStart.value = ''
      newEventEnd.value = ''
      newBudget.value = ''
      toast.success(`Étiquette « ${created.name} » créée`)
    }
  }

  // Edit state
  const editingId = ref<string | null>(null)
  const editName = ref('')
  const editColor = ref<string>(DEFAULT_COLOR)
  const editIsExceptional = ref(false)
  const editEventStart = ref('')
  const editEventEnd = ref('')
  const editBudget = ref('')

  function startEdit(tag: TagDto): void {
    editingId.value = tag.id
    editName.value = tag.name
    editColor.value = tag.color ?? DEFAULT_COLOR
    editIsExceptional.value = tag.isExceptional
    editEventStart.value = tag.eventStartDate ?? ''
    editEventEnd.value = tag.eventEndDate ?? ''
    editBudget.value = tag.budgetAmount === null ? '' : String(tag.budgetAmount)
  }

  function cancelEdit(): void {
    editingId.value = null
  }

  async function saveEdit(id: string): Promise<void> {
    const name = editName.value.trim()
    if (!name) return
    const period = eventPeriod(
      editIsExceptional.value,
      editEventStart.value,
      editEventEnd.value
    )
    const ok = await tagsStore.updateTag(id, {
      name,
      color: editColor.value,
      isExceptional: editIsExceptional.value,
      ...period,
      // A tag that stops being exceptional stops being a project too.
      budgetAmount: editIsExceptional.value
        ? parseBudget(editBudget.value)
        : null,
    })
    if (ok) editingId.value = null
  }

  /** "12 juil. – 26 juil. 2025" */
  function formatPeriod(start: string, end: string): string {
    const opts: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short' }
    const from = new Date(start).toLocaleDateString('fr-FR', opts)
    const to = new Date(end).toLocaleDateString('fr-FR', {
      ...opts,
      year: 'numeric',
    })
    return `${from} – ${to}`
  }

  // Delete confirmation
  const confirmingDeleteId = ref<string | null>(null)

  async function confirmDelete(tag: TagDto): Promise<void> {
    const ok = await tagsStore.removeTag(tag.id)
    confirmingDeleteId.value = null
    if (ok) toast.success(`Étiquette « ${tag.name} » supprimée`)
  }

  function openAnalysis(tag: TagDto): void {
    router.push({ name: 'tag-analysis', params: { id: tag.id } })
  }

  onMounted(() => {
    tagsStore.fetchTags()
  })
</script>

<template>
  <div class="min-h-screen bg-gray-50 dark:bg-slate-800 py-8 transition-colors">
    <div class="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
      <!-- Header -->
      <div class="mb-6">
        <h1 class="text-3xl font-bold text-gray-900 dark:text-gray-100">
          Étiquettes
        </h1>
        <p class="mt-2 text-gray-600 dark:text-gray-400">
          Regroupez des transactions (événement, vacances…) et analysez-les.
        </p>
      </div>

      <!-- Create form -->
      <div
        class="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 mb-6 dark:shadow-slate-900/20"
      >
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            v-model="newName"
            type="text"
            placeholder="Nom de l'étiquette (ex : Vacances Italie)"
            class="flex-1 px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-emerald-500"
            @keyup.enter="createTag"
          />
          <div class="flex items-center gap-1.5">
            <button
              v-for="c in COLORS"
              :key="c"
              type="button"
              class="h-6 w-6 rounded-full border-2 transition-transform hover:scale-110"
              :class="
                newColor === c
                  ? 'border-gray-900 dark:border-white'
                  : 'border-transparent'
              "
              :style="{ backgroundColor: c }"
              :aria-label="`Couleur ${c}`"
              @click="newColor = c"
            ></button>
          </div>
          <button
            type="button"
            class="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            :disabled="!newName.trim() || creating"
            @click="createTag"
          >
            Créer
          </button>
        </div>

        <!-- Exceptional event settings -->
        <div class="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
          <label
            class="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
          >
            <input
              v-model="newIsExceptional"
              type="checkbox"
              class="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              data-testid="new-tag-exceptional"
            />
            Dépense exceptionnelle
            <span class="text-xs text-gray-400">
              — exclue des moyennes du quotidien
            </span>
          </label>

          <div v-if="newIsExceptional" class="mt-3 pl-6">
            <p class="text-xs text-gray-500 dark:text-gray-400">
              Période d'absence (facultatif) — pendant ces dates vos dépenses
              habituelles sont suspendues. Renseignez-la pour un déplacement ou
              des vacances ; laissez vide pour une fête à la maison.
            </p>
            <div class="mt-2 flex flex-wrap items-center gap-2">
              <input
                v-model="newEventStart"
                type="date"
                class="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                aria-label="Début de la période d'absence"
              />
              <span class="text-gray-400 text-sm">→</span>
              <input
                v-model="newEventEnd"
                type="date"
                class="px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                aria-label="Fin de la période d'absence"
              />
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <label
                for="new-tag-budget"
                class="text-xs text-gray-500 dark:text-gray-400"
              >
                Enveloppe du projet (facultatif) — un total, pas un montant
                mensuel
              </label>
              <div class="relative">
                <input
                  id="new-tag-budget"
                  v-model="newBudget"
                  type="number"
                  min="0"
                  step="10"
                  placeholder="—"
                  data-testid="new-tag-budget"
                  class="w-28 pl-2 pr-6 py-1 text-sm text-right border border-gray-300 dark:border-slate-600 rounded bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 tabular-nums"
                />
                <span
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none"
                >
                  €
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div
        v-if="tagsStore.isLoading && tagsStore.tags.length === 0"
        class="py-12 text-center text-gray-500 dark:text-gray-400"
      >
        Chargement…
      </div>

      <!-- Empty -->
      <div
        v-else-if="tagsStore.tags.length === 0"
        class="py-12 text-center text-gray-500 dark:text-gray-400"
      >
        Aucune étiquette pour l'instant. Créez-en une ci-dessus, puis
        attribuez-la à des transactions.
      </div>

      <!-- Tag cards -->
      <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="tag in tagsStore.tags"
          :key="tag.id"
          class="group relative bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 dark:shadow-slate-900/20 border border-transparent hover:border-emerald-300 dark:hover:border-emerald-700 transition-colors"
        >
          <!-- Edit mode -->
          <div v-if="editingId === tag.id" class="space-y-2">
            <input
              v-model="editName"
              type="text"
              class="w-full px-2 py-1 border border-gray-300 dark:border-slate-600 rounded text-sm bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
              @keyup.enter="saveEdit(tag.id)"
              @keyup.escape="cancelEdit"
            />
            <div class="flex items-center gap-1">
              <button
                v-for="c in COLORS"
                :key="c"
                type="button"
                class="h-5 w-5 rounded-full border-2"
                :class="
                  editColor === c
                    ? 'border-gray-900 dark:border-white'
                    : 'border-transparent'
                "
                :style="{ backgroundColor: c }"
                @click="editColor = c"
              ></button>
            </div>
            <label
              class="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer"
            >
              <input
                v-model="editIsExceptional"
                type="checkbox"
                class="h-3.5 w-3.5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              Dépense exceptionnelle
            </label>
            <div v-if="editIsExceptional" class="space-y-1">
              <p class="text-[11px] text-gray-400">
                Période d'absence (facultatif)
              </p>
              <div class="flex items-center gap-1">
                <input
                  v-model="editEventStart"
                  type="date"
                  class="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  aria-label="Début de la période d'absence"
                />
                <input
                  v-model="editEventEnd"
                  type="date"
                  class="flex-1 min-w-0 px-1.5 py-1 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                  aria-label="Fin de la période d'absence"
                />
              </div>
              <p class="text-[11px] text-gray-400 pt-1">
                Enveloppe du projet (total)
              </p>
              <div class="relative">
                <input
                  v-model="editBudget"
                  type="number"
                  min="0"
                  step="10"
                  placeholder="—"
                  data-testid="edit-tag-budget"
                  class="w-full px-1.5 pr-6 py-1 border border-gray-300 dark:border-slate-600 rounded text-xs bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 tabular-nums text-right"
                  aria-label="Enveloppe du projet"
                />
                <span
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400 pointer-events-none"
                >
                  €
                </span>
              </div>
            </div>
            <div class="flex justify-end gap-2 pt-1">
              <button
                class="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                @click="cancelEdit"
              >
                Annuler
              </button>
              <button
                class="px-2 py-1 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700"
                @click="saveEdit(tag.id)"
              >
                Enregistrer
              </button>
            </div>
          </div>

          <!-- Display mode -->
          <template v-else>
            <button
              type="button"
              class="w-full text-left"
              @click="openAnalysis(tag)"
            >
              <div class="flex items-center gap-2">
                <span
                  class="inline-block h-3 w-3 rounded-full shrink-0"
                  :style="{ backgroundColor: tag.color ?? '#9ca3af' }"
                ></span>
                <span
                  class="font-semibold text-gray-900 dark:text-gray-100 truncate"
                >
                  {{ tag.name }}
                </span>
              </div>
              <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
                {{ tag.transactionCount }} transaction(s)
              </p>
              <div
                v-if="tag.isExceptional"
                class="mt-2 flex flex-wrap items-center gap-1.5"
              >
                <span
                  class="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-400"
                  title="Exclue des moyennes du quotidien du tableau de bord"
                >
                  Exceptionnel
                </span>
                <span
                  v-if="tag.eventStartDate && tag.eventEndDate"
                  class="text-[11px] text-gray-400"
                >
                  {{ formatPeriod(tag.eventStartDate, tag.eventEndDate) }}
                </span>
                <span
                  v-if="tag.budgetAmount !== null"
                  :data-testid="`tag-budget-${tag.name}`"
                  class="inline-flex items-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 px-2 py-0.5 text-[11px] font-medium text-indigo-700 dark:text-indigo-400 tabular-nums"
                  title="Enveloppe allouée au projet"
                >
                  {{ formatCurrency(tag.budgetAmount) }}
                </span>
              </div>
              <span
                class="mt-2 inline-flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400"
              >
                Analyser
                <svg
                  class="h-3 w-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </span>
            </button>

            <!-- Card actions -->
            <div
              class="absolute top-3 right-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <button
                class="p-1 text-gray-400 hover:text-indigo-500 rounded"
                aria-label="Modifier"
                @click.stop="startEdit(tag)"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </button>
              <button
                class="p-1 text-gray-400 hover:text-red-500 rounded"
                aria-label="Supprimer"
                @click.stop="confirmingDeleteId = tag.id"
              >
                <svg
                  class="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            </div>

            <!-- Delete confirmation -->
            <div
              v-if="confirmingDeleteId === tag.id"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-white/95 dark:bg-slate-900/95 p-4 text-center"
            >
              <p class="text-sm text-gray-700 dark:text-gray-300">
                Supprimer « {{ tag.name }} » ?
              </p>
              <p class="text-xs text-gray-400">
                Les transactions ne sont pas supprimées.
              </p>
              <div class="flex gap-2">
                <button
                  class="px-3 py-1 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400"
                  @click.stop="confirmingDeleteId = null"
                >
                  Annuler
                </button>
                <button
                  class="px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700"
                  @click.stop="confirmDelete(tag)"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

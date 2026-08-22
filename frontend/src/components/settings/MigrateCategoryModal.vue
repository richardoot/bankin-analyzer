<script setup lang="ts">
  /**
   * Moving a category's transactions into another one.
   *
   * Two steps: pick the destination, then decide line by line. The second step
   * arrives already decided — every subcategory recreated in the destination —
   * so confirming without touching anything does the obvious thing. Merging
   * into an existing subcategory and leaving a line behind are alternatives in
   * the same dropdown, which is what makes a partial migration a per-line
   * choice rather than a mode.
   *
   * The source category is never deleted, even when it ends up empty: emptying
   * and removing are separate intentions.
   */
  import { computed, ref, watch } from 'vue'
  import { api } from '@/lib/api'
  import type {
    CategoryDto,
    CategoryMigrationPreviewDto,
    MigrationActionDto,
  } from '@/lib/api'
  import { useToast } from '@/composables/useToast'

  const props = defineProps<{
    isOpen: boolean
    source: CategoryDto | null
    categories: CategoryDto[]
  }>()

  const emit = defineEmits<{
    close: []
    migrated: []
  }>()

  const toast = useToast()

  const targetId = ref<string | null>(null)
  const preview = ref<CategoryMigrationPreviewDto | null>(null)
  const actions = ref<MigrationActionDto[]>([])
  const isLoading = ref(false)
  const isMigrating = ref(false)
  const error = ref<string | null>(null)

  /** Same type only: a category cannot change sign on the way across. */
  const destinations = computed(() =>
    props.categories
      .filter(c => c.id !== props.source?.id && c.type === props.source?.type)
      .sort((a, b) => a.name.localeCompare(b.name))
  )

  function reset(): void {
    targetId.value = null
    preview.value = null
    actions.value = []
    error.value = null
  }

  watch(
    () => props.isOpen,
    open => {
      if (!open) reset()
    }
  )

  async function loadPreview(): Promise<void> {
    if (!props.source || !targetId.value) return
    try {
      isLoading.value = true
      error.value = null
      const body = await api.getCategoryMigrationPreview(
        props.source.id,
        targetId.value
      )
      preview.value = body
      actions.value = body.defaultActions.map(a => ({ ...a }))
    } catch (err) {
      error.value =
        err instanceof Error
          ? err.message
          : 'Impossible de preparer le deplacement'
    } finally {
      isLoading.value = false
    }
  }

  /** The dropdown value encodes both the action and, for a merge, its target. */
  function encode(action: MigrationActionDto): string {
    if (action.action === 'MERGE') return `MERGE:${action.targetSubcategoryId}`
    return action.action
  }

  function decode(
    value: string,
    sourceSubcategoryId: string | null
  ): MigrationActionDto {
    if (value.startsWith('MERGE:')) {
      return {
        sourceSubcategoryId,
        action: 'MERGE',
        targetSubcategoryId: value.slice('MERGE:'.length),
      }
    }
    return { sourceSubcategoryId, action: value as 'MOVE' | 'KEEP' }
  }

  function actionFor(sourceSubcategoryId: string | null): MigrationActionDto {
    return (
      actions.value.find(
        a => a.sourceSubcategoryId === sourceSubcategoryId
      ) ?? {
        sourceSubcategoryId,
        action: 'KEEP',
      }
    )
  }

  function setAction(sourceSubcategoryId: string | null, value: string): void {
    const index = actions.value.findIndex(
      a => a.sourceSubcategoryId === sourceSubcategoryId
    )
    if (index === -1) return
    actions.value[index] = decode(value, sourceSubcategoryId)
  }

  function applyPreset(preset: 'default' | 'keep'): void {
    if (!preview.value) return
    actions.value =
      preset === 'keep'
        ? actions.value.map(a => ({
            sourceSubcategoryId: a.sourceSubcategoryId,
            action: 'KEEP' as const,
          }))
        : // "Take everything across" still respects the lines a name collision
          // leaves no choice about: those come back as their forced merge.
          preview.value.defaultActions.map(a => ({ ...a }))
  }

  function countOf(sourceSubcategoryId: string | null): number {
    if (!preview.value) return 0
    if (sourceSubcategoryId === null) return preview.value.uncategorizedCount
    return (
      preview.value.sourceSubcategories.find(s => s.id === sourceSubcategoryId)
        ?.transactionCount ?? 0
    )
  }

  const summary = computed(() => {
    let moved = 0
    let kept = 0
    let created = 0
    let merged = 0
    let keptSubcategories = 0

    for (const action of actions.value) {
      const count = countOf(action.sourceSubcategoryId)
      if (action.action === 'KEEP') {
        kept += count
        if (action.sourceSubcategoryId !== null) keptSubcategories++
        continue
      }
      moved += count
      if (action.sourceSubcategoryId === null) continue
      if (action.action === 'MOVE') created++
      else merged++
    }

    return { moved, kept, created, merged, keptSubcategories }
  })

  const sourceFate = computed(() => {
    const name = preview.value?.sourceCategoryName ?? ''
    if (summary.value.kept === 0 && summary.value.keptSubcategories === 0) {
      return `« ${name} » est conservee, vide.`
    }
    const parts = [`${summary.value.kept} transaction(s)`]
    if (summary.value.keptSubcategories > 0) {
      parts.push(`${summary.value.keptSubcategories} sous-categorie(s)`)
    }
    return `« ${name} » est conservee, avec ${parts.join(' dans ')}.`
  })

  async function confirm(): Promise<void> {
    if (!props.source || !targetId.value) return
    try {
      isMigrating.value = true
      error.value = null
      const result = await api.migrateCategory(
        props.source.id,
        targetId.value,
        actions.value
      )
      toast.success(
        `${result.movedTransactions} transaction(s) deplacee(s) vers « ${preview.value?.targetCategoryName ?? ''} »`
      )
      emit('migrated')
      emit('close')
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Echec du deplacement'
    } finally {
      isMigrating.value = false
    }
  }
</script>

<template>
  <Teleport to="body">
    <div
      v-if="isOpen && source"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div class="absolute inset-0 bg-black/50" @click="emit('close')" />

      <div
        role="dialog"
        aria-labelledby="migrate-category-title"
        class="relative bg-white dark:bg-slate-900 rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-6"
      >
        <h3
          id="migrate-category-title"
          class="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-1"
        >
          Deplacer les transactions de « {{ source.name }} »
        </h3>

        <!-- Step 1: destination -->
        <template v-if="!preview">
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Les transactions et leurs sous-categories rejoindront la categorie
            choisie. « {{ source.name }} » sera conservee.
          </p>

          <label
            for="migrate-target"
            class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Categorie de destination
          </label>
          <select
            id="migrate-target"
            v-model="targetId"
            data-testid="migrate-target-select"
            class="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100 mb-2"
          >
            <option :value="null" disabled>Selectionnez une categorie</option>
            <option v-for="cat in destinations" :key="cat.id" :value="cat.id">
              {{ cat.name }}
            </option>
          </select>
          <p class="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Seules les categories de
            {{ source.type === 'EXPENSE' ? 'depenses' : 'revenus' }} sont
            proposees.
          </p>

          <p
            v-if="error"
            data-testid="migrate-error"
            class="text-sm text-red-600 dark:text-red-400 mb-4"
          >
            {{ error }}
          </p>

          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg"
              @click="emit('close')"
            >
              Annuler
            </button>
            <button
              :disabled="!targetId || isLoading"
              data-testid="migrate-continue"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg"
              :class="
                targetId && !isLoading
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
              "
              @click="loadPreview"
            >
              {{ isLoading ? 'Chargement...' : 'Continuer' }}
            </button>
          </div>
        </template>

        <!-- Step 2: the mapping table -->
        <template v-else>
          <p class="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Vers « {{ preview.targetCategoryName }} ». Chaque ligne est deja
            decidee : validez tel quel pour tout recreer dans la destination.
          </p>

          <div class="flex flex-wrap gap-2 mb-3">
            <button
              type="button"
              data-testid="migrate-preset-default"
              class="px-2.5 py-1 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-300"
              @click="applyPreset('default')"
            >
              Tout recreer
            </button>
            <button
              type="button"
              data-testid="migrate-preset-keep"
              class="px-2.5 py-1 text-xs font-medium border border-gray-300 dark:border-slate-600 rounded-md text-gray-700 dark:text-gray-300"
              @click="applyPreset('keep')"
            >
              Tout garder sur place
            </button>
          </div>

          <ul class="flex flex-col gap-2 mb-4">
            <li
              v-for="sub in preview.sourceSubcategories"
              :key="sub.id"
              :data-testid="`migrate-row-${sub.id}`"
              class="flex flex-wrap items-center gap-2 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2"
              :class="
                actionFor(sub.id).action === 'KEEP'
                  ? 'bg-gray-50 dark:bg-slate-800/50'
                  : ''
              "
            >
              <span
                class="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 min-w-[8rem]"
              >
                {{ sub.name }}
                <span
                  class="text-xs font-normal text-gray-500 dark:text-gray-400"
                >
                  · {{ sub.transactionCount }}
                </span>
              </span>
              <select
                :value="encode(actionFor(sub.id))"
                :aria-label="`Destination de ${sub.name}`"
                :data-testid="`migrate-action-${sub.id}`"
                class="text-sm px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                @change="
                  setAction(sub.id, ($event.target as HTMLSelectElement).value)
                "
              >
                <option v-if="!sub.nameTakenInTarget" value="MOVE">
                  Creer « {{ sub.name }} » dans {{ preview.targetCategoryName }}
                </option>
                <option
                  v-for="target in preview.targetSubcategories"
                  :key="target.id"
                  :value="`MERGE:${target.id}`"
                >
                  Fusionner avec « {{ target.name }} »
                </option>
                <option value="KEEP">
                  Garder dans {{ preview.sourceCategoryName }}
                </option>
              </select>
              <span
                v-if="sub.nameTakenInTarget"
                class="w-full text-xs text-amber-700 dark:text-amber-400"
              >
                « {{ sub.name }} » existe deja dans
                {{ preview.targetCategoryName }} — fusion imposee.
              </span>
            </li>

            <li
              v-if="preview.uncategorizedCount > 0"
              data-testid="migrate-row-uncategorized"
              class="flex flex-wrap items-center gap-2 border border-gray-200 dark:border-slate-700 rounded-lg px-3 py-2"
            >
              <span
                class="text-sm font-medium text-gray-900 dark:text-gray-100 flex-1 min-w-[8rem]"
              >
                Sans sous-categorie
                <span
                  class="text-xs font-normal text-gray-500 dark:text-gray-400"
                >
                  · {{ preview.uncategorizedCount }}
                </span>
              </span>
              <select
                :value="encode(actionFor(null))"
                aria-label="Destination des transactions sans sous-categorie"
                data-testid="migrate-action-uncategorized"
                class="text-sm px-2 py-1.5 border border-gray-300 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-gray-900 dark:text-gray-100"
                @change="
                  setAction(null, ($event.target as HTMLSelectElement).value)
                "
              >
                <option value="MOVE">
                  Deplacer dans {{ preview.targetCategoryName }}, sans
                  sous-categorie
                </option>
                <option
                  v-for="target in preview.targetSubcategories"
                  :key="target.id"
                  :value="`MERGE:${target.id}`"
                >
                  Fusionner avec « {{ target.name }} »
                </option>
                <option value="KEEP">
                  Garder dans {{ preview.sourceCategoryName }}
                </option>
              </select>
            </li>
          </ul>

          <div
            data-testid="migrate-summary"
            class="text-sm bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-2 mb-3"
            aria-live="polite"
          >
            <p class="text-gray-900 dark:text-gray-100">
              {{ summary.moved }} transaction(s) deplacee(s)
              <template v-if="summary.created > 0">
                · {{ summary.created }} sous-categorie(s) creee(s)
              </template>
              <template v-if="summary.merged > 0">
                · {{ summary.merged }} fusion(s)
              </template>
            </p>
            <p class="text-gray-600 dark:text-gray-400">{{ sourceFate }}</p>
          </div>

          <div
            v-if="preview.budgetPlanEntries.length > 0"
            data-testid="migrate-budget-warning"
            class="text-sm text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/50 rounded-lg px-3 py-2 mb-3"
          >
            <p v-for="entry in preview.budgetPlanEntries" :key="entry.planName">
              Budget « {{ entry.planName }} » : la ligne
              {{ preview.sourceCategoryName }} ({{ entry.amount }} €) n'aura
              plus de depenses en face.
            </p>
          </div>

          <p
            v-if="error"
            data-testid="migrate-error"
            class="text-sm text-red-600 dark:text-red-400 mb-3"
          >
            {{ error }}
          </p>

          <div class="flex gap-3">
            <button
              class="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 rounded-lg"
              @click="preview = null"
            >
              Retour
            </button>
            <button
              :disabled="isMigrating || summary.moved === 0"
              data-testid="migrate-confirm"
              class="flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg"
              :class="
                !isMigrating && summary.moved > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-gray-300 dark:bg-slate-600 cursor-not-allowed'
              "
              @click="confirm"
            >
              <template v-if="isMigrating">Deplacement...</template>
              <template v-else-if="summary.moved === 0"
                >Rien a deplacer</template
              >
              <template v-else>Deplacer {{ summary.moved }}</template>
            </button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

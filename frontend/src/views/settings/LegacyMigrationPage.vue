<script setup lang="ts">
  /**
   * The migration assistant: replacing the categories from before the
   * catalogue, one at a time, in three steps.
   *
   *  1. Pick a legacy category. Each is listed with its rows and how many of
   *     its lines already have a suggestion.
   *  2. Decide every line — each legacy subcategory, plus the rows filed at
   *     the category alone. The table opens pre-filled with the dictionary's
   *     guesses, each labelled with what it rests on, and the user corrects.
   *  3. Read what it will do — rows moved, sent back to filing, kept; type
   *     changes; envelopes; the hidden preference — then confirm.
   *
   * The decisions travel as the server expects them; whether an arrangement
   * is possible is the server's call, and its reason is shown as is.
   */
  import { computed, onMounted, ref, watch } from 'vue'
  import { useRouter } from 'vue-router'
  import { api } from '@/lib/api'
  import type {
    CategoryDto,
    LegacyCategoryDto,
    LegacyDecisionDto,
    LegacyLineDto,
    LegacyMigrationPreviewDto,
    SubcategoryDto,
    TagDto,
  } from '@/lib/api'
  import {
    isCatalogCategory,
    kindOf,
    normalizeForSearch,
  } from '@/lib/categories'
  import { useToast } from '@/composables/useToast'
  import CategoryIcon from '@/components/CategoryIcon.vue'
  import SettingsCard from '@/components/settings/SettingsCard.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import EmptyState from '@/components/ui/EmptyState.vue'
  import StepIndicator from '@/components/ui/StepIndicator.vue'

  const router = useRouter()
  const toast = useToast()

  const STEPS = ['Catégorie', 'Décisions', 'Aperçu']
  const step = ref<1 | 2 | 3>(1)

  // ── Data ──────────────────────────────────────────────────────────────────
  const legacy = ref<LegacyCategoryDto[]>([])
  const totalTransactions = ref(0)
  const categories = ref<CategoryDto[]>([])
  const subcategories = ref<SubcategoryDto[]>([])
  const tags = ref<TagDto[]>([])
  const isLoading = ref(false)
  const loadError = ref<string | null>(null)

  async function load(): Promise<void> {
    isLoading.value = true
    loadError.value = null
    try {
      const [overview, cats, subs, tagList] = await Promise.all([
        api.getLegacyCategories(),
        api.getCategories(),
        api.getSubcategories(),
        api.getTags(),
      ])
      legacy.value = overview.categories
      totalTransactions.value = overview.totalTransactions
      categories.value = cats
      subcategories.value = subs
      tags.value = tagList
    } catch (err) {
      loadError.value =
        err instanceof Error
          ? err.message
          : 'Impossible de charger les catégories'
    } finally {
      isLoading.value = false
    }
  }

  onMounted(load)

  // ── Step 1: the legacy category ───────────────────────────────────────────
  const selectedId = ref<string | null>(null)
  const selected = computed(
    () => legacy.value.find(c => c.id === selectedId.value) ?? null
  )

  function suggestedCount(category: LegacyCategoryDto): number {
    return category.lines.filter(l => l.suggestion !== null).length
  }

  function choose(category: LegacyCategoryDto): void {
    selectedId.value = category.id
    resetDecisions(category)
    step.value = 2
  }

  // ── Step 2: one decision per line ─────────────────────────────────────────
  /**
   * The dropdown value encodes the whole filing:
   *   CATALOG:<categoryKey>            → the category alone
   *   CATALOG:<categoryKey>:<subKey>   → one of its catalogue subcategories
   *   CUSTOM:<categoryKey>             → a subcategory of the user's own, named beside
   *   UNFILE | KEEP
   */
  interface LineDraft {
    line: LegacyLineDto
    choice: string
    customName: string
    tagId: string | null
  }
  const drafts = ref<LineDraft[]>([])

  const targets = computed(() =>
    categories.value.filter(
      c =>
        isCatalogCategory(c) &&
        (kindOf(c) === 'TRANSFER' ||
          (selected.value && c.type === selected.value.type))
    )
  )

  function subcategoriesOf(category: CategoryDto): SubcategoryDto[] {
    return subcategories.value
      .filter(s => s.categoryId === category.id && s.catalogKey)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'))
  }

  function resetDecisions(category: LegacyCategoryDto): void {
    drafts.value = category.lines.map(line => {
      const s = line.suggestion
      let choice = 'KEEP'
      if (s?.action === 'UNFILE') choice = 'UNFILE'
      else if (s?.action === 'CATALOG' && s.categoryKey) {
        choice = s.subcategoryKey
          ? `CATALOG:${s.categoryKey}:${s.subcategoryKey}`
          : `CATALOG:${s.categoryKey}`
      }
      const tag = s?.tagName
        ? (tags.value.find(
            t =>
              normalizeForSearch(t.name) ===
              normalizeForSearch(s.tagName as string)
          ) ?? null)
        : null
      return { line, choice, customName: '', tagId: tag?.id ?? null }
    })
  }

  function lineLabel(line: LegacyLineDto): string {
    return line.name ?? 'Transactions sans sous-catégorie'
  }

  const BASIS_LABELS: Record<string, string> = {
    pair: 'd’après le couple catégorie / sous-catégorie',
    subcategory: 'd’après le nom de la sous-catégorie',
    'catalog-label': 'libellé identique dans le catalogue',
    category: 'd’après le nom de la catégorie',
  }

  function basisOf(line: LegacyLineDto): string | null {
    const basis = line.suggestion?.basis
    return basis ? (BASIS_LABELS[basis] ?? basis) : null
  }

  function decisionOf(draft: LineDraft): LegacyDecisionDto {
    const base: LegacyDecisionDto = {
      sourceSubcategoryId: draft.line.sourceSubcategoryId,
      action: 'KEEP',
      tagId: draft.tagId,
    }
    if (draft.choice === 'UNFILE') return { ...base, action: 'UNFILE' }
    if (draft.choice === 'KEEP') return base
    const [action, categoryKey, subcategoryKey] = draft.choice.split(':')
    if (action === 'CUSTOM') {
      return {
        ...base,
        action: 'CUSTOM',
        categoryKey: categoryKey ?? null,
        subcategoryName: draft.customName.trim(),
      }
    }
    return {
      ...base,
      action: 'CATALOG',
      categoryKey: categoryKey ?? null,
      subcategoryKey: subcategoryKey ?? null,
    }
  }

  const decisions = computed(() => drafts.value.map(decisionOf))

  const missingCustomName = computed(() =>
    drafts.value.some(
      d => d.choice.startsWith('CUSTOM:') && d.customName.trim().length === 0
    )
  )

  // A suggested tag that the user does not have yet is one click away.
  const missingTagNames = computed(() => {
    if (!selected.value) return []
    const names = new Set<string>()
    for (const line of selected.value.lines) {
      const name = line.suggestion?.tagName
      if (!name) continue
      const exists = tags.value.some(
        t => normalizeForSearch(t.name) === normalizeForSearch(name)
      )
      if (!exists) names.add(name)
    }
    return [...names]
  })
  const creatingTag = ref<string | null>(null)

  async function createSuggestedTag(name: string): Promise<void> {
    creatingTag.value = name
    try {
      const tag = await api.createTag({ name })
      tags.value = [...tags.value, tag]
      // Every line that suggested this tag now carries it.
      for (const draft of drafts.value) {
        if (
          draft.tagId === null &&
          draft.line.suggestion?.tagName &&
          normalizeForSearch(draft.line.suggestion.tagName) ===
            normalizeForSearch(name)
        ) {
          draft.tagId = tag.id
        }
      }
      toast.success(`Tag « ${tag.name} » créé`)
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : 'Impossible de créer le tag'
      )
    } finally {
      creatingTag.value = null
    }
  }

  // ── Step 3: preview, then apply ───────────────────────────────────────────
  const preview = ref<LegacyMigrationPreviewDto | null>(null)
  const isPreviewing = ref(false)
  const previewError = ref<string | null>(null)
  const isApplying = ref(false)

  async function loadPreview(): Promise<void> {
    if (!selected.value) return
    isPreviewing.value = true
    previewError.value = null
    try {
      preview.value = await api.previewLegacyMigration(
        selected.value.id,
        decisions.value
      )
      step.value = 3
    } catch (err) {
      previewError.value =
        err instanceof Error
          ? err.message
          : 'Impossible de préparer la migration'
    } finally {
      isPreviewing.value = false
    }
  }

  async function apply(): Promise<void> {
    if (!selected.value || isApplying.value) return
    const name = selected.value.name
    isApplying.value = true
    try {
      const result = await api.migrateLegacyCategory(
        selected.value.id,
        decisions.value
      )
      toast.success(
        result.sourceDeleted
          ? `« ${name} » migrée : ${result.movedTransactions} transaction(s) replacée(s), catégorie supprimée`
          : `« ${name} » migrée en partie : ${result.movedTransactions} replacée(s), ${result.keptTransactions} gardée(s)`
      )
      preview.value = null
      selectedId.value = null
      step.value = 1
      await load()
      if (legacy.value.length === 0) {
        await router.push('/settings/categories')
      }
    } catch (err) {
      previewError.value =
        err instanceof Error ? err.message : 'La migration a échoué'
    } finally {
      isApplying.value = false
    }
  }

  function backToDecisions(): void {
    preview.value = null
    previewError.value = null
    step.value = 2
  }

  function backToList(): void {
    selectedId.value = null
    drafts.value = []
    preview.value = null
    previewError.value = null
    step.value = 1
  }

  // Tags created elsewhere, categories renamed: nothing here goes stale
  // silently, because leaving the page and coming back reloads everything.
  watch(step, next => {
    if (next === 1) previewError.value = null
  })
</script>

<template>
  <div class="space-y-6">
    <SettingsCard
      title="Migration vers le catalogue"
      description="Vos catégories d'avant le catalogue, replacées ligne par ligne. Rien n'est perdu : une ligne peut aussi repartir à classer, ou attendre."
    >
      <StepIndicator :steps="STEPS" :current="step" class="mb-6" />

      <div v-if="isLoading && legacy.length === 0" class="py-8">
        <p class="text-center text-sm text-gray-500 dark:text-gray-400">
          Chargement…
        </p>
      </div>

      <div
        v-else-if="loadError"
        role="alert"
        class="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
      >
        {{ loadError }}
      </div>

      <!-- ── Step 1 ─────────────────────────────────────────────────────── -->
      <template v-else-if="step === 1">
        <EmptyState
          v-if="legacy.length === 0"
          title="Tout est dans le catalogue"
          description="Plus aucune catégorie d'avant le catalogue, ni aucune sous-catégorie à ranger."
        >
          <template #action>
            <RouterLink
              to="/settings/categories"
              class="text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
            >
              Retour aux catégories
            </RouterLink>
          </template>
        </EmptyState>

        <template v-else>
          <p class="mb-4 text-sm text-gray-600 dark:text-gray-400">
            {{ legacy.length }} catégorie{{ legacy.length > 1 ? 's' : '' }},
            {{ totalTransactions }} transaction{{
              totalTransactions > 1 ? 's' : ''
            }}
            à replacer. Choisissez par laquelle commencer.
          </p>
          <ul
            class="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-100 dark:divide-slate-700/60 dark:border-slate-700/60"
          >
            <li v-for="category in legacy" :key="category.id">
              <button
                type="button"
                class="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/50"
                :data-testid="`legacy-category-${category.id}`"
                @click="choose(category)"
              >
                <span class="min-w-0 flex-1">
                  <CategoryIcon :icon="category.icon" :name="category.name">
                    <span class="text-sm text-gray-800 dark:text-gray-200">
                      {{ category.name }}
                    </span>
                  </CategoryIcon>
                  <span
                    class="ml-2 text-[10px] uppercase tracking-wide text-gray-400 dark:text-gray-500"
                  >
                    {{ category.type === 'EXPENSE' ? 'Dépense' : 'Revenu' }}
                  </span>
                  <span
                    v-if="category.isCatalog"
                    class="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                    data-testid="tidy-badge"
                  >
                    Sous-catégories à ranger
                  </span>
                  <span
                    v-if="category.isHidden"
                    class="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400"
                  >
                    Masquée
                  </span>
                  <span
                    class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400"
                  >
                    {{ category.transactionCount }} transaction{{
                      category.transactionCount > 1 ? 's' : ''
                    }}
                    · {{ category.lines.length }} ligne{{
                      category.lines.length > 1 ? 's' : ''
                    }}
                    · {{ suggestedCount(category) }} suggérée{{
                      suggestedCount(category) > 1 ? 's' : ''
                    }}
                    <template v-if="category.budgetPlanEntryCount > 0">
                      · {{ category.budgetPlanEntryCount }} enveloppe{{
                        category.budgetPlanEntryCount > 1 ? 's' : ''
                      }}
                    </template>
                  </span>
                </span>
                <svg
                  class="h-4 w-4 shrink-0 text-gray-400"
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
              </button>
            </li>
          </ul>
        </template>
      </template>

      <!-- ── Step 2 ─────────────────────────────────────────────────────── -->
      <template v-else-if="step === 2 && selected">
        <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 class="text-base font-semibold text-gray-900 dark:text-gray-100">
            <CategoryIcon :icon="selected.icon" :name="selected.name">
              {{ selected.name }}
            </CategoryIcon>
            <span class="ml-2 text-sm font-normal text-gray-500">
              {{ selected.transactionCount }} transaction{{
                selected.transactionCount > 1 ? 's' : ''
              }}
            </span>
          </h3>
          <BaseButton variant="ghost" size="sm" @click="backToList">
            ← Autre catégorie
          </BaseButton>
        </div>

        <div
          v-if="missingTagNames.length > 0"
          class="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/20 dark:text-blue-300"
        >
          <span>Cette catégorie encodait un contexte. Créer le tag :</span>
          <button
            v-for="name in missingTagNames"
            :key="name"
            type="button"
            class="rounded-full border border-blue-300 px-2 py-0.5 font-medium hover:bg-blue-100 disabled:opacity-50 dark:border-blue-700 dark:hover:bg-blue-900/40"
            :disabled="creatingTag === name"
            :data-testid="`create-tag-${name}`"
            @click="createSuggestedTag(name)"
          >
            {{ creatingTag === name ? 'Création…' : `« ${name} »` }}
          </button>
        </div>

        <ul class="space-y-3">
          <li
            v-for="draft in drafts"
            :key="draft.line.sourceSubcategoryId ?? 'none'"
            class="rounded-lg border border-gray-100 p-3 dark:border-slate-700/60"
            data-testid="legacy-line"
          >
            <div
              class="mb-2 flex flex-wrap items-baseline justify-between gap-2"
            >
              <span
                class="text-sm font-medium text-gray-800 dark:text-gray-200"
              >
                {{ lineLabel(draft.line) }}
              </span>
              <span class="text-xs text-gray-500 dark:text-gray-400">
                {{ draft.line.transactionCount }} transaction{{
                  draft.line.transactionCount > 1 ? 's' : ''
                }}
              </span>
            </div>

            <div class="grid gap-2 sm:grid-cols-[1fr_minmax(10rem,14rem)]">
              <select
                v-model="draft.choice"
                :aria-label="`Destination de ${lineLabel(draft.line)}`"
                class="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 sm:min-h-0 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                data-testid="line-choice"
              >
                <option value="UNFILE">
                  À classer (le catégoriseur repassera)
                </option>
                <option value="KEEP">Garder pour l'instant</option>
                <optgroup
                  v-for="target in targets"
                  :key="target.id"
                  :label="`${target.icon ? target.icon + ' ' : ''}${target.name}`"
                >
                  <option :value="`CATALOG:${target.catalogKey}`">
                    {{ target.name }}
                    {{
                      kindOf(target) === 'TRANSFER'
                        ? '(transfert)'
                        : '(catégorie seule)'
                    }}
                  </option>
                  <option
                    v-for="sub in subcategoriesOf(target)"
                    :key="sub.id"
                    :value="`CATALOG:${target.catalogKey}:${sub.catalogKey}`"
                  >
                    {{ target.name }} › {{ sub.name }}
                  </option>
                  <option
                    v-if="kindOf(target) !== 'TRANSFER'"
                    :value="`CUSTOM:${target.catalogKey}`"
                  >
                    {{ target.name }} › sous-catégorie personnelle…
                  </option>
                </optgroup>
              </select>

              <select
                v-model="draft.tagId"
                :aria-label="`Tag pour ${lineLabel(draft.line)}`"
                class="min-h-[44px] w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-900 sm:min-h-0 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
                data-testid="line-tag"
              >
                <option :value="null">Sans tag</option>
                <option v-for="tag in tags" :key="tag.id" :value="tag.id">
                  {{ tag.icon ? tag.icon + ' ' : '' }}{{ tag.name }}
                </option>
              </select>
            </div>

            <input
              v-if="draft.choice.startsWith('CUSTOM:')"
              v-model="draft.customName"
              type="text"
              placeholder="Nom de la sous-catégorie personnelle"
              :aria-label="`Nom de la sous-catégorie pour ${lineLabel(draft.line)}`"
              class="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-900 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100"
              data-testid="line-custom-name"
            />

            <p
              v-if="basisOf(draft.line)"
              class="mt-1.5 text-xs text-gray-500 dark:text-gray-400"
            >
              Suggestion {{ basisOf(draft.line) }}
              <template v-if="draft.line.suggestion?.tagName">
                · tag « {{ draft.line.suggestion.tagName }} »
              </template>
            </p>
            <p
              v-else
              class="mt-1.5 text-xs italic text-gray-500 dark:text-gray-400"
            >
              Aucune suggestion : à vous de décider.
            </p>
          </li>
        </ul>

        <div
          v-if="previewError"
          role="alert"
          class="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
          data-testid="preview-error"
        >
          {{ previewError }}
        </div>

        <div class="mt-6 flex justify-end gap-3">
          <BaseButton variant="secondary" @click="backToList"
            >Annuler</BaseButton
          >
          <BaseButton
            :disabled="missingCustomName"
            :loading="isPreviewing"
            data-testid="to-preview"
            @click="loadPreview"
          >
            Voir l'aperçu
          </BaseButton>
        </div>
      </template>

      <!-- ── Step 3 ─────────────────────────────────────────────────────── -->
      <template v-else-if="step === 3 && preview">
        <h3
          class="mb-4 text-base font-semibold text-gray-900 dark:text-gray-100"
        >
          Ce que la migration de « {{ preview.sourceCategoryName }} » va faire
        </h3>

        <dl
          class="mb-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4"
          data-testid="preview-summary"
        >
          <div class="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
            <dt class="text-xs text-gray-500 dark:text-gray-400">Replacées</dt>
            <dd class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ preview.movedTransactions }}
            </dd>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
            <dt class="text-xs text-gray-500 dark:text-gray-400">À classer</dt>
            <dd class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ preview.unfiledTransactions }}
            </dd>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
            <dt class="text-xs text-gray-500 dark:text-gray-400">Gardées</dt>
            <dd class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ preview.keptTransactions }}
            </dd>
          </div>
          <div class="rounded-lg bg-gray-50 p-3 dark:bg-slate-800/60">
            <dt class="text-xs text-gray-500 dark:text-gray-400">
              Changent de type
            </dt>
            <dd class="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {{ preview.typeChangedTransactions }}
            </dd>
          </div>
        </dl>

        <ul class="mb-4 space-y-1.5 text-sm" data-testid="preview-lines">
          <li
            v-for="move in preview.moves"
            :key="move.sourceSubcategoryId ?? 'none'"
            class="flex flex-wrap items-baseline gap-x-2 text-gray-700 dark:text-gray-300"
          >
            <span class="font-medium">
              {{ move.sourceSubcategoryName ?? 'Sans sous-catégorie' }}
            </span>
            <span class="text-gray-400">({{ move.transactionCount }})</span>
            <span>→</span>
            <span>
              {{ move.categoryName
              }}<template v-if="move.subcategoryName">
                › {{ move.subcategoryName }}</template
              >
            </span>
            <span
              v-if="move.createsSubcategory"
              class="rounded-full bg-primary-50 px-1.5 text-[10px] text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
              >nouvelle</span
            >
            <span
              v-if="move.reparentsSubcategory"
              class="rounded-full bg-gray-100 px-1.5 text-[10px] text-gray-600 dark:bg-slate-700 dark:text-gray-300"
              >déplacée telle quelle</span
            >
            <span
              v-if="move.changesType"
              class="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
              >devient un transfert</span
            >
            <span v-if="move.tagId" class="text-xs text-gray-500">+ tag</span>
          </li>
          <li
            v-for="unfile in preview.unfiles"
            :key="`unfile-${unfile.sourceSubcategoryId ?? 'none'}`"
            class="flex flex-wrap items-baseline gap-x-2 text-gray-700 dark:text-gray-300"
          >
            <span class="font-medium">
              {{ unfile.sourceSubcategoryName ?? 'Sans sous-catégorie' }}
            </span>
            <span class="text-gray-400">({{ unfile.transactionCount }})</span>
            <span>→ à classer</span>
            <span v-if="unfile.tagId" class="text-xs text-gray-500">+ tag</span>
          </li>
        </ul>

        <ul
          class="mb-6 space-y-1 text-xs text-gray-600 dark:text-gray-400"
          data-testid="preview-effects"
        >
          <li v-for="entry in preview.budgetEntries" :key="entry.planName">
            Enveloppe « {{ entry.planName }} » ({{ entry.amount }} €) :
            <template v-if="entry.targetCategoryName">
              suit « {{ entry.targetCategoryName }} »<template
                v-if="entry.mergesIntoExisting"
              >
                et s'ajoute à celle qui existe</template
              >.
            </template>
            <template v-else>supprimée, rien de budgété ne la reçoit.</template>
          </li>
          <li v-if="preview.dropsHiddenPreference">
            La catégorie était masquée du tableau de bord ; cette préférence
            disparaît avec elle.
          </li>
          <li>
            <template v-if="preview.deletesSourceCategory">
              La catégorie sera supprimée une fois vide.
            </template>
            <template v-else-if="selected?.isCatalog">
              La catégorie fait partie du catalogue et reste en place ; seules
              les sous-catégories rangées disparaissent.
            </template>
            <template v-else>
              La catégorie est conservée : des lignes restent à décider.
            </template>
          </li>
        </ul>

        <div
          v-if="previewError"
          role="alert"
          class="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400"
        >
          {{ previewError }}
        </div>

        <div class="flex justify-end gap-3">
          <BaseButton
            variant="secondary"
            :disabled="isApplying"
            @click="backToDecisions"
          >
            ← Corriger
          </BaseButton>
          <BaseButton
            :loading="isApplying"
            data-testid="apply-migration"
            @click="apply"
          >
            Migrer
          </BaseButton>
        </div>
      </template>
    </SettingsCard>
  </div>
</template>

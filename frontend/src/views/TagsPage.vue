<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { RouterLink } from 'vue-router'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import { useTagsStore } from '@/stores/tags'
  import type { CreateTagFamilyDto, TagDto, TagFamilyDto } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'
  import IconChevronDown from '@/components/icons/IconChevronDown.vue'
  import IconPencil from '@/components/icons/IconPencil.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import TagColorPicker from '@/components/tags/TagColorPicker.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'
  import { formatCompactCurrency } from '@/lib/formatters'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import TagForm from '@/components/tags/TagForm.vue'
  import SectionLabel from '@/components/ui/SectionLabel.vue'
  import SegmentedControl, {
    type SegmentedOption,
  } from '@/components/ui/SegmentedControl.vue'
  import TagCard from '@/components/tags/TagCard.vue'
  import {
    eventYear,
    eventYears,
    groupEventsByFamily,
    splitTagSections,
  } from '@/components/tags/tagSections'
  import {
    DEFAULT_TAG_COLOR,
    emptyTagForm,
    type TagFormValue,
  } from '@/components/tags/tagFormModel'

  const tagsStore = useTagsStore()
  const toast = useToast()

  // Create form state
  // The creation form is a screen of controls on a phone; it folds
  // behind one button there and stays open on a desk.
  const isMobile = useIsMobile()
  const createOpen = ref(false)
  const draft = ref<TagFormValue>(emptyTagForm())
  const creating = ref(false)

  /**
   * The event period is only meaningful for an exceptional tag, and only when
   * both bounds are known — a half-filled range would silently skew every
   * everyday average.
   */
  function eventPeriod(value: TagFormValue): {
    eventStartDate: string | null
    eventEndDate: string | null
  } {
    const { isExceptional, eventStart: start, eventEnd: end } = value
    if (isExceptional && start && end && start <= end) {
      return { eventStartDate: start, eventEndDate: end }
    }
    return { eventStartDate: null, eventEndDate: null }
  }

  /** A family groups events: only an exceptional tag is filed under one. */
  function familyOf(value: TagFormValue): string | null {
    return value.isExceptional ? value.familyId : null
  }

  /** The form creates a family on the spot; the store keeps the list. */
  function createFamily(dto: CreateTagFamilyDto): Promise<TagFamilyDto | null> {
    return tagsStore.addFamily(dto)
  }

  /** The envelope only exists on an exceptional tag, and never below zero. */
  function budgetOf(value: TagFormValue): number | null {
    if (!value.isExceptional || value.budget === null) return null
    return value.budget >= 0 ? value.budget : null
  }

  async function createTag(): Promise<void> {
    const name = draft.value.name.trim()
    if (!name || creating.value) return
    creating.value = true
    const period = eventPeriod(draft.value)
    const familyId = familyOf(draft.value)
    const created = await tagsStore.addTag({
      name,
      color: draft.value.color,
      isExceptional: draft.value.isExceptional,
      ...(period.eventStartDate && period.eventEndDate
        ? {
            eventStartDate: period.eventStartDate,
            eventEndDate: period.eventEndDate,
          }
        : {}),
      ...(familyId !== null ? { familyId } : {}),
    })
    creating.value = false
    if (created) {
      draft.value = emptyTagForm()
      createOpen.value = false
      toast.success(`Étiquette « ${created.name} » créée`)
    }
  }

  // Edit state: the same form, in a dialog, so the card keeps its shape.
  const editingTag = ref<TagDto | null>(null)
  const editDraft = ref<TagFormValue>(emptyTagForm())
  const savingEdit = ref(false)

  function startEdit(tag: TagDto): void {
    editingTag.value = tag
    editDraft.value = {
      name: tag.name,
      color: tag.color ?? DEFAULT_TAG_COLOR,
      isExceptional: tag.isExceptional,
      eventStart: tag.eventStartDate ?? '',
      eventEnd: tag.eventEndDate ?? '',
      budget: tag.budgetAmount,
      familyId: tag.familyId,
    }
  }

  function cancelEdit(): void {
    editingTag.value = null
  }

  async function saveEdit(): Promise<void> {
    const tag = editingTag.value
    const name = editDraft.value.name.trim()
    if (!tag || !name || savingEdit.value) return
    savingEdit.value = true
    const ok = await tagsStore.updateTag(tag.id, {
      name,
      color: editDraft.value.color,
      isExceptional: editDraft.value.isExceptional,
      ...eventPeriod(editDraft.value),
      // A tag that stops being exceptional stops being a project too.
      budgetAmount: budgetOf(editDraft.value),
      familyId: familyOf(editDraft.value),
    })
    savingEdit.value = false
    if (ok) {
      editingTag.value = null
      toast.success(`Étiquette « ${name} » modifiée`)
    }
  }

  // Three natures of tag, three sections: dated events, undated episodes,
  // long-running themes.
  const sections = computed(() => splitTagSections(tagsStore.tags))

  // Events filter by the year their window starts in; null is every year.
  const selectedYear = ref<number | null>(null)
  const years = computed(() => eventYears(sections.value.events))
  // A year that no longer has an event (its last one deleted or re-dated)
  // falls back to every year rather than showing an empty section.
  const activeYear = computed(() =>
    selectedYear.value !== null && years.value.includes(selectedYear.value)
      ? selectedYear.value
      : null
  )
  const yearOptions = computed<SegmentedOption<number | null>[]>(() => [
    { value: null, label: 'Toutes', testId: 'events-year-all' },
    ...years.value.map(year => ({
      value: year,
      label: String(year),
      testId: `events-year-${year}`,
    })),
  ])
  const yearModel = computed<number | null>({
    get: () => activeYear.value,
    set: value => {
      selectedYear.value = value
    },
  })
  const visibleEvents = computed(() =>
    activeYear.value === null
      ? sections.value.events
      : sections.value.events.filter(tag => eventYear(tag) === activeYear.value)
  )

  // Events grouped by family, those without one last.
  const eventGroups = computed(() => groupEventsByFamily(visibleEvents.value))
  const hasFamilies = computed(() => tagsStore.families.length > 0)

  /** How many tags a family holds, read off the tags as they stand now. */
  function tagCountOf(familyId: string): number {
    return tagsStore.tags.filter(t => t.familyId === familyId).length
  }

  // A family is renamed or recoloured in a dialog, from its group's heading
  // or from the list of families.
  const editingFamily = ref<TagFamilyDto | null>(null)
  const familyName = ref('')
  const familyColor = ref<string | null>(null)
  const familyBudget = ref<number | null>(null)
  const savingFamily = ref(false)

  function startEditFamily(id: string): void {
    const family = tagsStore.families.find(f => f.id === id)
    if (!family) return
    editingFamily.value = family
    familyName.value = family.name
    familyColor.value = family.color
    familyBudget.value = family.annualBudget
  }

  async function saveFamily(): Promise<void> {
    const family = editingFamily.value
    const name = familyName.value.trim()
    if (!family || !name || savingFamily.value) return
    savingFamily.value = true
    // Emptied, the envelope is cleared; never below zero. Sent only when it
    // changed, like a field the dialog did not touch.
    const annualBudget =
      familyBudget.value !== null && familyBudget.value >= 0
        ? familyBudget.value
        : null
    const ok = await tagsStore.updateFamily(family.id, {
      name,
      color: familyColor.value,
      ...(annualBudget !== family.annualBudget ? { annualBudget } : {}),
    })
    savingFamily.value = false
    if (ok) {
      editingFamily.value = null
      toast.success(`Famille « ${name} » modifiée`)
    }
  }

  // Deleting a family keeps its tags, without a family: the dialog says so.
  const familyToDelete = ref<TagFamilyDto | null>(null)
  const deletingFamily = ref(false)

  async function confirmDeleteFamily(): Promise<void> {
    const family = familyToDelete.value
    if (!family || deletingFamily.value) return
    deletingFamily.value = true
    const ok = await tagsStore.removeFamily(family.id)
    deletingFamily.value = false
    familyToDelete.value = null
    if (ok) toast.success(`Famille « ${family.name} » supprimée`)
  }

  // Delete confirmation: a real dialog (named, Escape closes it), not an
  // overlay painted over the card.
  const tagToDelete = ref<TagDto | null>(null)
  const deleting = ref(false)

  async function confirmDelete(): Promise<void> {
    const tag = tagToDelete.value
    if (!tag || deleting.value) return
    deleting.value = true
    const ok = await tagsStore.removeTag(tag.id)
    deleting.value = false
    tagToDelete.value = null
    if (ok) toast.success(`Étiquette « ${tag.name} » supprimée`)
  }

  // Only the initial fetch decides this: a failed creation is a toast, not
  // a page that "could not load".
  const loadFailed = ref(false)
  async function loadTags(): Promise<void> {
    await tagsStore.fetchTags()
    loadFailed.value = tagsStore.error !== null
  }

  onMounted(() => {
    void loadTags()
    void tagsStore.fetchFamilies()
  })
</script>

<template>
  <PageShell>
    <PageHeader
      title="Étiquettes"
      subtitle="Regroupez des transactions (événement, vacances…) et analysez-les."
    />

    <!-- Create form -->
    <BaseCard padding="sm" class="mb-6">
      <button
        type="button"
        data-testid="toggle-create-tag"
        class="flex min-h-[44px] w-full items-center justify-between gap-2 text-sm font-medium text-gray-800 md:hidden dark:text-gray-200"
        :aria-expanded="createOpen"
        @click="createOpen = !createOpen"
      >
        <span class="inline-flex items-center gap-2">
          <IconPlus class="h-4 w-4 text-primary-700 dark:text-primary-400" />
          Nouvelle étiquette
        </span>
        <IconChevronDown
          class="h-4 w-4 text-gray-500 transition-transform"
          :class="{ 'rotate-180': createOpen }"
        />
      </button>
      <div v-show="!isMobile || createOpen" class="mt-3 md:mt-0">
        <h2
          class="mb-3 hidden text-sm font-semibold text-gray-800 md:block dark:text-gray-200"
        >
          Nouvelle étiquette
        </h2>
        <TagForm
          v-model="draft"
          test-id="new-tag"
          :families="tagsStore.families"
          :create-family="createFamily"
          @submit="createTag"
        >
          <template #actions>
            <div class="flex justify-end">
              <BaseButton
                type="submit"
                :disabled="!draft.name.trim()"
                :loading="creating"
                data-testid="create-tag"
              >
                Créer
              </BaseButton>
            </div>
          </template>
        </TagForm>
      </div>
    </BaseCard>

    <!-- Loading -->
    <div
      v-if="tagsStore.isLoading && tagsStore.tags.length === 0"
      class="py-12 text-center text-gray-500 dark:text-gray-400"
    >
      Chargement…
    </div>

    <!-- Failed load: not the same as having no tag -->
    <InlineAlert
      v-else-if="loadFailed && tagsStore.tags.length === 0"
      data-testid="tags-load-error"
      retry-label="Réessayer"
      retry-test-id="tags-retry"
      :retrying="tagsStore.isLoading"
      @retry="loadTags"
    >
      Les étiquettes n'ont pas pu être chargées.
    </InlineAlert>

    <!-- Empty -->
    <div
      v-else-if="tagsStore.tags.length === 0"
      class="py-12 text-center text-gray-500 dark:text-gray-400"
    >
      Aucune étiquette pour l'instant. Créez-en une ci-dessus, puis attribuez-la
      à des transactions.
    </div>

    <!-- Three sections, one per nature of tag. A section with no tag is
         left out rather than shown empty. -->
    <div v-else class="flex flex-col gap-8">
      <section
        v-if="sections.events.length > 0"
        aria-labelledby="tags-events-heading"
        data-testid="tags-section-events"
      >
        <div
          class="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2"
        >
          <SectionLabel id="tags-events-heading" as="h2">
            Événements
          </SectionLabel>
          <SegmentedControl
            v-if="years.length > 1"
            v-model="yearModel"
            :options="yearOptions"
            label="Année des événements"
            size="sm"
            scrollable
            data-testid="events-year-filter"
          />
        </div>
        <!-- Without any family the grid stays as it was: one « Sans
             famille » heading over every event would say nothing. -->
        <div
          v-if="!hasFamilies"
          class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <TagCard
            v-for="tag in visibleEvents"
            :key="tag.id"
            :tag="tag"
            @edit="startEdit(tag)"
            @delete="tagToDelete = tag"
          />
        </div>
        <div v-else class="flex flex-col gap-5">
          <div
            v-for="group in eventGroups"
            :key="group.family?.id ?? 'none'"
            :data-testid="`tags-family-group-${group.family?.id ?? 'none'}`"
          >
            <div class="mb-2 flex items-center gap-2">
              <span
                v-if="group.family"
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: group.family.color ?? '#9ca3af' }"
                aria-hidden="true"
              ></span>
              <h3
                class="text-sm font-semibold text-gray-700 dark:text-gray-300"
              >
                <RouterLink
                  v-if="group.family"
                  :to="{ name: 'tag-family', params: { id: group.family.id } }"
                  class="hover:text-primary-700 hover:underline dark:hover:text-primary-400"
                  :data-testid="`family-group-link-${group.family.id}`"
                >
                  {{ group.family.name }}
                </RouterLink>
                <template v-else>Sans famille</template>
              </h3>
              <BaseIconButton
                v-if="group.family"
                size="sm"
                :label="`Modifier la famille ${group.family.name}`"
                :data-testid="`edit-family-${group.family.id}`"
                @click="startEditFamily(group.family.id)"
              >
                <IconPencil />
              </BaseIconButton>
            </div>
            <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <TagCard
                v-for="tag in group.tags"
                :key="tag.id"
                :tag="tag"
                @edit="startEdit(tag)"
                @delete="tagToDelete = tag"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        v-if="sections.episodes.length > 0"
        aria-labelledby="tags-episodes-heading"
        data-testid="tags-section-episodes"
      >
        <SectionLabel id="tags-episodes-heading" as="h2" class="mb-3">
          Épisodes sans date
        </SectionLabel>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TagCard
            v-for="tag in sections.episodes"
            :key="tag.id"
            :tag="tag"
            @edit="startEdit(tag)"
            @delete="tagToDelete = tag"
          />
        </div>
      </section>

      <section
        v-if="sections.themes.length > 0"
        aria-labelledby="tags-themes-heading"
        data-testid="tags-section-themes"
      >
        <SectionLabel id="tags-themes-heading" as="h2" class="mb-3">
          Thèmes
        </SectionLabel>
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TagCard
            v-for="tag in sections.themes"
            :key="tag.id"
            :tag="tag"
            @edit="startEdit(tag)"
            @delete="tagToDelete = tag"
          />
        </div>
      </section>

      <section
        v-if="hasFamilies"
        aria-labelledby="tags-families-heading"
        data-testid="tags-section-families"
      >
        <SectionLabel id="tags-families-heading" as="h2" class="mb-3">
          Familles
        </SectionLabel>
        <BaseCard padding="none">
          <ul class="divide-y divide-gray-100 dark:divide-slate-700">
            <li
              v-for="family in tagsStore.families"
              :key="family.id"
              class="flex items-center gap-2 px-4 py-2"
              :data-testid="`family-row-${family.id}`"
            >
              <span
                class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: family.color ?? '#9ca3af' }"
                aria-hidden="true"
              ></span>
              <RouterLink
                :to="{ name: 'tag-family', params: { id: family.id } }"
                class="min-w-0 flex-1 truncate text-sm text-gray-900 hover:text-primary-700 hover:underline dark:text-gray-100 dark:hover:text-primary-400"
                :data-testid="`family-row-link-${family.id}`"
              >
                {{ family.name }}
              </RouterLink>
              <span
                class="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400"
              >
                {{ tagCountOf(family.id) }} étiquette(s)
              </span>
              <span
                v-if="family.annualBudget !== null"
                class="shrink-0 text-xs tabular-nums text-gray-500 dark:text-gray-400"
                :data-testid="`family-row-budget-${family.id}`"
              >
                {{ formatCompactCurrency(family.annualBudget) }} par an
              </span>
              <TransactionsLink
                v-if="tagCountOf(family.id) > 0"
                :to="transactionsLink({ tagFamilyId: family.id })"
                :subject="`la famille ${family.name}`"
                icon-only
                :data-testid="`family-transactions-link-${family.id}`"
              />
              <BaseIconButton
                size="sm"
                :label="`Modifier la famille ${family.name}`"
                @click="startEditFamily(family.id)"
              >
                <IconPencil />
              </BaseIconButton>
              <BaseIconButton
                size="sm"
                variant="danger"
                :label="`Supprimer la famille ${family.name}`"
                :data-testid="`delete-family-${family.id}`"
                @click="familyToDelete = family"
              >
                <IconTrash />
              </BaseIconButton>
            </li>
          </ul>
        </BaseCard>
      </section>
    </div>

    <!-- Edit: the same form as the creation, in a dialog -->
    <BaseModal
      :open="editingTag !== null"
      :title="editingTag ? `Modifier « ${editingTag.name} »` : ''"
      :closable="!savingEdit"
      data-testid="edit-tag-modal"
      @close="cancelEdit"
    >
      <TagForm
        v-if="editingTag"
        v-model="editDraft"
        test-id="edit-tag"
        :families="tagsStore.families"
        :create-family="createFamily"
        :show-budget="editingTag.budgetAmount !== null"
        @submit="saveEdit"
      />
      <template #footer>
        <BaseButton
          variant="secondary"
          :disabled="savingEdit"
          @click="cancelEdit"
        >
          Annuler
        </BaseButton>
        <BaseButton
          :disabled="!editDraft.name.trim()"
          :loading="savingEdit"
          data-testid="save-tag"
          @click="saveEdit"
        >
          Enregistrer
        </BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="tagToDelete !== null"
      :title="`Supprimer « ${tagToDelete?.name ?? ''} » ?`"
      :loading="deleting"
      @confirm="confirmDelete"
      @cancel="tagToDelete = null"
    >
      Les transactions qui portent cette étiquette ne sont pas supprimées.
    </ConfirmDialog>

    <BaseModal
      :open="editingFamily !== null"
      :title="
        editingFamily ? `Modifier la famille « ${editingFamily.name} »` : ''
      "
      :closable="!savingFamily"
      data-testid="edit-family-modal"
      @close="editingFamily = null"
    >
      <form class="space-y-4" @submit.prevent="saveFamily">
        <BaseField
          v-model="familyName"
          size="sm"
          type="text"
          label="Nom de la famille"
          data-testid="edit-family-name"
        />
        <TagColorPicker v-model="familyColor" />
        <BaseField
          v-model="familyBudget"
          amount
          size="sm"
          label="Enveloppe annuelle (facultatif)"
          hint="Par année civile, pour toute la famille ; vide pour aucune"
          placeholder="—"
          class="w-48 [&_input]:text-right"
          data-testid="edit-family-budget"
        />
      </form>
      <template #footer>
        <BaseButton
          variant="secondary"
          :disabled="savingFamily"
          @click="editingFamily = null"
        >
          Annuler
        </BaseButton>
        <BaseButton
          :disabled="!familyName.trim()"
          :loading="savingFamily"
          data-testid="save-family"
          @click="saveFamily"
        >
          Enregistrer
        </BaseButton>
      </template>
    </BaseModal>

    <ConfirmDialog
      :open="familyToDelete !== null"
      :title="`Supprimer la famille « ${familyToDelete?.name ?? ''} » ?`"
      :loading="deletingFamily"
      data-testid="delete-family-dialog"
      @confirm="confirmDeleteFamily"
      @cancel="familyToDelete = null"
    >
      {{
        familyToDelete && tagCountOf(familyToDelete.id) > 0
          ? `Ses ${tagCountOf(familyToDelete.id)} étiquette(s) sont conservées, sans famille.`
          : 'Elle ne contient aucune étiquette.'
      }}
    </ConfirmDialog>
  </PageShell>
</template>

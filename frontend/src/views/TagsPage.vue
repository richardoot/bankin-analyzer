<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import { useTagsStore } from '@/stores/tags'
  import type { TagDto } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'
  import IconChevronDown from '@/components/icons/IconChevronDown.vue'
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
    const budget = budgetOf(draft.value)
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
      ...(budget !== null ? { budgetAmount: budget } : {}),
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
        <TagForm v-model="draft" test-id="new-tag" @submit="createTag">
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
        <div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TagCard
            v-for="tag in visibleEvents"
            :key="tag.id"
            :tag="tag"
            @edit="startEdit(tag)"
            @delete="tagToDelete = tag"
          />
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
  </PageShell>
</template>

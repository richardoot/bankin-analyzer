<script setup lang="ts">
  import { onMounted, ref } from 'vue'
  import { useIsMobile } from '@/composables/useMediaQuery'
  import PageShell from '@/components/ui/PageShell.vue'
  import PageHeader from '@/components/ui/PageHeader.vue'
  import { RouterLink } from 'vue-router'
  import { useTagsStore } from '@/stores/tags'
  import type { TagDto } from '@/lib/api'
  import { useToast } from '@/composables/useToast'
  import { formatCurrency } from '@/lib/formatters'
  import InlineAlert from '@/components/ui/InlineAlert.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import BaseIconButton from '@/components/ui/BaseIconButton.vue'
  import BaseModal from '@/components/ui/BaseModal.vue'
  import IconPlus from '@/components/icons/IconPlus.vue'
  import IconChevronDown from '@/components/icons/IconChevronDown.vue'
  import IconChevronRight from '@/components/icons/IconChevronRight.vue'
  import IconPencil from '@/components/icons/IconPencil.vue'
  import IconTrash from '@/components/icons/IconTrash.vue'
  import BaseCard from '@/components/ui/BaseCard.vue'
  import ConfirmDialog from '@/components/ui/ConfirmDialog.vue'
  import TagForm from '@/components/tags/TagForm.vue'
  import TransactionsLink from '@/components/ui/TransactionsLink.vue'
  import { transactionsLink } from '@/lib/transactionsLink'
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

    <!-- Tag cards: an article, with its own link and its own actions —
         not a button wrapped around blocks, with controls hidden until
         hovered. -->
    <div v-else class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <BaseCard
        v-for="tag in tagsStore.tags"
        :key="tag.id"
        as="article"
        padding="sm"
        class="flex flex-col gap-2"
        :data-testid="`tag-card-${tag.name}`"
      >
        <div class="flex items-start justify-between gap-2">
          <div class="flex min-w-0 items-center gap-2">
            <span
              class="inline-block h-3 w-3 shrink-0 rounded-full"
              :style="{ backgroundColor: tag.color ?? '#9ca3af' }"
            ></span>
            <h3
              class="truncate font-semibold text-gray-900 dark:text-gray-100"
              :title="tag.name"
            >
              {{ tag.name }}
            </h3>
          </div>
          <div class="flex shrink-0 items-center">
            <BaseIconButton
              size="sm"
              :label="`Modifier ${tag.name}`"
              :data-testid="`edit-tag-${tag.name}`"
              @click="startEdit(tag)"
            >
              <IconPencil />
            </BaseIconButton>
            <BaseIconButton
              size="sm"
              variant="danger"
              :label="`Supprimer ${tag.name}`"
              @click="tagToDelete = tag"
            >
              <IconTrash />
            </BaseIconButton>
          </div>
        </div>
        <p class="text-sm text-gray-500 dark:text-gray-400">
          <TransactionsLink
            :to="transactionsLink({ tagId: tag.id, label: tag.name })"
            :subject="tag.name"
            size="md"
            :data-testid="`tag-transactions-link-${tag.id}`"
          >
            {{ tag.transactionCount }} transaction(s)
          </TransactionsLink>
        </p>
        <div
          v-if="tag.isExceptional"
          class="flex flex-wrap items-center gap-1.5"
        >
          <span
            class="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-400"
          >
            Exceptionnel
          </span>
          <span
            v-if="tag.eventStartDate && tag.eventEndDate"
            class="text-[11px] text-gray-500 dark:text-gray-400"
          >
            {{ formatPeriod(tag.eventStartDate, tag.eventEndDate) }}
          </span>
          <span
            v-if="tag.budgetAmount !== null"
            :data-testid="`tag-budget-${tag.name}`"
            class="inline-flex shrink-0 items-center rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-medium tabular-nums text-primary-700 dark:bg-primary-900/40 dark:text-primary-400"
          >
            Enveloppe {{ formatCurrency(tag.budgetAmount) }}
          </span>
        </div>
        <RouterLink
          :to="{ name: 'tag-analysis', params: { id: tag.id } }"
          class="mt-auto inline-flex min-h-[44px] items-center gap-1 self-start text-sm font-medium text-primary-700 hover:underline sm:min-h-0 dark:text-primary-400"
          :data-testid="`analyse-tag-${tag.name}`"
        >
          Analyser
          <IconChevronRight class="h-3.5 w-3.5" />
        </RouterLink>
      </BaseCard>
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

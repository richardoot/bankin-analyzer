<script setup lang="ts">
  /**
   * Which family a tag is an edition of: none, one of the user's, or a new
   * one created on the spot without leaving the tag's form. While the user
   * has no family, a few names are offered as shortcuts; choosing one only
   * opens the creation, pre-filled — nothing is written until « Créer la
   * famille » is pressed. The annual envelope can be set right away, or
   * later from the family's own dialog.
   */
  import { computed, nextTick, ref } from 'vue'
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseButton from '@/components/ui/BaseButton.vue'
  import TagColorPicker from './TagColorPicker.vue'
  import { DEFAULT_TAG_COLOR, FAMILY_SUGGESTIONS } from './tagFormModel'
  import type { CreateTagFamilyDto, TagFamilyDto } from '@/lib/api'

  const props = defineProps<{
    families: readonly TagFamilyDto[]
    /** Creates the family and hands it back, or null when it failed. */
    createFamily: (dto: CreateTagFamilyDto) => Promise<TagFamilyDto | null>
    /** A test id prefix, so each form's fields can be addressed. */
    testId: string
  }>()

  const model = defineModel<string | null>({ required: true })

  const NONE = ''
  const NEW = '__new__'
  const SUGGESTION = 'suggestion:'

  /** What the select shows while a family is being created, else null. */
  const pendingChoice = ref<string | null>(null)
  const newName = ref('')
  const newColor = ref<string | null>(DEFAULT_TAG_COLOR)
  const newBudget = ref<number | null>(null)
  const saving = ref(false)
  const nameField = ref<InstanceType<typeof BaseField> | null>(null)

  const selectValue = computed(() => pendingChoice.value ?? model.value ?? NONE)

  const suggestions = computed(() =>
    props.families.length === 0 ? FAMILY_SUGGESTIONS : []
  )

  function onSelect(value: string | number | null): void {
    const choice = String(value ?? NONE)
    if (choice === NEW || choice.startsWith(SUGGESTION)) {
      pendingChoice.value = choice
      newName.value = choice === NEW ? '' : choice.slice(SUGGESTION.length)
      newColor.value = DEFAULT_TAG_COLOR
      newBudget.value = null
      void nextTick(() => {
        const input = (
          nameField.value?.$el as HTMLElement | undefined
        )?.querySelector('input')
        input?.focus()
      })
      return
    }
    pendingChoice.value = null
    model.value = choice === NONE ? null : choice
  }

  function cancel(): void {
    pendingChoice.value = null
  }

  async function confirm(): Promise<void> {
    const name = newName.value.trim()
    if (!name || saving.value) return
    saving.value = true
    const created = await props.createFamily({
      name,
      ...(newColor.value ? { color: newColor.value } : {}),
      ...(newBudget.value !== null && newBudget.value >= 0
        ? { annualBudget: newBudget.value }
        : {}),
    })
    saving.value = false
    if (created) {
      pendingChoice.value = null
      model.value = created.id
    }
  }
</script>

<template>
  <div class="space-y-2">
    <BaseField
      as="select"
      size="sm"
      label="Famille"
      hint="Le genre d'événement : voyages, compétitions, concerts…"
      class="max-w-xs"
      :model-value="selectValue"
      :data-testid="`${testId}-family`"
      @update:model-value="onSelect"
    >
      <option :value="NONE">Aucune</option>
      <option v-for="f in families" :key="f.id" :value="f.id">
        {{ f.name }}
      </option>
      <optgroup v-if="suggestions.length > 0" label="Suggestions">
        <option
          v-for="name in suggestions"
          :key="name"
          :value="`${SUGGESTION}${name}`"
        >
          {{ name }}
        </option>
      </optgroup>
      <option :value="NEW">Nouvelle famille…</option>
    </BaseField>

    <div
      v-if="pendingChoice !== null"
      role="group"
      aria-label="Nouvelle famille"
      class="space-y-3 rounded-lg border border-gray-200 p-3 dark:border-slate-700"
      :data-testid="`${testId}-new-family`"
    >
      <BaseField
        ref="nameField"
        v-model="newName"
        size="sm"
        type="text"
        label="Nom de la famille"
        placeholder="ex : Voyages"
        :data-testid="`${testId}-new-family-name`"
        @keydown.enter.prevent="confirm"
      />
      <TagColorPicker v-model="newColor" legend="Couleur de la famille" />
      <BaseField
        v-model="newBudget"
        amount
        size="sm"
        label="Enveloppe annuelle (facultatif)"
        hint="Par année civile, pour toute la famille"
        placeholder="—"
        class="w-48 [&_input]:text-right"
        :data-testid="`${testId}-new-family-budget`"
      />
      <div class="flex justify-end gap-2">
        <BaseButton
          variant="secondary"
          size="sm"
          :disabled="saving"
          :data-testid="`${testId}-new-family-cancel`"
          @click="cancel"
        >
          Annuler
        </BaseButton>
        <BaseButton
          size="sm"
          :disabled="!newName.trim()"
          :loading="saving"
          :data-testid="`${testId}-new-family-create`"
          @click="confirm"
        >
          Créer la famille
        </BaseButton>
      </div>
    </div>
  </div>
</template>

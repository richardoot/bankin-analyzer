<script setup lang="ts">
  /**
   * What a tag is made of, asked the same way whether it is being created
   * or edited: a name, a colour, whether it is an exceptional event, and
   * for an event its absence period and its envelope. One form, so the
   * two screens stop drifting apart in controls and sizes.
   *
   * The family is asked of an exceptional tag only: it groups events, and a
   * theme is not the edition of anything (agent-os/product/tag-families.md).
   *
   * The envelope is set on the family, by year. A tag's own envelope is no
   * longer asked at creation; editing shows it only to a tag that already
   * carries one, so it can still be read, changed or cleared.
   */
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'
  import TagColorPicker from './TagColorPicker.vue'
  import TagFamilyField from './TagFamilyField.vue'
  import type { CreateTagFamilyDto, TagFamilyDto } from '@/lib/api'

  import type { TagFormValue } from './tagFormModel'

  withDefaults(
    defineProps<{
      /** A test id prefix, so each form's fields can be addressed. */
      testId: string
      /** The user's families, offered in the Famille field. */
      families?: readonly TagFamilyDto[]
      /**
       * Creates a family from the form. Without it the Famille field is
       * left out.
       */
      createFamily?:
        ((dto: CreateTagFamilyDto) => Promise<TagFamilyDto | null>) | undefined
      /** Shows the tag's own envelope: only for a tag that carries one. */
      showBudget?: boolean
    }>(),
    { families: () => [], createFamily: undefined, showBudget: false }
  )

  const emit = defineEmits<{ submit: [] }>()

  const model = defineModel<TagFormValue>({ required: true })

  function patch(partial: Partial<TagFormValue>): void {
    model.value = { ...model.value, ...partial }
  }
</script>

<template>
  <form class="space-y-4" @submit.prevent="emit('submit')">
    <BaseField
      :model-value="model.name"
      size="sm"
      type="text"
      label="Nom de l'étiquette"
      placeholder="ex : Vacances Italie"
      :data-testid="`${testId}-name`"
      @update:model-value="patch({ name: String($event) })"
    />

    <TagColorPicker
      :model-value="model.color"
      @update:model-value="patch({ color: $event ?? model.color })"
    />

    <div class="border-t border-gray-100 pt-3 dark:border-slate-700">
      <BaseCheckbox
        :model-value="model.isExceptional"
        label="Dépense exceptionnelle"
        description="Exclue des moyennes du quotidien"
        :data-testid="`${testId}-exceptional`"
        @update:model-value="patch({ isExceptional: $event })"
      />

      <div v-if="model.isExceptional" class="mt-3 space-y-3 pl-6">
        <TagFamilyField
          v-if="createFamily"
          :model-value="model.familyId"
          :families="families"
          :create-family="createFamily"
          :test-id="testId"
          @update:model-value="patch({ familyId: $event })"
        />

        <div>
          <p class="text-xs text-gray-500 dark:text-gray-400">
            Période d'absence (facultatif) — pendant ces dates vos dépenses
            habituelles sont suspendues. Renseignez-la pour un déplacement ou
            des vacances ; laissez vide pour une fête à la maison.
          </p>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <BaseField
              :model-value="model.eventStart"
              type="date"
              size="sm"
              label="Début de la période d'absence"
              label-hidden
              class="min-w-0 flex-1 sm:flex-none"
              :data-testid="`${testId}-event-start`"
              @update:model-value="patch({ eventStart: String($event) })"
            />
            <span class="text-sm text-gray-400">→</span>
            <BaseField
              :model-value="model.eventEnd"
              type="date"
              size="sm"
              label="Fin de la période d'absence"
              label-hidden
              class="min-w-0 flex-1 sm:flex-none"
              :data-testid="`${testId}-event-end`"
              @update:model-value="patch({ eventEnd: String($event) })"
            />
          </div>
        </div>

        <div v-if="showBudget" class="flex flex-wrap items-end gap-2">
          <BaseField
            :model-value="model.budget"
            amount
            size="sm"
            label="Enveloppe du projet (facultatif)"
            hint="Un total pour tout l'événement, pas un montant mensuel"
            placeholder="—"
            class="w-40 [&_input]:text-right"
            :data-testid="`${testId}-budget`"
            @update:model-value="
              patch({ budget: typeof $event === 'number' ? $event : null })
            "
          />
        </div>
      </div>
    </div>

    <slot name="actions" />
  </form>
</template>

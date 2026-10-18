<script setup lang="ts">
  /**
   * What a tag is made of, asked the same way whether it is being created
   * or edited: a name, a colour, whether it is an exceptional event, and
   * for an event its absence period and its envelope. One form, so the
   * two screens stop drifting apart in controls and sizes.
   */
  import BaseField from '@/components/ui/BaseField.vue'
  import BaseCheckbox from '@/components/ui/BaseCheckbox.vue'

  import {
    TAG_COLORS,
    TAG_COLOR_NAMES as COLOR_NAMES,
    type TagFormValue,
  } from './tagFormModel'

  defineProps<{
    /** A test id prefix, so each form's fields can be addressed. */
    testId: string
  }>()

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

    <fieldset>
      <legend class="text-xs text-gray-600 dark:text-gray-400">Couleur</legend>
      <div class="mt-1.5 flex flex-wrap items-center gap-2">
        <button
          v-for="c in TAG_COLORS"
          :key="c"
          type="button"
          :aria-pressed="model.color === c"
          class="relative h-8 w-8 shrink-0 rounded-full border-2 transition-transform pointer-coarse:before:absolute pointer-coarse:before:-inset-1.5 pointer-coarse:before:content-[''] hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:h-7 sm:w-7"
          :class="
            model.color === c
              ? 'border-gray-900 dark:border-white'
              : 'border-transparent'
          "
          :style="{ backgroundColor: c }"
          :aria-label="`Couleur ${COLOR_NAMES[c] ?? c}`"
          @click="patch({ color: c })"
        ></button>
      </div>
    </fieldset>

    <div class="border-t border-gray-100 pt-3 dark:border-slate-700">
      <BaseCheckbox
        :model-value="model.isExceptional"
        label="Dépense exceptionnelle"
        description="Exclue des moyennes du quotidien"
        :data-testid="`${testId}-exceptional`"
        @update:model-value="patch({ isExceptional: $event })"
      />

      <div v-if="model.isExceptional" class="mt-3 space-y-3 pl-6">
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

        <div class="flex flex-wrap items-end gap-2">
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

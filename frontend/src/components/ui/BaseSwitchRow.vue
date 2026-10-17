<script setup lang="ts">
  import { useId } from 'vue'
  import ToggleSwitch from '@/components/ui/ToggleSwitch.vue'

  /**
   * A preference line: what it is, what it does, and the switch. The text
   * is a label for the switch, so tapping the sentence flips it too, and
   * the switch keeps the halo and the loading state ToggleSwitch gives it.
   * Emits `change` with the next value; the parent owns the state.
   */
  withDefaults(
    defineProps<{
      checked: boolean
      label: string
      description?: string | undefined
      disabled?: boolean | undefined
      loading?: boolean | undefined
    }>(),
    { description: undefined, disabled: false, loading: false }
  )

  const emit = defineEmits<{ change: [next: boolean] }>()
  const id = useId()
</script>

<template>
  <div class="flex items-center justify-between gap-4">
    <label :for="id" class="min-w-0 cursor-pointer">
      <span class="block text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ label }}
      </span>
      <span
        v-if="description"
        class="mt-0.5 block text-xs text-gray-500 dark:text-gray-400"
      >
        {{ description }}
      </span>
    </label>
    <ToggleSwitch
      :id="id"
      :checked="checked"
      :label="label"
      :disabled="disabled"
      :loading="loading"
      @change="emit('change', $event)"
    />
  </div>
</template>

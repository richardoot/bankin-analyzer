<script setup lang="ts">
  /**
   * The small uppercase caption that names a group of controls or a block
   * of figures. Twenty-odd places spelled it by hand at three sizes; the
   * size and colour live here now. `as` picks the element — a heading when
   * the group is a section of the page, a paragraph (with an id, to name a
   * `role="group"`) when it captions a control.
   */
  withDefaults(
    defineProps<{
      as?:
        'p' | 'span' | 'label' | 'h2' | 'h3' | 'h4' | 'div' | 'dt' | undefined
    }>(),
    { as: 'p' }
  )
</script>

<template>
  <component
    :is="as"
    class="text-xs font-semibold tracking-wide text-gray-500 uppercase dark:text-gray-400"
  >
    <slot />
  </component>
</template>

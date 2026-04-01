<script setup lang="ts">
  defineProps<{
    icon?: string | null
    name: string
  }>()
</script>

<template>
  <span class="inline-flex items-center">
    <span v-if="icon" class="mr-1">{{ icon }}</span>
    <slot />
  </span>
</template>

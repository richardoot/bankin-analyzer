<script setup lang="ts">
  import { ref } from 'vue'

  const message = ref('Bankin Analyzer')
</script>

<template>
  <div>
    <h1>{{ message }}</h1>
  </div>
</template>

<style scoped>
  h1 {
    color: #333;
  }
</style>

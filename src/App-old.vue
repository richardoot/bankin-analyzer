<script setup lang="ts">
  import AppHeader from './components/AppHeader.vue'
  import HeroSection from './components/HeroSection.vue'
  import UploadSection from './components/UploadSection.vue'
  import AppFooter from './components/AppFooter.vue'
</script>

<template>
  <div class="app-container">
    <AppHeader />
    <main class="main-content" role="main">
      <HeroSection />
      <UploadSection />
    </main>
    <AppFooter />
  </div>
</template>

<style scoped>
  .app-container {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    background-color: #ffffff;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .app-container {
      background-color: #111827;
    }
  }
</style>

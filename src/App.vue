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
    background: linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    position: relative;
  }

  /* Effet de grain subtil pour un aspect premium */
  .app-container::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(
      circle at 1px 1px,
      rgba(0, 0, 0, 0.02) 1px,
      transparent 0
    );
    background-size: 20px 20px;
    pointer-events: none;
    z-index: -1;
  }

  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .app-container {
      background: linear-gradient(180deg, #111827 0%, #0f1419 100%);
    }

    .app-container::before {
      background-image: radial-gradient(
        circle at 1px 1px,
        rgba(255, 255, 255, 0.02) 1px,
        transparent 0
      );
    }
  }

  /* Animation d'entrée fluide */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .main-content {
    animation: fadeInUp 0.8s ease-out;
  }
</style>

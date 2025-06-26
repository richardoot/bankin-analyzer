<script setup lang="ts">
  import { ref } from 'vue'
  import AppHeader from './components/layout/AppHeader.vue'
  import HeroSection from './components/layout/HeroSection.vue'
  import StartAnalysisSection from './components/layout/StartAnalysisSection.vue'
  import AnalysesPage from './views/AnalysesPage.vue'
  import AppFooter from './components/layout/AppFooter.vue'

  // État de navigation
  type ViewState = 'home' | 'analyses'
  const currentView = ref<ViewState>('home')

  // Gestion de la navigation
  const handleNavigation = (view: ViewState) => {
    currentView.value = view
  }

  // Gestion du bouton "Commencer l'analyse"
  const handleStartAnalysis = () => {
    currentView.value = 'analyses'
  }
</script>

<template>
  <div class="app-container">
    <AppHeader :current-view="currentView" @navigate="handleNavigation" />
    <main class="main-content" role="main">
      <!-- Page d'accueil -->
      <template v-if="currentView === 'home'">
        <HeroSection />
        <StartAnalysisSection @start-analysis="handleStartAnalysis" />
      </template>

      <!-- Page des analyses -->
      <template v-if="currentView === 'analyses'">
        <AnalysesPage />
      </template>
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

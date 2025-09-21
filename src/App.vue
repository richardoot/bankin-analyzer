<script setup lang="ts">
  import { ref, defineAsyncComponent, nextTick } from 'vue'
  import AppHeader from './components/layout/AppHeader.vue'
  import HeroSection from './components/layout/HeroSection.vue'
  import StartAnalysisSection from './components/layout/StartAnalysisSection.vue'
  import AppFooter from './components/layout/AppFooter.vue'
  import ErrorBoundary from './components/shared/ErrorBoundary.vue'
  import DevTools from './components/dev/DevTools.vue'
  import { useImportManager } from '@/composables/useImportManager'

  // Lazy load components for better initial load performance
  const UploadPage = defineAsyncComponent(
    () => import('./views/UploadPage.vue')
  )
  const DashboardPage = defineAsyncComponent(
    () => import('./views/DashboardPage.vue')
  )
  const ReimbursementPage = defineAsyncComponent(
    () => import('./views/ReimbursementPage.vue')
  )

  // État de navigation
  type ViewState = 'home' | 'analyses' | 'dashboard' | 'reimbursements'
  const currentView = ref<ViewState>('home')
  const uploadPageRef = ref()

  // Import manager pour vérifier les sessions
  const { activeSession } = useImportManager()

  // Gestion de la navigation
  const handleNavigation = (view: ViewState) => {
    // Pour les pages dashboard et remboursements, vérifier qu'il y a une session active
    if (
      (view === 'dashboard' || view === 'reimbursements') &&
      !activeSession.value
    ) {
      // Rediriger vers la page d'analyses si aucune session active
      currentView.value = 'analyses'
      return
    }
    currentView.value = view
  }

  // Gestion du bouton "Commencer l'analyse"
  const handleStartAnalysis = () => {
    currentView.value = 'analyses'
  }

  // Gestion du bouton "Nouvel Upload" depuis le header
  const handleNewUpload = () => {
    currentView.value = 'analyses'
    // Utiliser nextTick pour s'assurer que le composant est monté
    nextTick(() => {
      if (uploadPageRef.value?.handleNewUpload) {
        uploadPageRef.value.handleNewUpload()
      }
    })
  }

  // Gestion de la navigation vers le dashboard depuis la page d'analyses
  const handleNavigateToDashboard = (_sessionId: string) => {
    currentView.value = 'dashboard'
  }
</script>

<template>
  <div class="app-container">
    <AppHeader
      :current-view="currentView"
      @navigate="handleNavigation"
      @new-upload="handleNewUpload"
    />
    <main class="main-content" role="main">
      <!-- Page d'accueil -->
      <template v-if="currentView === 'home'">
        <ErrorBoundary
          fallback-title="Erreur de la page d'accueil"
          fallback-message="Impossible de charger la page d'accueil. Veuillez rafraîchir votre navigateur."
        >
          <HeroSection />
          <StartAnalysisSection @start-analysis="handleStartAnalysis" />
        </ErrorBoundary>
      </template>

      <!-- Page d'upload/analyses -->
      <template v-if="currentView === 'analyses'">
        <ErrorBoundary
          fallback-title="Erreur de la page d'analyses"
          fallback-message="Impossible de charger la page d'analyses. Veuillez rafraîchir votre navigateur."
        >
          <UploadPage
            ref="uploadPageRef"
            @navigate-to-dashboard="handleNavigateToDashboard"
          />
        </ErrorBoundary>
      </template>

      <!-- Page du tableau de bord -->
      <template v-if="currentView === 'dashboard'">
        <ErrorBoundary
          fallback-title="Erreur du tableau de bord"
          fallback-message="Impossible de charger le tableau de bord. Veuillez rafraîchir votre navigateur."
        >
          <DashboardPage v-if="activeSession" :import-session="activeSession" />
        </ErrorBoundary>
      </template>

      <!-- Page des remboursements -->
      <template v-if="currentView === 'reimbursements'">
        <ErrorBoundary
          fallback-title="Erreur de la page de remboursements"
          fallback-message="Impossible de charger la page de remboursements. Veuillez rafraîchir votre navigateur."
        >
          <ReimbursementPage
            @navigate-to-analyses="() => (currentView = 'analyses')"
          />
        </ErrorBoundary>
      </template>
    </main>
    <AppFooter />

    <!-- Dev Tools (visible seulement en développement) -->
    <DevTools />
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

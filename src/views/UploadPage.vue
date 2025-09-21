<script setup lang="ts">
  import { ref, computed } from 'vue'
  import UploadSection from '../components/layout/UploadSection.vue'
  import ErrorBoundary from '../components/shared/ErrorBoundary.vue'
  import ImportSelector from '../components/shared/ImportSelector.vue'
  import { useImportManager } from '@/composables/useImportManager'

  // Émissions pour communiquer avec le parent (App.vue)
  interface Emits {
    (e: 'navigate-to-dashboard', sessionId: string): void
  }
  const emit = defineEmits<Emits>()

  // Import manager pour gérer les sessions
  const { activeSession, sessions, switchToSession } = useImportManager()

  // État local pour gérer l'affichage
  const forceShowUpload = ref(false)

  // Computed pour détecter s'il y a une session active
  const _hasActiveSession = computed(() => !!activeSession.value)

  // Gestion de la sélection d'une session existante
  const handleNavigateToAnalysis = (sessionId: string): void => {
    console.log('🎯 Navigation vers analyse avec session:', sessionId)
    switchToSession(sessionId)
    emit('navigate-to-dashboard', sessionId)
  }

  // Fonction pour forcer l'affichage de l'upload (pour le header)
  const handleNewUpload = (): void => {
    forceShowUpload.value = true
  }

  // Quand on upload avec succès, naviguer vers le dashboard
  const handleNavigateToAnalysisFromUpload = (sessionId: string): void => {
    forceShowUpload.value = false
    switchToSession(sessionId)
    emit('navigate-to-dashboard', sessionId)
  }

  // Exposer les fonctions pour le parent
  defineExpose({
    handleNewUpload,
  })

  // Removed setActiveTab - no longer needed
</script>

<template>
  <div class="analyses-page">
    <div class="analyses-container">
      <div class="page-header">
        <h1 class="page-title">Import de données</h1>
        <p class="page-description">
          Uploadez votre fichier d'export CSV Bankin pour commencer l'analyse de
          vos données financières
        </p>
      </div>

      <!-- Gestion des imports existants -->
      <div v-if="sessions.length > 0" class="existing-imports-section">
        <div class="section-header">
          <h2 class="section-title">Imports existants</h2>
          <p class="section-description">
            Sélectionnez un import existant pour accéder aux analyses ou créez
            un nouvel import
          </p>
        </div>

        <ErrorBoundary
          fallback-title="Erreur des imports"
          fallback-message="Impossible de charger la liste des imports."
        >
          <ImportSelector
            variant="full"
            show-actions
            @session-selected="handleNavigateToAnalysis"
          />
        </ErrorBoundary>
      </div>

      <div class="upload-wrapper">
        <ErrorBoundary
          fallback-title="Erreur d'upload"
          fallback-message="Impossible de charger l'interface d'upload. Veuillez rafraîchir la page."
        >
          <UploadSection
            @navigate-to-dashboard="handleNavigateToAnalysisFromUpload"
          />
        </ErrorBoundary>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .analyses-page {
    min-height: calc(100vh - 120px);
    padding: 2rem;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  }

  .analyses-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .page-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
    line-height: 1.2;
  }

  .page-description {
    font-size: 1.125rem;
    color: #6b7280;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  .upload-wrapper {
    margin-bottom: 3rem;
  }

  /* Section des imports existants */
  .existing-imports-section {
    margin-bottom: 3rem;
  }

  .section-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .section-title {
    font-size: 1.75rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 0.75rem;
  }

  .section-description {
    font-size: 1rem;
    color: #6b7280;
    line-height: 1.6;
    max-width: 500px;
    margin: 0 auto;
  }

  /* Removed back-button styles - no longer needed */

  .results-section {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .hidden {
    display: none;
  }

  /* Removed tab styles - no longer needed */

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .analyses-page {
      background: linear-gradient(135deg, #0f1419 0%, #111827 100%);
    }

    .page-title {
      color: #f9fafb;
    }

    .page-description {
      color: #d1d5db;
    }

    .section-title {
      color: #f9fafb;
    }

    .section-description {
      color: #d1d5db;
    }

    .chart-card-title {
      color: #f9fafb;
    }

    .chart-stats {
      background: rgba(31, 41, 55, 0.5);
      border-color: rgba(75, 85, 99, 0.3);
    }

    .stat-count {
      color: #9ca3af;
    }

    .stat-label {
      color: #9ca3af;
    }

    .stat-count {
      color: #9ca3af;
    }

    .results-section {
      background: #1f2937;
      border: 1px solid #374151;
    }
  }

  /* Animation d'entrée */
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

  .analyses-container > * {
    animation: fadeInUp 0.6s ease-out;
  }

  .upload-wrapper {
    animation-delay: 0.1s;
  }

  /* Section des transactions */
  .transactions-section {
    margin-bottom: 3rem;
  }

  .transactions-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2rem;
    margin-top: 2rem;
  }

  .transaction-list-wrapper {
    min-height: 400px;
  }

  .charts-grid {
    display: flex;
    justify-content: center;
    margin-top: 2rem;
  }

  .chart-card {
    min-height: 600px;
    max-width: 1000px;
    width: 100%;
  }

  .complete-analysis-card {
    border-left: 4px solid #3b82f6;
  }

  .analysis-icon {
    color: #3b82f6;
  }

  .chart-card-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 1rem;
  }

  .chart-card-icon {
    width: 1.25rem;
    height: 1.25rem;
  }

  .expenses-icon {
    color: #ef4444;
  }

  .income-icon {
    color: #10b981;
  }

  .chart-stats {
    padding: 1rem;
    background: rgba(248, 250, 252, 0.5);
    border-radius: 0.5rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
  }

  .stats-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
  }

  .stat-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #6b7280;
  }

  .stat-amount {
    font-size: 1.5rem;
    font-weight: 700;
    line-height: 1.2;
  }

  .expenses-amount {
    color: #ef4444;
  }

  .income-amount {
    color: #10b981;
  }

  .stat-count {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .chart-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1.5rem;
    margin-top: 1rem;
  }

  .chart-section {
    width: 100%;
    min-height: 400px;
  }

  /* Responsive pour les graphiques */
  @media (max-width: 1200px) {
    .chart-content {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .chart-card {
      min-height: 600px;
    }

    .stats-row {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .transactions-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .analyses-page {
      padding: 1.5rem;
    }

    .page-title {
      font-size: 2rem;
    }

    .page-description {
      font-size: 1rem;
    }

    .results-section {
      padding: 1.5rem;
    }
  }
</style>

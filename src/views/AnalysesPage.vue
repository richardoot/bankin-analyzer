<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'
  import { ref } from 'vue'
  import UploadSection from '../components/layout/UploadSection.vue'
  import DashboardPage from './DashboardPage.vue'
  import ReimbursementManager from '../components/reimbursement/ReimbursementManager.vue'
  import ErrorBoundary from '../components/shared/ErrorBoundary.vue'

  // État local pour gérer l'affichage
  const showAnalysis = ref(false)
  const analysisResult = ref<CsvAnalysisResult | null>(null)
  const activeTab = ref<'dashboard' | 'reimbursements'>('dashboard')

  // Gestion de la navigation vers l'analyse
  const handleNavigateToAnalysis = (result: CsvAnalysisResult): void => {
    analysisResult.value = result
    showAnalysis.value = true
    activeTab.value = 'dashboard'
  }

  // Fonction pour revenir à l'upload
  const backToUpload = (): void => {
    showAnalysis.value = false
    analysisResult.value = null
    activeTab.value = 'dashboard'
  }

  // Fonction pour changer d'onglet
  const setActiveTab = (tab: 'dashboard' | 'reimbursements'): void => {
    activeTab.value = tab
  }
</script>

<template>
  <div class="analyses-page">
    <div class="analyses-container">
      <!-- Affichage conditionnel : upload ou analyse -->
      <template v-if="!showAnalysis">
        <div class="page-header">
          <h1 class="page-title">Analyses financières</h1>
          <p class="page-description">
            Uploadez votre fichier d'export CSV Bankin pour commencer l'analyse
            de vos données financières
          </p>
        </div>

        <div class="upload-wrapper">
          <ErrorBoundary
            fallback-title="Erreur d'upload"
            fallback-message="Impossible de charger l'interface d'upload. Veuillez rafraîchir la page."
          >
            <UploadSection @navigate-to-dashboard="handleNavigateToAnalysis" />
          </ErrorBoundary>
        </div>
      </template>

      <!-- Interface d'analyse avec onglets -->
      <template v-else-if="analysisResult">
        <div class="analysis-header">
          <button class="back-button" @click="backToUpload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Nouvel upload
          </button>

          <!-- Navigation par onglets -->
          <div class="tabs-navigation">
            <button
              class="tab-button"
              :class="{ active: activeTab === 'dashboard' }"
              @click="setActiveTab('dashboard')"
            >
              <svg
                class="tab-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <path d="M9 12h6" />
                <path d="M9 16h6" />
                <path d="M9 8h6" />
              </svg>
              Tableau de bord
            </button>
            <button
              class="tab-button"
              :class="{ active: activeTab === 'reimbursements' }"
              @click="setActiveTab('reimbursements')"
            >
              <svg
                class="tab-icon"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
              >
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              Remboursements
            </button>
          </div>
        </div>

        <!-- Contenu des onglets -->
        <div class="tab-content">
          <div v-if="activeTab === 'dashboard'" class="tab-panel">
            <ErrorBoundary
              fallback-title="Erreur du tableau de bord"
              fallback-message="Impossible d'afficher le tableau de bord. Veuillez rafraîchir la page."
              >
              <DashboardPage :analysis-result="analysisResult" />
            </ErrorBoundary>
          </div>
          <div v-if="activeTab === 'reimbursements'" class="tab-panel">
            <ErrorBoundary
              fallback-title="Erreur du gestionnaire de remboursements"
              fallback-message="Impossible d'afficher le gestionnaire de remboursements. Veuillez rafraîchir la page."
              >
              <ReimbursementManager :analysis-result="analysisResult" />
            </ErrorBoundary>
          </div>
        </div>
      </template>
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

  .dashboard-header {
    margin-bottom: 2rem;
  }

  .back-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    font-size: 0.9rem;
  }

  .back-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(102, 126, 234, 0.3);
  }

  .back-button svg {
    width: 1.2rem;
    height: 1.2rem;
    stroke-width: 2;
  }

  .results-section {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  }

  .hidden {
    display: none;
  }

  /* Styles pour le header d'analyse */
  .analysis-header {
    display: flex;
    flex-direction: column;
    gap: 2rem;
    margin-bottom: 2rem;
  }

  /* Styles pour la navigation par onglets */
  .tabs-navigation {
    display: flex;
    gap: 1rem;
    background: white;
    padding: 0.5rem;
    border-radius: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
  }

  .tab-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem 1.5rem;
    border: none;
    background: transparent;
    color: #6b7280;
    border-radius: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    flex: 1;
    justify-content: center;
    font-size: 0.95rem;
  }

  .tab-button:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .tab-button.active {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
  }

  .tab-icon {
    width: 1.25rem;
    height: 1.25rem;
    stroke-width: 2;
  }

  /* Contenu des onglets */
  .tab-content {
    margin-top: 1rem;
  }

  .tab-panel {
    animation: fadeInUp 0.4s ease-out;
  }

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

    .results-section {
      background: #1f2937;
      border: 1px solid #374151;
    }

    .tabs-navigation {
      background: #1f2937;
      border: 1px solid #374151;
    }

    .tab-button {
      color: #d1d5db;
    }

    .tab-button:hover {
      background: #374151;
      color: #f9fafb;
    }

    .tab-button.active {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
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

    .analysis-header {
      gap: 1rem;
    }

    .tabs-navigation {
      flex-direction: column;
      gap: 0.5rem;
      padding: 0.75rem;
    }

    .tab-button {
      padding: 0.875rem 1rem;
      font-size: 0.9rem;
    }

    .tab-icon {
      width: 1.1rem;
      height: 1.1rem;
    }

    .back-button {
      padding: 0.625rem 1.25rem;
      font-size: 0.85rem;
    }

    .back-button svg {
      width: 1rem;
      height: 1rem;
    }
  }
</style>

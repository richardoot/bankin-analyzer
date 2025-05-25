<script setup lang="ts">
  import { ref } from 'vue'
  import UploadSection from './UploadSection.vue'
  import DashboardPage from './DashboardPage.vue'
  import type { CsvAnalysisResult } from '@/types'

  // État local pour gérer l'affichage
  const showDashboard = ref(false)
  const analysisResult = ref<CsvAnalysisResult | null>(null)

  // Gestion de la navigation vers le dashboard
  const handleNavigateToDashboard = (result: CsvAnalysisResult): void => {
    analysisResult.value = result
    showDashboard.value = true
  }

  // Fonction pour revenir à l'upload
  const backToUpload = (): void => {
    showDashboard.value = false
    analysisResult.value = null
  }
</script>

<template>
  <div class="analyses-page">
    <div class="analyses-container">
      <!-- Affichage conditionnel : upload ou dashboard -->
      <template v-if="!showDashboard">
        <div class="page-header">
          <h1 class="page-title">Analyses financières</h1>
          <p class="page-description">
            Uploadez votre fichier d'export CSV Bankin pour commencer l'analyse
            de vos données financières
          </p>
        </div>

        <div class="upload-wrapper">
          <UploadSection @navigate-to-dashboard="handleNavigateToDashboard" />
        </div>
      </template>

      <!-- Dashboard intégré -->
      <template v-else-if="analysisResult">
        <div class="dashboard-header">
          <button class="back-button" @click="backToUpload">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Nouvel upload
          </button>
        </div>
        <DashboardPage :analysis-result="analysisResult" />
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
  }
</style>

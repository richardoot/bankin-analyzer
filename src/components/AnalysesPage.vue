<script setup lang="ts">
  import UploadSection from './UploadSection.vue'
</script>

<template>
  <div class="analyses-page">
    <div class="analyses-container">
      <div class="page-header">
        <h1 class="page-title">Analyses financières</h1>
        <p class="page-description">
          Uploadez votre fichier d'export CSV Bankin pour commencer l'analyse de
          vos données financières
        </p>
      </div>

      <div class="upload-wrapper">
        <UploadSection />
      </div>

      <!-- Section pour les résultats d'analyse (à implémenter plus tard) -->
      <div class="results-section hidden">
        <h2>Résultats de l'analyse</h2>
        <!-- Les graphiques et tableaux apparaîtront ici après upload -->
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

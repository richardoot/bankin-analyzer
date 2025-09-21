<script setup lang="ts">
  import { computed } from 'vue'
  import { useImportManager } from '@/composables/useImportManager'
  import DashboardPage from '@/views/DashboardPage.vue'
  import type { CsvAnalysisResult } from '@/types'

  interface Props {
    analysisResult?: CsvAnalysisResult // Pour la compatibilité avec l'ancien système
  }

  const props = defineProps<Props>()

  // Import manager pour gérer les sessions
  const {
    activeSession,
    createSession,
    getCurrentAnalysisResult,
    hasMultipleSessions,
  } = useImportManager()

  // Si on reçoit un analysisResult et qu'il n'y a pas encore de session active,
  // créer automatiquement une session
  if (props.analysisResult && !activeSession.value) {
    createSession(props.analysisResult, 'Import')
  }

  // Computed pour déterminer quel analysisResult utiliser
  const effectiveAnalysisResult = computed(() => {
    // Priorité à la session active (mode multi-imports)
    const sessionResult = getCurrentAnalysisResult()
    if (sessionResult) {
      return sessionResult
    }

    // Fallback sur les props (mode legacy)
    if (props.analysisResult) {
      return props.analysisResult
    }

    return null
  })

  // Props pour DashboardPage selon le mode
  const dashboardProps = computed(() => {
    if (activeSession.value) {
      // Mode multi-imports : passer la session complète
      return {
        importSession: activeSession.value,
      }
    } else if (props.analysisResult) {
      // Mode legacy : passer directement analysisResult
      return {
        analysisResult: props.analysisResult,
      }
    }

    return {}
  })
</script>

<template>
  <div class="dashboard-wrapper">
    <!-- Debug info (only in dev mode) -->
    <div v-if="false" class="debug-info">
      <p>Mode: {{ hasMultipleSessions ? 'Multi-imports' : 'Single import' }}</p>
      <p>Active session: {{ activeSession?.name || 'None' }}</p>
      <p>Has analysis result: {{ !!effectiveAnalysisResult }}</p>
    </div>

    <!-- DashboardPage avec props dynamiques -->
    <DashboardPage v-if="effectiveAnalysisResult" v-bind="dashboardProps" />

    <!-- État de chargement/erreur -->
    <div v-else class="no-data-state">
      <div class="no-data-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <h3>Aucune donnée à analyser</h3>
      <p>Veuillez d'abord importer un fichier CSV pour commencer l'analyse.</p>
    </div>
  </div>
</template>

<style scoped>
  .dashboard-wrapper {
    width: 100%;
    min-height: 100vh;
  }

  .debug-info {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    padding: 1rem;
    margin-bottom: 1rem;
    font-family: monospace;
    font-size: 0.875rem;
  }

  .debug-info p {
    margin: 0.25rem 0;
    color: #1e40af;
  }

  .no-data-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    text-align: center;
    color: #6b7280;
    padding: 2rem;
  }

  .no-data-icon {
    width: 4rem;
    height: 4rem;
    margin-bottom: 1rem;
    color: #d1d5db;
  }

  .no-data-state h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 0.5rem;
  }

  .no-data-state p {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
    max-width: 400px;
  }
</style>

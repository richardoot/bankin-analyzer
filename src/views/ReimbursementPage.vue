<script setup lang="ts">
  import { computed } from 'vue'
  import { useImportManager } from '@/composables/useImportManager'
  import ReimbursementManager from '@/components/reimbursement/ReimbursementManager.vue'
  import ErrorBoundary from '@/components/shared/ErrorBoundary.vue'

  // Émissions pour communiquer avec le parent
  interface Emits {
    (e: 'navigate-to-analyses'): void
  }
  const emit = defineEmits<Emits>()

  // Import manager pour obtenir les données de la session active
  const { activeSession } = useImportManager()

  // Computed pour obtenir l'analysisResult de la session active
  const analysisResult = computed(() => {
    if (!activeSession.value) {
      // Retourner un résultat par défaut si pas de session active
      return {
        isValid: false,
        transactionCount: 0,
        categoryCount: 0,
        categories: [],
        dateRange: { start: '', end: '' },
        totalAmount: 0,
        expenses: {
          totalAmount: 0,
          transactionCount: 0,
          categories: [],
          categoriesData: {},
        },
        income: {
          totalAmount: 0,
          transactionCount: 0,
          categories: [],
          categoriesData: {},
        },
        transactions: [],
      }
    }

    return activeSession.value.analysisResult
  })

  // Computed pour vérifier s'il y a des données valides
  const hasValidData = computed(() => analysisResult.value.isValid)

  // Gestion de la navigation vers la page d'import
  const handleGoToImport = (): void => {
    emit('navigate-to-analyses')
  }
</script>

<template>
  <div class="reimbursement-page">
    <div class="page-container">
      <!-- En-tête de page -->
      <div class="page-header">
        <h1 class="page-title">
          <svg
            class="page-icon"
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
          Gestionnaire de Remboursements
        </h1>
        <p class="page-description">
          Gérez vos demandes de remboursement, identifiez les dépenses
          professionnelles et suivez vos demandes.
        </p>
      </div>

      <!-- Contenu principal -->
      <template v-if="hasValidData">
        <ErrorBoundary
          fallback-title="Erreur du gestionnaire de remboursements"
          fallback-message="Impossible d'afficher le gestionnaire de remboursements. Veuillez rafraîchir la page."
        >
          <ReimbursementManager :analysis-result="analysisResult" />
        </ErrorBoundary>
      </template>

      <!-- État sans données -->
      <template v-else>
        <div class="no-data-state">
          <div class="no-data-illustration">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              />
              <polyline points="14,2 14,8 20,8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <path d="M10 9h4" stroke-dasharray="2,2" />
            </svg>
          </div>

          <div class="no-data-content">
            <h2 class="no-data-title">Aucune donnée à analyser</h2>
            <p class="no-data-message">
              Pour utiliser le gestionnaire de remboursements, vous devez
              d'abord importer un fichier CSV avec vos transactions.
            </p>

            <div class="no-data-actions">
              <button class="cta-button primary" @click="handleGoToImport">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7,10 12,15 17,10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Importer un CSV
              </button>
            </div>
          </div>
        </div>
      </template>

      <!-- Informations contextuelles -->
      <div class="page-info">
        <div class="info-cards">
          <div class="info-card">
            <div class="info-icon expense-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div class="info-content">
              <h3 class="info-title">Dépenses Professionnelles</h3>
              <p class="info-text">
                Identifiez automatiquement les dépenses éligibles aux
                remboursements
              </p>
            </div>
          </div>

          <div class="info-card">
            <div class="info-icon person-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
            </div>
            <div class="info-content">
              <h3 class="info-title">Gestion des Personnes</h3>
              <p class="info-text">
                Associez les dépenses aux collaborateurs pour un suivi précis
              </p>
            </div>
          </div>

          <div class="info-card">
            <div class="info-icon report-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                />
                <polyline points="14,2 14,8 20,8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <div class="info-content">
              <h3 class="info-title">Rapports Export</h3>
              <p class="info-text">
                Générez des rapports détaillés pour vos demandes de
                remboursement
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-page {
    min-height: calc(100vh - 120px);
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  }

  .page-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  /* En-tête de page */
  .page-header {
    text-align: center;
    margin-bottom: 3rem;
  }

  .page-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 1rem;
  }

  .page-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: #3b82f6;
  }

  .page-description {
    font-size: 1.125rem;
    color: #6b7280;
    max-width: 600px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* État sans données */
  .no-data-state {
    text-align: center;
    padding: 4rem 2rem;
    margin: 2rem 0;
  }

  .no-data-illustration {
    width: 8rem;
    height: 8rem;
    margin: 0 auto 2rem;
    color: #d1d5db;
  }

  .no-data-content {
    max-width: 500px;
    margin: 0 auto;
  }

  .no-data-title {
    font-size: 1.75rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 1rem;
  }

  .no-data-message {
    font-size: 1rem;
    color: #6b7280;
    line-height: 1.6;
    margin: 0 0 2rem;
  }

  .no-data-actions {
    display: flex;
    justify-content: center;
    gap: 1rem;
  }

  .cta-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1.5rem;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
    color: white;
    text-decoration: none;
    border-radius: 0.75rem;
    font-weight: 600;
    font-size: 1rem;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
  }

  .cta-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 25px rgba(59, 130, 246, 0.4);
  }

  .cta-button svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  /* Informations contextuelles */
  .page-info {
    margin-top: 4rem;
  }

  .info-cards {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1rem;
  }

  .info-card {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: all 0.3s ease;
  }

  .info-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
  }

  .info-icon {
    width: 2rem;
    height: 2rem;
    border-radius: 0.375rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .expense-icon {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .person-icon {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  }

  .report-icon {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .info-icon svg {
    width: 1rem;
    height: 1rem;
    color: white;
  }

  .info-content {
    flex: 1;
  }

  .info-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .info-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: #1f2937;
    line-height: 1.2;
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    width: 100%;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .page-container {
      padding: 1.5rem;
    }

    .page-title {
      font-size: 2rem;
      flex-direction: column;
      gap: 0.75rem;
    }

    .page-icon {
      width: 2rem;
      height: 2rem;
    }

    .page-description {
      font-size: 1rem;
    }

    .no-data-state {
      padding: 3rem 1rem;
    }

    .no-data-illustration {
      width: 6rem;
      height: 6rem;
    }

    .no-data-title {
      font-size: 1.5rem;
    }

    .info-cards {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .info-card {
      flex-direction: column;
      text-align: center;
      padding: 1.25rem;
    }
  }

  /* Thème sombre */
  @media (prefers-color-scheme: dark) {
    .reimbursement-page {
      background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
    }

    .page-title {
      color: #f9fafb;
    }

    .page-description {
      color: #d1d5db;
    }

    .no-data-title {
      color: #f3f4f6;
    }

    .no-data-message {
      color: #9ca3af;
    }

    .info-card {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .info-card:hover {
      background: rgba(51, 65, 85, 0.9);
    }

    .info-title {
      color: #94a3b8;
    }

    .info-text {
      color: #e2e8f0;
    }
  }
</style>

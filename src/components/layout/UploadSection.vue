<script setup lang="ts">
  import { ref } from 'vue'
  import FileUpload from '../shared/FileUpload.vue'
  import ValidationModal from '../shared/ValidationModal.vue'
  import { useFileUpload } from '@/composables/useFileUpload'
  import { useImportManager } from '@/composables/useImportManager'
  import type { CsvAnalysisResult } from '@/types'

  interface Emits {
    (e: 'navigate-to-dashboard', sessionId: string): void
  }

  const emit = defineEmits<Emits>()

  // État de la modale de validation
  const showValidationModal = ref(false)
  const currentAnalysisResult = ref<CsvAnalysisResult | null>(null)
  const uploadedFileName = ref<string>('')

  // Import manager pour créer les sessions
  const { createSession } = useImportManager()

  // Composable pour la logique d'upload
  const { handleFileUpload, analysisResult, uploadState } = useFileUpload()

  // Gestionnaire d'événements pour l'upload de fichier
  const handleFileUploaded = async (file: File): Promise<void> => {
    console.log('🔄 Fichier uploadé:', file.name)

    // Stocker le nom du fichier pour créer la session
    uploadedFileName.value = file.name

    // Analyser le fichier
    await handleFileUpload(file)

    console.log('📊 État après upload:', {
      error: uploadState.value.error,
      isValid: analysisResult.value?.isValid,
      hasAnalysisResult: !!analysisResult.value,
    })

    // Vérifier le résultat après l'upload
    if (uploadState.value.error) {
      // Il y a une erreur (soit de validation, soit technique)
      console.log('❌ Erreur détectée:', uploadState.value.error)
      handleUploadError(uploadState.value.error)
    } else if (analysisResult.value && analysisResult.value.isValid) {
      // Succès - afficher la modale de validation
      console.log('✅ Succès - Affichage de la modale')
      currentAnalysisResult.value = analysisResult.value
      showValidationModal.value = true
    } else {
      // Cas imprévu - erreur générique
      console.log('⚠️ Cas imprévu')
      handleUploadError('Erreur lors du traitement du fichier')
    }
  }

  // État des erreurs d'upload
  const uploadError = ref<string>('')
  const showUploadError = ref(false)

  const handleUploadError = (error: string): void => {
    console.error("🚨 Erreur lors de l'upload:", error)
    console.log("🚨 Affichage de l'erreur à l'utilisateur")
    uploadError.value = error
    showUploadError.value = true

    // Masquer l'erreur après 10 secondes
    setTimeout(() => {
      console.log("⏰ Masquage automatique de l'erreur après 10s")
      showUploadError.value = false
      uploadError.value = ''
    }, 10000)
  }

  const dismissError = (): void => {
    showUploadError.value = false
    uploadError.value = ''
  }

  // Gestionnaires de la modale de validation
  const handleValidationConfirm = (): void => {
    if (currentAnalysisResult.value) {
      console.log('🎯 Création de session pour:', uploadedFileName.value)

      // Créer une nouvelle session d'import
      const sessionId = createSession(
        currentAnalysisResult.value,
        uploadedFileName.value
      )

      console.log('✅ Session créée:', sessionId)

      // Émettre l'ID de la session au lieu de l'analysisResult
      emit('navigate-to-dashboard', sessionId)
      showValidationModal.value = false
    }
  }

  const handleValidationClose = (): void => {
    showValidationModal.value = false
    currentAnalysisResult.value = null
  }
</script>

<template>
  <section class="upload-section">
    <div class="upload-container">
      <div class="upload-header">
        <h2 class="section-title">Commencez votre analyse</h2>
        <p class="section-description">
          Importez votre fichier d'export CSV depuis l'application Bankin pour
          démarrer l'analyse de vos données financières. Notre outil vous aidera
          à identifier les tendances, catégoriser vos dépenses et optimiser
          votre budget.
        </p>
      </div>

      <div class="upload-wrapper">
        <!-- Affichage des erreurs -->
        <div v-if="showUploadError" class="error-alert" role="alert">
          <div class="error-content">
            <svg
              class="error-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="15" y1="9" x2="9" y2="15" />
              <line x1="9" y1="9" x2="15" y2="15" />
            </svg>
            <div class="error-text">
              <strong>Erreur d'importation</strong>
              <p>{{ uploadError }}</p>
            </div>
            <button
              type="button"
              class="error-dismiss"
              aria-label="Fermer l'erreur"
              @click="dismissError"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <FileUpload
          :accepted-formats="['.csv']"
          max-size-label="10MB max"
          @file-uploaded="handleFileUploaded"
          @upload-error="handleUploadError"
        />
      </div>

      <div class="features-grid">
        <div class="feature-item">
          <div class="feature-icon-wrapper">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
              />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <h3 class="feature-title">Import sécurisé</h3>
          <p class="feature-description">
            Vos données restent privées et sont traitées localement. Aucune
            information bancaire n'est transmise à des serveurs externes.
          </p>
        </div>

        <div class="feature-item">
          <div class="feature-icon-wrapper">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
            </svg>
          </div>
          <h3 class="feature-title">Analyse instantanée</h3>
          <p class="feature-description">
            Obtenez immédiatement des graphiques et statistiques détaillées sur
            vos habitudes de consommation et revenus.
          </p>
        </div>

        <div class="feature-item">
          <div class="feature-icon-wrapper">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
          </div>
          <h3 class="feature-title">Visualisations avancées</h3>
          <p class="feature-description">
            Découvrez vos données sous forme de graphiques interactifs, tableaux
            de bord et rapports personnalisables.
          </p>
        </div>
      </div>
    </div>

    <!-- Modale de validation -->
    <ValidationModal
      :is-open="showValidationModal"
      :analysis-result="currentAnalysisResult"
      @close="handleValidationClose"
      @confirm="handleValidationConfirm"
    />
  </section>
</template>

<style scoped>
  .upload-section {
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    padding: 4rem 0;
    min-height: 60vh;
    position: relative;
  }

  .upload-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      #e2e8f0 50%,
      transparent 100%
    );
  }

  .upload-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .upload-header {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
  }

  .section-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 1rem;
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .section-description {
    font-size: 1.125rem;
    line-height: 1.7;
    color: #6b7280;
    margin: 0;
  }

  .upload-wrapper {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    align-items: center;
  }

  /* Styles pour les alertes d'erreur */
  .error-alert {
    width: 100%;
    max-width: 600px;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 12px;
    overflow: hidden;
    animation: slideInDown 0.3s ease-out;
  }

  @keyframes slideInDown {
    from {
      opacity: 0;
      transform: translateY(-20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .error-content {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    padding: 16px;
  }

  .error-icon {
    width: 24px;
    height: 24px;
    color: #dc2626;
    flex-shrink: 0;
    margin-top: 2px;
  }

  .error-text {
    flex: 1;
  }

  .error-text strong {
    display: block;
    color: #991b1b;
    font-weight: 600;
    margin-bottom: 4px;
    font-size: 14px;
  }

  .error-text p {
    color: #7f1d1d;
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
  }

  .error-dismiss {
    background: none;
    border: none;
    color: #dc2626;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .error-dismiss:hover {
    background: #fee2e2;
    color: #991b1b;
  }

  .error-dismiss svg {
    width: 16px;
    height: 16px;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
  }

  .feature-item {
    background: white;
    border-radius: 16px;
    padding: 2rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.05),
      0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #f1f5f9;
    transition: all 0.3s ease;
    text-align: center;
  }

  .feature-item:hover {
    transform: translateY(-4px);
    box-shadow:
      0 10px 25px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  .feature-icon-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
    border-radius: 16px;
    margin-bottom: 1.5rem;
  }

  .feature-icon {
    width: 32px;
    height: 32px;
    color: #4f46e5;
  }

  .feature-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 1rem;
  }

  .feature-description {
    font-size: 0.875rem;
    line-height: 1.6;
    color: #6b7280;
    margin: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .upload-section {
      padding: 2rem 0;
    }

    .upload-container {
      padding: 0 1rem;
      gap: 2rem;
    }

    .section-title {
      font-size: 2rem;
    }

    .section-description {
      font-size: 1rem;
    }

    .features-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .feature-item {
      padding: 1.5rem;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .upload-section {
      background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
    }

    .section-title {
      color: #f9fafb;
    }

    .section-description {
      color: #d1d5db;
    }

    .feature-item {
      background: #374151;
      border-color: #4b5563;
    }

    .feature-item:hover {
      background: #4b5563;
    }

    .feature-icon-wrapper {
      background: linear-gradient(135deg, #4c1d95, #5b21b6);
    }

    .feature-icon {
      color: #a78bfa;
    }

    .feature-title {
      color: #f9fafb;
    }

    .feature-description {
      color: #d1d5db;
    }
  }
</style>

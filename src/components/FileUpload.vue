<script setup lang="ts">
  import { ref } from 'vue'
  import { useFileUpload } from '@/composables/useFileUpload'

  // Props et émissions avec types explicites
  interface Props {
    acceptedFormats?: string[]
    maxSizeLabel?: string
  }

  interface Emits {
    (e: 'file-uploaded', file: File): void
    (e: 'upload-error', error: string): void
  }

  const props = withDefaults(defineProps<Props>(), {
    acceptedFormats: () => ['.csv'],
    maxSizeLabel: '10MB max',
  })

  const emit = defineEmits<Emits>()

  // Composable pour la logique d'upload
  const {
    uploadState,
    uploadedFile,
    handleFileUpload,
    resetUpload,
    canUpload,
    hasError,
    isComplete,
  } = useFileUpload()

  // Refs pour le composant
  const fileInput = ref<HTMLInputElement | null>(null)
  const isDragOver = ref(false)

  /**
   * Gère la sélection de fichier via input
   */
  const onFileSelect = async (event: Event): Promise<void> => {
    const target = event.target as HTMLInputElement
    const file = target.files?.[0]

    if (file) {
      await processFile(file)
    }
  }

  /**
   * Gère le drop de fichier
   */
  const onFileDrop = async (event: DragEvent): Promise<void> => {
    event.preventDefault()
    isDragOver.value = false

    const file = event.dataTransfer?.files[0]
    if (file) {
      await processFile(file)
    }
  }

  /**
   * Traite le fichier sélectionné
   */
  const processFile = async (file: File): Promise<void> => {
    try {
      await handleFileUpload(file)
      emit('file-uploaded', file)
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Erreur inconnue'
      emit('upload-error', errorMessage)
    }
  }

  /**
   * Gère les événements de drag
   */
  const onDragOver = (event: DragEvent): void => {
    event.preventDefault()
    isDragOver.value = true
  }

  const onDragLeave = (): void => {
    isDragOver.value = false
  }

  /**
   * Ouvre le sélecteur de fichier
   */
  const openFileDialog = (): void => {
    fileInput.value?.click()
  }

  /**
   * Supprime le fichier uploadé
   */
  const removeFile = (): void => {
    resetUpload()
    if (fileInput.value) {
      fileInput.value.value = ''
    }
  }

  /**
   * Formate la taille du fichier
   */
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }
</script>

<template>
  <div class="file-upload-container">
    <!-- Zone de drop -->
    <div
      v-if="!isComplete"
      class="upload-zone"
      :class="{
        'drag-over': isDragOver,
        uploading: uploadState.isUploading,
        error: hasError,
      }"
      @click="openFileDialog"
      @dragover="onDragOver"
      @dragleave="onDragLeave"
      @drop="onFileDrop"
    >
      <!-- Input file caché -->
      <input
        ref="fileInput"
        type="file"
        accept=".csv"
        class="hidden-input"
        :disabled="!canUpload"
        @change="onFileSelect"
      />

      <!-- Contenu de la zone d'upload -->
      <div class="upload-content">
        <div v-if="uploadState.isUploading" class="uploading-state">
          <div class="spinner" aria-label="Chargement en cours"></div>
          <p class="upload-text">Traitement du fichier...</p>
        </div>

        <div v-else class="idle-state">
          <svg
            class="upload-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17,8 12,3 7,8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>

          <h3 class="upload-title">Importez votre export CSV Bankin</h3>
          <p class="upload-description">
            Glissez-déposez votre fichier ici ou
            <button type="button" class="browse-button" :disabled="!canUpload">
              parcourez vos fichiers
            </button>
          </p>
          <p class="upload-specs">
            Formats acceptés : {{ props.acceptedFormats.join(', ') }} •
            {{ props.maxSizeLabel }}
          </p>
        </div>
      </div>
    </div>

    <!-- Fichier uploadé avec succès -->
    <div v-if="isComplete && uploadedFile" class="success-state">
      <div class="file-info">
        <svg
          class="success-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22,4 12,14.01 9,11.01" />
        </svg>

        <div class="file-details">
          <h4 class="file-name">{{ uploadedFile.name }}</h4>
          <p class="file-meta">
            {{ formatFileSize(uploadedFile.size) }} • Importé le
            {{
              new Date(uploadedFile.lastModified).toLocaleDateString('fr-FR')
            }}
          </p>
        </div>

        <button
          type="button"
          class="remove-button"
          aria-label="Supprimer le fichier"
          @click="removeFile"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>

    <!-- Message d'erreur -->
    <div v-if="hasError" class="error-message" role="alert">
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
      <span>{{ uploadState.error }}</span>
    </div>
  </div>
</template>

<style scoped>
  .file-upload-container {
    width: 100%;
    max-width: 600px;
    margin: 0 auto;
  }

  .upload-zone {
    border: 2px dashed #e2e8f0;
    border-radius: 12px;
    background: #f8fafc;
    padding: 2rem;
    text-align: center;
    cursor: pointer;
    transition: all 0.3s ease;
    min-height: 200px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .upload-zone:hover {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .upload-zone.drag-over {
    border-color: #10b981;
    background: #ecfdf5;
    transform: scale(1.02);
  }

  .upload-zone.uploading {
    border-color: #8b5cf6;
    background: #f3e8ff;
    cursor: not-allowed;
  }

  .upload-zone.error {
    border-color: #ef4444;
    background: #fef2f2;
  }

  .hidden-input {
    display: none;
  }

  .upload-content {
    width: 100%;
  }

  .upload-icon {
    width: 48px;
    height: 48px;
    color: #6b7280;
    margin: 0 auto 1rem;
  }

  .upload-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.5rem;
  }

  .upload-description {
    color: #6b7280;
    margin: 0 0 0.5rem;
  }

  .browse-button {
    color: #3b82f6;
    background: none;
    border: none;
    cursor: pointer;
    text-decoration: underline;
    font-weight: 500;
    padding: 0;
  }

  .browse-button:hover {
    color: #1d4ed8;
  }

  .browse-button:disabled {
    color: #9ca3af;
    cursor: not-allowed;
    text-decoration: none;
  }

  .upload-specs {
    font-size: 0.875rem;
    color: #9ca3af;
    margin: 0;
  }

  .uploading-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
  }

  .spinner {
    width: 32px;
    height: 32px;
    border: 3px solid #e5e7eb;
    border-top: 3px solid #3b82f6;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }

  .upload-text {
    color: #6b7280;
    margin: 0;
    font-weight: 500;
  }

  .success-state {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 12px;
    padding: 1.5rem;
  }

  .file-info {
    display: flex;
    align-items: center;
    gap: 1rem;
  }

  .success-icon {
    width: 24px;
    height: 24px;
    color: #10b981;
    flex-shrink: 0;
  }

  .file-details {
    flex: 1;
  }

  .file-name {
    font-size: 1rem;
    font-weight: 600;
    color: #065f46;
    margin: 0 0 0.25rem;
  }

  .file-meta {
    font-size: 0.875rem;
    color: #047857;
    margin: 0;
  }

  .remove-button {
    background: #f87171;
    border: none;
    border-radius: 6px;
    padding: 0.5rem;
    cursor: pointer;
    transition: background-color 0.2s;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .remove-button:hover {
    background: #ef4444;
  }

  .remove-button svg {
    width: 16px;
    height: 16px;
    color: white;
  }

  .error-message {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: #fef2f2;
    border: 1px solid #fecaca;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1rem;
    color: #dc2626;
  }

  .error-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .upload-zone {
      background: #1f2937;
      border-color: #374151;
    }

    .upload-zone:hover {
      background: #1e3a8a;
      border-color: #3b82f6;
    }

    .upload-title {
      color: #f9fafb;
    }

    .upload-description {
      color: #d1d5db;
    }

    .success-state {
      background: #064e3b;
      border-color: #065f46;
    }

    .file-name {
      color: #34d399;
    }

    .file-meta {
      color: #6ee7b7;
    }
  }
</style>

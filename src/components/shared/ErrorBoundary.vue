<script setup lang="ts">
  import { computed } from 'vue'
  import { useErrorBoundary } from '@/composables/useErrorBoundary'

  interface Props {
    /** Titre personnalisé de l'erreur */
    fallbackTitle?: string
    /** Message personnalisé de l'erreur */
    fallbackMessage?: string
    /** Afficher les détails de l'erreur (mode dev) */
    showErrorDetails?: boolean
    /** Afficher le bouton de retry */
    showRetryButton?: boolean
    /** Délai de récupération automatique */
    autoRecoveryDelay?: number
    /** Nombre maximum de tentatives */
    maxRetries?: number
    /** Variante visuelle */
    variant?: 'default' | 'minimal' | 'detailed'
  }

  interface Emits {
    (e: 'error', errorInfo: any): void
    (e: 'recover'): void
  }

  const props = withDefaults(defineProps<Props>(), {
    fallbackTitle: "Oups ! Une erreur s'est produite",
    fallbackMessage:
      'Nous rencontrons des difficultés techniques. Veuillez réessayer.',
    showErrorDetails: false,
    showRetryButton: true,
    autoRecoveryDelay: 0,
    maxRetries: 3,
    variant: 'default',
  })

  const emit = defineEmits<Emits>()

  // Composable pour la gestion d'erreurs
  const {
    hasError,
    errorInfo,
    isRecovering,
    retryCount,
    recover,
    reset,
    forceRecover,
    maxRetries,
  } = useErrorBoundary({
    autoRecoveryDelay: props.autoRecoveryDelay,
    maxRetries: props.maxRetries,
    onError: errorInfo => {
      emit('error', errorInfo)
    },
    onRecover: () => {
      emit('recover')
    },
  })

  // Computed properties pour l'affichage
  const canRetry = computed(() => retryCount.value < maxRetries)

  const retryButtonText = computed(() => {
    if (isRecovering.value) {
      return 'Récupération...'
    }
    return canRetry.value ? 'Réessayer' : 'Forcer le redémarrage'
  })

  const showDetails = computed(() => {
    // Ne jamais afficher les détails techniques en production pour des raisons de sécurité
    return false
  })

  const errorDisplayMessage = computed(() => {
    // Toujours afficher le message générique pour éviter l'exposition d'informations sensibles
    return props.fallbackMessage
  })

  // Actions
  const handleRetry = () => {
    if (canRetry.value) {
      recover()
    } else {
      forceRecover()
    }
  }

  const handleReset = () => {
    reset()
  }
</script>

<template>
  <div
    v-if="hasError"
    class="error-boundary"
    :class="`error-boundary--${variant}`"
  >
    <div class="error-content">
      <!-- Icône d'erreur -->
      <div class="error-icon-container">
        <svg
          class="error-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <path d="m15 9-6 6" />
          <path d="m9 9 6 6" />
        </svg>
      </div>

      <!-- Contenu principal -->
      <div class="error-main-content">
        <!-- Titre -->
        <h2 class="error-title">
          {{ fallbackTitle }}
        </h2>

        <!-- Message -->
        <p class="error-message">
          {{ errorDisplayMessage }}
        </p>

        <!-- Détails de l'erreur (mode développement) -->
        <details v-if="showDetails && errorInfo" class="error-details">
          <summary class="error-details-summary">Détails techniques</summary>
          <div class="error-details-content">
            <div class="error-field">
              <strong>Erreur:</strong>
              <code>{{ errorInfo.error?.name || 'Unknown Error' }}</code>
            </div>
            <div class="error-field">
              <strong>Message:</strong>
              <code>{{
                errorInfo.error?.message || 'No message available'
              }}</code>
            </div>
            <div class="error-field">
              <strong>Composant:</strong>
              <code>{{ errorInfo.componentStack || 'Unknown Component' }}</code>
            </div>
            <div class="error-field">
              <strong>Stack trace:</strong>
              <pre class="error-stack">{{
                errorInfo.error?.stack || 'No stack trace available'
              }}</pre>
            </div>
            <div class="error-field">
              <strong>Tentatives:</strong>
              <span>{{ retryCount }} / {{ maxRetries }}</span>
            </div>
            <div class="error-field">
              <strong>Timestamp:</strong>
              <span>{{
                new Date(errorInfo.timestamp).toLocaleString('fr-FR')
              }}</span>
            </div>
          </div>
        </details>

        <!-- Actions -->
        <div class="error-actions">
          <button
            v-if="showRetryButton"
            type="button"
            class="retry-button"
            :disabled="isRecovering"
            @click="handleRetry"
          >
            <svg
              v-if="isRecovering"
              class="retry-spinner"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            <svg
              v-else
              class="retry-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M21 2v6h-6" />
              <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
              <path d="M3 22v-6h6" />
              <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
            </svg>
            {{ retryButtonText }}
          </button>

          <button type="button" class="reset-button" @click="handleReset">
            Réinitialiser
          </button>
        </div>
      </div>
    </div>

    <!-- Indicateur de récupération -->
    <div v-if="isRecovering" class="recovery-indicator" aria-live="polite">
      <div class="recovery-progress">
        <div class="recovery-bar"></div>
      </div>
      <span class="recovery-text">Récupération en cours...</span>
    </div>
  </div>

  <!-- Slot par défaut quand il n'y a pas d'erreur -->
  <slot v-else></slot>
</template>

<style scoped>
  .error-boundary {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    min-height: 200px;
    background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
    border: 1px solid #fca5a5;
    border-radius: 12px;
    margin: 1rem 0;
  }

  .error-boundary--minimal {
    padding: 1rem;
    min-height: 100px;
    background: #fee2e2;
  }

  .error-boundary--detailed {
    padding: 2.5rem;
    min-height: 300px;
  }

  .error-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    max-width: 600px;
    width: 100%;
  }

  .error-icon-container {
    margin-bottom: 1.5rem;
  }

  .error-icon {
    width: 4rem;
    height: 4rem;
    color: #dc2626;
    stroke-width: 1.5;
  }

  .error-boundary--minimal .error-icon {
    width: 2.5rem;
    height: 2.5rem;
  }

  .error-main-content {
    width: 100%;
  }

  .error-title {
    font-size: 1.5rem;
    font-weight: 600;
    color: #991b1b;
    margin: 0 0 1rem 0;
  }

  .error-boundary--minimal .error-title {
    font-size: 1.25rem;
    margin-bottom: 0.5rem;
  }

  .error-message {
    font-size: 1rem;
    color: #7f1d1d;
    margin: 0 0 2rem 0;
    line-height: 1.6;
  }

  .error-boundary--minimal .error-message {
    font-size: 0.9rem;
    margin-bottom: 1rem;
  }

  .error-details {
    margin: 1.5rem 0;
    text-align: left;
    width: 100%;
    background: rgba(255, 255, 255, 0.8);
    border-radius: 8px;
    padding: 1rem;
  }

  .error-details-summary {
    font-weight: 600;
    color: #991b1b;
    cursor: pointer;
    padding: 0.5rem 0;
  }

  .error-details-summary:hover {
    color: #7f1d1d;
  }

  .error-details-content {
    margin-top: 1rem;
  }

  .error-field {
    margin-bottom: 1rem;
  }

  .error-field strong {
    display: inline-block;
    min-width: 100px;
    color: #7f1d1d;
    font-weight: 600;
  }

  .error-field code {
    background: #f3f4f6;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
    font-size: 0.85rem;
  }

  .error-stack {
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    padding: 1rem;
    border-radius: 6px;
    font-family: 'Fira Code', 'Monaco', 'Consolas', monospace;
    font-size: 0.75rem;
    overflow-x: auto;
    white-space: pre-wrap;
    max-height: 200px;
    overflow-y: auto;
  }

  .error-actions {
    display: flex;
    gap: 1rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .retry-button,
  .reset-button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
  }

  .retry-button {
    background: #dc2626;
    color: white;
  }

  .retry-button:hover:not(:disabled) {
    background: #b91c1c;
    transform: translateY(-1px);
  }

  .retry-button:disabled {
    background: #9ca3af;
    cursor: not-allowed;
    transform: none;
  }

  .reset-button {
    background: transparent;
    color: #7f1d1d;
    border: 1px solid #7f1d1d;
  }

  .reset-button:hover {
    background: #7f1d1d;
    color: white;
    transform: translateY(-1px);
  }

  .retry-icon,
  .retry-spinner {
    width: 1rem;
    height: 1rem;
    stroke-width: 2;
  }

  .retry-spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  .recovery-indicator {
    margin-top: 1.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
  }

  .recovery-progress {
    width: 200px;
    height: 4px;
    background: #fca5a5;
    border-radius: 2px;
    overflow: hidden;
  }

  .recovery-bar {
    height: 100%;
    background: #dc2626;
    width: 0%;
    animation: progress 3s ease-in-out;
  }

  @keyframes progress {
    0% {
      width: 0%;
    }
    100% {
      width: 100%;
    }
  }

  .recovery-text {
    font-size: 0.85rem;
    color: #7f1d1d;
    font-style: italic;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .error-boundary {
      background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%);
      border-color: #b91c1c;
    }

    .error-boundary--minimal {
      background: #7f1d1d;
    }

    .error-title,
    .error-message {
      color: #fecaca;
    }

    .error-details {
      background: rgba(0, 0, 0, 0.4);
    }

    .error-details-summary {
      color: #fecaca;
    }

    .error-details-summary:hover {
      color: #fca5a5;
    }

    .error-field strong {
      color: #fca5a5;
    }

    .retry-button {
      background: #ef4444;
    }

    .retry-button:hover:not(:disabled) {
      background: #dc2626;
    }

    .reset-button {
      color: #fca5a5;
      border-color: #fca5a5;
    }

    .reset-button:hover {
      background: #fca5a5;
      color: #7f1d1d;
    }
  }
</style>

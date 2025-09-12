/**
 * Composable pour la gestion d'erreurs globale (Error Boundaries Vue 3)
 * Suit les bonnes pratiques de 2025 pour la gestion d'erreurs
 */

import { ref, onErrorCaptured, onUnmounted } from 'vue'

export interface ErrorInfo {
  error: Error
  info: string
  timestamp: number
  componentStack?: string
  userId?: string
  sessionId?: string
}

interface ErrorBoundaryOptions {
  /** Fonction de callback pour signaler l'erreur */
  onError?: (errorInfo: ErrorInfo) => void
  /** Fonction de fallback pour récupérer de l'erreur */
  onRecover?: () => void
  /** Délai de récupération automatique en ms */
  autoRecoveryDelay?: number
  /** Nombre maximum de tentatives de récupération */
  maxRetries?: number
}

export const useErrorBoundary = (options: ErrorBoundaryOptions = {}) => {
  const {
    onError,
    onRecover,
    autoRecoveryDelay = 3000,
    maxRetries = 3,
  } = options

  // Sécurité : ne jamais exposer les détails techniques en production
  const isDevelopment = import.meta.env.DEV

  // État des erreurs
  const hasError = ref(false)
  const errorInfo = ref<ErrorInfo | null>(null)
  const retryCount = ref(0)
  const isRecovering = ref(false)

  // Timer pour la récupération automatique
  let recoveryTimer: number | null = null

  /**
   * Capture les erreurs des composants enfants
   */
  onErrorCaptured((error: Error, instance, info: string) => {
    const errorData: ErrorInfo = {
      error,
      info,
      timestamp: Date.now(),
      componentStack: instance?.$options.name || 'UnknownComponent',
      // Ajouter des métadonnées utiles en production
      userId: getUserId(),
      sessionId: getSessionId(),
    }

    hasError.value = true
    errorInfo.value = errorData

    // Log de l'erreur pour le développement
    if (isDevelopment) {
      console.group('🚨 Error Boundary Triggered')
      console.error('Error:', error)
      console.error('Component Info:', info)
      console.error('Component Stack:', errorData.componentStack)
      console.error('Full Error Info:', errorData)
      console.groupEnd()
    }

    // Callback personnalisé
    if (onError) {
      try {
        onError(errorData)
      } catch (callbackError) {
        console.error('Error in onError callback:', callbackError)
      }
    }

    // Programmer la récupération automatique si activée
    if (autoRecoveryDelay > 0 && retryCount.value < maxRetries) {
      scheduleAutoRecovery()
    }

    // Retourner false empêche la propagation de l'erreur vers le niveau supérieur
    return false
  })

  /**
   * Programme une récupération automatique
   */
  const scheduleAutoRecovery = () => {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer)
    }

    isRecovering.value = true

    recoveryTimer = window.setTimeout(() => {
      recover()
    }, autoRecoveryDelay)
  }

  /**
   * Récupère de l'erreur
   */
  const recover = () => {
    try {
      hasError.value = false
      errorInfo.value = null
      isRecovering.value = false
      retryCount.value++

      if (recoveryTimer) {
        clearTimeout(recoveryTimer)
        recoveryTimer = null
      }

      // Callback de récupération
      if (onRecover) {
        onRecover()
      }

      if (isDevelopment) {
        console.log(
          `🔄 Error boundary recovered (attempt ${retryCount.value}/${maxRetries})`
        )
      }
    } catch (recoverError) {
      console.error('Error during recovery:', recoverError)
    }
  }

  /**
   * Remet à zéro l'état d'erreur
   */
  const reset = () => {
    hasError.value = false
    errorInfo.value = null
    retryCount.value = 0
    isRecovering.value = false

    if (recoveryTimer) {
      clearTimeout(recoveryTimer)
      recoveryTimer = null
    }
  }

  /**
   * Force une récupération même si le nombre max de tentatives est atteint
   */
  const forceRecover = () => {
    retryCount.value = 0
    recover()
  }

  // Nettoyage des timers au démontage
  onUnmounted(() => {
    if (recoveryTimer) {
      clearTimeout(recoveryTimer)
    }
  })

  // Computed properties pour l'interface
  const canRetry = ref(true)
  const retryText = ref('Réessayer')
  const errorMessage = ref("Une erreur inattendue s'est produite")

  return {
    // État
    hasError,
    errorInfo,
    isRecovering,
    retryCount,
    canRetry,

    // Actions
    recover,
    reset,
    forceRecover,

    // Informations pour l'interface
    retryText,
    errorMessage,

    // Métadonnées
    maxRetries,
  }
}

/**
 * Utilitaires pour les métadonnées d'erreur
 */
function getUserId(): string {
  // En production, vous pourriez récupérer l'ID utilisateur depuis le store/auth
  return 'anonymous'
}

function getSessionId(): string {
  // Générer ou récupérer un ID de session pour le suivi des erreurs
  let sessionId = sessionStorage.getItem('bankin-analyzer-session-id')
  if (!sessionId) {
    sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    sessionStorage.setItem('bankin-analyzer-session-id', sessionId)
  }
  return sessionId
}

/**
 * Hook spécialisé pour les erreurs de composants async
 */
export const useAsyncErrorBoundary = (options: ErrorBoundaryOptions = {}) => {
  const errorBoundary = useErrorBoundary({
    ...options,
    // Délai plus long pour les composants async
    autoRecoveryDelay: options.autoRecoveryDelay || 5000,
    maxRetries: options.maxRetries || 2,
  })

  return {
    ...errorBoundary,
    errorMessage: ref('Erreur de chargement du composant'),
    retryText: ref('Recharger le composant'),
  }
}

/**
 * Hook spécialisé pour les erreurs de données/API
 */
export const useDataErrorBoundary = (options: ErrorBoundaryOptions = {}) => {
  const errorBoundary = useErrorBoundary({
    ...options,
    autoRecoveryDelay: options.autoRecoveryDelay || 0, // Pas de récupération auto pour les erreurs de données
    maxRetries: options.maxRetries || 5,
  })

  return {
    ...errorBoundary,
    errorMessage: ref('Erreur de chargement des données'),
    retryText: ref('Recharger les données'),
  }
}

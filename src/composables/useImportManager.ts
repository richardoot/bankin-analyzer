import { ref, computed, watch } from 'vue'
import type {
  ImportSession,
  ImportManagerState,
  CsvAnalysisResult,
} from '@/types'

// État global partagé entre tous les composants
const state = ref<ImportManagerState>({
  sessions: [],
  activeSessionId: null,
  nextSessionNumber: 1,
})

const STORAGE_KEY = 'bankin-analyzer-import-manager'

/**
 * Composable pour gérer les sessions d'import multiples
 */
export function useImportManager() {
  // Fonctions utilitaires
  function generateSessionId(): string {
    return `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
  }

  function generateSessionName(
    fileName: string,
    sessionNumber: number
  ): string {
    const baseName = fileName.replace(/\.[^/.]+$/, '') // Retire l'extension
    return `Import ${sessionNumber} (${baseName})`
  }

  function saveToLocalStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.value))
    } catch (error) {
      console.warn('Erreur lors de la sauvegarde des sessions:', error)
    }
  }

  function loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored)
        state.value = {
          sessions: parsed.sessions || [],
          activeSessionId: parsed.activeSessionId || null,
          nextSessionNumber: parsed.nextSessionNumber || 1,
        }

        // Convertir les dates string en Date objects
        state.value.sessions = state.value.sessions.map(session => ({
          ...session,
          uploadDate: new Date(session.uploadDate),
          lastAccessDate: new Date(session.lastAccessDate),
        }))
      }
    } catch (error) {
      console.warn('Erreur lors du chargement des sessions:', error)
      // Reset to default state on error
      state.value = {
        sessions: [],
        activeSessionId: null,
        nextSessionNumber: 1,
      }
    }
  }

  // Computed properties
  const sessions = computed(() => state.value.sessions)
  const activeSessionId = computed(() => state.value.activeSessionId)
  const hasMultipleSessions = computed(() => state.value.sessions.length > 1)

  const activeSession = computed(
    () =>
      state.value.sessions.find(
        session => session.id === state.value.activeSessionId
      ) || null
  )

  const sessionsCount = computed(() => state.value.sessions.length)

  // Actions principales
  function createSession(
    csvResult: CsvAnalysisResult,
    originalFileName: string
  ): string {
    const sessionId = generateSessionId()
    const sessionName = generateSessionName(
      originalFileName,
      state.value.nextSessionNumber
    )

    const newSession: ImportSession = {
      id: sessionId,
      name: sessionName,
      fileName: sessionName,
      originalFileName,
      uploadDate: new Date(),
      lastAccessDate: new Date(),
      isActive: true,
      analysisResult: csvResult,
    }

    // Désactiver toutes les autres sessions
    state.value.sessions = state.value.sessions.map(session => ({
      ...session,
      isActive: false,
    }))

    // Ajouter la nouvelle session
    state.value.sessions.push(newSession)
    state.value.activeSessionId = sessionId
    state.value.nextSessionNumber += 1

    return sessionId
  }

  function switchToSession(sessionId: string): boolean {
    const session = state.value.sessions.find(s => s.id === sessionId)
    if (!session) {
      console.warn(`Session ${sessionId} non trouvée`)
      return false
    }

    // Désactiver toutes les sessions
    state.value.sessions = state.value.sessions.map(s => ({
      ...s,
      isActive: false,
    }))

    // Activer la session cible
    const targetSession = state.value.sessions.find(s => s.id === sessionId)
    if (targetSession) {
      targetSession.isActive = true
      targetSession.lastAccessDate = new Date()
      state.value.activeSessionId = sessionId
      return true
    }

    return false
  }

  function deleteSession(sessionId: string): boolean {
    const sessionIndex = state.value.sessions.findIndex(s => s.id === sessionId)
    if (sessionIndex === -1) {
      return false
    }

    const isActiveSession = state.value.activeSessionId === sessionId

    // Supprimer les filtres associés à cette session
    try {
      localStorage.removeItem(`bankin-analyzer-filters-${sessionId}`)
      console.log('🗑️ Filtres supprimés pour la session:', sessionId)
    } catch (error) {
      console.warn('Erreur lors de la suppression des filtres:', error)
    }

    // Supprimer la session
    state.value.sessions.splice(sessionIndex, 1)

    // Si c'était la session active, activer une autre session
    if (isActiveSession && state.value.sessions.length > 0) {
      const mostRecentSession = state.value.sessions.reduce(
        (latest, session) =>
          session.lastAccessDate > latest.lastAccessDate ? session : latest
      )
      switchToSession(mostRecentSession.id)
    } else if (state.value.sessions.length === 0) {
      state.value.activeSessionId = null
    }

    return true
  }

  function renameSession(sessionId: string, newName: string): boolean {
    const session = state.value.sessions.find(s => s.id === sessionId)
    if (!session) {
      return false
    }

    session.name = newName
    session.fileName = newName
    return true
  }

  function duplicateSession(sessionId: string): string | null {
    const originalSession = state.value.sessions.find(s => s.id === sessionId)
    if (!originalSession) {
      return null
    }

    const newSessionId = generateSessionId()
    const duplicatedSession: ImportSession = {
      ...originalSession,
      id: newSessionId,
      name: `${originalSession.name} (Copie)`,
      fileName: `${originalSession.fileName} (Copie)`,
      uploadDate: new Date(),
      lastAccessDate: new Date(),
      isActive: false,
    }

    state.value.sessions.push(duplicatedSession)
    return newSessionId
  }

  // Fonction pour nettoyer les sessions anciennes (utilitaire)
  function cleanOldSessions(maxAge: number = 30): number {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - maxAge)

    const initialCount = state.value.sessions.length
    state.value.sessions = state.value.sessions.filter(
      session => session.lastAccessDate > cutoffDate
    )

    return initialCount - state.value.sessions.length
  }

  // Compatibilité avec l'API existante
  function getCurrentAnalysisResult(): CsvAnalysisResult | null {
    return activeSession.value?.analysisResult || null
  }

  // Initialisation
  loadFromLocalStorage()

  // Sauvegarde automatique
  watch(
    () => state.value,
    () => saveToLocalStorage(),
    { deep: true }
  )

  return {
    // État réactif
    sessions,
    activeSessionId,
    activeSession,
    hasMultipleSessions,
    sessionsCount,

    // Actions
    createSession,
    switchToSession,
    deleteSession,
    renameSession,
    duplicateSession,
    cleanOldSessions,

    // Compatibilité
    getCurrentAnalysisResult,

    // Utilitaires
    loadFromLocalStorage,
    saveToLocalStorage,
  }
}

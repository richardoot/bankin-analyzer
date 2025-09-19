<script setup lang="ts">
  import { computed } from 'vue'
  import { useImportManager } from '@/composables/useImportManager'
  import BaseButton from '@/components/shared/BaseButton.vue'
  // Props pour personnaliser l'affichage
  interface Props {
    variant?: 'full' | 'compact'
    showActions?: boolean
  }

  interface Emits {
    (e: 'session-selected', sessionId: string): void
  }

  withDefaults(defineProps<Props>(), {
    variant: 'compact',
    showActions: true,
  })

  const emit = defineEmits<Emits>()

  // Utilisation du composable import manager
  const {
    sessions,
    activeSession,
    hasMultipleSessions,
    switchToSession,
    deleteSession,
    renameSession,
  } = useImportManager()

  // Computed pour l'affichage
  const sortedSessions = computed(() =>
    [...sessions.value].sort(
      (a, b) => b.lastAccessDate.getTime() - a.lastAccessDate.getTime()
    )
  )

  // Gestionnaires d'événements
  const handleSessionSwitch = (sessionId: string) => {
    if (activeSession.value?.id !== sessionId) {
      switchToSession(sessionId)
      // Émettre l'événement pour navigation
      emit('session-selected', sessionId)
    }
  }

  const handleSessionSelect = (sessionId: string) => {
    switchToSession(sessionId)
    // Émettre l'événement pour navigation
    emit('session-selected', sessionId)
  }

  const handleDeleteSession = (sessionId: string, event: Event) => {
    event.stopPropagation()
    if (confirm('Êtes-vous sûr de vouloir supprimer cet import ?')) {
      deleteSession(sessionId)
    }
  }

  const handleRenameSession = (sessionId: string) => {
    const session = sessions.value.find(s => s.id === sessionId)
    if (!session) return

    const newName = prompt('Nouveau nom pour cet import:', session.name)
    if (newName && newName.trim() && newName.trim() !== session.name) {
      renameSession(sessionId, newName.trim())
    }
  }

  const _formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  const formatDate = (date: Date): string => {
    return new Intl.DateTimeFormat('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date)
  }
</script>

<template>
  <!-- Mode compact (pour le header) -->
  <div
    v-if="variant === 'compact' && hasMultipleSessions"
    class="import-selector-compact"
  >
    <div class="compact-selector">
      <div class="selector-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
          />
          <polyline points="14,2 14,8 20,8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
      </div>

      <select
        class="selector-dropdown"
        :value="activeSession?.id || ''"
        @change="
          handleSessionSwitch(($event.target as HTMLSelectElement).value)
        "
      >
        <option disabled value="">Choisir un import...</option>
        <option
          v-for="session in sortedSessions"
          :key="session.id"
          :value="session.id"
        >
          {{ session.name }}
        </option>
      </select>

      <div class="sessions-badge">{{ sessions.length }}</div>
    </div>
  </div>

  <!-- Mode complet (pour les paramètres) -->
  <div v-else-if="variant === 'full'" class="import-selector-full">
    <div class="filter-header">
      <h3 class="filter-title">
        <svg
          class="filter-icon"
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
          <line x1="10" y1="9" x2="8" y2="9" />
        </svg>
        Gestion des imports
      </h3>
      <p class="filter-description">
        Sélectionnez l'import à analyser ou gérez vos imports existants
      </p>
    </div>

    <div v-if="sessions.length === 0" class="no-sessions">
      <div class="no-sessions-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </div>
      <p class="no-sessions-text">Aucun import disponible</p>
      <p class="no-sessions-subtitle">Commencez par importer un fichier CSV</p>
    </div>

    <div v-else class="sessions-list">
      <div
        v-for="session in sortedSessions"
        :key="session.id"
        class="session-item"
        :class="{
          active: session.id === activeSession?.id,
        }"
        @click="handleSessionSelect(session.id)"
      >
        <div class="session-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
            />
            <polyline points="14,2 14,8 20,8" />
          </svg>
        </div>

        <div class="session-content">
          <div class="session-main">
            <h4 class="session-name">{{ session.name }}</h4>
            <div class="session-badges">
              <span
                v-if="session.id === activeSession?.id"
                class="active-badge"
              >
                Actif
              </span>
              <span class="transactions-badge">
                {{ session.analysisResult.transactionCount }} transactions
              </span>
            </div>
          </div>

          <div class="session-details">
            <span class="session-date">
              Importé le {{ formatDate(session.uploadDate) }}
            </span>
            <span class="session-file">{{ session.originalFileName }}</span>
          </div>
        </div>

        <div v-if="showActions" class="session-actions" @click.stop>
          <BaseButton
            variant="secondary"
            size="sm"
            icon
            title="Renommer"
            @click="handleRenameSession(session.id)"
          >
            <template #icon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                />
                <path
                  d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                />
              </svg>
            </template>
          </BaseButton>

          <BaseButton
            v-if="sessions.length > 1"
            variant="danger"
            size="sm"
            icon
            title="Supprimer"
            @click="(event) => handleDeleteSession(session.id, event)"
          >
            <template #icon>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3,6 5,6 21,6" />
                <path
                  d="M19,6v14a2,2 0,0,1-2,2H7a2,2,0,0,1-2-2V6m3,0V4a2,2,0,0,1,2,2h4a2,2,0,0,1,2,2v2"
                />
              </svg>
            </template>
          </BaseButton>
        </div>
      </div>
    </div>

    <div v-if="sessions.length > 0" class="filter-summary">
      <p class="summary-text">
        {{ sessions.length }} import{{
          sessions.length > 1 ? 's' : ''
        }}
        disponible{{ sessions.length > 1 ? 's' : '' }}
      </p>
      <p v-if="activeSession" class="summary-info">
        Import actif :
        {{ activeSession.analysisResult.transactionCount }} transactions,
        {{
          activeSession.analysisResult.expenses.categories.length +
          activeSession.analysisResult.income.categories.length
        }}
        catégories
      </p>
    </div>
  </div>
</template>

<style scoped>
  /* Mode compact */
  .import-selector-compact {
    display: flex;
    align-items: center;
  }

  .compact-selector {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(229, 231, 235, 0.5);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    transition: all 0.2s ease;
  }

  .compact-selector:hover {
    background: rgba(243, 244, 246, 0.9);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .selector-icon {
    width: 1rem;
    height: 1rem;
    color: #6366f1;
    flex-shrink: 0;
  }

  .selector-dropdown {
    background: transparent;
    border: none;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    cursor: pointer;
    min-width: 180px;
  }

  .selector-dropdown:focus {
    outline: none;
  }

  .sessions-badge {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    color: white;
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    min-width: 1.5rem;
    text-align: center;
  }

  /* Mode complet */
  .import-selector-full {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.75rem;
    padding: 1.25rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .filter-header {
    margin-bottom: 1.5rem;
  }

  .filter-title {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 0.25rem 0;
  }

  .filter-icon {
    width: 1.25rem;
    height: 1.25rem;
    color: #6366f1;
  }

  .filter-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  /* État vide */
  .no-sessions {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
  }

  .no-sessions-icon {
    width: 3rem;
    height: 3rem;
    margin: 0 auto 1rem;
    color: #d1d5db;
  }

  .no-sessions-text {
    font-size: 1rem;
    font-weight: 500;
    color: #374151;
    margin: 0 0 0.5rem;
  }

  .no-sessions-subtitle {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  /* Liste des sessions */
  .sessions-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(229, 231, 235, 0.5);
    border-radius: 0.5rem;
    transition: all 0.3s ease;
    cursor: pointer;
  }

  .session-item:hover {
    background: rgba(243, 244, 246, 0.9);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .session-item.active {
    background: rgba(99, 102, 241, 0.1);
    border-color: rgba(99, 102, 241, 0.6);
    box-shadow: 0 4px 16px rgba(99, 102, 241, 0.15);
  }

  .session-icon {
    width: 2rem;
    height: 2rem;
    border-radius: 0.5rem;
    background: linear-gradient(135deg, #6366f1, #4f46e5);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: white;
  }

  .session-content {
    flex: 1;
    min-width: 0;
  }

  .session-main {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 0.5rem;
  }

  .session-name {
    font-size: 0.875rem;
    font-weight: 600;
    color: #111827;
    margin: 0;
    truncate: true;
  }

  .session-badges {
    display: flex;
    gap: 0.5rem;
  }

  .active-badge {
    background: linear-gradient(135deg, #22c55e, #16a34a);
    color: white;
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
  }

  .transactions-badge {
    background: rgba(107, 114, 128, 0.1);
    color: #374151;
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .session-details {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .session-date,
  .session-file {
    font-size: 0.75rem;
    color: #6b7280;
  }

  .session-file {
    font-family: 'SF Mono', 'Monaco', 'Cascadia Code', monospace;
  }

  /* Actions */
  .session-actions {
    display: flex;
    gap: 0.5rem;
  }

  /* Résumé */
  .filter-summary {
    padding-top: 1rem;
    border-top: 1px solid rgba(229, 231, 235, 0.3);
  }

  .summary-text {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin: 0 0 0.25rem 0;
  }

  .summary-info {
    font-size: 0.75rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.4;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .compact-selector {
      padding: 0.375rem 0.5rem;
    }

    .selector-dropdown {
      min-width: 120px;
      font-size: 0.8125rem;
    }

    .session-item {
      padding: 0.75rem;
    }

    .session-main {
      flex-direction: column;
      align-items: flex-start;
      gap: 0.5rem;
    }
  }

  /* Thème sombre */
  @media (prefers-color-scheme: dark) {
    .compact-selector,
    .session-item {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .import-selector-full {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .filter-title,
    .session-name {
      color: #e2e8f0;
    }

    .filter-description,
    .summary-text {
      color: #94a3b8;
    }

    .session-item.active {
      background: rgba(99, 102, 241, 0.2);
    }
  }
</style>

<script setup lang="ts">
  import { ref, computed, onMounted } from 'vue'
  import {
    initializeTestData,
    clearTestData,
    hasTestData,
  } from '@/utils/testData'
  import { useImportManager } from '@/composables/useImportManager'

  const { sessions, activeSession, loadFromLocalStorage } = useImportManager()
  const showDevTools = ref(false)
  const hasData = ref(false)

  // Computed pour vérifier si on est en mode dev
  const isDev = computed(() => import.meta.env.DEV)

  // Vérifier si on a des données au montage
  onMounted(() => {
    hasData.value = hasTestData()
  })

  const handleInitTestData = () => {
    initializeTestData()
    loadFromLocalStorage() // Recharger les données dans le composable
    hasData.value = true
  }

  const handleClearData = () => {
    clearTestData()
    loadFromLocalStorage() // Recharger les données dans le composable
    hasData.value = false
  }

  // Toggle dev tools avec Ctrl+Shift+D
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'D') {
      showDevTools.value = !showDevTools.value
    }
  }

  onMounted(() => {
    document.addEventListener('keydown', handleKeydown)
  })
</script>

<template>
  <!-- Dev Tools Panel (visible seulement en développement) -->
  <div v-if="isDev && showDevTools" class="dev-tools">
    <div class="dev-header">
      <h3>🛠️ Dev Tools - Multi Import System</h3>
      <button class="close-btn" @click="showDevTools = false">×</button>
    </div>

    <div class="dev-content">
      <div class="dev-section">
        <h4>État actuel</h4>
        <div class="dev-info">
          <p><strong>Sessions:</strong> {{ sessions.length }}</p>
          <p>
            <strong>Session active:</strong>
            {{ activeSession?.name || 'Aucune' }}
          </p>
          <p>
            <strong>Données de test:</strong>
            {{ hasData ? '✅ Présentes' : '❌ Absentes' }}
          </p>
        </div>
      </div>

      <div class="dev-section">
        <h4>Actions</h4>
        <div class="dev-actions">
          <button
            class="dev-btn primary"
            :disabled="hasData"
            @click="handleInitTestData"
          >
            🧪 Initialiser données test
          </button>

          <button
            class="dev-btn danger"
            :disabled="!hasData"
            @click="handleClearData"
          >
            🗑️ Nettoyer données
          </button>
        </div>
      </div>

      <div v-if="sessions.length > 0" class="dev-section">
        <h4>Sessions disponibles</h4>
        <div class="sessions-debug">
          <div
            v-for="session in sessions"
            :key="session.id"
            class="session-debug"
            :class="{ active: session.id === activeSession?.id }"
          >
            <div class="session-name">{{ session.name }}</div>
            <div class="session-details">
              {{ session.analysisResult.transactionCount }} transactions |
              {{ session.analysisResult.expenses.categories.length }} catégories
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="dev-footer">
      <small>Press Ctrl+Shift+D to toggle</small>
    </div>
  </div>

  <!-- Toggle hint (toujours visible en dev) -->
  <div
    v-if="isDev && !showDevTools"
    class="dev-hint"
    @click="showDevTools = true"
  >
    🛠️
  </div>
</template>

<style scoped>
  .dev-tools {
    position: fixed;
    top: 20px;
    right: 20px;
    width: 350px;
    background: rgba(15, 23, 42, 0.95);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: 12px;
    padding: 1rem;
    color: white;
    font-size: 0.875rem;
    z-index: 9999;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3);
  }

  .dev-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(59, 130, 246, 0.2);
  }

  .dev-header h3 {
    margin: 0;
    font-size: 1rem;
    color: #60a5fa;
  }

  .close-btn {
    background: none;
    border: none;
    color: #94a3b8;
    font-size: 1.5rem;
    cursor: pointer;
    padding: 0;
    line-height: 1;
  }

  .close-btn:hover {
    color: #f87171;
  }

  .dev-section {
    margin-bottom: 1rem;
  }

  .dev-section h4 {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
    color: #cbd5e1;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .dev-info p {
    margin: 0.25rem 0;
    color: #e2e8f0;
  }

  .dev-actions {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .dev-btn {
    padding: 0.5rem 1rem;
    border: none;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .dev-btn.primary {
    background: #3b82f6;
    color: white;
  }

  .dev-btn.primary:hover:not(:disabled) {
    background: #2563eb;
  }

  .dev-btn.danger {
    background: #ef4444;
    color: white;
  }

  .dev-btn.danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .dev-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sessions-debug {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .session-debug {
    padding: 0.5rem;
    background: rgba(30, 41, 59, 0.5);
    border-radius: 6px;
    border: 1px solid rgba(71, 85, 105, 0.3);
  }

  .session-debug.active {
    border-color: #22c55e;
    background: rgba(34, 197, 94, 0.1);
  }

  .session-name {
    font-weight: 500;
    color: #f1f5f9;
    margin-bottom: 0.25rem;
  }

  .session-details {
    font-size: 0.75rem;
    color: #94a3b8;
  }

  .dev-footer {
    margin-top: 1rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(59, 130, 246, 0.2);
    text-align: center;
    color: #64748b;
  }

  .dev-hint {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 40px;
    height: 40px;
    background: rgba(59, 130, 246, 0.9);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 999;
    transition: all 0.2s ease;
    font-size: 1.2rem;
  }

  .dev-hint:hover {
    background: rgba(37, 99, 235, 0.9);
    transform: scale(1.1);
  }
</style>

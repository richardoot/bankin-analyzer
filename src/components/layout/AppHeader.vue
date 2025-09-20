<script setup lang="ts">
  import ImportSelector from '@/components/shared/ImportSelector.vue'
  import { useImportManager } from '@/composables/useImportManager'

  interface Props {
    currentView?: 'home' | 'analyses' | 'dashboard' | 'reimbursements'
  }

  interface Emits {
    (
      e: 'navigate',
      view: 'home' | 'analyses' | 'dashboard' | 'reimbursements'
    ): void
  }

  defineProps<Props>()
  const emit = defineEmits<Emits>()

  // Import manager pour afficher le sélecteur quand approprié
  const { sessions } = useImportManager()

  const handleNavigation = (
    view: 'home' | 'analyses' | 'dashboard' | 'reimbursements'
  ) => {
    emit('navigate', view)
  }
</script>

<template>
  <header class="app-header">
    <div class="header-container">
      <div class="brand">
        <div class="logo-wrapper">
          <svg
            class="logo-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M12 2L2 7v10c0 5.55 3.84 10 9 10s9-4.45 9-10V7L12 2z" />
            <path d="M8 11v5a4 4 0 0 0 8 0v-5" />
          </svg>
          <span class="logo-text">Bankin Analyzer</span>
        </div>
        <span class="tagline">Analyse financière simplifiée</span>
      </div>

      <div class="header-right">
        <nav
          class="navigation"
          role="navigation"
          aria-label="Navigation principale"
        >
          <ul class="nav-list">
            <li>
              <button
                class="nav-link"
                :class="{ active: currentView === 'home' }"
                @click="handleNavigation('home')"
              >
                Accueil
              </button>
            </li>
            <li>
              <button
                class="nav-link"
                :class="{ active: currentView === 'analyses' }"
                @click="handleNavigation('analyses')"
              >
                Upload
              </button>
            </li>
            <li>
              <button
                class="nav-link"
                :class="{ active: currentView === 'dashboard' }"
                @click="handleNavigation('dashboard')"
              >
                <svg
                  class="nav-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="9" y1="9" x2="15" y2="9" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                Analyses
              </button>
            </li>
            <li>
              <button
                class="nav-link"
                :class="{ active: currentView === 'reimbursements' }"
                @click="handleNavigation('reimbursements')"
              >
                <svg
                  class="nav-icon"
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
                Remboursements
              </button>
            </li>
          </ul>
        </nav>

        <!-- Sélecteur d'imports amélioré -->
        <div v-if="sessions.length > 0" class="import-selector-wrapper">
          <ImportSelector variant="compact" :show-actions="false" />
        </div>
      </div>
    </div>
  </header>
</template>

<style scoped>
  .app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1rem 0;
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  }

  .header-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .brand {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .logo-wrapper {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 32px;
    height: 32px;
    color: #fbbf24;
  }

  .logo-text {
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
  }

  .tagline {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    margin-left: 2.5rem;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 1.5rem;
  }

  .navigation {
    display: flex;
    align-items: center;
  }

  .import-selector-wrapper {
    display: flex;
    align-items: center;
  }

  .nav-list {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 2rem;
  }

  .nav-link {
    color: rgba(255, 255, 255, 0.9);
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    transition: all 0.2s ease;
    position: relative;
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    font-family: inherit;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .nav-icon {
    width: 1rem;
    height: 1rem;
    opacity: 0.8;
    transition: opacity 0.2s ease;
  }

  .nav-link:hover .nav-icon,
  .nav-link.active .nav-icon {
    opacity: 1;
  }

  .nav-link:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  .nav-link.active {
    color: white;
    background: rgba(255, 255, 255, 0.15);
  }

  .nav-link:focus {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
  }

  /* Style harmonisé pour l'ImportSelector dans le header */
  .import-selector-wrapper :deep(.compact-selector) {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 6px;
    padding: 0.5rem 0.75rem;
    gap: 0.5rem;
    min-width: auto;
    max-width: 140px;
    transition: all 0.2s ease;
  }

  .import-selector-wrapper :deep(.compact-selector:hover) {
    background: rgba(255, 255, 255, 0.25);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .import-selector-wrapper :deep(.selector-dropdown) {
    color: white;
    background: transparent;
    border: none;
    font-weight: 500;
    font-size: 1rem;
    font-family: inherit;
    min-width: 80px;
    max-width: 100px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .import-selector-wrapper :deep(.selector-dropdown option) {
    background: #374151;
    color: #f3f4f6;
    padding: 0.5rem;
  }

  .import-selector-wrapper :deep(.sessions-badge) {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: #1f2937;
    font-weight: 600;
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.375rem;
    min-width: 1.5rem;
    text-align: center;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .header-container {
      flex-direction: column;
      text-align: center;
      gap: 1.5rem;
    }

    .header-right {
      flex-direction: column;
      gap: 1rem;
    }

    .nav-list {
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .tagline {
      margin-left: 0;
    }

    .import-selector-wrapper {
      justify-content: center;
    }

    .import-selector-wrapper :deep(.compact-selector) {
      padding: 0.5rem;
      max-width: 120px;
    }

    .import-selector-wrapper :deep(.selector-dropdown) {
      min-width: 60px;
      max-width: 80px;
      font-size: 0.875rem;
    }
  }
</style>

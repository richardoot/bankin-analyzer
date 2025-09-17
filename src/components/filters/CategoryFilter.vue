<template>
  <div class="category-filter">
    <div class="filter-header">
      <h3 class="filter-title">
        <svg
          class="filter-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M6 3h12l-4 4v8l-4 2V7L6 3z" />
        </svg>
        Filtres par catégories
      </h3>
      <p class="filter-description">
        Cliquez sur les catégories pour les activer/désactiver dans les
        graphiques
      </p>
    </div>

    <!-- Status des filtres pour les lecteurs d'écran -->
    <div class="sr-only" aria-live="polite" aria-atomic="true">
      {{ selectedCategories.length }} catégorie(s) sélectionnée(s) sur
      {{ categories.length }}
    </div>

    <div class="filter-actions">
      <button
        class="filter-action-btn select-all"
        :disabled="allSelected"
        :aria-label="`Sélectionner toutes les ${categories.length} catégories`"
        @click="selectAll"
      >
        <svg
          class="btn-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        Tout sélectionner
      </button>

      <button
        class="filter-action-btn deselect-all"
        :disabled="noneSelected"
        aria-label="Désélectionner toutes les catégories"
        @click="deselectAll"
      >
        <svg
          class="btn-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        Tout désélectionner
      </button>
    </div>

    <div class="categories-list">
      <button
        v-for="(category, index) in categories"
        :key="category"
        class="category-filter-button"
        :class="{
          selected: selectedCategories.includes(category),
          disabled: !selectedCategories.includes(category),
        }"
        @click="toggleCategory(category)"
      >
        <div
          class="category-color"
          :style="{ backgroundColor: getCategoryColor(index) }"
        ></div>
        <span class="category-name">{{ category }}</span>
      </button>
    </div>

    <div class="filter-summary">
      <p class="summary-text">
        {{ selectedCategories.length }} / {{ categories.length }} catégories
        sélectionnées
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  interface Props {
    categories: string[]
    selectedCategories: string[]
  }

  interface Emits {
    (e: 'update:selected-categories', categories: string[]): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const allSelected = computed(
    () => props.selectedCategories.length === props.categories.length
  )
  const noneSelected = computed(() => props.selectedCategories.length === 0)

  const toggleCategory = (category: string) => {
    const newSelection = props.selectedCategories.includes(category)
      ? props.selectedCategories.filter(c => c !== category)
      : [...props.selectedCategories, category]

    emit('update:selected-categories', newSelection)
  }

  const selectAll = () => {
    emit('update:selected-categories', [...props.categories])
  }

  const deselectAll = () => {
    emit('update:selected-categories', [])
  }

  const getCategoryColor = (index: number): string => {
    const colors = [
      '#3B82F6',
      '#6366F1',
      '#8B5CF6',
      '#A855F7',
      '#EC4899',
      '#F43F5E',
      '#EF4444',
      '#F97316',
      '#F59E0B',
      '#EAB308',
      '#84CC16',
      '#22C55E',
      '#10B981',
      '#06B6D4',
      '#0EA5E9',
      '#6B7280',
      '#8B8B8B',
      '#A1A1A1',
    ]

    if (index < colors.length) {
      return colors[index] || '#6B7280'
    }

    // Génération de couleur pour les index supérieurs
    const hue = (index * 137.5) % 360
    return `hsl(${hue}, 70%, 50%)`
  }
</script>

<style scoped>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .category-filter {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    padding: 20px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
  }

  .filter-header {
    margin-bottom: 16px;
  }

  .filter-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 4px 0;
  }

  .filter-icon {
    width: 20px;
    height: 20px;
    color: #6366f1;
  }

  .filter-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .filter-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .filter-action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-action-btn:hover:not(:disabled) {
    background: rgba(249, 250, 251, 0.9);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .filter-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
  }

  .select-all:hover:not(:disabled) {
    background: rgba(236, 253, 245, 0.9);
    border-color: rgba(34, 197, 94, 0.6);
    color: #16a34a;
  }

  .deselect-all:hover:not(:disabled) {
    background: rgba(254, 242, 242, 0.9);
    border-color: rgba(239, 68, 68, 0.6);
    color: #dc2626;
  }

  .categories-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
    max-height: 400px;
    overflow-y: auto;
    padding: 1rem;
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
  }

  .category-filter-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 0.5rem;
    border: 1px solid rgba(229, 231, 235, 0.5);
    transition: all 0.3s ease;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    text-align: left;
    width: 100%;
  }

  .category-filter-button:hover {
    background: rgba(243, 244, 246, 0.9);
    transform: translateY(-1px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }

  .category-filter-button.selected {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(59, 130, 246, 0.6);
    box-shadow: 0 4px 16px rgba(59, 130, 246, 0.15);
  }

  .category-filter-button.disabled {
    background: rgba(156, 163, 175, 0.3);
    color: #9ca3af;
    opacity: 0.6;
    transform: none;
    box-shadow: none;
  }

  .category-filter-button.disabled:hover {
    background: rgba(156, 163, 175, 0.4);
    transform: none;
    box-shadow: none;
  }

  .category-color {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .category-filter-button.disabled .category-color {
    opacity: 0.5;
  }

  .category-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .filter-summary {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid rgba(255, 255, 255, 0.3);
  }

  .summary-text {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    margin: 0;
    font-weight: 500;
  }

  /* Scrollbar styling pour les catégories */
  .categories-list::-webkit-scrollbar {
    width: 6px;
  }

  .categories-list::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 3px;
  }

  .categories-list::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .categories-list::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }

  /* Thème sombre */
  @media (prefers-color-scheme: dark) {
    .category-filter {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .filter-title {
      color: #e2e8f0;
    }

    .filter-icon {
      color: #a78bfa;
    }

    .filter-description {
      color: #94a3b8;
    }

    .filter-action-btn {
      background: rgba(51, 65, 85, 0.9);
      border-color: rgba(71, 85, 105, 0.3);
      color: #cbd5e1;
    }

    .filter-action-btn:hover:not(:disabled) {
      background: rgba(71, 85, 105, 0.9);
      border-color: rgba(100, 116, 139, 0.4);
    }

    .select-all:hover:not(:disabled) {
      background: rgba(20, 83, 45, 0.6);
      border-color: rgba(34, 197, 94, 0.4);
      color: #4ade80;
    }

    .deselect-all:hover:not(:disabled) {
      background: rgba(127, 29, 29, 0.6);
      border-color: rgba(239, 68, 68, 0.4);
      color: #f87171;
    }

    .categories-list {
      background: rgba(15, 23, 42, 0.6);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .category-filter-button {
      background: rgba(51, 65, 85, 0.9);
      border-color: rgba(71, 85, 105, 0.5);
      color: #cbd5e1;
    }

    .category-filter-button:hover {
      background: rgba(71, 85, 105, 0.9);
    }

    .category-filter-button.selected {
      background: rgba(51, 65, 85, 0.9);
      border-color: rgba(99, 102, 241, 0.6);
      box-shadow: 0 4px 16px rgba(99, 102, 241, 0.2);
    }

    .category-filter-button.disabled {
      background: rgba(71, 85, 105, 0.3);
      color: #64748b;
    }

    .category-filter-button.disabled:hover {
      background: rgba(71, 85, 105, 0.4);
    }

    .filter-summary {
      border-top-color: rgba(71, 85, 105, 0.3);
    }

    .summary-text {
      color: #94a3b8;
    }

    /* Scrollbar en mode sombre */
    .categories-list::-webkit-scrollbar-track {
      background: #334155;
    }

    .categories-list::-webkit-scrollbar-thumb {
      background: #64748b;
    }

    .categories-list::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
    }
  }
</style>

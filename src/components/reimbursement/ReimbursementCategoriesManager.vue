<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'
  import type { ReimbursementCategory } from '@/types'
  import BaseModal from '@/components/shared/BaseModal.vue'
  import BaseButton from '@/components/shared/BaseButton.vue'
  import BaseCard from '@/components/shared/BaseCard.vue'
  import { useLocalStorage } from '@/composables/useLocalStorage'

  // Utiliser le composable de localStorage
  const { useReimbursementCategoriesStorage } = useLocalStorage()
  const { data: categories, save: saveCategories } =
    useReimbursementCategoriesStorage()
  const showAddModal = ref(false)
  const editingCategory = ref<ReimbursementCategory | null>(null)
  const searchTerm = ref('')

  // Formulaire
  const formData = ref({
    name: '',
    description: '',
    icon: '💼',
    color: '#3b82f6',
    keywords: '',
  })

  // Icônes disponibles
  const availableIcons = [
    '💼',
    '🚗',
    '🍽️',
    '🏨',
    '✈️',
    '🚇',
    '⛽',
    '🅿️',
    '📱',
    '💻',
    '📚',
    '🏥',
    '🎓',
    '🛒',
    '🔧',
    '📋',
  ]

  // Couleurs disponibles
  const availableColors = [
    '#3b82f6',
    '#10b981',
    '#f59e0b',
    '#ef4444',
    '#8b5cf6',
    '#06b6d4',
    '#84cc16',
    '#f97316',
    '#ec4899',
    '#6b7280',
  ]

  // Catégories par défaut
  const defaultCategories: Omit<ReimbursementCategory, 'id' | 'createdAt'>[] = [
    {
      name: 'Transport',
      description: 'Frais de transport et déplacements',
      icon: '🚗',
      color: '#3b82f6',
      keywords: [
        'taxi',
        'uber',
        'essence',
        'parking',
        'transport',
        'métro',
        'bus',
      ],
      isDefault: true,
    },
    {
      name: 'Restauration',
      description: "Repas d'affaires et restauration",
      icon: '🍽️',
      color: '#10b981',
      keywords: [
        'restaurant',
        'repas',
        'déjeuner',
        'dîner',
        'café',
        'brasserie',
      ],
      isDefault: true,
    },
    {
      name: 'Hébergement',
      description: "Hôtels et frais d'hébergement",
      icon: '🏨',
      color: '#f59e0b',
      keywords: ['hotel', 'hébergement', 'nuit', 'booking', 'airbnb'],
      isDefault: true,
    },
    {
      name: 'Matériel',
      description: 'Matériel et fournitures professionnelles',
      icon: '💻',
      color: '#8b5cf6',
      keywords: ['matériel', 'bureau', 'fourniture', 'ordinateur', 'logiciel'],
      isDefault: true,
    },
    {
      name: 'Formation',
      description: 'Formations et développement professionnel',
      icon: '🎓',
      color: '#06b6d4',
      keywords: [
        'formation',
        'cours',
        'séminaire',
        'conférence',
        'certification',
      ],
      isDefault: true,
    },
  ]

  // Charger les catégories depuis localStorage
  const loadCategories = () => {
    if (categories.value.length === 0) {
      // Initialiser avec les catégories par défaut si vide
      initializeDefaultCategories()
    }
  }

  // Initialiser les catégories par défaut
  const initializeDefaultCategories = () => {
    categories.value = defaultCategories.map(cat => ({
      ...cat,
      id: generateId(),
      createdAt: new Date(),
    }))
    saveCategories()
  }

  // Générer un ID unique
  const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2)
  }

  // Ouvrir la modal d'ajout
  const openAddModal = () => {
    editingCategory.value = null
    formData.value = {
      name: '',
      description: '',
      icon: '💼',
      color: '#3b82f6',
      keywords: '',
    }
    showAddModal.value = true
  }

  // Ouvrir la modal d'édition
  const openEditModal = (category: ReimbursementCategory) => {
    editingCategory.value = category
    formData.value = {
      name: category.name,
      description: category.description,
      icon: category.icon,
      color: category.color,
      keywords: category.keywords.join(', '),
    }
    showAddModal.value = true
  }

  // Fermer la modal
  const closeModal = () => {
    showAddModal.value = false
    editingCategory.value = null
    formData.value = {
      name: '',
      description: '',
      icon: '💼',
      color: '#3b82f6',
      keywords: '',
    }
  }

  // Valider le formulaire
  const isFormValid = computed(() => {
    return (
      formData.value.name.trim() !== '' &&
      formData.value.description.trim() !== ''
    )
  })

  // Sauvegarder une catégorie
  const saveCategory = () => {
    if (!isFormValid.value) return

    const keywordsArray = formData.value.keywords
      .split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k !== '')

    if (editingCategory.value) {
      // Édition
      const index = categories.value.findIndex(
        c => c.id === editingCategory.value?.id
      )
      if (index !== -1) {
        categories.value[index] = {
          ...editingCategory.value,
          name: formData.value.name.trim(),
          description: formData.value.description.trim(),
          icon: formData.value.icon,
          color: formData.value.color,
          keywords: keywordsArray,
        }
      }
    } else {
      // Ajout
      const newCategory: ReimbursementCategory = {
        id: generateId(),
        name: formData.value.name.trim(),
        description: formData.value.description.trim(),
        icon: formData.value.icon,
        color: formData.value.color,
        keywords: keywordsArray,
        isDefault: false,
        createdAt: new Date(),
      }
      categories.value.push(newCategory)
    }

    saveCategories()
    closeModal()
  }

  // Supprimer une catégorie
  const deleteCategory = (category: ReimbursementCategory) => {
    if (
      confirm(
        `Êtes-vous sûr de vouloir supprimer la catégorie "${category.name}" ?`
      )
    ) {
      categories.value = categories.value.filter(c => c.id !== category.id)
      saveCategories()
    }
  }

  // Statistiques
  const stats = computed(() => ({
    total: categories.value.length,
    custom: categories.value.filter(c => !c.isDefault).length,
    default: categories.value.filter(c => c.isDefault).length,
  }))

  // Catégories filtrées selon le terme de recherche
  const filteredCategories = computed(() => {
    if (!searchTerm.value.trim()) {
      return categories.value
    }
    const term = searchTerm.value.toLowerCase().trim()
    return categories.value.filter(
      category =>
        category.name.toLowerCase().includes(term) ||
        category.description.toLowerCase().includes(term)
    )
  })

  // Exposition des données pour les autres composants
  defineExpose({
    categories,
    stats,
  })

  // Initialisation
  onMounted(() => {
    loadCategories()
  })
</script>

<template>
  <BaseCard
    variant="glass"
    padding="lg"
    rounded="lg"
    class="categories-manager"
  >
    <template #header>
      <h4 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path
            d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2z"
          />
          <path d="M8 1v4" />
          <path d="M16 1v4" />
        </svg>
        Catégories de remboursement
        <span v-if="stats.total > 0" class="title-badge">
          {{ stats.total }} catégorie{{ stats.total > 1 ? 's' : '' }}
        </span>
      </h4>
    </template>

    <div class="section-content">
      <!-- Barre de recherche -->
      <div class="search-container">
        <div class="search-input-wrapper">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="search-icon"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            v-model="searchTerm"
            type="text"
            placeholder="Rechercher une catégorie..."
            class="search-input"
          />
          <button
            v-if="searchTerm"
            class="clear-search"
            title="Effacer la recherche"
            @click="searchTerm = ''"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      <!-- Zone de contenu scrollable -->
      <div class="content-area">
        <!-- Message quand aucune catégorie n'est trouvée -->
        <div
          v-if="filteredCategories.length === 0 && searchTerm"
          class="no-results"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <p>Aucune catégorie trouvée pour "{{ searchTerm }}"</p>
          <BaseButton variant="primary" size="sm" @click="searchTerm = ''">
            <template #icon-left>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </template>
            Effacer
          </BaseButton>
        </div>

        <!-- Message quand aucune catégorie n'existe -->
        <div v-else-if="categories.length === 0" class="no-results">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path
              d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2z"
            />
            <path d="M8 1v4" />
            <path d="M16 1v4" />
          </svg>
          <p>Aucune catégorie enregistrée</p>
          <p class="no-results-subtitle">
            Commencez par ajouter votre première catégorie
          </p>
        </div>

        <!-- Liste des catégories -->
        <div v-else class="categories-list">
          <div
            v-for="category in filteredCategories"
            :key="category.id"
            class="category-card"
            :style="{ borderColor: category.color }"
          >
            <div
              class="category-icon"
              :style="{ backgroundColor: category.color }"
            >
              {{ category.icon }}
            </div>
            <div class="category-info">
              <span class="category-name">{{ category.name }}</span>
              <span class="category-description">{{
                category.description
              }}</span>
            </div>
            <div class="category-actions">
              <BaseButton
                variant="secondary"
                size="sm"
                icon
                title="Modifier"
                @click="openEditModal(category)"
              >
                <template #icon-left>
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
                variant="danger"
                size="sm"
                icon
                title="Supprimer"
                @click="deleteCategory(category)"
              >
                <template #icon-left>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <polyline points="3,6 5,6 21,6" />
                    <path
                      d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                    />
                  </svg>
                </template>
              </BaseButton>
            </div>
          </div>
        </div>
      </div>

      <!-- Bouton d'ajout fixe en bas -->
      <div class="action-buttons">
        <BaseButton
          variant="primary"
          size="large"
          class="add-category-btn"
          @click="openAddModal"
        >
          <template #icon-left>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
          </template>
          Ajouter une catégorie
        </BaseButton>
      </div>
    </div>

    <!-- Modal d'ajout/édition -->
    <BaseModal
      :is-open="showAddModal"
      :title="editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'"
      max-width="900px"
      @close="closeModal"
    >
      <div class="form-group">
        <label for="category-name">Nom de la catégorie</label>
        <input
          id="category-name"
          v-model="formData.name"
          type="text"
          placeholder="Ex: Transport, Restauration..."
          class="form-input"
          maxlength="50"
        />
      </div>

      <div class="form-group">
        <label for="category-description">Description</label>
        <textarea
          id="category-description"
          v-model="formData.description"
          placeholder="Description de la catégorie..."
          class="form-textarea"
          maxlength="200"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Icône</label>
        <div class="icon-selector">
          <button
            v-for="icon in availableIcons"
            :key="icon"
            type="button"
            class="icon-option"
            :class="{ active: formData.icon === icon }"
            @click="formData.icon = icon"
          >
            {{ icon }}
          </button>
        </div>
      </div>

      <div class="form-group">
        <label>Couleur</label>
        <div class="color-selector">
          <button
            v-for="color in availableColors"
            :key="color"
            type="button"
            class="color-option"
            :class="{ active: formData.color === color }"
            :style="{ backgroundColor: color }"
            @click="formData.color = color"
          ></button>
        </div>
      </div>

      <div class="form-group">
        <label for="category-keywords"
          >Mots-clés (séparés par des virgules)</label
        >
        <input
          id="category-keywords"
          v-model="formData.keywords"
          type="text"
          placeholder="Ex: taxi, uber, transport, métro..."
          class="form-input"
        />
        <small class="form-help">
          Ces mots-clés aideront à identifier automatiquement les dépenses de
          cette catégorie
        </small>
      </div>

      <template #footer>
        <BaseButton variant="secondary" size="medium" @click="closeModal">
          Annuler
        </BaseButton>
        <BaseButton
          variant="primary"
          size="medium"
          :disabled="!isFormValid"
          @click="saveCategory"
        >
          {{ editingCategory ? 'Modifier' : 'Créer' }}
        </BaseButton>
      </template>
    </BaseModal>
  </BaseCard>
</template>

<style scoped>
  .categories-manager {
    margin-bottom: 1.5rem;
    height: 600px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Force BaseCard to use full height */
  .categories-manager :deep(.card-container) {
    height: 100%;
    display: flex;
    flex-direction: column;
  }

  .categories-manager :deep(.card-content) {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .categories-manager :deep(.card-header) {
    flex-shrink: 0;
  }

  .categories-manager :deep(.card-body) {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 1rem 1.5rem 1.5rem 1.5rem;
    min-height: 0;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    font-size: var(--text-xl);
    font-weight: var(--font-weight-bold);
    color: var(--gray-900);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    margin: 0 0 1rem 0;
    position: relative;
  }

  .section-title::after {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 0;
    width: 60px;
    height: 3px;
    background: linear-gradient(90deg, var(--primary-500), var(--primary-600));
    border-radius: 2px;
  }

  .section-title svg {
    width: 1.25rem;
    height: 1.25rem;
    color: #3b82f6;
  }

  .title-badge {
    background: linear-gradient(135deg, var(--primary-50), var(--primary-100));
    color: var(--primary-700);
    padding: 0.375rem 0.875rem;
    border-radius: 16px;
    font-size: 0.75rem;
    font-weight: var(--font-weight-semibold);
    margin-left: auto;
    border: 1px solid var(--primary-200);
    box-shadow: 0 2px 4px rgba(59, 130, 246, 0.1);
    backdrop-filter: blur(10px);
  }

  /* Statistiques */
  .categories-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .stat-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .stat-card:hover {
    background: #f9fafb;
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
    transform: translateY(-1px);
  }

  .stat-icon {
    font-size: 1.5rem;
  }

  .stat-content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .stat-label {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .stat-value {
    font-size: 1.25rem;
    font-weight: 700;
    color: #1f2937;
  }

  /* Section content */
  .section-content {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    min-height: 0;
    height: 100%;
  }

  /* Barre de recherche fixe */
  .search-container {
    flex-shrink: 0;
    margin-bottom: 0.75rem;
  }

  .search-input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 0.75rem;
    width: 1rem;
    height: 1rem;
    color: #9ca3af;
    z-index: 1;
  }

  .search-input {
    width: 100%;
    padding: 0.75rem 0.75rem 0.75rem 2.5rem;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 0.875rem;
    background: white;
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: #3b82f6;
    background: white;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .clear-search {
    position: absolute;
    right: 0.5rem;
    width: 1.5rem;
    height: 1.5rem;
    border: none;
    background: #e5e7eb;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .clear-search:hover {
    background: #d1d5db;
  }

  .clear-search svg {
    width: 0.75rem;
    height: 0.75rem;
    color: #6b7280;
  }

  /* Zone de contenu - height fixe */
  .content-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-height: 0;
  }

  /* Styles pour les messages "aucun résultat" */
  .no-results {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .no-results svg {
    width: 2rem;
    height: 2rem;
    margin: 0 auto 1rem;
    color: #d1d5db;
  }

  .no-results p {
    margin: 0.5rem 0;
    font-size: 0.9rem;
  }

  .no-results-subtitle {
    font-size: 0.8rem !important;
    color: #9ca3af !important;
  }

  .categories-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    overflow-y: auto;
    flex: 1;
  }

  /* Bouton d'ajout fixe en bas */
  .action-buttons {
    flex-shrink: 0;
    padding-top: 0.75rem;
    border-top: 1px solid rgba(229, 231, 235, 0.5);
    margin-top: 0.75rem;
  }

  .add-category-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.3s ease;
    width: 100%;
    justify-content: center;
  }

  .add-category-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .add-category-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .category-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem 1rem;
    background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-lg);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.04),
      0 1px 3px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
    transition: all var(--transition-spring);
    position: relative;
    overflow: hidden;
    height: 3.5rem;
    justify-content: space-between;
    min-height: 3.5rem;
    flex-shrink: 0;
  }

  .category-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      135deg,
      transparent 0%,
      rgba(59, 130, 246, 0.02) 100%
    );
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .category-card:hover {
    transform: translateY(-3px) scale(1.01);
    box-shadow:
      0 12px 25px rgba(0, 0, 0, 0.06),
      0 6px 15px rgba(59, 130, 246, 0.1),
      0 0 0 1px rgba(59, 130, 246, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
    background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
  }

  .category-card:hover::before {
    opacity: 1;
  }

  .category-card:hover .category-icon {
    transform: scale(1.1) rotate(5deg);
    box-shadow:
      0 6px 20px rgba(59, 130, 246, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .category-icon {
    width: 2.25rem;
    height: 2.25rem;
    border-radius: 50%;
    background: linear-gradient(
      135deg,
      var(--primary-500) 0%,
      var(--primary-700) 100%
    );
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: var(--font-weight-bold);
    font-size: 1rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow:
      0 4px 12px rgba(59, 130, 246, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all var(--transition-spring);
    flex-shrink: 0;
  }

  .category-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .category-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 0.9rem;
  }

  .category-description {
    font-size: 0.8rem;
    color: #6b7280;
  }

  .category-actions {
    display: flex;
    gap: 0.5rem;
  }

  .form-group {
    margin-bottom: 1.5rem;
  }

  .form-group label {
    display: block;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .form-input,
  .form-textarea {
    width: 100%;
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 6px;
    font-size: 0.875rem;
    color: #374151;
    transition: border-color 0.2s;
  }

  .form-input:focus,
  .form-textarea:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .form-textarea {
    min-height: 80px;
    resize: vertical;
  }

  .form-help {
    display: block;
    margin-top: 0.5rem;
    font-size: 0.75rem;
    color: #6b7280;
  }

  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  /* Sélecteurs améliorés */
  .icon-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(3rem, 1fr));
    gap: 0.875rem;
    margin-top: 0.75rem;
    max-width: 100%;
    padding: 0.5rem;
    background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 12px;
    border: 1px solid var(--gray-200);
  }

  .icon-option {
    width: 3rem;
    height: 3rem;
    border: 2px solid var(--gray-200);
    border-radius: 12px;
    background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.375rem;
    transition: all var(--transition-spring);
    justify-self: center;
    box-shadow:
      0 2px 4px rgba(0, 0, 0, 0.05),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
    position: relative;
    overflow: hidden;
  }

  .icon-option::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(
      135deg,
      transparent 0%,
      rgba(59, 130, 246, 0.05) 100%
    );
    opacity: 0;
    transition: opacity var(--transition-normal);
  }

  .icon-option:hover {
    border-color: var(--primary-300);
    transform: translateY(-2px) scale(1.05);
    box-shadow:
      0 8px 25px rgba(59, 130, 246, 0.15),
      0 3px 10px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  .icon-option:hover::before {
    opacity: 1;
  }

  .icon-option.active {
    border-color: var(--primary-500);
    background: linear-gradient(
      145deg,
      var(--primary-50) 0%,
      var(--primary-100) 100%
    );
    color: var(--primary-700);
    transform: scale(1.1);
    box-shadow:
      0 8px 25px rgba(59, 130, 246, 0.25),
      0 3px 10px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.8);
  }

  .icon-option.active::before {
    opacity: 1;
  }

  .color-selector {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(3.25rem, 1fr));
    gap: 1rem;
    margin-top: 0.75rem;
    max-width: 100%;
    padding: 0.75rem;
    background: linear-gradient(145deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: 12px;
    border: 1px solid var(--gray-200);
  }

  .color-option {
    width: 3.25rem;
    height: 3.25rem;
    border: 3px solid rgba(255, 255, 255, 0.9);
    border-radius: 50%;
    cursor: pointer;
    transition: all var(--transition-spring);
    justify-self: center;
    position: relative;
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      0 2px 4px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .color-option::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    border: 2px solid transparent;
    border-radius: 50%;
    background: linear-gradient(135deg, transparent, rgba(255, 255, 255, 0.2))
      padding-box;
    transition: all var(--transition-normal);
    z-index: -1;
  }

  .color-option:hover {
    transform: translateY(-3px) scale(1.15);
    box-shadow:
      0 12px 35px rgba(0, 0, 0, 0.2),
      0 6px 20px rgba(0, 0, 0, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
    border-color: rgba(255, 255, 255, 1);
  }

  .color-option:hover::before {
    border-color: rgba(59, 130, 246, 0.3);
  }

  .color-option.active {
    transform: scale(1.2);
    border-color: var(--primary-600);
    box-shadow:
      0 12px 35px rgba(59, 130, 246, 0.3),
      0 6px 20px rgba(0, 0, 0, 0.15),
      0 0 0 4px rgba(59, 130, 246, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.4);
  }

  .color-option.active::before {
    border-color: var(--primary-400);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .categories-manager {
      height: 500px;
    }

    .categories-grid {
      max-height: 300px;
    }

    .category-card {
      padding: 0.75rem 1rem;
      height: 4rem;
      flex-direction: column;
      align-items: flex-start;
      gap: 0.375rem;
    }

    .category-header {
      width: 100%;
      gap: 0.5rem;
    }

    .category-icon {
      width: 2rem;
      height: 2rem;
      font-size: 1rem;
    }

    .category-name {
      font-size: 0.875rem;
      margin-bottom: 0.0625rem;
    }

    .category-description {
      font-size: 0.6875rem;
    }

    .category-actions {
      width: 100%;
      justify-content: flex-end;
      margin-left: 0;
      margin-top: 0.25rem;
    }

    .icon-selector {
      grid-template-columns: repeat(auto-fit, minmax(2.5rem, 1fr));
      gap: 0.75rem;
      padding: 0.375rem;
    }

    .color-selector {
      grid-template-columns: repeat(auto-fit, minmax(2.75rem, 1fr));
      gap: 0.875rem;
      padding: 0.5rem;
    }

    .icon-option {
      width: 2.5rem;
      height: 2.5rem;
      font-size: 1.125rem;
    }

    .color-option {
      width: 2.75rem;
      height: 2.75rem;
    }

    .modal-content {
      margin: 1rem;
      width: calc(100% - 2rem);
    }
  }

  /* Thème sombre */
  @media (prefers-color-scheme: dark) {
    .section-title {
      color: #e2e8f0;
    }

    .title-badge {
      background: linear-gradient(
        135deg,
        rgba(59, 130, 246, 0.2),
        rgba(59, 130, 246, 0.3)
      );
      color: #60a5fa;
      border-color: rgba(96, 165, 250, 0.3);
    }

    /* Cartes de statistiques - Mode sombre */
    .stat-card {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.3);
    }

    .stat-card:hover {
      background: rgba(51, 65, 85, 0.9);
    }

    .stat-label {
      color: #94a3b8;
    }

    .stat-value {
      color: #e2e8f0;
    }

    /* Cartes de catégories - Mode sombre */
    .category-card {
      background: linear-gradient(
        145deg,
        rgba(30, 41, 59, 0.8) 0%,
        rgba(51, 65, 85, 0.8) 100%
      );
      border-color: rgba(71, 85, 105, 0.3);
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.2),
        0 1px 3px rgba(0, 0, 0, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .category-card:hover {
      background: linear-gradient(
        145deg,
        rgba(51, 65, 85, 0.9) 0%,
        rgba(71, 85, 105, 0.9) 100%
      );
      border-color: rgba(96, 165, 250, 0.5);
      box-shadow:
        0 20px 40px rgba(0, 0, 0, 0.3),
        0 8px 25px rgba(59, 130, 246, 0.3),
        0 0 0 2px rgba(59, 130, 246, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.15);
    }

    .category-name {
      color: #e2e8f0;
    }

    .category-description {
      color: #94a3b8;
    }

    /* Formulaire - Mode sombre */
    .form-group label {
      color: #e2e8f0;
    }

    .form-input,
    .form-textarea {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.5);
      color: #e2e8f0;
    }

    .form-input:focus,
    .form-textarea:focus {
      border-color: #60a5fa;
      background: rgba(30, 41, 59, 0.9);
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
    }

    .form-input::placeholder,
    .form-textarea::placeholder {
      color: #94a3b8;
    }

    .form-help {
      color: #94a3b8;
    }

    /* Sélecteurs d'icônes et couleurs - Mode sombre */
    .icon-selector {
      background: linear-gradient(
        145deg,
        rgba(30, 41, 59, 0.8) 0%,
        rgba(51, 65, 85, 0.8) 100%
      );
      border-color: rgba(71, 85, 105, 0.3);
    }

    .icon-option {
      background: linear-gradient(
        145deg,
        rgba(51, 65, 85, 0.8) 0%,
        rgba(71, 85, 105, 0.8) 100%
      );
      border-color: rgba(100, 116, 139, 0.5);
      box-shadow:
        0 2px 4px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.1);
    }

    .icon-option:hover {
      border-color: rgba(96, 165, 250, 0.5);
      background: linear-gradient(
        145deg,
        rgba(71, 85, 105, 0.9) 0%,
        rgba(100, 116, 139, 0.9) 100%
      );
    }

    .icon-option.active {
      border-color: #60a5fa;
      background: linear-gradient(
        145deg,
        rgba(59, 130, 246, 0.2) 0%,
        rgba(59, 130, 246, 0.3) 100%
      );
      color: #60a5fa;
    }

    .color-selector {
      background: linear-gradient(
        145deg,
        rgba(30, 41, 59, 0.8) 0%,
        rgba(51, 65, 85, 0.8) 100%
      );
      border-color: rgba(71, 85, 105, 0.3);
    }

    .color-option {
      border-color: rgba(255, 255, 255, 0.8);
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.3),
        0 2px 4px rgba(0, 0, 0, 0.2),
        inset 0 1px 0 rgba(255, 255, 255, 0.2);
    }

    .color-option:hover {
      border-color: rgba(255, 255, 255, 1);
    }

    .color-option.active {
      border-color: #60a5fa;
      box-shadow:
        0 12px 35px rgba(96, 165, 250, 0.4),
        0 6px 20px rgba(0, 0, 0, 0.3),
        0 0 0 4px rgba(96, 165, 250, 0.3),
        inset 0 1px 0 rgba(255, 255, 255, 0.3);
    }

    .color-option.active::before {
      border-color: #60a5fa;
    }

    /* Barre de recherche - Mode sombre */
    .search-icon {
      color: #6b7280;
    }

    .search-input {
      background: rgba(30, 41, 59, 0.8);
      border-color: rgba(71, 85, 105, 0.5);
      color: #e2e8f0;
    }

    .search-input:focus {
      border-color: #60a5fa;
      background: rgba(30, 41, 59, 0.9);
      box-shadow: 0 0 0 3px rgba(96, 165, 250, 0.2);
    }

    .search-input::placeholder {
      color: #94a3b8;
    }

    .clear-search {
      background: rgba(71, 85, 105, 0.8);
    }

    .clear-search:hover {
      background: rgba(100, 116, 139, 0.8);
    }

    .clear-search svg {
      color: #94a3b8;
    }

    /* Messages "aucun résultat" - Mode sombre */
    .no-results {
      color: #94a3b8;
    }

    .no-results svg {
      color: #64748b;
    }

    .no-results-subtitle {
      color: #64748b !important;
    }
  }
</style>

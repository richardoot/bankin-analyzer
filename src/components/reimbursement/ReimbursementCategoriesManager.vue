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
    if (category.isDefault) {
      alert('Impossible de supprimer une catégorie par défaut')
      return
    }

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
  <BaseCard variant="default" class="categories-manager">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path
          d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 0-2-2z"
        />
        <path d="M8 1v4" />
        <path d="M16 1v4" />
      </svg>
      Catégories de remboursement
    </h3>

    <div class="section-content">
      <!-- Statistiques -->
      <div class="categories-stats">
        <div class="stat-card">
          <div class="stat-icon">📊</div>
          <div class="stat-content">
            <span class="stat-label">Total</span>
            <span class="stat-value">{{ stats.total }}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">⭐</div>
          <div class="stat-content">
            <span class="stat-label">Par défaut</span>
            <span class="stat-value">{{ stats.default }}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-icon">✨</div>
          <div class="stat-content">
            <span class="stat-label">Personnalisées</span>
            <span class="stat-value">{{ stats.custom }}</span>
          </div>
        </div>
      </div>

      <!-- Bouton d'ajout -->
      <div class="actions-bar">
        <BaseButton variant="primary" size="medium" @click="openAddModal">
          <template #icon-left>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </template>
          Nouvelle catégorie
        </BaseButton>
      </div>

      <!-- Liste des catégories -->
      <div class="categories-grid">
        <div
          v-for="category in categories"
          :key="category.id"
          class="category-card"
          :style="{ borderColor: category.color }"
        >
          <div class="category-header">
            <div
              class="category-icon"
              :style="{ backgroundColor: category.color }"
            >
              {{ category.icon }}
            </div>
            <div class="category-info">
              <h4 class="category-name">{{ category.name }}</h4>
              <p class="category-description">{{ category.description }}</p>
            </div>
            <div v-if="category.isDefault" class="category-badge">Défaut</div>
          </div>

          <div class="category-keywords">
            <span
              v-for="keyword in category.keywords.slice(0, 3)"
              :key="keyword"
              class="keyword-tag"
            >
              {{ keyword }}
            </span>
            <span v-if="category.keywords.length > 3" class="keyword-more">
              +{{ category.keywords.length - 3 }}
            </span>
          </div>

          <div class="category-actions">
            <BaseButton
              variant="secondary"
              size="small"
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
              v-if="!category.isDefault"
              variant="danger"
              size="small"
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

    <!-- Modal d'ajout/édition -->
    <BaseModal
      :is-open="showAddModal"
      :title="editingCategory ? 'Modifier la catégorie' : 'Nouvelle catégorie'"
      @close="closeModal"
    >
      <template #body>
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

        <div class="form-row">
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
      </template>

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
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1.5rem;
  }

  .section-title svg {
    width: 1.5rem;
    height: 1.5rem;
    color: #3b82f6;
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
    background: rgba(249, 250, 251, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
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

  /* Actions */
  .actions-bar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: 1.5rem;
  }

  /* Grille des catégories */
  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .category-card {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 2px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .category-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  }

  .category-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
    position: relative;
  }

  .category-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: white;
    flex-shrink: 0;
  }

  .category-info {
    flex: 1;
    min-width: 0;
  }

  .category-name {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.25rem;
  }

  .category-description {
    font-size: 0.875rem;
    color: #6b7280;
    line-height: 1.4;
  }

  .category-badge {
    position: absolute;
    top: -0.5rem;
    right: -0.5rem;
    background: rgba(251, 191, 36, 0.8);
    backdrop-filter: blur(5px);
    color: #92400e;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  /* Mots-clés */
  .category-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .keyword-tag {
    background: rgba(243, 244, 246, 0.8);
    backdrop-filter: blur(5px);
    color: #374151;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .keyword-more {
    background: rgba(229, 231, 235, 0.8);
    backdrop-filter: blur(5px);
    color: #6b7280;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  /* Actions de catégorie */
  .category-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
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
    border: 1px solid rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 6px;
    font-size: 0.875rem;
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

  /* Sélecteurs */
  .icon-selector {
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .icon-option {
    width: 2.5rem;
    height: 2.5rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.25rem;
    transition: all 0.2s;
  }

  .icon-option:hover {
    border-color: #3b82f6;
  }

  .icon-option.active {
    border-color: #3b82f6;
    background: rgba(219, 234, 254, 0.8);
    backdrop-filter: blur(5px);
  }

  .color-selector {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .color-option {
    width: 2.5rem;
    height: 2.5rem;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    cursor: pointer;
    transition: all 0.2s;
  }

  .color-option:hover {
    transform: scale(1.1);
  }

  .color-option.active {
    border-color: #1f2937;
    transform: scale(1.1);
  }

  /* Responsive */
  @media (max-width: 768px) {
    .categories-grid {
      grid-template-columns: 1fr;
    }

    .form-row {
      grid-template-columns: 1fr;
    }

    .icon-selector {
      grid-template-columns: repeat(6, 1fr);
    }

    .modal-content {
      margin: 1rem;
      width: calc(100% - 2rem);
    }
  }
</style>

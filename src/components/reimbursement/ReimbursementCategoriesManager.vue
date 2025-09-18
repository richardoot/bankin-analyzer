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
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    font-size: var(--text-xl);
    font-weight: var(--font-weight-bold);
    color: var(--gray-900);
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
    margin: 0 0 var(--spacing-6) 0;
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
    background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-2xl);
    padding: 1.75rem;
    transition: all var(--transition-spring);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.05),
      0 1px 3px rgba(0, 0, 0, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
    position: relative;
    overflow: hidden;
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
    transform: translateY(-6px) scale(1.02);
    box-shadow:
      0 20px 40px rgba(0, 0, 0, 0.08),
      0 8px 25px rgba(59, 130, 246, 0.15),
      0 0 0 2px rgba(59, 130, 246, 0.1),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
    background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
  }

  .category-card:hover::before {
    opacity: 1;
  }

  .category-card:hover .category-icon {
    transform: scale(1.1) rotate(5deg);
    box-shadow:
      0 8px 25px rgba(0, 0, 0, 0.2),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .category-header {
    display: flex;
    align-items: flex-start;
    gap: 1rem;
    margin-bottom: 1rem;
    position: relative;
  }

  .category-icon {
    width: 3.25rem;
    height: 3.25rem;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 1.5rem;
    color: white;
    flex-shrink: 0;
    transition: all var(--transition-spring);
    box-shadow:
      0 4px 12px rgba(0, 0, 0, 0.15),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    border: 2px solid rgba(255, 255, 255, 0.1);
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
    background: rgba(251, 191, 36, 0.9);
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
    background: #f3f4f6;
    color: #374151;
    padding: 0.25rem 0.5rem;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .keyword-more {
    background: #e5e7eb;
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
    .categories-grid {
      grid-template-columns: 1fr;
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
</style>

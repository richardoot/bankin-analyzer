<script setup lang="ts">
  import { computed, onMounted, ref } from 'vue'

  interface ReimbursementCategory {
    id: string
    name: string
    description: string
    icon: string
    color: string
    keywords: string[]
    isDefault: boolean
    createdAt: Date
  }

  // État local
  const categories = ref<ReimbursementCategory[]>([])
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
    try {
      const stored = localStorage.getItem(
        'bankin-analyzer-reimbursement-categories'
      )
      if (stored) {
        const parsed = JSON.parse(stored)
        categories.value = parsed.map(
          (
            cat: Omit<ReimbursementCategory, 'createdAt'> & {
              createdAt: string
            }
          ) => ({
            ...cat,
            createdAt: new Date(cat.createdAt),
          })
        )
      } else {
        // Initialiser avec les catégories par défaut
        initializeDefaultCategories()
      }
    } catch (error) {
      console.error('Erreur lors du chargement des catégories:', error)
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

  // Sauvegarder les catégories
  const saveCategories = () => {
    try {
      localStorage.setItem(
        'bankin-analyzer-reimbursement-categories',
        JSON.stringify(categories.value)
      )
    } catch (error) {
      console.error('Erreur lors de la sauvegarde des catégories:', error)
    }
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
  <div class="categories-manager section">
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
        <button class="add-btn" @click="openAddModal">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          Nouvelle catégorie
        </button>
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
            <button
              class="action-btn edit"
              title="Modifier"
              @click="openEditModal(category)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path
                  d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"
                />
                <path
                  d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"
                />
              </svg>
            </button>
            <button
              v-if="!category.isDefault"
              class="action-btn delete"
              title="Supprimer"
              @click="deleteCategory(category)"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <polyline points="3,6 5,6 21,6" />
                <path
                  d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal d'ajout/édition -->
    <div v-if="showAddModal" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>{{ editingCategory ? 'Modifier' : 'Nouvelle' }} catégorie</h3>
          <button class="close-btn" @click="closeModal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div class="modal-body">
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
              Ces mots-clés aideront à identifier automatiquement les dépenses
              de cette catégorie
            </small>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn-secondary" @click="closeModal">Annuler</button>
          <button
            class="btn-primary"
            :disabled="!isFormValid"
            @click="saveCategory"
          >
            {{ editingCategory ? 'Modifier' : 'Créer' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .categories-manager {
    background: white;
    border-radius: 1rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    border: 1px solid #f3f4f6;
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
    background: #f9fafb;
    border: 1px solid #e5e7eb;
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

  .add-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .add-btn:hover {
    background: #1d4ed8;
  }

  .add-btn svg {
    width: 1rem;
    height: 1rem;
  }

  /* Grille des catégories */
  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 1rem;
  }

  .category-card {
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 12px;
    padding: 1.5rem;
    transition: all 0.2s ease;
  }

  .category-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
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
    background: #fbbf24;
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

  .action-btn {
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .action-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .action-btn.edit {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .action-btn.edit:hover {
    background: #bfdbfe;
  }

  .action-btn.delete {
    background: #fecaca;
    color: #dc2626;
  }

  .action-btn.delete:hover {
    background: #fca5a5;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: white;
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .modal-header h3 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
  }

  .close-btn {
    width: 2rem;
    height: 2rem;
    border: none;
    background: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
    border-radius: 4px;
  }

  .close-btn:hover {
    background: #f3f4f6;
  }

  .close-btn svg {
    width: 1rem;
    height: 1rem;
  }

  .modal-body {
    padding: 1.5rem;
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
    border: 1px solid #d1d5db;
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
    border: 2px solid #e5e7eb;
    border-radius: 6px;
    background: white;
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
    background: #dbeafe;
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
    border: 2px solid #e5e7eb;
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

  .modal-footer {
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    padding: 1.5rem;
    border-top: 1px solid #e5e7eb;
  }

  .btn-secondary,
  .btn-primary {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 6px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn-primary {
    background: #3b82f6;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-primary:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .categories-manager {
      background: #1f2937;
      border: 1px solid #374151;
    }

    .section-title {
      color: #f9fafb;
    }

    .stat-card {
      background: #374151;
      border-color: #4b5563;
    }

    .stat-label {
      color: #d1d5db;
    }

    .stat-value {
      color: #f9fafb;
    }

    .add-btn {
      background: #3b82f6;
      color: white;
    }

    .add-btn:hover {
      background: #1d4ed8;
    }

    .category-card {
      background: #374151;
      border-color: #4b5563;
    }

    .category-card:hover {
      background: #4b5563;
    }

    .category-name {
      color: #f9fafb;
    }

    .category-description {
      color: #d1d5db;
    }

    .keyword-tag {
      background: #4b5563;
      color: #f3f4f6;
    }

    .keyword-more {
      background: #6b7280;
      color: #d1d5db;
    }

    .action-btn.edit {
      background: #1e3a8a;
      color: #60a5fa;
    }

    .action-btn.edit:hover {
      background: #1e40af;
    }

    .action-btn.delete {
      background: #7f1d1d;
      color: #f87171;
    }

    .action-btn.delete:hover {
      background: #991b1b;
    }

    .modal-content {
      background: #1f2937;
    }

    .modal-header {
      border-bottom-color: #374151;
    }

    .modal-header h3 {
      color: #f9fafb;
    }

    .close-btn {
      color: #d1d5db;
    }

    .close-btn:hover {
      background: #374151;
    }

    .form-group label {
      color: #f3f4f6;
    }

    .form-input,
    .form-textarea {
      background: #374151;
      border-color: #4b5563;
      color: #f9fafb;
    }

    .form-input:focus,
    .form-textarea:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-help {
      color: #d1d5db;
    }

    .icon-option {
      background: #374151;
      border-color: #4b5563;
    }

    .icon-option:hover {
      border-color: #60a5fa;
    }

    .icon-option.active {
      border-color: #3b82f6;
      background: #1e3a8a;
    }

    .color-option {
      border-color: #4b5563;
    }

    .color-option.active {
      border-color: #f9fafb;
    }

    .modal-footer {
      border-top-color: #374151;
    }

    .btn-secondary {
      background: #374151;
      color: #f3f4f6;
    }

    .btn-secondary:hover {
      background: #4b5563;
    }

    .btn-primary {
      background: #3b82f6;
      color: white;
    }

    .btn-primary:hover:not(:disabled) {
      background: #1d4ed8;
    }

    .btn-primary:disabled {
      background: #6b7280;
    }
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

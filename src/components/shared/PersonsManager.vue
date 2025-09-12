<script setup lang="ts">
  import { computed, ref } from 'vue'
  import type { Person, PersonAssignment } from '@/types'
  import BaseModal from './BaseModal.vue'
  import BaseButton from './BaseButton.vue'
  import BaseCard from './BaseCard.vue'
  import { useLocalStorage } from '@/composables/useLocalStorage'

  interface ExpenseAssignment {
    transactionId: string
    assignedPersons: PersonAssignment[]
  }

  const { usePersonsStorage } = useLocalStorage()
  const { data: availablePersons, save: savePersons } = usePersonsStorage()

  // États pour la gestion du formulaire
  const showAddPersonForm = ref(false)
  const editingPersonId = ref<string | null>(null)
  const newPerson = ref({ name: '', email: '' })
  const searchTerm = ref('')

  // Personnes filtrées selon le terme de recherche
  const filteredPersons = computed(() => {
    if (!searchTerm.value.trim()) {
      return availablePersons.value
    }
    const term = searchTerm.value.toLowerCase().trim()
    return availablePersons.value.filter(
      person =>
        person.name.toLowerCase().includes(term) ||
        (person.email && person.email.toLowerCase().includes(term))
    )
  })

  // Les données sont maintenant gérées par usePersonsStorage - pas besoin de fonctions supplémentaires

  // Validation du formulaire
  const isFormValid = computed(() => {
    const hasValidName = newPerson.value.name.trim() !== ''
    const email = newPerson.value.email.trim()

    // Si un email est fourni, il doit être valide et unique
    if (email !== '') {
      return hasValidName && isValidEmail(email) && !isEmailDuplicate(email)
    }

    // Si pas d'email, seul le nom est requis
    return hasValidName
  })

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Vérifier si l'email existe déjà (sauf pour la personne en cours d'édition)
  const isEmailDuplicate = (email: string): boolean => {
    if (!email.trim()) return false // Pas de doublon si email vide
    const trimmedEmail = email.trim().toLowerCase()
    return availablePersons.value.some(
      person =>
        person.email &&
        person.email.toLowerCase() === trimmedEmail &&
        person.id !== editingPersonId.value
    )
  }

  // Message d'erreur pour l'email
  const emailErrorMessage = computed(() => {
    const email = newPerson.value.email.trim()
    if (!email) return ''
    if (!isValidEmail(email)) return 'Veuillez entrer une adresse email valide'
    if (isEmailDuplicate(email)) return 'Cette adresse email est déjà utilisée'
    return ''
  })

  // Fonction pour générer un ID unique
  const generateId = (): string => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 9)
  }

  // Ajouter une nouvelle personne
  const addPerson = () => {
    if (!isFormValid.value) return

    const person: Person = {
      id: generateId(),
      name: newPerson.value.name.trim(),
    }

    // Ajouter l'email seulement s'il est fourni
    const email = newPerson.value.email.trim()
    if (email) {
      person.email = email
    }

    availablePersons.value.push(person)
    savePersons()
    resetForm()
  }

  // Commencer l'édition d'une personne
  const startEditPerson = (personId: string) => {
    const person = availablePersons.value.find(p => p.id === personId)
    if (person) {
      editingPersonId.value = personId
      newPerson.value = {
        name: person.name,
        email: person.email || '', // Utiliser une chaîne vide si email undefined
      }
      showAddPersonForm.value = true
    }
  }

  // Sauvegarder les modifications d'une personne
  const updatePerson = () => {
    if (!isFormValid.value || !editingPersonId.value) return

    const personIndex = availablePersons.value.findIndex(
      p => p.id === editingPersonId.value
    )
    if (personIndex !== -1) {
      const existingPerson = availablePersons.value[personIndex]
      if (existingPerson) {
        const updatedPerson: Person = {
          id: existingPerson.id,
          name: newPerson.value.name.trim(),
        }

        // Ajouter l'email seulement s'il est fourni
        const email = newPerson.value.email.trim()
        if (email) {
          updatedPerson.email = email
        }

        availablePersons.value[personIndex] = updatedPerson
      }
    }
    savePersons()
    resetForm()
  }

  // Supprimer une personne et ses associations
  const deletePerson = (personId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette personne ?')) {
      // Supprimer la personne de la liste
      availablePersons.value = availablePersons.value.filter(
        p => p.id !== personId
      )
      savePersons()

      // Nettoyer toutes les assignations de cette personne dans les dépenses
      cleanPersonAssignments(personId)
    }
  }

  // Nettoyer les assignations d'une personne supprimée
  const cleanPersonAssignments = (personId: string) => {
    try {
      const stored = localStorage.getItem('bankin-analyzer-expense-assignments')
      if (stored) {
        let expenseAssignments = JSON.parse(stored)

        // Supprimer la personne de toutes les assignations
        expenseAssignments = expenseAssignments
          .map((assignment: ExpenseAssignment) => {
            if (assignment.assignedPersons) {
              assignment.assignedPersons = assignment.assignedPersons.filter(
                (ap: PersonAssignment) => ap.personId !== personId
              )
            }
            return assignment
          })
          .filter(
            (assignment: ExpenseAssignment) =>
              // Garder seulement les assignations qui ont encore des personnes
              assignment.assignedPersons &&
              assignment.assignedPersons.length > 0
          )

        // Sauvegarder les assignations mises à jour
        localStorage.setItem(
          'bankin-analyzer-expense-assignments',
          JSON.stringify(expenseAssignments)
        )
      }
    } catch (error) {
      console.warn('Erreur lors du nettoyage des assignations:', error)
    }
  }

  // Réinitialiser le formulaire
  const resetForm = () => {
    newPerson.value = { name: '', email: '' }
    showAddPersonForm.value = false
    editingPersonId.value = null
  }

  // Action principale du formulaire (ajouter ou modifier)
  const submitForm = () => {
    if (editingPersonId.value) {
      updatePerson()
    } else {
      addPerson()
    }
  }

  // Fonction closeModalOnOverlay supprimée - gérée par BaseModal

  // Fonctions d'export/import
  const exportPersons = () => {
    const dataStr = JSON.stringify(availablePersons.value, null, 2)
    const dataBlob = new Blob([dataStr], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'personnes-bankin-analyzer.json'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const importPersons = (event: Event) => {
    const file = (event.target as HTMLInputElement).files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = e => {
      try {
        const importedData = JSON.parse(e.target?.result as string)
        if (Array.isArray(importedData)) {
          // Valider les données importées
          const validPersons = importedData.filter(
            person =>
              person &&
              typeof person.id === 'string' &&
              typeof person.name === 'string' &&
              (person.email === undefined ||
                (typeof person.email === 'string' &&
                  isValidEmail(person.email)))
          )

          if (validPersons.length > 0) {
            availablePersons.value = validPersons
            savePersons()
            alert(`${validPersons.length} personne(s) importée(s) avec succès`)
          } else {
            alert('Aucune donnée valide trouvée dans le fichier')
          }
        } else {
          alert('Format de fichier invalide')
        }
      } catch (_error) {
        alert('Erreur lors de la lecture du fichier')
      }
    }
    reader.readAsText(file)
    // Reset l'input file
    ;(event.target as HTMLInputElement).value = ''
  }
</script>

<template>
  <BaseCard variant="glass" padding="lg" rounded="lg" class="persons-section">
    <template #header>
      <h4 class="section-title">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Gestion des personnes
        <span v-if="availablePersons.length > 0" class="title-badge">
          {{ availablePersons.length }} personne{{
            availablePersons.length > 1 ? 's' : ''
          }}
        </span>
      </h4>
    </template>

    <!-- Annonces pour lecteurs d'écran -->
    <div class="sr-only" aria-live="polite" aria-atomic="false">
      <span v-if="searchTerm">
        {{ filteredPersons.length }} personne{{
          filteredPersons.length !== 1 ? 's' : ''
        }}
        trouvée{{ filteredPersons.length !== 1 ? 's' : '' }} pour "{{
          searchTerm
        }}"
      </span>
      <span v-else>
        {{ availablePersons.length }} personne{{
          availablePersons.length !== 1 ? 's' : ''
        }}
        total{{ availablePersons.length !== 1 ? 'es' : 'e' }}
      </span>
    </div>

    <div class="section-content placeholder-content">
      <div class="placeholder-card">
        <div class="placeholder-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h4>Gestion des contacts</h4>

        <!-- Aperçu des personnes existantes -->
        <div class="persons-preview">
          <div class="persons-header">
            <h5>Personnes configurées actuellement :</h5>
            <span v-if="availablePersons.length > 0" class="persons-count">
              {{ filteredPersons.length }} / {{ availablePersons.length }}
              {{ filteredPersons.length <= 1 ? 'personne' : 'personnes' }}
              <span v-if="searchTerm">
                trouvée{{ filteredPersons.length <= 1 ? '' : 's' }}
              </span>
            </span>
          </div>

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
                placeholder="Rechercher par nom ou email..."
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

          <div class="persons-list">
            <!-- Message quand aucune personne n'est trouvée -->
            <div
              v-if="filteredPersons.length === 0 && searchTerm"
              class="no-results"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <p>Aucune personne trouvée pour "{{ searchTerm }}"</p>
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

            <!-- Message quand aucune personne n'existe -->
            <div v-else-if="availablePersons.length === 0" class="no-results">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <p>Aucune personne enregistrée</p>
              <p class="no-results-subtitle">
                Commencez par ajouter votre première personne
              </p>
            </div>

            <!-- Liste des personnes -->
            <div
              v-for="person in filteredPersons"
              :key="person.id"
              class="person-item"
            >
              <div class="person-avatar">
                {{ person.name.charAt(0).toUpperCase() }}
              </div>
              <div class="person-info">
                <span class="person-name">{{ person.name }}</span>
                <span v-if="person.email" class="person-email">{{
                  person.email
                }}</span>
                <span v-else class="person-email no-email"
                  >Aucun email renseigné</span
                >
              </div>
              <div class="person-actions">
                <BaseButton
                  variant="secondary"
                  size="sm"
                  icon
                  title="Éditer"
                  @click="startEditPerson(person.id)"
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
                  @click="deletePerson(person.id)"
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

          <!-- Boutons d'actions -->
          <div class="action-buttons">
            <BaseButton
              variant="primary"
              size="large"
              class="add-person-btn"
              @click="showAddPersonForm = !showAddPersonForm"
            >
              <template #icon-left>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </template>
              {{ editingPersonId ? 'Annuler' : 'Ajouter une personne' }}
            </BaseButton>

            <div v-if="availablePersons.length > 0" class="secondary-actions">
              <BaseButton
                variant="secondary"
                size="medium"
                title="Exporter les données"
                @click="exportPersons"
              >
                <template #icon-left>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7,10 12,15 17,10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </template>
                Exporter
              </BaseButton>

              <label class="import-label">
                <BaseButton
                  variant="secondary"
                  size="medium"
                  title="Importer des données"
                  as="span"
                >
                  <template #icon-left>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17,8 12,3 7,8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                  </template>
                  Importer
                </BaseButton>
                <input
                  type="file"
                  accept=".json"
                  class="hidden-file-input"
                  @change="importPersons"
                />
              </label>
            </div>
          </div>

          <!-- Modale de formulaire d'ajout/édition -->
          <BaseModal
            :is-open="showAddPersonForm"
            :title="
              editingPersonId
                ? 'Modifier la personne'
                : 'Ajouter une nouvelle personne'
            "
            @close="resetForm"
          >
            <form @submit.prevent="submitForm">
              <div class="form-group">
                <label for="person-name">Nom complet</label>
                <input
                  id="person-name"
                  v-model="newPerson.name"
                  type="text"
                  placeholder="Entrez le nom complet"
                  required
                  class="form-input"
                />
              </div>
              <div class="form-group">
                <label for="person-email">Email (optionnel)</label>
                <input
                  id="person-email"
                  v-model="newPerson.email"
                  type="email"
                  placeholder="Entrez l'adresse email (optionnel)"
                  class="form-input"
                />
                <div v-if="emailErrorMessage" class="error-message">
                  {{ emailErrorMessage }}
                </div>
              </div>
            </form>

            <template #footer>
              <BaseButton variant="secondary" size="medium" @click="resetForm">
                Annuler
              </BaseButton>
              <BaseButton
                variant="primary"
                size="medium"
                :disabled="!isFormValid"
                @click="submitForm"
              >
                {{ editingPersonId ? 'Sauvegarder' : 'Ajouter' }}
              </BaseButton>
            </template>
          </BaseModal>
        </div>
      </div>
    </div>
  </BaseCard>
</template>

<style scoped>
  .persons-section {
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

  .placeholder-content {
    text-align: center;
  }

  .placeholder-card {
    background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
    border: 2px dashed var(--gray-300);
    border-radius: var(--radius-xl);
    padding: 2rem;
    transition: all var(--transition-normal);
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
  }

  .placeholder-card:hover {
    border-color: var(--primary-400);
    background: linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.98) 0%,
      rgba(59, 130, 246, 0.04) 100%
    );
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.95),
      0 4px 12px rgba(59, 130, 246, 0.08);
  }

  .placeholder-icon {
    width: 4rem;
    height: 4rem;
    margin: 0 auto 1.5rem;
    background: #e5e7eb;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #6b7280;
  }

  .placeholder-icon svg {
    width: 2rem;
    height: 2rem;
  }

  .placeholder-card h4 {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 0.75rem;
  }

  .placeholder-card p {
    color: #6b7280;
    line-height: 1.6;
    margin-bottom: 1.5rem;
  }

  .placeholder-features {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    justify-content: center;
    margin-bottom: 2rem;
  }

  .feature-badge {
    background: #dbeafe;
    color: #1e40af;
    padding: 0.375rem 0.75rem;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
  }

  /* Aperçu des personnes */
  .persons-preview {
    border-top: 1px solid #e5e7eb;
    padding-top: 1.5rem;
    margin-top: 1.5rem;
    text-align: left;
  }

  .persons-preview h5 {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
    margin-bottom: 1rem;
  }

  .persons-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .persons-count {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  /* Styles pour la barre de recherche */
  .search-container {
    margin-bottom: 1rem;
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

  /* Styles pour les messages "aucun résultat" */
  .no-results {
    text-align: center;
    padding: 2rem;
    color: #6b7280;
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

  .persons-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .person-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-xl);
    box-shadow:
      0 2px 8px rgba(0, 0, 0, 0.04),
      0 1px 3px rgba(0, 0, 0, 0.06),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
    transition: all var(--transition-spring);
    position: relative;
    overflow: hidden;
  }

  .person-item::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: linear-gradient(90deg, var(--primary-500), var(--primary-600));
    transform: scaleX(0);
    transition: transform var(--transition-normal);
    transform-origin: left;
  }

  .person-item:hover::before {
    transform: scaleX(1);
  }

  .person-item:hover {
    background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
    border-color: var(--primary-200);
    transform: translateY(-3px) scale(1.02);
    box-shadow:
      0 12px 28px rgba(0, 0, 0, 0.08),
      0 6px 20px rgba(59, 130, 246, 0.12),
      0 0 0 2px rgba(59, 130, 246, 0.08),
      inset 0 1px 0 rgba(255, 255, 255, 0.95);
  }

  .person-item:hover .person-avatar {
    transform: scale(1.1) rotate(5deg);
    box-shadow:
      0 6px 20px rgba(59, 130, 246, 0.4),
      inset 0 1px 0 rgba(255, 255, 255, 0.3);
  }

  .person-avatar {
    width: 2.75rem;
    height: 2.75rem;
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
    font-size: 1.125rem;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow:
      0 4px 12px rgba(59, 130, 246, 0.3),
      inset 0 1px 0 rgba(255, 255, 255, 0.2);
    transition: all var(--transition-spring);
    flex-shrink: 0;
  }

  .person-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .person-name {
    font-weight: 600;
    color: #1f2937;
    font-size: 0.9rem;
  }

  .person-email {
    font-size: 0.8rem;
    color: #6b7280;
  }

  .person-email.no-email {
    font-style: italic;
    color: #9ca3af;
  }

  .person-actions {
    display: flex;
    gap: 0.5rem;
  }

  .add-person-btn {
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

  .add-person-btn:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .add-person-btn svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  /* Styles pour les boutons d'action */
  .action-buttons {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
  }

  .secondary-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-start;
    flex-wrap: wrap;
  }

  .action-btn.secondary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.625rem 1rem;
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
    text-decoration: none;
    min-width: fit-content;
    white-space: nowrap;
    flex-shrink: 0;
    justify-content: flex-start;
  }

  .action-btn.secondary:hover {
    background: #e5e7eb;
    transform: translateY(-1px);
  }

  .action-btn.secondary svg {
    width: 1rem;
    height: 1rem;
    stroke-width: 2;
    flex-shrink: 0;
  }

  .hidden-file-input {
    display: none;
  }

  /* Modale de formulaire d'ajout/édition */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    backdrop-filter: blur(4px);
  }

  .modal-dialog {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
    max-width: 500px;
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    animation: modalSlideIn 0.3s ease-out;
  }

  @keyframes modalSlideIn {
    from {
      opacity: 0;
      transform: scale(0.95) translateY(-20px);
    }
    to {
      opacity: 1;
      transform: scale(1) translateY(0);
    }
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1.5rem 1.5rem 0 1.5rem;
    border-bottom: 1px solid #f3f4f6;
    margin-bottom: 1.5rem;
  }

  .modal-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #111827;
    margin: 0;
  }

  .modal-close-btn {
    background: none;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 0.5rem;
    border-radius: 6px;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .modal-close-btn:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-close-btn svg {
    width: 1.25rem;
    height: 1.25rem;
    stroke-width: 2;
  }

  .modal-body {
    padding: 0 1.5rem 1.5rem 1.5rem;
  }

  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    margin-bottom: 0.5rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.875rem 1rem;
    border: 2px solid var(--gray-200);
    border-radius: var(--radius-lg);
    font-size: 0.875rem;
    background: white;
    color: var(--gray-800);
    transition: all var(--transition-normal);
    font-weight: var(--font-weight-medium);
  }

  .form-group input:hover {
    border-color: var(--gray-300);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--primary-400);
    box-shadow:
      0 0 0 4px rgba(59, 130, 246, 0.1),
      0 4px 12px rgba(59, 130, 246, 0.15);
    transform: translateY(-1px);
  }

  .error-message {
    color: #dc2626;
    font-size: 0.75rem;
    margin-top: 0.5rem;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .placeholder-features {
      flex-direction: column;
      align-items: center;
    }

    .secondary-actions {
      justify-content: center;
      gap: 0.375rem;
    }

    .action-btn.secondary {
      padding: 0.5rem 0.75rem;
      font-size: 0.8rem;
      gap: 0.375rem;
    }

    .action-btn.secondary svg {
      width: 0.875rem;
      height: 0.875rem;
    }

    .persons-list {
      gap: 0.5rem;
    }

    .person-item {
      padding: 0.625rem;
    }

    .person-avatar {
      width: 2rem;
      height: 2rem;
      font-size: 0.875rem;
    }
  }
</style>

<script setup lang="ts">
  import { computed, ref } from 'vue'

  // Interface pour les personnes
  interface Person {
    id: string
    name: string
    email?: string // Email optionnel
  }

  // Interfaces pour les assignations d'ExpensesReimbursementManager
  interface PersonAssignment {
    personId: string
    amount: number
  }

  interface ExpenseAssignment {
    transactionId: string
    assignedPersons: PersonAssignment[]
  }

  // Liste des personnes (chargée depuis localStorage)
  const availablePersons = ref<Person[]>([])

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

  // Fonctions de persistance localStorage
  const saveToStorage = () => {
    localStorage.setItem(
      'bankin-analyzer-persons',
      JSON.stringify(availablePersons.value)
    )
  }

  const loadFromStorage = () => {
    try {
      const stored = localStorage.getItem('bankin-analyzer-persons')
      if (stored) {
        availablePersons.value = JSON.parse(stored)
      }
    } catch (error) {
      console.error('Erreur lors du chargement des données:', error)
      availablePersons.value = []
    }
  }

  // Charger les données au démarrage
  loadFromStorage()

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
    saveToStorage()
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
    saveToStorage()
    resetForm()
  }

  // Supprimer une personne et ses associations
  const deletePerson = (personId: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette personne ?')) {
      // Supprimer la personne de la liste
      availablePersons.value = availablePersons.value.filter(
        p => p.id !== personId
      )
      saveToStorage()

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

  // Fermer la modale en cliquant sur l'overlay
  const closeModalOnOverlay = (event: Event) => {
    if (event.target === event.currentTarget) {
      resetForm()
    }
  }

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
            saveToStorage()
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
  <div class="reimbursement-section persons-section">
    <h3 class="section-title">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </svg>
      Gestion des personnes
    </h3>
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
              <button class="clear-search-btn" @click="searchTerm = ''">
                Effacer la recherche
              </button>
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
                <button
                  class="action-btn edit"
                  title="Éditer"
                  @click="startEditPerson(person.id)"
                >
                  ✏️
                </button>
                <button
                  class="action-btn delete"
                  title="Supprimer"
                  @click="deletePerson(person.id)"
                >
                  🗑️
                </button>
              </div>
            </div>
          </div>

          <!-- Boutons d'actions -->
          <div class="action-buttons">
            <button
              class="add-person-btn primary"
              @click="showAddPersonForm = !showAddPersonForm"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              {{ editingPersonId ? 'Annuler' : 'Ajouter une personne' }}
            </button>

            <div v-if="availablePersons.length > 0" class="secondary-actions">
              <button
                class="action-btn secondary"
                title="Exporter les données"
                @click="exportPersons"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7,10 12,15 17,10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Exporter
              </button>

              <label class="action-btn secondary" title="Importer des données">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17,8 12,3 7,8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                Importer
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
          <div
            v-if="showAddPersonForm"
            class="modal-overlay"
            @click="closeModalOnOverlay"
          >
            <div class="modal-dialog" @click.stop>
              <div class="modal-header">
                <h5 class="modal-title">
                  {{
                    editingPersonId
                      ? 'Modifier la personne'
                      : 'Ajouter une nouvelle personne'
                  }}
                </h5>
                <button
                  type="button"
                  class="modal-close-btn"
                  @click="resetForm"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              <div class="modal-body">
                <form @submit.prevent="submitForm">
                  <div class="form-group">
                    <label for="person-name">Nom complet</label>
                    <input
                      id="person-name"
                      v-model="newPerson.name"
                      type="text"
                      placeholder="Entrez le nom complet"
                      required
                    />
                  </div>
                  <div class="form-group">
                    <label for="person-email">Email (optionnel)</label>
                    <input
                      id="person-email"
                      v-model="newPerson.email"
                      type="email"
                      placeholder="Entrez l'adresse email (optionnel)"
                    />
                    <div v-if="emailErrorMessage" class="error-message">
                      {{ emailErrorMessage }}
                    </div>
                  </div>
                  <div class="form-actions">
                    <button
                      type="button"
                      class="btn-secondary"
                      @click="resetForm"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      class="btn-primary"
                      :disabled="!isFormValid"
                    >
                      {{ editingPersonId ? 'Sauvegarder' : 'Ajouter' }}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-section {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    padding: 1.5rem 1.5rem 0;
    margin-bottom: 1rem;
  }

  .section-title svg {
    width: 1.5rem;
    height: 1.5rem;
    color: #3b82f6;
  }

  .section-content {
    padding: 0 1.5rem 1.5rem;
  }

  .placeholder-content {
    text-align: center;
  }

  .placeholder-card {
    background: rgba(255, 255, 255, 0.5);
    backdrop-filter: blur(5px);
    border: 2px dashed rgba(255, 255, 255, 0.4);
    border-radius: 12px;
    padding: 2rem;
    transition: all 0.3s ease;
  }

  .placeholder-card:hover {
    border-color: #3b82f6;
    background: rgba(59, 130, 246, 0.1);
    backdrop-filter: blur(8px);
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
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    font-size: 0.875rem;
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(5px);
    transition: all 0.2s ease;
  }

  .search-input:focus {
    outline: none;
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(8px);
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

  .clear-search-btn {
    margin-top: 1rem;
    padding: 0.5rem 1rem;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .clear-search-btn:hover {
    background: #2563eb;
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
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 8px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
    transition: all 0.2s ease;
  }

  .person-item:hover {
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border-color: rgba(255, 255, 255, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
  }

  .person-avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 1rem;
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

  .action-btn {
    width: 2rem;
    height: 2rem;
    border: none;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .action-btn svg {
    width: 1.1rem;
    height: 1.1rem;
    fill: currentColor;
  }

  .action-btn.edit {
    background: #dbeafe;
    color: #1e40af;
  }

  .action-btn.edit:hover {
    background: #3b82f6;
    color: white;
    transform: scale(1.1);
  }

  .action-btn.delete {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.delete:hover {
    background: #dc2626;
    color: white;
    transform: scale(1.1);
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
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(15px);
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
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
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 6px;
    font-size: 0.875rem;
    background: rgba(255, 255, 255, 0.8);
    backdrop-filter: blur(5px);
    transition: all 0.2s ease;
  }

  .form-group input:focus {
    outline: none;
    border-color: #3b82f6;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .error-message {
    color: #dc2626;
    font-size: 0.75rem;
    margin-top: 0.5rem;
  }

  .form-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
    margin-top: 1.5rem;
  }

  .btn-secondary {
    padding: 0.5rem 1rem;
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn-primary {
    padding: 0.5rem 1rem;
    background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Styles pour garantir l'affichage des SVG dans les boutons d'action */
  .person-actions .action-btn svg {
    display: block !important;
    width: 1.1rem !important;
    height: 1.1rem !important;
    fill: currentColor !important;
    opacity: 1 !important;
    visibility: visible !important;
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

    .action-btn {
      width: 1.75rem;
      height: 1.75rem;
    }

    .action-btn svg {
      width: 0.875rem;
      height: 0.875rem;
    }
  }
</style>

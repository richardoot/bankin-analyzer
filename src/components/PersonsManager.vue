<script setup lang="ts">
  import { ref } from 'vue'

  // Interface pour les personnes
  interface Person {
    id: string
    name: string
    email: string
  }

  // Données mockées pour les personnes (à remplacer par une vraie gestion)
  const availablePersons = ref<Person[]>([
    { id: '1', name: 'Jean Dupont', email: 'jean.dupont@email.com' },
    { id: '2', name: 'Marie Martin', email: 'marie.martin@email.com' },
    { id: '3', name: 'Pierre Durand', email: 'pierre.durand@email.com' },
  ])

  // États pour la gestion future
  const showAddPersonForm = ref(false)
  const newPerson = ref({ name: '', email: '' })

  // Fonctions pour la gestion future des personnes (préfixées avec _ car non utilisées pour le moment)
  const _addPerson = () => {
    // À implémenter : ajouter une nouvelle personne
    console.log('Ajouter une personne:', newPerson.value)
  }

  const _editPerson = (personId: string) => {
    // À implémenter : éditer une personne
    console.log('Éditer la personne:', personId)
  }

  const _deletePerson = (personId: string) => {
    // À implémenter : supprimer une personne
    console.log('Supprimer la personne:', personId)
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
        <h4>À venir : Gestion des contacts</h4>
        <p>
          Cette section permettra d'ajouter, modifier et supprimer les personnes
          qui peuvent faire l'objet de remboursements. Vous pourrez définir
          leurs informations de contact et leur associer des dépenses.
        </p>
        <div class="placeholder-features">
          <span class="feature-badge">Ajout de contacts</span>
          <span class="feature-badge">Modification des informations</span>
          <span class="feature-badge">Association aux dépenses</span>
        </div>

        <!-- Aperçu des personnes existantes -->
        <div class="persons-preview">
          <h5>Personnes configurées actuellement :</h5>
          <div class="persons-list">
            <div
              v-for="person in availablePersons"
              :key="person.id"
              class="person-item"
            >
              <div class="person-avatar">
                {{ person.name.charAt(0).toUpperCase() }}
              </div>
              <div class="person-info">
                <span class="person-name">{{ person.name }}</span>
                <span class="person-email">{{ person.email }}</span>
              </div>
              <div class="person-actions">
                <button
                  class="action-btn edit"
                  title="Éditer"
                  @click="_editPerson(person.id)"
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
                  class="action-btn delete"
                  title="Supprimer"
                  @click="_deletePerson(person.id)"
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

          <button
            class="add-person-btn"
            @click="showAddPersonForm = !showAddPersonForm"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="16" />
              <line x1="8" y1="12" x2="16" y2="12" />
            </svg>
            Ajouter une personne
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .reimbursement-section {
    background: white;
    border-radius: 1rem;
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
    background: #f9fafb;
    border: 2px dashed #d1d5db;
    border-radius: 12px;
    padding: 2rem;
    transition: all 0.3s ease;
  }

  .placeholder-card:hover {
    border-color: #3b82f6;
    background: #eff6ff;
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
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    transition: all 0.2s ease;
  }

  .person-item:hover {
    background: #f9fafb;
    border-color: #d1d5db;
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
    width: 1rem;
    height: 1rem;
  }

  .action-btn.edit {
    background: #dbeafe;
    color: #1e40af;
  }

  .action-btn.edit:hover {
    background: #3b82f6;
    color: white;
  }

  .action-btn.delete {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.delete:hover {
    background: #dc2626;
    color: white;
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

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .reimbursement-section {
      background: #1f2937;
      border: 1px solid #374151;
    }

    .section-title {
      color: #f9fafb;
    }

    .placeholder-card {
      background: #374151;
      border-color: #4b5563;
    }

    .placeholder-card:hover {
      border-color: #3b82f6;
      background: #1e3a8a;
    }

    .placeholder-card h4 {
      color: #f9fafb;
    }

    .placeholder-card p {
      color: #d1d5db;
    }

    .person-item {
      background: #374151;
      border-color: #4b5563;
    }

    .person-item:hover {
      background: #4b5563;
    }

    .person-name {
      color: #f9fafb;
    }

    .person-email {
      color: #d1d5db;
    }

    .persons-preview h5 {
      color: #f3f4f6;
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .placeholder-features {
      flex-direction: column;
      align-items: center;
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

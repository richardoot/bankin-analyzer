<script setup lang="ts">
  import FileUpload from './FileUpload.vue'

  // Gestionnaire d'événements pour l'upload de fichier
  const handleFileUploaded = (file: File): void => {
    console.log('Fichier uploadé avec succès:', file.name)
    // TODO: Implémenter la logique de traitement du fichier
  }

  const handleUploadError = (error: string): void => {
    console.error("Erreur lors de l'upload:", error)
    // TODO: Implémenter la gestion d'erreur globale
  }
</script>

<template>
  <section class="upload-section">
    <div class="upload-container">
      <div class="upload-header">
        <h2 class="section-title">Commencez votre analyse</h2>
        <p class="section-description">
          Importez votre fichier d'export CSV depuis l'application Bankin pour
          démarrer l'analyse de vos données financières. Notre outil vous aidera
          à identifier les tendances, catégoriser vos dépenses et optimiser
          votre budget.
        </p>
      </div>

      <div class="upload-wrapper">
        <FileUpload
          :accepted-formats="['.csv']"
          max-size-label="10MB max"
          @file-uploaded="handleFileUploaded"
          @upload-error="handleUploadError"
        />
      </div>

      <div class="features-grid">
        <div class="feature-item">
          <div class="feature-icon-wrapper">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
              />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <h3 class="feature-title">Import sécurisé</h3>
          <p class="feature-description">
            Vos données restent privées et sont traitées localement. Aucune
            information bancaire n'est transmise à des serveurs externes.
          </p>
        </div>

        <div class="feature-item">
          <div class="feature-icon-wrapper">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
            </svg>
          </div>
          <h3 class="feature-title">Analyse instantanée</h3>
          <p class="feature-description">
            Obtenez immédiatement des graphiques et statistiques détaillées sur
            vos habitudes de consommation et revenus.
          </p>
        </div>

        <div class="feature-item">
          <div class="feature-icon-wrapper">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
          </div>
          <h3 class="feature-title">Visualisations avancées</h3>
          <p class="feature-description">
            Découvrez vos données sous forme de graphiques interactifs, tableaux
            de bord et rapports personnalisables.
          </p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .upload-section {
    background: linear-gradient(180deg, #f8fafc 0%, #ffffff 100%);
    padding: 4rem 0;
    min-height: 60vh;
    position: relative;
  }

  .upload-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent 0%,
      #e2e8f0 50%,
      transparent 100%
    );
  }

  .upload-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    flex-direction: column;
    gap: 3rem;
  }

  .upload-header {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
  }

  .section-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 1rem;
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .section-description {
    font-size: 1.125rem;
    line-height: 1.7;
    color: #6b7280;
    margin: 0;
  }

  .upload-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 2rem;
    margin-top: 2rem;
  }

  .feature-item {
    background: white;
    border-radius: 16px;
    padding: 2rem;
    box-shadow:
      0 4px 6px -1px rgba(0, 0, 0, 0.05),
      0 2px 4px -1px rgba(0, 0, 0, 0.03);
    border: 1px solid #f1f5f9;
    transition: all 0.3s ease;
    text-align: center;
  }

  .feature-item:hover {
    transform: translateY(-4px);
    box-shadow:
      0 10px 25px -3px rgba(0, 0, 0, 0.1),
      0 4px 6px -2px rgba(0, 0, 0, 0.05);
  }

  .feature-icon-wrapper {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 64px;
    height: 64px;
    background: linear-gradient(135deg, #e0e7ff, #c7d2fe);
    border-radius: 16px;
    margin-bottom: 1.5rem;
  }

  .feature-icon {
    width: 32px;
    height: 32px;
    color: #4f46e5;
  }

  .feature-title {
    font-size: 1.25rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 1rem;
  }

  .feature-description {
    font-size: 0.875rem;
    line-height: 1.6;
    color: #6b7280;
    margin: 0;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .upload-section {
      padding: 2rem 0;
    }

    .upload-container {
      padding: 0 1rem;
      gap: 2rem;
    }

    .section-title {
      font-size: 2rem;
    }

    .section-description {
      font-size: 1rem;
    }

    .features-grid {
      grid-template-columns: 1fr;
      gap: 1.5rem;
    }

    .feature-item {
      padding: 1.5rem;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .upload-section {
      background: linear-gradient(180deg, #1f2937 0%, #111827 100%);
    }

    .section-title {
      color: #f9fafb;
    }

    .section-description {
      color: #d1d5db;
    }

    .feature-item {
      background: #374151;
      border-color: #4b5563;
    }

    .feature-item:hover {
      background: #4b5563;
    }

    .feature-icon-wrapper {
      background: linear-gradient(135deg, #4c1d95, #5b21b6);
    }

    .feature-icon {
      color: #a78bfa;
    }

    .feature-title {
      color: #f9fafb;
    }

    .feature-description {
      color: #d1d5db;
    }
  }
</style>

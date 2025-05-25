<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  defineProps<Props>()

  const formatAmount = (amount: number): string => {
    return new Intl.NumberFormat('fr-FR', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount)
  }

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return 'Non défini'
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('fr-FR')
    } catch {
      return dateStr
    }
  }
</script>

<template>
  <div class="dashboard-page">
    <div class="dashboard-container">
      <!-- En-tête du dashboard -->
      <div class="dashboard-header">
        <h1 class="dashboard-title">
          <svg
            class="dashboard-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <line x1="9" y1="9" x2="15" y2="9" />
            <line x1="9" y1="15" x2="15" y2="15" />
          </svg>
          Tableau de bord financier
        </h1>
        <p class="dashboard-description">
          Voici un aperçu de vos données financières analysées
        </p>
      </div>

      <!-- Grille des statistiques principales -->
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-icon transactions">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
              />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Transactions</h3>
            <p class="stat-value">{{ analysisResult.transactionCount }}</p>
            <p class="stat-description">transactions analysées</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon categories">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Catégories</h3>
            <p class="stat-value">{{ analysisResult.categoryCount }}</p>
            <p class="stat-description">catégories détectées</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon amount">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Montant total</h3>
            <p class="stat-value">
              {{ formatAmount(analysisResult.totalAmount) }}
            </p>
            <p class="stat-description">sur la période</p>
          </div>
        </div>

        <div class="stat-card">
          <div class="stat-icon period">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Période</h3>
            <p class="stat-value">
              {{ formatDate(analysisResult.dateRange.start) }}
            </p>
            <p class="stat-description">
              au {{ formatDate(analysisResult.dateRange.end) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Section des catégories -->
      <div class="categories-section">
        <h2 class="section-title">
          <svg
            class="section-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M3 3v18h18" />
            <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
          </svg>
          Catégories détectées
        </h2>

        <div class="categories-grid">
          <div
            v-for="(category, index) in analysisResult.categories"
            :key="index"
            class="category-item"
          >
            <div
              class="category-color"
              :style="{
                backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 60%)`,
              }"
            ></div>
            <span class="category-name">{{ category }}</span>
          </div>
        </div>
      </div>

      <!-- Message informatif -->
      <div class="info-section">
        <div class="info-card">
          <div class="info-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4" />
              <path d="M12 8h.01" />
            </svg>
          </div>
          <div class="info-content">
            <h3 class="info-title">Analyse terminée</h3>
            <p class="info-description">
              Votre fichier CSV a été analysé avec succès. Ces données vous
              donnent un aperçu de vos habitudes financières sur la période
              sélectionnée.
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .dashboard-page {
    min-height: calc(100vh - 120px);
    padding: 2rem;
    background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
  }

  .dashboard-container {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  /* En-tête */
  .dashboard-header {
    text-align: center;
    padding: 2rem 0;
  }

  .dashboard-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 2.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 1rem;
    line-height: 1.2;
  }

  .dashboard-icon {
    width: 2.5rem;
    height: 2.5rem;
    color: #3b82f6;
  }

  .dashboard-description {
    font-size: 1.125rem;
    color: #6b7280;
    line-height: 1.6;
    max-width: 600px;
    margin: 0 auto;
  }

  /* Grille des statistiques */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
  }

  .stat-card {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
  }

  .stat-icon {
    width: 3rem;
    height: 3rem;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .stat-icon svg {
    width: 1.5rem;
    height: 1.5rem;
    color: white;
  }

  .stat-icon.transactions {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .stat-icon.categories {
    background: linear-gradient(135deg, #10b981, #047857);
  }

  .stat-icon.amount {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .stat-icon.period {
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
  }

  .stat-content {
    flex: 1;
  }

  .stat-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stat-value {
    font-size: 2rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0 0 0.25rem;
    line-height: 1;
  }

  .stat-description {
    font-size: 0.875rem;
    color: #6b7280;
    margin: 0;
  }

  /* Section des catégories */
  .categories-section {
    background: white;
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid #e5e7eb;
  }

  .section-title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    font-size: 1.5rem;
    font-weight: 600;
    color: #1f2937;
    margin-bottom: 1.5rem;
  }

  .section-icon {
    width: 1.5rem;
    height: 1.5rem;
    color: #3b82f6;
  }

  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 1rem;
  }

  .category-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: #f9fafb;
    border-radius: 0.5rem;
    border: 1px solid #e5e7eb;
    transition: all 0.2s ease;
  }

  .category-item:hover {
    background: #f3f4f6;
  }

  .category-color {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .category-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
  }

  /* Section info */
  .info-section {
    margin-top: 1rem;
  }

  .info-card {
    background: linear-gradient(135deg, #dbeafe, #bfdbfe);
    border-radius: 1rem;
    padding: 2rem;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    border: 1px solid #93c5fd;
  }

  .info-icon {
    width: 3rem;
    height: 3rem;
    background: #3b82f6;
    border-radius: 0.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .info-icon svg {
    width: 1.5rem;
    height: 1.5rem;
    color: white;
  }

  .info-content {
    flex: 1;
  }

  .info-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #1e40af;
    margin: 0 0 0.5rem;
  }

  .info-description {
    font-size: 0.875rem;
    color: #1e40af;
    margin: 0;
    line-height: 1.5;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .dashboard-page {
      padding: 1.5rem;
    }

    .dashboard-title {
      font-size: 2rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .dashboard-icon {
      width: 2rem;
      height: 2rem;
    }

    .stats-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .stat-card {
      padding: 1.5rem;
    }

    .categories-grid {
      grid-template-columns: 1fr;
    }

    .categories-section {
      padding: 1.5rem;
    }

    .info-card {
      flex-direction: column;
      text-align: center;
      padding: 1.5rem;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .dashboard-page {
      background: linear-gradient(135deg, #0f1419 0%, #111827 100%);
    }

    .dashboard-title {
      color: #f9fafb;
    }

    .dashboard-description {
      color: #d1d5db;
    }

    .stat-card {
      background: #1f2937;
      border-color: #374151;
    }

    .stat-value {
      color: #f9fafb;
    }

    .categories-section {
      background: #1f2937;
      border-color: #374151;
    }

    .section-title {
      color: #f9fafb;
    }

    .category-item {
      background: #374151;
      border-color: #4b5563;
    }

    .category-item:hover {
      background: #4b5563;
    }

    .category-name {
      color: #e5e7eb;
    }

    .info-card {
      background: linear-gradient(135deg, #1e3a8a, #1e40af);
      border-color: #3b82f6;
    }

    .info-title,
    .info-description {
      color: #dbeafe;
    }
  }

  /* Animations */
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .dashboard-container > * {
    animation: fadeInUp 0.6s ease-out;
  }

  .stats-grid {
    animation-delay: 0.1s;
  }

  .categories-section {
    animation-delay: 0.2s;
  }

  .info-section {
    animation-delay: 0.3s;
  }
</style>

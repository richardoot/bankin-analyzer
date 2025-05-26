<script setup lang="ts">
  import { ref } from 'vue'
  import type { CsvAnalysisResult } from '@/types'

  interface Props {
    analysisResult: CsvAnalysisResult
  }

  defineProps<Props>()

  // État pour gérer l'onglet actif
  const activeTab = ref<'expenses' | 'income'>('expenses')

  const setActiveTab = (tab: 'expenses' | 'income') => {
    activeTab.value = tab
  }

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
          Analyse détaillée de vos transactions - Dépenses et Revenus séparés
        </p>
      </div>

      <!-- Statistiques générales -->
      <div class="overview-stats">
        <div class="stat-card total">
          <div class="stat-icon total-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path
                d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
              />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Total Transactions</h3>
            <p class="stat-value">{{ analysisResult.transactionCount }}</p>
            <p class="stat-description">transactions analysées</p>
          </div>
        </div>

        <div class="stat-card period">
          <div class="stat-icon period-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          </div>
          <div class="stat-content">
            <h3 class="stat-title">Période d'analyse</h3>
            <p class="stat-value">
              {{ formatDate(analysisResult.dateRange.start) }}
            </p>
            <p class="stat-description">
              au {{ formatDate(analysisResult.dateRange.end) }}
            </p>
          </div>
        </div>
      </div>

      <!-- Système d'onglets Dépenses/Revenus -->
      <div class="tabs-container">
        <!-- Navigation des onglets -->
        <div class="tabs-navigation">
          <button
            class="tab-button"
            :class="{ active: activeTab === 'expenses' }"
            @click="setActiveTab('expenses')"
          >
            <svg
              class="tab-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
              <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
            </svg>
            Dépenses
            <span class="tab-badge expenses-badge">
              {{ analysisResult.expenses.transactionCount }}
            </span>
          </button>

          <button
            class="tab-button"
            :class="{ active: activeTab === 'income' }"
            @click="setActiveTab('income')"
          >
            <svg
              class="tab-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M7 13l3 3 7-7" />
              <path
                d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4"
              />
            </svg>
            Revenus
            <span class="tab-badge income-badge">
              {{ analysisResult.income.transactionCount }}
            </span>
          </button>
        </div>

        <!-- Contenu des onglets -->
        <div class="tab-content">
          <!-- Onglet Dépenses -->
          <div
            v-show="activeTab === 'expenses'"
            class="tab-panel expenses-panel"
          >
            <div class="panel-header">
              <h2 class="panel-title">
                <svg
                  class="panel-icon expenses-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M17 11l-3-3V2m0 6l-3 3m3-3h8" />
                  <path d="M7 21H4a2 2 0 01-2-2v-5h20v5a2 2 0 01-2 2h-3" />
                </svg>
                Analyse des Dépenses
              </h2>
              <p class="panel-description">
                Catégories de dépenses basées sur la colonne "Catégorie"
              </p>
            </div>

            <div class="panel-stats">
              <div class="panel-stat-card">
                <div class="panel-stat-icon expenses">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path
                      d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                    />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Montant total</h4>
                  <p class="panel-stat-value expenses-amount">
                    {{ formatAmount(analysisResult.expenses.totalAmount) }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon transactions">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M9 12l2 2 4-4" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Transactions</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.expenses.transactionCount }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon categories">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Catégories</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.expenses.categories.length }}
                  </p>
                </div>
              </div>
            </div>

            <div class="categories-container">
              <h3 class="categories-title">Catégories de dépenses</h3>
              <div class="categories-grid">
                <div
                  v-for="(category, index) in analysisResult.expenses
                    .categories"
                  :key="index"
                  class="category-item expenses-category"
                >
                  <div
                    class="category-color"
                    :style="{
                      backgroundColor: `hsl(${(index * 137.5) % 360}, 70%, 50%)`,
                    }"
                  ></div>
                  <span class="category-name">{{ category }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Onglet Revenus -->
          <div v-show="activeTab === 'income'" class="tab-panel income-panel">
            <div class="panel-header">
              <h2 class="panel-title">
                <svg
                  class="panel-icon income-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                >
                  <path d="M7 13l3 3 7-7" />
                  <path
                    d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.35 0 4.49.91 6.08 2.4"
                  />
                </svg>
                Analyse des Revenus
              </h2>
              <p class="panel-description">
                Sources de revenus basées sur la colonne "Sous-Catégorie"
              </p>
            </div>

            <div class="panel-stats">
              <div class="panel-stat-card">
                <div class="panel-stat-icon income">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <line x1="12" y1="1" x2="12" y2="23" />
                    <path
                      d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                    />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Montant total</h4>
                  <p class="panel-stat-value income-amount">
                    {{ formatAmount(analysisResult.income.totalAmount) }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon transactions">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <path d="M9 12l2 2 4-4" />
                    <circle cx="12" cy="12" r="10" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Transactions</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.income.transactionCount }}
                  </p>
                </div>
              </div>

              <div class="panel-stat-card">
                <div class="panel-stat-icon categories">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 1v6m0 6v6m11-7h-6m-6 0H1" />
                  </svg>
                </div>
                <div class="panel-stat-content">
                  <h4 class="panel-stat-title">Catégories</h4>
                  <p class="panel-stat-value">
                    {{ analysisResult.income.categories.length }}
                  </p>
                </div>
              </div>
            </div>

            <div class="categories-container">
              <h3 class="categories-title">Sources de revenus</h3>
              <div class="categories-grid">
                <div
                  v-for="(category, index) in analysisResult.income.categories"
                  :key="index"
                  class="category-item income-category"
                >
                  <div
                    class="category-color"
                    :style="{
                      backgroundColor: `hsl(${(index * 137.5 + 120) % 360}, 70%, 50%)`,
                    }"
                  ></div>
                  <span class="category-name">{{ category }}</span>
                </div>
              </div>
            </div>
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
              Vos données Bankin ont été analysées selon les règles métier : les
              dépenses utilisent la colonne "Catégorie" et les revenus la
              colonne "Sous-Catégorie".
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
    background: linear-gradient(
      135deg,
      rgba(102, 126, 234, 0.05) 0%,
      rgba(118, 75, 162, 0.05) 50%,
      rgba(248, 250, 252, 0.8) 100%
    );
    position: relative;
  }

  /* Effet de texture subtile pour harmoniser avec l'app */
  .dashboard-page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-image: radial-gradient(
      circle at 1px 1px,
      rgba(102, 126, 234, 0.02) 1px,
      transparent 0
    );
    background-size: 30px 30px;
    pointer-events: none;
    z-index: 0;
  }

  .dashboard-container {
    max-width: 1400px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 2rem;
    position: relative;
    z-index: 1;
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

  /* Statistiques générales */
  .overview-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1.5rem;
    margin-bottom: 1rem;
  }

  .stat-card {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    padding: 2rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    display: flex;
    align-items: center;
    gap: 1.5rem;
    transition: all 0.3s ease;
  }

  .stat-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    background: rgba(255, 255, 255, 0.85);
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

  .total-icon {
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .period-icon {
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

  /* Système d'onglets */
  .tabs-container {
    background: rgba(255, 255, 255, 0.7);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.2);
    overflow: hidden;
  }

  .tabs-navigation {
    display: flex;
    background: rgba(249, 250, 251, 0.8);
    backdrop-filter: blur(5px);
    border-bottom: 1px solid rgba(229, 231, 235, 0.3);
  }

  .tab-button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 1.25rem 2rem;
    background: transparent;
    border: none;
    font-size: 1rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.3s ease;
    position: relative;
  }

  .tab-button:hover {
    background: rgba(243, 244, 246, 0.8);
    color: #374151;
  }

  .tab-button.active {
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(10px);
    color: #1f2937;
    font-weight: 600;
  }

  .tab-button.active::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  }

  .tab-icon {
    width: 1.25rem;
    height: 1.25rem;
    transition: transform 0.2s ease;
  }

  .tab-button.active .tab-icon {
    transform: scale(1.1);
  }

  .tab-badge {
    padding: 0.25rem 0.5rem;
    border-radius: 0.5rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: white;
    min-width: 1.5rem;
    text-align: center;
  }

  .expenses-badge {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .income-badge {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .tab-content {
    padding: 0;
  }

  .tab-panel {
    padding: 2rem;
    animation: fadeIn 0.3s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .panel-header {
    margin-bottom: 2rem;
    text-align: center;
  }

  .panel-title {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    font-size: 1.75rem;
    font-weight: 600;
    color: #1f2937;
    margin: 0 0 0.75rem;
  }

  .panel-icon {
    width: 1.75rem;
    height: 1.75rem;
  }

  .expenses-icon {
    color: #ef4444;
  }

  .income-icon {
    color: #10b981;
  }

  .panel-description {
    font-size: 1rem;
    color: #6b7280;
    margin: 0;
    line-height: 1.5;
  }

  .panel-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1.5rem;
    margin-bottom: 2rem;
  }

  .panel-stat-card {
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border-radius: 0.75rem;
    padding: 1.5rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
    display: flex;
    align-items: center;
    gap: 1rem;
    transition: all 0.2s ease;
  }

  .panel-stat-card:hover {
    background: rgba(243, 244, 246, 0.8);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  }

  .panel-stat-icon {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 0.5rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .panel-stat-icon svg {
    width: 1.25rem;
    height: 1.25rem;
    color: white;
  }

  .panel-stat-icon.expenses {
    background: linear-gradient(135deg, #ef4444, #dc2626);
  }

  .panel-stat-icon.income {
    background: linear-gradient(135deg, #10b981, #059669);
  }

  .panel-stat-icon.transactions {
    background: linear-gradient(135deg, #6366f1, #4f46e5);
  }

  .panel-stat-icon.categories {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .panel-stat-content {
    flex: 1;
    min-width: 0;
  }

  .panel-stat-title {
    font-size: 0.875rem;
    font-weight: 500;
    color: #6b7280;
    margin: 0 0 0.5rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .panel-stat-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    line-height: 1.2;
  }

  .expenses-amount {
    color: #ef4444;
  }

  .income-amount {
    color: #10b981;
  }

  /* Conteneurs de catégories */
  .categories-container {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .categories-title {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
    margin: 0;
  }

  .categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 0.75rem;
  }

  .category-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(249, 250, 251, 0.6);
    backdrop-filter: blur(5px);
    border-radius: 0.5rem;
    border: 1px solid rgba(229, 231, 235, 0.3);
    transition: all 0.2s ease;
  }

  .category-item:hover {
    background: rgba(243, 244, 246, 0.8);
    transform: translateY(-1px);
  }

  .expenses-category:hover {
    border-color: #ef4444;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);
  }

  .income-category:hover {
    border-color: #10b981;
    box-shadow: 0 2px 8px rgba(16, 185, 129, 0.1);
  }

  .category-color {
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .category-name {
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
  @media (max-width: 1024px) {
    .panel-stats {
      grid-template-columns: 1fr;
    }

    .tabs-navigation {
      flex-direction: column;
    }

    .tab-button {
      padding: 1rem 1.5rem;
    }
  }

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

    .overview-stats {
      grid-template-columns: 1fr;
    }

    .tab-panel {
      padding: 1.5rem;
    }

    .panel-title {
      font-size: 1.5rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .panel-stats {
      grid-template-columns: 1fr;
    }

    .categories-grid {
      grid-template-columns: 1fr;
    }

    .info-card {
      flex-direction: column;
      text-align: center;
    }

    .tab-button {
      padding: 0.875rem 1rem;
      font-size: 0.875rem;
    }

    .tab-badge {
      font-size: 0.6875rem;
      padding: 0.1875rem 0.375rem;
    }
  }

  @media (max-width: 480px) {
    .dashboard-page {
      padding: 1rem;
    }

    .tab-panel {
      padding: 1rem;
    }

    .panel-stat-card {
      padding: 1rem;
    }

    .tabs-navigation {
      border-radius: 0;
    }

    .tab-button {
      padding: 0.75rem;
      flex-direction: column;
      gap: 0.5rem;
    }

    .tab-icon {
      width: 1rem;
      height: 1rem;
    }
  }
</style>

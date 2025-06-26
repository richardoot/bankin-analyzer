<script setup lang="ts">
  import type { CsvAnalysisResult } from '@/types'

  interface Props {
    isOpen: boolean
    analysisResult: CsvAnalysisResult | null
  }

  interface Emits {
    (e: 'close'): void
    (e: 'confirm'): void
  }

  defineProps<Props>()
  const emit = defineEmits<Emits>()

  const handleConfirm = () => {
    emit('confirm')
  }

  const handleClose = () => {
    emit('close')
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
  <div v-if="isOpen" class="modal-overlay" @click="handleClose">
    <div class="modal-content" @click.stop>
      <div class="modal-header">
        <h2 class="modal-title">
          <svg
            class="check-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
          Fichier CSV analysé avec succès
        </h2>
        <button class="close-button" @click="handleClose">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <div v-if="analysisResult" class="modal-body">
        <div class="analysis-summary">
          <div class="summary-grid">
            <div class="summary-item">
              <div class="summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"
                  />
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                </svg>
              </div>
              <div class="summary-info">
                <span class="summary-label">Transactions</span>
                <span class="summary-value">{{
                  analysisResult.transactionCount
                }}</span>
              </div>
            </div>

            <div class="summary-item">
              <div class="summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path d="M3 3v18h18" />
                  <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
                </svg>
              </div>
              <div class="summary-info">
                <span class="summary-label">Catégories</span>
                <span class="summary-value">{{
                  analysisResult.categoryCount
                }}</span>
              </div>
            </div>

            <div class="summary-item">
              <div class="summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12,6 12,12 16,14" />
                </svg>
              </div>
              <div class="summary-info">
                <span class="summary-label">Période</span>
                <span class="summary-value period">
                  {{ formatDate(analysisResult.dateRange.start) }} -
                  {{ formatDate(analysisResult.dateRange.end) }}
                </span>
              </div>
            </div>

            <div class="summary-item">
              <div class="summary-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
                  <path
                    d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"
                  />
                </svg>
              </div>
              <div class="summary-info">
                <span class="summary-label">Montant total</span>
                <span
                  class="summary-value"
                  :class="{ negative: analysisResult.totalAmount < 0 }"
                >
                  {{ formatAmount(analysisResult.totalAmount) }}
                </span>
              </div>
            </div>
          </div>

          <div
            v-if="analysisResult.categories.length > 0"
            class="categories-preview"
          >
            <h3 class="categories-title">Catégories détectées</h3>
            <div class="categories-list">
              <span
                v-for="category in analysisResult.categories.slice(0, 6)"
                :key="category"
                class="category-badge"
              >
                {{ category }}
              </span>
              <span
                v-if="analysisResult.categories.length > 6"
                class="category-more"
              >
                +{{ analysisResult.categories.length - 6 }} autres
              </span>
            </div>
          </div>
        </div>
      </div>

      <div class="modal-footer">
        <button class="btn btn-secondary" @click="handleClose">Annuler</button>
        <button class="btn btn-primary" @click="handleConfirm">
          Voir le tableau de bord
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M5 12h14" />
            <path d="M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
  }

  .modal-content {
    background: white;
    border-radius: 1rem;
    max-width: 600px;
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    position: relative;
  }

  .modal-header {
    padding: 2rem 2rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .modal-title {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .check-icon {
    width: 32px;
    height: 32px;
    color: #10b981;
  }

  .close-button {
    background: none;
    border: none;
    padding: 0.5rem;
    color: #6b7280;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.2s ease;
  }

  .close-button:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .close-button svg {
    width: 20px;
    height: 20px;
  }

  .modal-body {
    padding: 1.5rem 2rem;
    max-height: 60vh;
    overflow-y: auto;
  }

  .analysis-summary {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .summary-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1.5rem;
  }

  .summary-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f8fafc;
    border-radius: 0.75rem;
    border: 1px solid #e2e8f0;
  }

  .summary-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 0.75rem;
    flex-shrink: 0;
  }

  .summary-icon svg {
    width: 24px;
    height: 24px;
    color: white;
  }

  .summary-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-width: 0;
  }

  .summary-label {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .summary-value {
    font-size: 1.125rem;
    font-weight: 700;
    color: #1f2937;
  }

  .summary-value.period {
    font-size: 0.95rem;
    line-height: 1.2;
  }

  .summary-value.negative {
    color: #dc2626;
  }

  .categories-preview {
    background: #f8fafc;
    border-radius: 0.75rem;
    padding: 1.5rem;
    border: 1px solid #e2e8f0;
  }

  .categories-title {
    font-size: 1rem;
    font-weight: 600;
    color: #374151;
    margin: 0 0 1rem;
  }

  .categories-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .category-badge {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    padding: 0.375rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .category-more {
    background: #e5e7eb;
    color: #6b7280;
    padding: 0.375rem 0.75rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    font-weight: 500;
  }

  .modal-footer {
    padding: 1.5rem 2rem 2rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 0.5rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    font-size: 0.875rem;
  }

  .btn svg {
    width: 16px;
    height: 16px;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn-primary {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
  }

  .btn-primary:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .modal-overlay {
      padding: 0.5rem;
    }

    .modal-header {
      padding: 1.5rem 1.5rem 1rem;
    }

    .modal-body {
      padding: 1rem 1.5rem;
    }

    .modal-footer {
      padding: 1rem 1.5rem 1.5rem;
      flex-direction: column;
    }

    .summary-grid {
      grid-template-columns: 1fr;
      gap: 1rem;
    }

    .modal-title {
      font-size: 1.25rem;
    }

    .btn {
      justify-content: center;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .modal-content {
      background: #1f2937;
    }

    .modal-header {
      border-color: #374151;
    }

    .modal-title {
      color: #f9fafb;
    }

    .close-button {
      color: #9ca3af;
    }

    .close-button:hover {
      background: #374151;
      color: #d1d5db;
    }

    .modal-footer {
      border-color: #374151;
    }

    .summary-item {
      background: #374151;
      border-color: #4b5563;
    }

    .summary-label {
      color: #9ca3af;
    }

    .summary-value {
      color: #f9fafb;
    }

    .categories-preview {
      background: #374151;
      border-color: #4b5563;
    }

    .categories-title {
      color: #d1d5db;
    }

    .category-more {
      background: #4b5563;
      color: #9ca3af;
    }

    .btn-secondary {
      background: #374151;
      color: #d1d5db;
    }

    .btn-secondary:hover {
      background: #4b5563;
    }
  }
</style>

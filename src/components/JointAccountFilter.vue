<template>
  <div class="joint-account-filter">
    <div class="filter-header">
      <h3 class="filter-title">
        <svg
          class="filter-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Comptes joints
      </h3>
      <p class="filter-description">
        Sélectionnez les comptes à considérer comme joints (montants divisés par
        2)
      </p>
    </div>

    <div class="filter-actions">
      <button
        class="filter-action-btn select-all"
        :disabled="allSelected"
        @click="selectAll"
      >
        <svg
          class="btn-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <path d="M9 12l2 2 4-4" />
          <circle cx="12" cy="12" r="10" />
        </svg>
        Tout sélectionner
      </button>

      <button
        class="filter-action-btn deselect-all"
        :disabled="noneSelected"
        @click="deselectAll"
      >
        <svg
          class="btn-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        Tout désélectionner
      </button>
    </div>

    <div class="accounts-list">
      <button
        v-for="account in accounts"
        :key="account"
        class="account-filter-button"
        :class="{
          selected: selectedAccounts.includes(account),
          disabled: !selectedAccounts.includes(account),
        }"
        @click="toggleAccount(account)"
      >
        <div class="account-icon">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="icon"
          >
            <rect x="1" y="3" width="15" height="13" />
            <path d="M16 8h4a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-4" />
            <circle cx="9" cy="9" r="2" />
            <path d="M7 21v-2a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </div>
        <span class="account-name">{{ formatAccountName(account) }}</span>
        <span v-if="selectedAccounts.includes(account)" class="joint-badge">
          Joint
        </span>
      </button>
    </div>

    <div class="filter-summary">
      <p class="summary-text">
        {{ selectedAccounts.length }} / {{ accounts.length }} comptes déclarés
        comme joints
      </p>
      <p v-if="selectedAccounts.length > 0" class="summary-info">
        Les montants de ces comptes seront divisés par 2 dans les analyses
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
  import { computed } from 'vue'

  interface Props {
    accounts: string[]
    selectedAccounts: string[]
  }

  interface Emits {
    (e: 'update:selected-accounts', accounts: string[]): void
  }

  const props = defineProps<Props>()
  const emit = defineEmits<Emits>()

  const allSelected = computed(
    () => props.selectedAccounts.length === props.accounts.length
  )
  const noneSelected = computed(() => props.selectedAccounts.length === 0)

  const toggleAccount = (account: string) => {
    const newSelection = props.selectedAccounts.includes(account)
      ? props.selectedAccounts.filter(a => a !== account)
      : [...props.selectedAccounts, account]

    emit('update:selected-accounts', newSelection)
  }

  const selectAll = () => {
    emit('update:selected-accounts', [...props.accounts])
  }

  const deselectAll = () => {
    emit('update:selected-accounts', [])
  }

  const formatAccountName = (account: string): string => {
    // Raccourcir les noms de comptes trop longs
    if (account.length > 40) {
      return account.substring(0, 37) + '...'
    }
    return account
  }
</script>

<style scoped>
  .joint-account-filter {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    height: 100%;
  }

  .filter-header {
    margin-bottom: 16px;
  }

  .filter-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 600;
    color: #111827;
    margin: 0 0 4px 0;
  }

  .filter-icon {
    width: 20px;
    height: 20px;
    color: #8b5cf6;
  }

  .filter-description {
    font-size: 14px;
    color: #6b7280;
    margin: 0;
  }

  .filter-actions {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
  }

  .filter-action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    font-size: 14px;
    font-weight: 500;
    border-radius: 6px;
    border: 1px solid #d1d5db;
    background: #ffffff;
    color: #374151;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .filter-action-btn:hover:not(:disabled) {
    background: #f9fafb;
    border-color: #9ca3af;
  }

  .filter-action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-icon {
    width: 16px;
    height: 16px;
  }

  .select-all:hover:not(:disabled) {
    background: #ecfdf5;
    border-color: #22c55e;
    color: #16a34a;
  }

  .deselect-all:hover:not(:disabled) {
    background: #fef2f2;
    border-color: #ef4444;
    color: #dc2626;
  }

  .accounts-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
    padding: 1rem;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
  }

  .account-filter-button {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(255, 255, 255, 0.9);
    backdrop-filter: blur(5px);
    border-radius: 0.5rem;
    border: 1px solid rgba(229, 231, 235, 0.5);
    transition: all 0.3s ease;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    color: #374151;
    text-align: left;
    width: 100%;
  }

  .account-filter-button:hover {
    background: rgba(243, 244, 246, 0.9);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .account-filter-button.selected {
    background: rgba(139, 92, 246, 0.1);
    border-color: #8b5cf6;
    box-shadow: 0 2px 8px rgba(139, 92, 246, 0.15);
  }

  .account-filter-button.disabled {
    background: rgba(156, 163, 175, 0.3);
    color: #9ca3af;
    opacity: 0.6;
    transform: none;
    box-shadow: none;
  }

  .account-filter-button.disabled:hover {
    background: rgba(156, 163, 175, 0.4);
    transform: none;
    box-shadow: none;
  }

  .account-icon {
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 50%;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .account-filter-button.disabled .account-icon {
    background: #9ca3af;
    opacity: 0.5;
  }

  .account-icon .icon {
    width: 0.875rem;
    height: 0.875rem;
    color: white;
  }

  .account-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
  }

  .joint-badge {
    padding: 0.125rem 0.5rem;
    background: linear-gradient(135deg, #8b5cf6, #7c3aed);
    color: white;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    flex-shrink: 0;
  }

  .filter-summary {
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid #e5e7eb;
  }

  .summary-text {
    font-size: 14px;
    color: #6b7280;
    text-align: center;
    margin: 0 0 8px;
    font-weight: 500;
  }

  .summary-info {
    font-size: 12px;
    color: #8b5cf6;
    text-align: center;
    margin: 0;
    font-style: italic;
  }

  /* Scrollbar styling */
  .accounts-list::-webkit-scrollbar {
    width: 6px;
  }

  .accounts-list::-webkit-scrollbar-track {
    background: #f1f5f9;
    border-radius: 3px;
  }

  .accounts-list::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 3px;
  }

  .accounts-list::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
</style>

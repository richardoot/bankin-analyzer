<script setup lang="ts">
  interface Props {
    isOpen: boolean
    title?: string
    maxWidth?: string
    showCloseButton?: boolean
    closeOnOverlay?: boolean
  }

  interface Emits {
    (e: 'close'): void
  }

  const props = withDefaults(defineProps<Props>(), {
    title: '',
    maxWidth: '600px',
    showCloseButton: true,
    closeOnOverlay: true,
  })

  const emit = defineEmits<Emits>()

  const handleClose = () => {
    emit('close')
  }

  const handleOverlayClick = () => {
    if (props.closeOnOverlay) {
      handleClose()
    }
  }
</script>

<template>
  <div v-if="isOpen" class="modal-overlay" @click="handleOverlayClick">
    <div class="modal-content" :style="{ maxWidth }" @click.stop>
      <!-- Header -->
      <div
        v-if="title || showCloseButton || $slots.header"
        class="modal-header"
      >
        <div class="modal-title-section">
          <slot name="header" :close="handleClose">
            <h2 v-if="title" class="modal-title">{{ title }}</h2>
          </slot>
        </div>
        <button
          v-if="showCloseButton"
          class="modal-close-button"
          type="button"
          @click="handleClose"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      <!-- Body -->
      <div class="modal-body">
        <slot :close="handleClose" />
      </div>

      <!-- Footer -->
      <div v-if="$slots.footer" class="modal-footer">
        <slot name="footer" :close="handleClose" />
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
    width: 100%;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    position: relative;
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    padding: 2rem 2rem 1rem;
    border-bottom: 1px solid #e5e7eb;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .modal-title-section {
    flex: 1;
    min-width: 0;
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

  .modal-close-button {
    background: none;
    border: none;
    padding: 0.5rem;
    color: #6b7280;
    cursor: pointer;
    border-radius: 0.5rem;
    transition: all 0.2s ease;
    flex-shrink: 0;
  }

  .modal-close-button:hover {
    background: #f3f4f6;
    color: #374151;
  }

  .modal-close-button svg {
    width: 20px;
    height: 20px;
  }

  .modal-body {
    padding: 1.5rem 2rem;
    flex: 1;
    overflow-y: auto;
  }

  .modal-footer {
    padding: 1.5rem 2rem 2rem;
    border-top: 1px solid #e5e7eb;
    display: flex;
    gap: 1rem;
    justify-content: flex-end;
    flex-shrink: 0;
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

    .modal-title {
      font-size: 1.25rem;
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

    .modal-close-button {
      color: #9ca3af;
    }

    .modal-close-button:hover {
      background: #374151;
      color: #d1d5db;
    }

    .modal-footer {
      border-color: #374151;
    }
  }
</style>

<script setup lang="ts">
  interface Props {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    size?: 'sm' | 'md' | 'lg'
    disabled?: boolean
    loading?: boolean
    type?: 'button' | 'submit' | 'reset'
    fullWidth?: boolean
    icon?: boolean
  }

  interface Emits {
    (e: 'click', event: MouseEvent): void
  }

  const props = withDefaults(defineProps<Props>(), {
    variant: 'primary',
    size: 'md',
    disabled: false,
    loading: false,
    type: 'button',
    fullWidth: false,
    icon: false,
  })

  const emit = defineEmits<Emits>()

  const handleClick = (event: MouseEvent) => {
    if (!props.disabled && !props.loading) {
      emit('click', event)
    }
  }
</script>

<template>
  <button
    :type="type"
    :disabled="disabled || loading"
    class="base-btn"
    :class="[
      `base-btn--${variant}`,
      `base-btn--${size}`,
      {
        'base-btn--full-width': fullWidth,
        'base-btn--loading': loading,
        'base-btn--icon': icon,
        'base-btn--disabled': disabled,
      },
    ]"
    @click="handleClick"
  >
    <!-- Loading spinner -->
    <svg
      v-if="loading"
      class="base-btn__spinner"
      viewBox="0 0 24 24"
      fill="none"
    >
      <circle
        class="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        stroke-width="4"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>

    <!-- Icon slot -->
    <span v-if="$slots.icon && !loading" class="base-btn__icon">
      <slot name="icon" />
    </span>

    <!-- Main content -->
    <span v-if="!icon || $slots.default" class="base-btn__content">
      <slot />
    </span>
  </button>
</template>

<style scoped>
  .base-btn {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    border-radius: 0.5rem;
    font-family: inherit;
    font-weight: 600;
    text-decoration: none;
    cursor: pointer;
    transition: all 0.2s ease;
    white-space: nowrap;
    user-select: none;
    outline: none;
  }

  .base-btn:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }

  /* Sizes */
  .base-btn--sm {
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
    line-height: 1rem;
  }

  .base-btn--md {
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  .base-btn--lg {
    padding: 0.75rem 1.5rem;
    font-size: 0.875rem;
    line-height: 1.25rem;
  }

  /* Icon button adjustments */
  .base-btn--icon.base-btn--sm {
    padding: 0.375rem;
    width: 2rem;
    height: 2rem;
  }

  .base-btn--icon.base-btn--md {
    padding: 0.5rem;
    width: 2.5rem;
    height: 2.5rem;
  }

  .base-btn--icon.base-btn--lg {
    padding: 0.75rem;
    width: 3rem;
    height: 3rem;
  }

  /* Variants */
  .base-btn--primary {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: 1px solid transparent;
  }

  .base-btn--primary:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
  }

  .base-btn--primary:active:not(:disabled) {
    transform: translateY(0);
  }

  .base-btn--secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
  }

  .base-btn--secondary:hover:not(:disabled) {
    background: #e5e7eb;
    border-color: #9ca3af;
  }

  .base-btn--danger {
    background: #ef4444;
    color: white;
    border: 1px solid transparent;
  }

  .base-btn--danger:hover:not(:disabled) {
    background: #dc2626;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(239, 68, 68, 0.4);
  }

  .base-btn--ghost {
    background: transparent;
    color: #6b7280;
    border: 1px solid transparent;
  }

  .base-btn--ghost:hover:not(:disabled) {
    background: #f3f4f6;
    color: #374151;
  }

  /* States */
  .base-btn--disabled,
  .base-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .base-btn--loading {
    cursor: wait;
  }

  .base-btn--full-width {
    width: 100%;
  }

  /* Spinner animation */
  .base-btn__spinner {
    width: 1rem;
    height: 1rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }

  /* Icon sizing */
  .base-btn__icon {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .base-btn__icon :deep(svg) {
    width: 1rem;
    height: 1rem;
  }

  .base-btn--sm .base-btn__icon :deep(svg) {
    width: 0.875rem;
    height: 0.875rem;
  }

  .base-btn--lg .base-btn__icon :deep(svg) {
    width: 1.125rem;
    height: 1.125rem;
  }

  .base-btn__content {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .base-btn {
      padding: 0.625rem 1rem;
      font-size: 0.875rem;
    }

    .base-btn--sm {
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
    }

    .base-btn--lg {
      padding: 0.75rem 1.25rem;
      font-size: 0.875rem;
    }
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .base-btn--secondary {
      background: #374151;
      color: #d1d5db;
      border-color: #4b5563;
    }

    .base-btn--secondary:hover:not(:disabled) {
      background: #4b5563;
      border-color: #6b7280;
    }

    .base-btn--ghost {
      color: #9ca3af;
    }

    .base-btn--ghost:hover:not(:disabled) {
      background: #374151;
      color: #d1d5db;
    }
  }
</style>

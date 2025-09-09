<script setup lang="ts">
  import { computed } from 'vue'

  interface Props {
    variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
    size?: 'small' | 'medium' | 'large' | 'sm' | 'md' | 'lg'
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

  // Map size values for compatibility
  const normalizedSize = computed(() => {
    switch (props.size) {
      case 'small':
        return 'sm'
      case 'medium':
        return 'md'
      case 'large':
        return 'lg'
      default:
        return props.size
    }
  })

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
      `base-btn--${normalizedSize}`,
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

    <!-- Left icon slot -->
    <span
      v-if="$slots['icon-left'] && !loading"
      class="base-btn__icon base-btn__icon--left"
    >
      <slot name="icon-left" />
    </span>

    <!-- Legacy icon slot (for compatibility) -->
    <span v-else-if="$slots.icon && !loading" class="base-btn__icon">
      <slot name="icon" />
    </span>

    <!-- Main content -->
    <span v-if="!icon || $slots.default" class="base-btn__content">
      <slot />
    </span>

    <!-- Right icon slot -->
    <span
      v-if="$slots['icon-right'] && !loading"
      class="base-btn__icon base-btn__icon--right"
    >
      <slot name="icon-right" />
    </span>
  </button>
</template>

<style scoped>
  .base-btn {
    position: relative;
    display: inline-flex !important;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    border: none;
    border-radius: var(--radius-lg);
    font-family: inherit;
    font-weight: var(--font-weight-semibold) !important;
    text-decoration: none;
    cursor: pointer;
    transition: all var(--transition-normal);
    white-space: nowrap;
    user-select: none;
    outline: none;
    backdrop-filter: blur(10px);
  }

  .base-btn:focus-visible {
    outline: 3px solid var(--primary-400);
    outline-offset: 3px;
    transform: scale(1.05);
  }

  .base-btn:active {
    transform: scale(0.98);
    transition: transform 0.1s ease;
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
    background: linear-gradient(135deg, var(--primary-500), var(--primary-700));
    color: white !important;
    border: 1px solid transparent;
    box-shadow: var(--shadow-primary);
    position: relative;
    overflow: hidden;
  }

  .base-btn--primary::before {
    content: '';
    position: absolute;
    top: 0;
    left: -100%;
    width: 100%;
    height: 100%;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(255, 255, 255, 0.2),
      transparent
    );
    transition: left var(--transition-normal);
  }

  .base-btn--primary:hover::before {
    left: 100%;
  }

  .base-btn--primary:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      var(--shadow-primary),
      0 8px 25px rgba(59, 130, 246, 0.3);
    background: linear-gradient(135deg, var(--primary-600), var(--primary-700));
  }

  .base-btn--primary:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
    box-shadow: var(--shadow-sm);
  }

  .base-btn--primary:focus:not(:disabled) {
    box-shadow:
      var(--shadow-primary),
      0 0 0 4px rgba(59, 130, 246, 0.2);
  }

  .base-btn--secondary {
    background: white;
    color: var(--gray-700) !important;
    border: 1px solid var(--gray-300);
    box-shadow: var(--shadow-sm);
    backdrop-filter: blur(10px);
  }

  .base-btn--secondary:hover:not(:disabled) {
    background: var(--gray-50);
    border-color: var(--primary-300);
    color: var(--primary-700) !important;
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
  }

  .base-btn--danger {
    background: linear-gradient(135deg, var(--error-500), #dc2626);
    color: white !important;
    border: 1px solid transparent;
    box-shadow: var(--shadow-error);
  }

  .base-btn--danger:hover:not(:disabled) {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: white !important;
    transform: translateY(-2px) scale(1.02);
    box-shadow:
      var(--shadow-error),
      0 8px 25px rgba(239, 68, 68, 0.3);
  }

  .base-btn--danger:active:not(:disabled) {
    transform: translateY(0) scale(0.98);
    box-shadow: var(--shadow-sm);
  }

  .base-btn--danger:focus:not(:disabled) {
    box-shadow:
      var(--shadow-error),
      0 0 0 4px rgba(239, 68, 68, 0.2);
  }

  .base-btn--ghost {
    background: transparent;
    color: #6b7280 !important;
    border: 1px solid transparent;
  }

  .base-btn--ghost:hover:not(:disabled) {
    background: #f3f4f6;
    color: #374151 !important;
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
    color: inherit;
  }

  .base-btn__icon :deep(svg) {
    width: 1rem;
    height: 1rem;
    color: inherit;
    fill: currentColor;
    stroke: currentColor;
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
    color: inherit;
  }

  .base-btn__icon--left {
    margin-right: 0.25rem;
  }

  .base-btn__icon--right {
    margin-left: 0.25rem;
  }

  /* Force color inheritance for all child elements */
  .base-btn * {
    color: inherit !important;
  }

  .base-btn svg {
    fill: currentColor !important;
    stroke: currentColor !important;
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
      color: #d1d5db !important;
      border-color: #4b5563;
    }

    .base-btn--secondary:hover:not(:disabled) {
      background: #4b5563;
      color: #d1d5db !important;
      border-color: #6b7280;
    }

    .base-btn--ghost {
      color: #9ca3af !important;
    }

    .base-btn--ghost:hover:not(:disabled) {
      background: #374151;
      color: #d1d5db !important;
    }
  }
</style>

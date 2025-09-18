<script setup lang="ts">
  interface Props {
    variant?: 'default' | 'glass' | 'bordered' | 'elevated' | 'gradient'
    padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
    shadow?: 'none' | 'sm' | 'md' | 'lg' | 'xl'
    blur?: boolean
    hoverable?: boolean
    clickable?: boolean
  }

  interface Emits {
    (e: 'click', event: MouseEvent): void
  }

  const props = withDefaults(defineProps<Props>(), {
    variant: 'default',
    padding: 'md',
    rounded: 'lg',
    shadow: 'md',
    blur: false,
    hoverable: false,
    clickable: false,
  })

  const emit = defineEmits<Emits>()

  const handleClick = (event: MouseEvent) => {
    if (props.clickable) {
      emit('click', event)
    }
  }
</script>

<template>
  <div
    class="base-card"
    :class="[
      `base-card--${variant}`,
      `base-card--padding-${padding}`,
      `base-card--rounded-${rounded}`,
      `base-card--shadow-${shadow}`,
      {
        'base-card--blur': blur,
        'base-card--hoverable': hoverable,
        'base-card--clickable': clickable,
      },
    ]"
    @click="handleClick"
  >
    <!-- Header slot -->
    <div v-if="$slots.header" class="base-card__header">
      <slot name="header" />
    </div>

    <!-- Main content -->
    <div class="base-card__content">
      <slot />
    </div>

    <!-- Footer slot -->
    <div v-if="$slots.footer" class="base-card__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped>
  .base-card {
    position: relative;
    display: flex;
    flex-direction: column;
    background: white;
    border: 1px solid #e5e7eb;
    transition: all 0.2s ease;
  }

  /* Variants */
  .base-card--default {
    background: linear-gradient(145deg, #ffffff 0%, #fafbfc 100%);
    border: 1px solid var(--gray-200);
    box-shadow:
      var(--shadow-sm),
      inset 0 1px 0 rgba(255, 255, 255, 0.9);
    transition: all var(--transition-normal);
  }

  .base-card--glass {
    background: linear-gradient(
      145deg,
      rgba(255, 255, 255, 0.98) 0%,
      rgba(248, 250, 252, 0.95) 100%
    );
    border: 1px solid rgba(255, 255, 255, 0.4);
    backdrop-filter: blur(16px) saturate(180%);
    box-shadow:
      0 8px 32px rgba(0, 0, 0, 0.06),
      0 2px 8px rgba(0, 0, 0, 0.02),
      inset 0 1px 0 rgba(255, 255, 255, 0.8),
      inset 0 0 20px rgba(255, 255, 255, 0.1);
  }

  .base-card--bordered {
    background: white;
    border: 2px solid #e5e7eb;
  }

  .base-card--elevated {
    background: white;
    border: none;
    box-shadow: var(--shadow-xl);
    position: relative;
    overflow: hidden;
  }

  .base-card--elevated::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(59, 130, 246, 0.3),
      transparent
    );
  }

  .base-card--gradient {
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  /* Padding variants */
  .base-card--padding-none {
    padding: 0;
  }

  .base-card--padding-sm {
    padding: 0.75rem;
  }

  .base-card--padding-md {
    padding: 1.5rem;
  }

  .base-card--padding-lg {
    padding: 2rem;
  }

  .base-card--padding-xl {
    padding: 2.5rem;
  }

  /* Rounded variants */
  .base-card--rounded-none {
    border-radius: 0;
  }

  .base-card--rounded-sm {
    border-radius: 0.25rem;
  }

  .base-card--rounded-md {
    border-radius: 0.5rem;
  }

  .base-card--rounded-lg {
    border-radius: 0.75rem;
  }

  .base-card--rounded-xl {
    border-radius: 1rem;
  }

  /* Shadow variants */
  .base-card--shadow-none {
    box-shadow: none;
  }

  .base-card--shadow-sm {
    box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);
  }

  .base-card--shadow-md {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
  }

  .base-card--shadow-lg {
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }

  .base-card--shadow-xl {
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  /* Modifiers */
  .base-card--blur {
    backdrop-filter: blur(8px);
  }

  .base-card--hoverable:hover {
    transform: translateY(-2px);
    box-shadow: 0 15px 30px -5px rgba(0, 0, 0, 0.15);
  }

  .base-card--clickable {
    cursor: pointer;
  }

  .base-card--clickable:active {
    transform: translateY(0);
  }

  /* Card sections - Espacement professionnel */
  .base-card__header {
    flex-shrink: 0;
    margin-bottom: var(--spacing-6);
    padding-bottom: var(--spacing-4);
    border-bottom: 1px solid var(--gray-100);
  }

  .base-card__content {
    flex: 1;
    min-height: 0; /* Permet le flex shrink */
  }

  .base-card__footer {
    flex-shrink: 0;
    margin-top: var(--spacing-6);
    padding-top: var(--spacing-4);
    border-top: 1px solid var(--gray-100);
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-3);
  }

  /* Special case: when padding is none, add padding to sections */
  .base-card--padding-none .base-card__header {
    padding: 1.5rem 1.5rem 0;
    margin-bottom: 0;
  }

  .base-card--padding-none .base-card__content {
    padding: 0 1.5rem;
  }

  .base-card--padding-none .base-card__footer {
    padding: 0 1.5rem 1.5rem;
    margin-top: 0;
  }

  /* Metric card specific styles (common pattern) */
  .base-card--variant-metric {
    text-align: center;
    padding: 1rem;
  }

  /* Summary item pattern (from ValidationModal) */
  .base-card--variant-summary {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .base-card--padding-lg {
      padding: 1.5rem 1rem;
    }

    .base-card--padding-xl {
      padding: 2rem 1rem;
    }

    .base-card--hoverable:hover {
      transform: none;
    }
  }

  /* Dark mode support */
  @media (prefers-color-scheme: dark) {
    .base-card--default {
      background: #1f2937;
      border-color: #374151;
    }

    .base-card--glass {
      background: rgba(31, 41, 55, 0.8);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .base-card--bordered {
      background: #1f2937;
      border-color: #374151;
    }

    .base-card--elevated {
      background: #1f2937;
    }

    .base-card--gradient {
      background: linear-gradient(135deg, #1f2937 0%, #374151 100%);
    }

    .base-card--variant-summary {
      background: #374151;
      border-color: #4b5563;
    }
  }

  /* Focus styles for accessibility */
  .base-card--clickable:focus {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
</style>

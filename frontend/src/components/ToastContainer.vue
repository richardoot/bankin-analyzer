<script setup lang="ts">
  import { useToast } from '@/composables/useToast'

  const { toasts, remove, pause, resume } = useToast()
</script>

<template>
  <!-- Full width on a phone (a 384 px card does not fit 390 px), clear of
       the home indicator; bottom-right from sm up. -->
  <div
    class="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-4 right-4 z-[60] flex flex-col gap-2 sm:left-auto sm:right-4"
    aria-live="polite"
  >
    <TransitionGroup name="toast">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        :class="[
          'flex w-full items-center gap-3 px-4 py-3 rounded-lg shadow-lg text-sm font-medium sm:w-auto sm:min-w-72 sm:max-w-sm',
          toast.type === 'success' &&
            'bg-primary-50 dark:bg-primary-900/80 text-primary-800 dark:text-primary-200 border border-primary-200 dark:border-primary-700',
          toast.type === 'error' &&
            'bg-red-50 dark:bg-red-900/80 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-700',
          toast.type === 'info' &&
            'bg-blue-50 dark:bg-blue-900/80 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-700',
        ]"
        :role="toast.type === 'error' ? 'alert' : 'status'"
        data-testid="toast"
        @mouseenter="pause(toast.id)"
        @mouseleave="resume(toast.id)"
        @focusin="pause(toast.id)"
        @focusout="resume(toast.id)"
      >
        <!-- Icon -->
        <svg
          v-if="toast.type === 'success'"
          class="w-5 h-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M5 13l4 4L19 7"
          />
        </svg>
        <svg
          v-else-if="toast.type === 'error'"
          class="w-5 h-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
        <svg
          v-else
          class="w-5 h-5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>

        <span class="min-w-0 flex-1 break-words">{{ toast.message }}</span>

        <button
          type="button"
          class="relative -m-1.5 shrink-0 rounded p-1.5 opacity-60 hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-current pointer-coarse:before:absolute pointer-coarse:before:-inset-2 pointer-coarse:before:content-['']"
          aria-label="Fermer la notification"
          data-testid="toast-close"
          @click="remove(toast.id)"
        >
          <svg
            class="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
  .toast-enter-active {
    transition: all 0.3s ease-out;
  }

  .toast-leave-active {
    transition: all 0.2s ease-in;
  }

  .toast-enter-from {
    opacity: 0;
    transform: translateX(100%);
  }

  .toast-leave-to {
    opacity: 0;
    transform: translateX(100%);
  }
</style>

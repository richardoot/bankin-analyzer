<script setup lang="ts">
  interface Emits {
    (e: 'start-analysis'): void
  }

  const emit = defineEmits<Emits>()

  const handleStartAnalysis = () => {
    emit('start-analysis')
  }
</script>

<template>
  <section class="start-analysis-section">
    <div class="start-analysis-container">
      <div class="cta-card">
        <div class="cta-content">
          <div class="cta-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h2 class="cta-title">Prêt à analyser vos finances ?</h2>
          <p class="cta-description">
            Uploadez votre export CSV Bankin et découvrez des insights
            personnalisés sur vos habitudes financières en quelques secondes.
          </p>
          <button class="cta-button" @click="handleStartAnalysis">
            <span>Commencer l'analyse</span>
            <svg
              class="button-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M5 12h14" />
              <path d="M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <div class="cta-features">
          <div class="feature-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <span>100% sécurisé</span>
          </div>
          <div class="feature-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12,6 12,12 16,14" />
            </svg>
            <span>Analyse instantanée</span>
          </div>
          <div class="feature-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
            <span>Visualisations avancées</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .start-analysis-section {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 4rem 0;
    position: relative;
    overflow: hidden;
  }

  .start-analysis-section::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Ccircle cx='30' cy='30' r='2'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    opacity: 0.1;
  }

  .start-analysis-container {
    max-width: 1000px;
    margin: 0 auto;
    padding: 0 2rem;
    position: relative;
    z-index: 1;
  }

  .cta-card {
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 2rem;
    padding: 3rem;
    text-align: center;
    box-shadow:
      0 25px 50px -12px rgba(0, 0, 0, 0.25),
      0 0 0 1px rgba(255, 255, 255, 0.05);
  }

  .cta-content {
    margin-bottom: 2.5rem;
  }

  .cta-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    border-radius: 20px;
    margin-bottom: 2rem;
  }

  .cta-icon svg {
    width: 40px;
    height: 40px;
    color: white;
  }

  .cta-title {
    font-size: 2.5rem;
    font-weight: 700;
    color: white;
    margin: 0 0 1.5rem;
    line-height: 1.2;
  }

  .cta-description {
    font-size: 1.25rem;
    color: rgba(255, 255, 255, 0.9);
    line-height: 1.6;
    margin: 0 0 2.5rem;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }

  .cta-button {
    display: inline-flex;
    align-items: center;
    gap: 0.75rem;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: white;
    font-size: 1.125rem;
    font-weight: 600;
    padding: 1rem 2.5rem;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    transition: all 0.3s ease;
    box-shadow: 0 10px 25px -5px rgba(251, 191, 36, 0.4);
  }

  .cta-button:hover {
    transform: translateY(-2px);
    box-shadow: 0 15px 35px -5px rgba(251, 191, 36, 0.5);
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .cta-button:active {
    transform: translateY(0);
  }

  .button-icon {
    width: 20px;
    height: 20px;
    transition: transform 0.3s ease;
  }

  .cta-button:hover .button-icon {
    transform: translateX(4px);
  }

  .cta-features {
    display: flex;
    justify-content: center;
    gap: 2rem;
    flex-wrap: wrap;
  }

  .feature-badge {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.875rem;
    font-weight: 500;
  }

  .feature-badge svg {
    width: 20px;
    height: 20px;
    color: #fbbf24;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .start-analysis-section {
      padding: 3rem 0;
    }

    .start-analysis-container {
      padding: 0 1rem;
    }

    .cta-card {
      padding: 2rem;
      border-radius: 1.5rem;
    }

    .cta-title {
      font-size: 2rem;
    }

    .cta-description {
      font-size: 1rem;
    }

    .cta-button {
      font-size: 1rem;
      padding: 0.875rem 2rem;
    }

    .cta-features {
      gap: 1rem;
      flex-direction: column;
      align-items: center;
    }
  }

  /* Animation d'entrée */
  @keyframes slideInUp {
    from {
      opacity: 0;
      transform: translateY(30px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .cta-card {
    animation: slideInUp 0.8s ease-out;
  }

  .cta-icon {
    animation: slideInUp 0.8s ease-out 0.2s both;
  }

  .cta-title {
    animation: slideInUp 0.8s ease-out 0.3s both;
  }

  .cta-description {
    animation: slideInUp 0.8s ease-out 0.4s both;
  }

  .cta-button {
    animation: slideInUp 0.8s ease-out 0.5s both;
  }

  .cta-features {
    animation: slideInUp 0.8s ease-out 0.6s both;
  }
</style>

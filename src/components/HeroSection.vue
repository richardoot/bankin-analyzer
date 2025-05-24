<script setup lang="ts">
  // Section hero sans logique complexe, focalisée sur la présentation
</script>

<template>
  <section class="hero-section">
    <div class="hero-container">
      <div class="hero-content">
        <h1 class="hero-title">
          Analysez vos finances
          <span class="highlight">en toute simplicité</span>
        </h1>

        <p class="hero-description">
          Importez vos exports CSV Bankin et découvrez des insights puissants
          sur vos habitudes financières. Visualisez vos dépenses, identifiez les
          tendances et prenez des décisions éclairées pour votre avenir
          financier.
        </p>

        <div class="hero-features">
          <div class="feature">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M9 19c-5 0-8-4-8-9s4-9 9-9 9 4 9 9" />
              <path d="M16 8l-4 4-2-2" />
            </svg>
            <span>Import CSV sécurisé</span>
          </div>

          <div class="feature">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <path d="M3 3v18h18" />
              <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
            </svg>
            <span>Analyses automatiques</span>
          </div>

          <div class="feature">
            <svg
              class="feature-icon"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Rapports détaillés</span>
          </div>
        </div>
      </div>

      <div class="hero-visual">
        <div class="dashboard-preview">
          <div class="preview-header">
            <div class="preview-controls">
              <span class="control red"></span>
              <span class="control yellow"></span>
              <span class="control green"></span>
            </div>
            <span class="preview-title">Dashboard Preview</span>
          </div>

          <div class="preview-content">
            <div class="metric-card">
              <div class="metric-value">€2,847</div>
              <div class="metric-label">Revenus ce mois</div>
              <div class="metric-trend positive">+12.5%</div>
            </div>

            <div class="metric-card">
              <div class="metric-value">€1,623</div>
              <div class="metric-label">Dépenses ce mois</div>
              <div class="metric-trend negative">-8.2%</div>
            </div>

            <div class="chart-placeholder">
              <div class="chart-bars">
                <div class="bar bar-60"></div>
                <div class="bar bar-80"></div>
                <div class="bar bar-45"></div>
                <div class="bar bar-90"></div>
                <div class="bar bar-70"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
  .hero-section {
    background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    padding: 4rem 0;
    min-height: 70vh;
    display: flex;
    align-items: center;
  }

  .hero-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
    align-items: center;
  }

  .hero-content {
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .hero-title {
    font-size: 3.5rem;
    font-weight: 800;
    line-height: 1.1;
    color: #1f2937;
    margin: 0;
  }

  .highlight {
    background: linear-gradient(135deg, #667eea, #764ba2);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .hero-description {
    font-size: 1.25rem;
    line-height: 1.6;
    color: #6b7280;
    margin: 0;
  }

  .hero-features {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .feature {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    color: #4b5563;
    font-weight: 500;
  }

  .feature-icon {
    width: 20px;
    height: 20px;
    color: #10b981;
    flex-shrink: 0;
  }

  .hero-visual {
    display: flex;
    justify-content: center;
    align-items: center;
  }

  .dashboard-preview {
    background: white;
    border-radius: 16px;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.15);
    overflow: hidden;
    width: 100%;
    max-width: 400px;
    border: 1px solid #e5e7eb;
  }

  .preview-header {
    background: #f9fafb;
    padding: 1rem;
    display: flex;
    align-items: center;
    gap: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .preview-controls {
    display: flex;
    gap: 0.5rem;
  }

  .control {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .control.red {
    background: #ef4444;
  }
  .control.yellow {
    background: #f59e0b;
  }
  .control.green {
    background: #10b981;
  }

  .preview-title {
    font-size: 0.875rem;
    color: #6b7280;
    font-weight: 500;
  }

  .preview-content {
    padding: 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .metric-card {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #e2e8f0;
  }

  .metric-value {
    font-size: 1.5rem;
    font-weight: 700;
    color: #1f2937;
    margin-bottom: 0.25rem;
  }

  .metric-label {
    font-size: 0.875rem;
    color: #6b7280;
    margin-bottom: 0.5rem;
  }

  .metric-trend {
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    display: inline-block;
  }

  .metric-trend.positive {
    background: #d1fae5;
    color: #065f46;
  }

  .metric-trend.negative {
    background: #fee2e2;
    color: #991b1b;
  }

  .chart-placeholder {
    background: #f8fafc;
    border-radius: 8px;
    padding: 1rem;
    border: 1px solid #e2e8f0;
  }

  .chart-bars {
    display: flex;
    align-items: end;
    justify-content: space-between;
    height: 80px;
    gap: 0.5rem;
  }

  .bar {
    background: linear-gradient(135deg, #667eea, #764ba2);
    border-radius: 2px;
    flex: 1;
    min-height: 20px;
    animation: growUp 0.8s ease-out;
  }

  .bar-60 {
    height: 60%;
  }

  .bar-80 {
    height: 80%;
  }

  .bar-45 {
    height: 45%;
  }

  .bar-90 {
    height: 90%;
  }

  .bar-70 {
    height: 70%;
  }

  @keyframes growUp {
    from {
      height: 0;
    }
    to {
      height: var(--height);
    }
  }

  /* Responsive */
  @media (max-width: 768px) {
    .hero-container {
      grid-template-columns: 1fr;
      gap: 2rem;
      text-align: center;
    }

    .hero-title {
      font-size: 2.5rem;
    }

    .hero-description {
      font-size: 1.125rem;
    }

    .dashboard-preview {
      max-width: 320px;
    }
  }

  /* Mode sombre */
  @media (prefers-color-scheme: dark) {
    .hero-section {
      background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
    }

    .hero-title {
      color: #f9fafb;
    }

    .hero-description {
      color: #d1d5db;
    }

    .feature {
      color: #e5e7eb;
    }

    .dashboard-preview {
      background: #374151;
      border-color: #4b5563;
    }

    .preview-header {
      background: #4b5563;
      border-color: #6b7280;
    }

    .metric-card {
      background: #4b5563;
      border-color: #6b7280;
    }

    .metric-value {
      color: #f9fafb;
    }

    .chart-placeholder {
      background: #4b5563;
      border-color: #6b7280;
    }
  }
</style>

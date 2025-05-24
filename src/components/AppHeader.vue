<script setup lang="ts">
  // Header sans logique complexe, respecte le principe de responsabilité unique
</script>

<template>
  <header class="app-header">
    <div class="header-container">
      <div class="brand">
        <div class="logo-wrapper">
          <svg
            class="logo-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
          >
            <path d="M12 2L2 7v10c0 5.55 3.84 10 9 10s9-4.45 9-10V7L12 2z" />
            <path d="M8 11v5a4 4 0 0 0 8 0v-5" />
          </svg>
          <span class="logo-text">Bankin Analyzer</span>
        </div>
        <span class="tagline">Analyse financière simplifiée</span>
      </div>

      <nav
        class="navigation"
        role="navigation"
        aria-label="Navigation principale"
      >
        <ul class="nav-list">
          <li>
            <a href="#" class="nav-link active" aria-current="page">Accueil</a>
          </li>
          <li><a href="#" class="nav-link">Analyses</a></li>
          <li><a href="#" class="nav-link">Rapports</a></li>
          <li><a href="#" class="nav-link">Aide</a></li>
        </ul>
      </nav>
    </div>
  </header>
</template>

<style scoped>
  .app-header {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 1rem 0;
    box-shadow: 0 2px 20px rgba(0, 0, 0, 0.1);
  }

  .header-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .brand {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .logo-wrapper {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 32px;
    height: 32px;
    color: #fbbf24;
  }

  .logo-text {
    font-size: 1.5rem;
    font-weight: 700;
    color: white;
  }

  .tagline {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.8);
    margin-left: 2.5rem;
  }

  .navigation {
    display: flex;
    align-items: center;
  }

  .nav-list {
    display: flex;
    list-style: none;
    margin: 0;
    padding: 0;
    gap: 2rem;
  }

  .nav-link {
    color: rgba(255, 255, 255, 0.9);
    text-decoration: none;
    font-weight: 500;
    padding: 0.5rem 1rem;
    border-radius: 6px;
    transition: all 0.2s ease;
    position: relative;
  }

  .nav-link:hover {
    color: white;
    background: rgba(255, 255, 255, 0.1);
  }

  .nav-link.active {
    color: white;
    background: rgba(255, 255, 255, 0.15);
  }

  .nav-link:focus {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .header-container {
      flex-direction: column;
      text-align: center;
    }

    .nav-list {
      gap: 1rem;
      flex-wrap: wrap;
      justify-content: center;
    }

    .tagline {
      margin-left: 0;
    }
  }
</style>

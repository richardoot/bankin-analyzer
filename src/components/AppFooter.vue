<script setup lang="ts">
  // Footer sans logique complexe, focalisé sur la présentation
  const currentYear = new Date().getFullYear()
</script>

<template>
  <footer class="app-footer">
    <div class="footer-container">
      <div class="footer-content">
        <div class="footer-brand">
          <div class="footer-logo">
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
          <p class="footer-description">
            Analysez vos finances en toute simplicité avec notre outil d'analyse
            de données bancaires sécurisé et respectueux de votre vie privée.
          </p>
        </div>

        <div class="footer-links">
          <div class="link-group">
            <h3 class="group-title">Produit</h3>
            <ul class="link-list">
              <li><a href="#" class="footer-link">Fonctionnalités</a></li>
              <li><a href="#" class="footer-link">Exemples</a></li>
              <li><a href="#" class="footer-link">Tutoriels</a></li>
              <li><a href="#" class="footer-link">API</a></li>
            </ul>
          </div>

          <div class="link-group">
            <h3 class="group-title">Support</h3>
            <ul class="link-list">
              <li><a href="#" class="footer-link">Documentation</a></li>
              <li><a href="#" class="footer-link">FAQ</a></li>
              <li><a href="#" class="footer-link">Contact</a></li>
              <li><a href="#" class="footer-link">Statut</a></li>
            </ul>
          </div>

          <div class="link-group">
            <h3 class="group-title">Légal</h3>
            <ul class="link-list">
              <li><a href="#" class="footer-link">Confidentialité</a></li>
              <li><a href="#" class="footer-link">CGU</a></li>
              <li><a href="#" class="footer-link">Cookies</a></li>
              <li><a href="#" class="footer-link">Sécurité</a></li>
            </ul>
          </div>
        </div>
      </div>

      <div class="footer-bottom">
        <div class="footer-bottom-content">
          <p class="copyright">
            © {{ currentYear }} Bankin Analyzer. Tous droits réservés.
          </p>

          <div class="social-links">
            <a href="#" class="social-link" aria-label="Twitter">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"
                />
              </svg>
            </a>

            <a href="#" class="social-link" aria-label="GitHub">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
                />
              </svg>
            </a>

            <a href="#" class="social-link" aria-label="LinkedIn">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path
                  d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"
                />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  </footer>
</template>

<style scoped>
  .app-footer {
    background: #1f2937;
    color: #f9fafb;
    padding: 3rem 0 1rem;
    margin-top: auto;
  }

  .footer-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 0 2rem;
  }

  .footer-content {
    display: grid;
    grid-template-columns: 1fr 2fr;
    gap: 3rem;
    margin-bottom: 2rem;
  }

  .footer-brand {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .footer-logo {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .logo-icon {
    width: 28px;
    height: 28px;
    color: #fbbf24;
  }

  .logo-text {
    font-size: 1.25rem;
    font-weight: 700;
    color: #f9fafb;
  }

  .footer-description {
    font-size: 0.875rem;
    line-height: 1.6;
    color: #d1d5db;
    margin: 0;
    max-width: 300px;
  }

  .footer-links {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 2rem;
  }

  .link-group {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .group-title {
    font-size: 1rem;
    font-weight: 600;
    color: #f9fafb;
    margin: 0;
  }

  .link-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .footer-link {
    color: #d1d5db;
    text-decoration: none;
    font-size: 0.875rem;
    transition: color 0.2s ease;
  }

  .footer-link:hover {
    color: #fbbf24;
  }

  .footer-link:focus {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
    border-radius: 4px;
  }

  .footer-bottom {
    border-top: 1px solid #374151;
    padding-top: 2rem;
  }

  .footer-bottom-content {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
  }

  .copyright {
    font-size: 0.875rem;
    color: #9ca3af;
    margin: 0;
  }

  .social-links {
    display: flex;
    gap: 1rem;
  }

  .social-link {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 8px;
    background: #374151;
    color: #d1d5db;
    transition: all 0.2s ease;
    text-decoration: none;
  }

  .social-link:hover {
    background: #4b5563;
    color: #fbbf24;
    transform: translateY(-2px);
  }

  .social-link:focus {
    outline: 2px solid #fbbf24;
    outline-offset: 2px;
  }

  .social-link svg {
    width: 20px;
    height: 20px;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .app-footer {
      padding: 2rem 0 1rem;
    }

    .footer-container {
      padding: 0 1rem;
    }

    .footer-content {
      grid-template-columns: 1fr;
      gap: 2rem;
      text-align: center;
    }

    .footer-brand {
      align-items: center;
    }

    .footer-description {
      max-width: none;
    }

    .footer-links {
      grid-template-columns: repeat(2, 1fr);
      gap: 1.5rem;
    }

    .footer-bottom-content {
      flex-direction: column;
      text-align: center;
    }
  }

  @media (max-width: 480px) {
    .footer-links {
      grid-template-columns: 1fr;
    }
  }

  /* Mode sombre - déjà dans le thème par défaut */
  @media (prefers-color-scheme: light) {
    .app-footer {
      background: #f8fafc;
      color: #1f2937;
      border-top: 1px solid #e5e7eb;
    }

    .logo-text {
      color: #1f2937;
    }

    .footer-description {
      color: #6b7280;
    }

    .group-title {
      color: #1f2937;
    }

    .footer-link {
      color: #6b7280;
    }

    .footer-link:hover {
      color: #3b82f6;
    }

    .footer-link:focus {
      outline-color: #3b82f6;
    }

    .footer-bottom {
      border-top-color: #e5e7eb;
    }

    .copyright {
      color: #6b7280;
    }

    .social-link {
      background: #e5e7eb;
      color: #6b7280;
    }

    .social-link:hover {
      background: #d1d5db;
      color: #3b82f6;
    }

    .social-link:focus {
      outline-color: #3b82f6;
    }
  }
</style>

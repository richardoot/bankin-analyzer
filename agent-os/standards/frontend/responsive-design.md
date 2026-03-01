# Design Responsive

## Pourquoi cette pratique

Le design responsive en 2025 s'appuie sur des techniques modernes qui dépassent les media queries traditionnelles. Avec 90%+ de support des container queries et l'indexation mobile-first de Google, cette approche améliore les Core Web Vitals de 60-70% et réduit les temps de développement de 40% grâce aux composants véritablement réutilisables.

## Approche stratégique 2025

### Hiérarchie des techniques

```css
/* 1. Container Queries - MICRO layout (composants) */
@container card (min-width: 300px) {
  .card-content {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
}

/* 2. Media Queries - MACRO layout (page) */
@media (min-width: 768px) {
  .main-layout {
    grid-template-columns: 250px 1fr;
  }
}

/* 3. Intrinsic Design - Layout fluide */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: clamp(1rem, 4vw, 2rem);
}
```

## Container Queries

### Configuration de base

```css
/* Définir le contexte de containment */
.card-container {
  container-type: inline-size;
  container-name: card;
}

/* Styles adaptatifs basés sur le container */
@container card (min-width: 400px) {
  .card {
    display: flex;
    align-items: center;
  }
  
  .card-image {
    flex: 0 0 150px;
    margin-inline-end: 1rem;
  }
}

@container card (max-width: 399px) {
  .card {
    display: block;
  }
  
  .card-image {
    width: 100%;
    margin-block-end: 0.5rem;
  }
}
```

### Container Query Units

```css
.responsive-component {
  /* Unités relatives au container */
  padding: 2cqw; /* 2% de la largeur du container */
  font-size: clamp(1rem, 3cqw, 1.5rem);
  border-radius: 1cqi; /* 1% de la taille inline du container */
}

/* Types de containers */
.size-container {
  container-type: size; /* largeur et hauteur */
}

.inline-container {
  container-type: inline-size; /* largeur uniquement */
}

.normal-container {
  container-type: normal; /* pas de containment */
}
```

## Unités de viewport modernes

### Nouvelles unités 2025

```css
.hero-section {
  /* Dynamic Viewport Height - s'adapte aux UI mobiles */
  height: 100dvh;
  
  /* Fallback pour anciens navigateurs */
  height: 100vh;
  height: 100dvh;
}

.sidebar {
  /* Large Viewport Height - ignore les UI dynamiques */
  min-height: 100lvh;
}

.mobile-menu {
  /* Small Viewport Height - avec UI mobile maximale */
  max-height: 100svh;
}

/* Unités complètes disponibles */
.viewport-units-demo {
  width: 50dvw;  /* Dynamic Viewport Width */
  height: 50dvh; /* Dynamic Viewport Height */
  
  /* Alternatives selon contexte */
  width: 50lvw;  /* Large Viewport Width */
  width: 50svw;  /* Small Viewport Width */
  
  /* Unités min/max */
  font-size: 4dvmin; /* Plus petite dimension */
  line-height: 1.2dvmax; /* Plus grande dimension */
}
```

## Breakpoints mobile-first 2025

### Système de breakpoints

```scss
// Variables SCSS
$breakpoints: (
  xs: 0,
  sm: 576px,
  md: 768px,
  lg: 992px,
  xl: 1200px,
  xxl: 1400px
);

// Mixins pour media queries
@mixin respond-up($breakpoint) {
  @media (min-width: map-get($breakpoints, $breakpoint)) {
    @content;
  }
}

@mixin respond-down($breakpoint) {
  @media (max-width: map-get($breakpoints, $breakpoint) - 1px) {
    @content;
  }
}

// Utilisation
.component {
  // Mobile-first par défaut
  padding: 1rem;
  
  @include respond-up(md) {
    padding: 2rem;
  }
  
  @include respond-up(lg) {
    padding: 3rem;
  }
}
```

### Propriétés logiques

```css
/* Migration vers propriétés logiques pour l'internationalization */
.article {
  /* Ancien : margin-left, margin-right */
  margin-inline: 1rem;
  
  /* Ancien : margin-top, margin-bottom */
  margin-block: 2rem;
  
  /* Ancien : padding-left */
  padding-inline-start: 1.5rem;
  
  /* Ancien : text-align: left */
  text-align: start;
  
  /* Ancien : border-left */
  border-inline-start: 3px solid var(--accent-color);
}

/* Support RTL automatique */
.navigation {
  /* S'adapte automatiquement à dir="rtl" */
  margin-inline-end: auto;
}
```

## Typographie fluide

### Fonction clamp() moderne

```css
.fluid-typography {
  /* Titre principal */
  h1 {
    font-size: clamp(2rem, 5vw + 1rem, 4rem);
    line-height: 1.1;
  }
  
  /* Texte corps */
  p {
    font-size: clamp(1rem, 2.5vw, 1.25rem);
    line-height: clamp(1.4, 1.2 + 0.5vw, 1.6);
  }
  
  /* Espacement fluide */
  margin-block: clamp(1rem, 4vw, 3rem);
}

/* Système d'échelle typographique */
:root {
  --step--2: clamp(0.69rem, 0.66rem + 0.18vw, 0.84rem);
  --step--1: clamp(0.83rem, 0.78rem + 0.29vw, 1.05rem);
  --step-0: clamp(1rem, 0.91rem + 0.43vw, 1.31rem);
  --step-1: clamp(1.2rem, 1.07rem + 0.63vw, 1.64rem);
  --step-2: clamp(1.44rem, 1.26rem + 0.89vw, 2.05rem);
}
```

### Typographie intrinsèque avancée

```css
/* Adaptation basée sur le contenu */
.adaptive-text {
  font-size: max(1rem, min(3vw, 2rem));
  
  /* Densité de contenu variable */
  --content-density: clamp(0.8, 1.2 - 0.4 * var(--container-width) / 100vw, 1);
  line-height: calc(1.4 * var(--content-density));
}

/* Container-based typography */
@container article (min-width: 60ch) {
  .content {
    font-size: 1.125rem;
    line-height: 1.7;
    column-count: 2;
    column-gap: 2rem;
  }
}
```

## CSS Grid avancé

### Subgrid pour layouts complexes

```css
.main-layout {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 1rem;
}

.card-grid {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: subgrid;
  gap: inherit;
}

.card {
  grid-column: span 4;
  display: grid;
  grid-template-rows: subgrid;
  
  /* Hérite de l'alignement parent */
  align-items: start;
}

@container (max-width: 768px) {
  .card {
    grid-column: span 6;
  }
}

@container (max-width: 480px) {
  .card {
    grid-column: span 12;
  }
}
```

### Auto-placement intelligent

```css
.dynamic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  gap: clamp(1rem, 3vw, 2rem);
  
  /* Densité adaptive */
  grid-auto-rows: minmax(200px, auto);
  
  /* Éléments spéciaux */
  .featured {
    grid-column: span min(2, var(--columns-count));
    grid-row: span 2;
  }
  
  .wide {
    grid-column: 1 / -1;
  }
}
```

## Images responsives optimisées

### Format moderne avec fallbacks

```html
<picture>
  <source
    srcset="hero-400.avif 400w, hero-800.avif 800w, hero-1200.avif 1200w"
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    type="image/avif">
  <source
    srcset="hero-400.webp 400w, hero-800.webp 800w, hero-1200.webp 1200w"
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    type="image/webp">
  <img
    src="hero-800.jpg"
    srcset="hero-400.jpg 400w, hero-800.jpg 800w, hero-1200.jpg 1200w"
    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
    alt="Description de l'image"
    loading="lazy"
    decoding="async">
</picture>
```

### CSS pour images adaptatives

```css
/* Aspect ratio moderne */
.image-container {
  aspect-ratio: 16 / 9;
  overflow: hidden;
  border-radius: 0.5rem;
}

.responsive-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  
  /* Optimisation performance */
  content-visibility: auto;
  contain-intrinsic-size: 300px 200px;
}

/* Images avec container queries */
@container image-grid (min-width: 600px) {
  .image-container {
    aspect-ratio: 4 / 3;
  }
}

@container image-grid (max-width: 400px) {
  .image-container {
    aspect-ratio: 1 / 1;
  }
}
```

## Performance et Core Web Vitals

### Optimisation CLS (Cumulative Layout Shift)

```css
/* Prévention layout shift */
.skeleton-loader {
  aspect-ratio: var(--content-aspect-ratio);
  background: linear-gradient(
    90deg,
    #f0f0f0 25%,
    #e0e0e0 50%,
    #f0f0f0 75%
  );
  background-size: 200% 100%;
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

/* Réservation espace */
.dynamic-content {
  min-height: var(--expected-height, 200px);
  contain-intrinsic-size: auto 200px;
}
```

### Optimisation LCP (Largest Contentful Paint)

```css
/* Priorisation ressources critiques */
.hero-image {
  /* Préchargement prioritaire */
  content-visibility: visible;
  contain: layout style;
}

/* CSS critique inline */
.above-fold {
  /* Styles essentiels pour le premier écran */
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100dvh;
}

/* Lazy loading pour contenu non-critique */
.below-fold {
  content-visibility: auto;
  contain-intrinsic-size: 0 500px;
}
```

## Testing et validation

### Configuration de test

```javascript
// Test responsive avec Playwright
import { test, expect } from '@playwright/test';

const breakpoints = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 }
};

Object.entries(breakpoints).forEach(([device, viewport]) => {
  test(`Layout responsive ${device}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    
    // Test container queries
    const card = page.locator('.responsive-card').first();
    await expect(card).toBeVisible();
    
    // Test breakpoints
    if (viewport.width < 768) {
      await expect(page.locator('.mobile-only')).toBeVisible();
    } else {
      await expect(page.locator('.desktop-sidebar')).toBeVisible();
    }
  });
});
```

### Outils de validation

```bash
# Audit performance
lighthouse --only-categories=performance --form-factor=mobile

# Test responsive
cypress run --spec "cypress/integration/responsive.spec.js"

# Validation accessibilité
axe-core --mobile
```

## Configuration framework

### Tailwind CSS avec container queries

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      containers: {
        '2xs': '16rem',
        'xs': '20rem',
        'sm': '24rem',
        'md': '28rem',
        'lg': '32rem',
        'xl': '36rem',
      }
    }
  },
  plugins: [
    require('@tailwindcss/container-queries'),
  ]
}
```

```html
<!-- Utilisation -->
<div class="@container">
  <div class="@lg:flex @lg:items-center">
    <div class="@lg:flex-1">Contenu adaptatif</div>
  </div>
</div>
```

### CSS custom properties pour breakpoints

```css
:root {
  /* Système de breakpoints en custom properties */
  --bp-sm: 576px;
  --bp-md: 768px;
  --bp-lg: 992px;
  --bp-xl: 1200px;
  
  /* Espacements fluides */
  --space-xs: clamp(0.5rem, 2vw, 1rem);
  --space-sm: clamp(1rem, 3vw, 1.5rem);
  --space-md: clamp(1.5rem, 4vw, 2rem);
  --space-lg: clamp(2rem, 5vw, 3rem);
  
  /* Grille adaptative */
  --grid-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  --grid-gap: var(--space-md);
}

/* Usage avec @supports */
@supports (container-type: inline-size) {
  .modern-layout {
    container-type: inline-size;
  }
}

@supports not (container-type: inline-size) {
  .modern-layout {
    /* Fallback avec media queries */
  }
}
```

Cette approche moderne du responsive design combine les techniques éprouvées avec les innovations 2025, garantissant des interfaces adaptables, performantes et accessibles sur tous les appareils.
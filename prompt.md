# Prompt Copilot – Bonnes pratiques Vue 3 + Vite.js (2025)

## 📦 Architecture du projet

- Utiliser la **Composition API** avec `<script setup>` pour tous les composants.
- Chaque composant doit respecter le **principe de responsabilité unique**.
- Organiser les fichiers dans les dossiers : `components`, `pages`, `composables`, `stores`,
  `services`, `assets`.
- Externaliser toute logique métier dans des fichiers `composables/` ou `services/`.

## ✨ Style de code

- Fichiers de composants nommés en **PascalCase.vue**.
- Utiliser `defineProps` et `defineEmits` avec des types explicites (`TypeScript` obligatoire).
- Pas de logique dans le template. Préférer `computed` et `watchEffect`.
- Préférer les fonctions pures et éviter les effets secondaires dans les méthodes.
- Pas de `v-if` et `v-for` sur un même élément – utiliser un élément wrapper.

## ⚙️ Vite.js + tooling moderne

- Utiliser les **alias** dans `vite.config.ts` (`@/` → `src/`).
- Tirer parti du **code splitting** via `import()` ou `defineAsyncComponent`.
- Stocker les secrets/env dans `.env` et accéder avec `import.meta.env`.
- Activer **HMR**, **preload**, et **lazy hydration** (ex: `vue-lazy-hydration` si SSR).
- Utiliser des plugins utiles : `vite-plugin-inspect`, `vite-plugin-vue-layouts`, etc.

## 🧩 Accessibilité (a11y)

- Tous les composants interactifs doivent être accessibles via le clavier.
- Utiliser les bons rôles ARIA et sémantique HTML (`<button>`, `<nav>`, etc.).
- Assurer un **contraste suffisant** entre texte et fond.
- Utiliser des labels explicites sur les champs de formulaire (`<label for="">`).
- Ajouter des tests d’accessibilité (ex: `axe-core`, `jest-axe`).

## ⚡ Performance front-end

- Utiliser `lazy` et `async` pour les composants peu critiques.
- Éviter les redondances de style CSS (préférer un Design System ou Tailwind).
- Minimiser les dépendances externes inutiles.
- Préférer les images **WebP**, utiliser `vite-imagetools` pour optimiser à la volée.
- Suivre les métriques **Core Web Vitals** via Lighthouse ou `web-vitals`.

## 🎨 Design System

- Utiliser un système de design (ex: **Tailwind**, **Vuetify**, ou Design Tokens custom).
- Ne jamais coder un composant UI ad-hoc sans vérifier s’il existe déjà.
- Chaque composant UI doit avoir une **interface claire**, une documentation minimale, et être
  **réutilisable**.

## ✅ Tests

- Utiliser **Vitest** pour les tests unitaires.
- Utiliser **Cypress** pour les tests E2E.
- Chaque `composable`, `service`, ou `store` doit avoir un test dédié.
- Pour les composants : tester la logique métier, les interactions utilisateur et le rendu.
- Pour les pages : tester le comportement global et les éventuelles erreurs critiques.

## 🧪 Qualité et validation

- Utiliser `ESLint` avec `eslint-plugin-vue`, `eslint-plugin-import`, `@typescript-eslint`.
- Utiliser `Prettier` pour le formatage.
- Activer les hooks `pre-commit` avec `lint-staged` pour valider les fichiers modifiés.
- Avoir un fichier `.editorconfig` partagé pour l’équipe.

## 🧠 Expérience développeur

- Utiliser **Volar** pour l'autocomplétion et les types dans Vue 3.
- Ajouter des **commentaires JSDoc** dans les composables ou services complexes.
- Tenir un `README.md` ou `ARCHITECTURE.md` à jour.
- Utiliser `vitest --watch` pour un feedback rapide.

## 🔐 Sécurité

- Ne jamais injecter de HTML sans passer par `v-html-sanitize`.
- Valider tous les inputs utilisateur côté front ET côté back.
- Ne jamais stocker de secret ou token dans le front.
- Protéger contre le XSS, CSRF et attaques typiques via content-security-policy.

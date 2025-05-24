# Bankin Analyzer

Analyseur de données bancaires développé avec Vue 3, TypeScript et Vite.

## 🚀 Démarrage rapide

```bash
# Installation des dépendances
npm install

# Démarrage du serveur de développement
npm run dev

# Build pour la production
npm run build
```

## 📋 Scripts disponibles

```bash
npm run dev          # Serveur de développement
npm run build        # Build de production
npm run preview      # Prévisualisation du build
npm run type-check   # Vérification TypeScript
npm run lint         # Linting avec correction automatique
npm run lint:check   # Vérification du linting seulement
npm run format       # Formatage avec Prettier
npm run format:check # Vérification du formatage
npm run check-all    # Vérification complète (types + lint + format)
npm run fix-all      # Correction automatique (format + lint)
```

## 🔧 Configuration

Ce projet utilise :

- **Vue 3** avec Composition API et `<script setup>`
- **TypeScript** en mode strict
- **Vite** pour le build et le développement
- **ESLint** avec les meilleures pratiques 2025
- **Prettier** pour le formatage automatique
- **Husky** pour les hooks Git
- **Commitlint** pour les conventions de commit

## 📝 Conventions de commit

Ce projet suit les [Conventional Commits](./COMMIT_CONVENTIONS.md).

### Hooks Git automatiques

- **Pre-commit**: Vérifie et corrige le code (ESLint + Prettier + TypeScript)
- **Commit-msg**: Valide le format du message de commit
- **Pre-push**: Exécute tous les checks et teste le build

### Exemples de commits valides

```bash
feat: add user dashboard
fix: resolve authentication bug
docs: update API documentation
style: format components with prettier
refactor: extract validation logic
```

## 🏗️ Architecture

```
src/
├── components/     # Composants Vue réutilisables
├── assets/        # Ressources statiques
├── style.css     # Styles globaux
└── main.ts       # Point d'entrée de l'application
```

## 🛠️ Développement

Le projet inclut une configuration VS Code optimisée avec :

- Formatage automatique à la sauvegarde
- Correction automatique ESLint
- Extensions recommandées

Pour plus de détails sur les conventions de commit, consultez
[COMMIT_CONVENTIONS.md](./COMMIT_CONVENTIONS.md).

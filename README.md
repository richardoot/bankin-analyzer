# Bankin Analyzer

Une application web moderne pour analyser vos données financières à partir des exports CSV de
l'application Bankin.

## 🚀 Fonctionnalités

### ✅ **Navigation Multi-Pages**

- **Page d'accueil** : Présentation de l'application avec appel à l'action
- **Page d'analyses** : Interface d'upload et d'analyse des données CSV
- Navigation fluide entre les pages avec état géré

### ✅ **Upload de Fichiers CSV**

- Interface drag-and-drop intuitive
- Validation des formats de fichiers (.csv)
- Gestion d'erreurs et feedback utilisateur
- Sécurité : traitement local, aucune donnée transmise

### ✅ **Workflow Git Complet**

- **Husky v9.1.7** : Hooks Git automatisés
- **Commitlint** : Validation des messages de commit conventionnels
- **Lint-staged** : Vérifications automatiques sur les fichiers modifiés
- **Commitizen** : Interface interactive pour les commits

### ✅ **Qualité de Code**

- **TypeScript** : Typage strict et sécurité
- **ESLint** : Analyse statique du code
- **Prettier** : Formatage automatique
- **Vue 3 Composition API** : Architecture moderne

## 🛠️ Technologies

- **Frontend** : Vue 3, TypeScript, Vite
- **Styling** : CSS3 avec variables personnalisées, gradients, animations
- **Outils** : Husky, ESLint, Prettier, Commitlint
- **Design** : Interface responsive, mode sombre, accessibilité

## 📦 Installation et Développement

```bash
# Installation des dépendances
npm install

# Démarrage du serveur de développement
npm run dev

# Build de production
npm run build

# Vérification de la qualité du code
npm run check-all

# Commit interactif avec conventions
npm run commit
```

## 🎯 Structure du Projet

```
src/
├── components/
│   ├── AppHeader.vue           # En-tête avec navigation
│   ├── HeroSection.vue         # Section héro de la page d'accueil
│   ├── StartAnalysisSection.vue # CTA pour démarrer l'analyse
│   ├── AnalysesPage.vue        # Page des analyses
│   ├── UploadSection.vue       # Section d'upload de fichiers
│   ├── FileUpload.vue          # Composant drag-and-drop
│   └── AppFooter.vue           # Pied de page
├── composables/
│   └── useFileUpload.ts        # Logique d'upload réutilisable
├── types/
│   └── index.ts                # Définitions TypeScript
└── App.vue                     # Composant racine avec navigation
```

## 🔄 Workflow Git

### Hooks Configurés

- **pre-commit** : lint-staged + vérifications TypeScript
- **commit-msg** : validation commitlint
- **prepare-commit-msg** : templates automatiques
- **pre-push** : suite de validation complète
- **post-commit** : feedback de succès

### Scripts Disponibles

```bash
npm run hooks:test          # Test des hooks Git
npm run commit             # Commit interactif avec commitizen
npm run fix-all           # Correction automatique (ESLint + Prettier)
npm run check-all         # Vérifications complètes
```

## 🎨 Design System

### Couleurs

- **Primaire** : Gradients bleu-violet (#667eea → #764ba2)
- **Accent** : Dégradé doré (#fbbf24 → #f59e0b)
- **Fond** : Blanc vers gris clair (#ffffff → #f8fafc)
- **Texte** : Grises (#1f2937, #6b7280)

### Composants

- Cards avec glassmorphism et backdrop-filter
- Boutons avec animations de hover et états
- Icônes SVG inline pour la performance
- Responsive design avec breakpoints mobiles

## 🔒 Sécurité

- **Traitement local** : Aucune donnée bancaire transmise
- **Validation stricte** : Types de fichiers et tailles
- **TypeScript** : Sécurité au niveau du code
- **CSP-ready** : Compatible Content Security Policy

## 📱 Fonctionnalités Prévues

- [ ] Parsing et analyse des CSV Bankin
- [ ] Tableaux de bord interactifs
- [ ] Graphiques de dépenses par catégorie
- [ ] Analyse des tendances temporelles
- [ ] Export des rapports
- [ ] Sauvegarde locale des analyses

## 🚀 Status

**✅ Phase 1 Complète** : Navigation et upload de fichiers

- Architecture Vue 3 + TypeScript ✅
- Workflow Git avec hooks ✅
- Interface d'upload sécurisée ✅
- Navigation multi-pages ✅
- Design responsive et accessible ✅

**🔄 Phase 2 En Cours** : Traitement et analyse des données CSV

---

_Développé avec ❤️ pour simplifier l'analyse financière personnelle_

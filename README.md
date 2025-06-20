# 💰 Bankin Analyzer

Une application web moderne pour analyser vos données financières Bankin avec gestion des
remboursements partagés et export PDF professionnel.

## 🚀 Fonctionnalités Principales

### 📊 **Analyse des Données Financières**

- Import CSV au format Bankin (comptes multiples, dates multiples formats)
- Parsing intelligent avec validation robuste et gestion d'erreurs
- Dashboard interactif avec graphiques harmonisés et tooltips précis

### 👥 **Gestion des Personnes et Remboursements**

- CRUD complet avec validation email et détection doublons
- Assignation intelligente des remboursements par transaction
- Helpers de calcul (total, moitié, division équitable)
- Synchronisation temps réel entre tous les composants

### 🏷️ **Catégorisation et Export**

- Catégories prédéfinies + personnalisées (icônes, couleurs)
- Export PDF multi-pages avec formatage français professionnel
- Filtres dynamiques par compte, catégorie, période, personne

## 🛠️ Technologies

**Stack Moderne**

- Vue 3 + Composition API + TypeScript strict
- Vite pour build optimisé et développement rapide
- CSS3 avec variables personnalisées et design responsive

**Qualité de Code**

- ESLint + Prettier avec configuration stricte
- Husky pour hooks Git automatisés + Commitlint
- Tests manuels exhaustifs documentés

**Performance et Sécurité**

- Traitement 100% local (aucune donnée transmise)
- Persistance localStorage avec récupération d'erreur
- Optimisations bundle avec lazy loading

## 📦 Installation et Développement

### Démarrage rapide

```bash
# Cloner et installer
git clone [url-du-repo]
cd bankin-analyzer
npm install

# Développement
npm run dev              # Serveur local (http://localhost:5173)

# Production
npm run build            # Build optimisé
npm run preview          # Prévisualisation

# Qualité
npm run check-all        # Vérifications complètes
npm run commit           # Commit avec conventions
```

## 🎯 Guide d'Utilisation Rapide

1. **Importer données** : Glisser-déposer CSV Bankin → validation → dashboard
2. **Configurer personnes** : Ajouter avec email (validation doublons)
3. **Assigner remboursements** : Sélectionner transaction → personne → catégorie → helpers calcul
4. **Analyser** : Dashboard avec graphiques interactifs et filtres dynamiques
5. **Exporter** : PDF professionnel avec détails complets

## 🔧 Corrections Récentes (Décembre 2024)

### ✅ Fix Tooltips BarChart

**Problème** : Tooltips revenus ne s'affichaient pas comme ceux des dépenses  
**Solution** : Ref locale `chartContainerRef` pour cibler le bon conteneur dans chaque instance  
**Impact** : Comportement identique entre graphiques, positionnement précis sans débordement

### ✅ Synchronisation Temps Réel

PersonsManager ↔ ExpensesReimbursementManager avec système d'événements localStorage (latence
<500ms)

### ✅ Export PDF Multi-pages

Pagination intelligente avec propriétés CSS anti-coupure, formatage français, caractères spéciaux

## � Testing et Validation

**Tests manuels recommandés** :

- Upload CSV (formats multiples fournis : `test-bankin-real.csv`, `test-multiline.csv`)
- CRUD Personnes avec validation email et synchronisation
- Tooltips graphiques sur dépenses ET revenus (correction majeure)
- Export PDF avec vérification pagination/formatage
- Performance >1000 transactions

**Fichiers de test fournis** : `test-*.csv` pour différents cas d'usage

## 🎨 Conventions de Développement

**Commits** : [Conventional Commits](https://www.conventionalcommits.org/)

```bash
feat: nouvelle fonctionnalité
fix: correction de bug
docs: mise à jour documentation
# Exemple: fix(charts): correct tooltip positioning in BarChart
```

**Code** : TypeScript strict, Composition API, CSS modulaire avec variables

## 📚 Documentation

- **[Documentation Complète](./docs/README_CONSOLIDATED.md)** - Guide détaillé avec toutes les
  fonctionnalités
- **[Guide Technique](./docs/TECHNICAL_GUIDE.md)** - Architecture, patterns, optimisations
- **[Guide de Test](./docs/TESTING_GUIDE_CONSOLIDATED.md)** - Procédures de test exhaustives
- **[Conventions de Commits](./COMMIT_CONVENTIONS.md)** - Standards de commits

---

**Version** : Prête pour production (corrections majeures appliquées)  
**Dernière mise à jour** : Décembre 2024 - Fix tooltips BarChart + documentation consolidée

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

## 🎯 Fonctionnalités Complètes

### ✅ **Gestion des Données**

- 👥 **Gestionnaire de Personnes** : CRUD complet avec emails optionnels
- 🎯 **Système de Catégories** : 5 catégories par défaut + personnalisées
- 💰 **Assignation de Remboursements** : Double niveau (personne + catégorie)

### ✅ **Visualisation Interactive**

- 📊 **Dashboard** : Graphiques harmonisés (BarChart + PieChart)
- 📈 **Résumé des Remboursements** : Analyses détaillées par personne
- 🔍 **Filtrage Avancé** : Par compte, catégorie, période

### ✅ **Import/Export Professionnel**

- 📤 **Import CSV Bankin** : Support complet avec validation
- 📋 **Export PDF** : Rapports détaillés multi-pages
- 💾 **Sauvegarde Locale** : Persistance automatique et sécurisée

## � Documentation

**Documentation complète disponible dans le dossier `/docs/` :**

- **[📖 Guide d'Utilisation](./docs/USER_GUIDE.md)** - Installation et utilisation
- **[🏗️ Guide de Développement](./docs/DEVELOPER_GUIDE.md)** - Architecture et conventions
- **[🧪 Guide de Test](./docs/TESTING_GUIDE.md)** - Procédures de validation
- **[🚀 Historique des Fonctionnalités](./docs/FEATURES_HISTORY.md)** - Évolution du projet
- **[🔧 Notes Techniques](./docs/TECHNICAL_NOTES.md)** - Corrections et optimisations

## 🚀 Statut du Projet

**✅ APPLICATION COMPLÈTE ET FONCTIONNELLE**

Toutes les fonctionnalités principales sont implémentées, testées et documentées. L'application est
prête pour une utilisation en production.

### Corrections Récentes

- ✅ **Tooltips BarChart** : Comportement identique entre graphiques dépenses/revenus
- ✅ **Export PDF** : Support des dates françaises (DD/MM/YYYY)
- ✅ **Synchronisation** : Communication temps réel entre composants
- ✅ **Validation** : Nettoyage automatique des données orphelines

---

_Application développée avec ❤️ pour simplifier l'analyse financière personnelle_

# 💰 Bankin Analyzer

Une application web moderne pour analyser vos données financières à partir des exports CSV de
l'application Bankin, avec gestion des remboursements partagés et export PDF professionnel.

## 🚀 Fonctionnalités Principales

### 📊 **Analyse des Données Financières**

- Import CSV au format Bankin (comptes multiples supportés)
- Parsing intelligent avec validation robuste
- Support des dates multiples formats (ISO + français)
- Détection automatique des dépenses pointées

### 👥 **Gestion des Personnes et Remboursements**

- CRUD complet avec validation email et détection doublons
- Recherche en temps réel multi-critères
- Assignation intelligente des remboursements par transaction
- Helpers de calcul : total, moitié, division équitable
- Synchronisation temps réel entre tous les composants

### 🏷️ **Catégorisation Avancée**

- Catégories prédéfinies (Transport, Restauration, Hébergement, etc.)
- Création de catégories personnalisées avec icônes et couleurs
- Filtrage automatique avec masquage intelligent
- Synchronisation bidirectionnelle avec gestionnaire de remboursements

### 📈 **Dashboard Interactif**

- Graphiques harmonisés (barres et secteurs) avec tooltips précis
- Filtres dynamiques par compte, catégorie, période, personne
- Visualisations responsives avec gestion des débordements
- Mise à jour en temps réel lors des modifications

### 📄 **Export PDF Professionnel**

- Génération multi-pages avec pagination intelligente
- Détails complets des transactions par personne et catégorie
- Formatage français (dates DD/MM/YYYY, montants €)
- Gestion des caractères spéciaux et encodage UTF-8

## 🛠️ Technologies

**Stack Moderne**

- Vue 3 + Composition API + TypeScript strict
- Vite pour build optimisé et développement rapide
- CSS3 avec variables personnalisées et design responsive

**Qualité de Code**

- ESLint + Prettier avec configuration stricte
- Husky pour hooks Git automatisés
- Commitlint pour conventions de commits
- Tests manuels exhaustifs documentés

**Performance et Sécurité**

- Traitement 100% local (aucune donnée transmise)
- Persistance localStorage avec récupération d'erreur
- Validation stricte des données et sanitization
- Optimisations bundle avec lazy loading

## 📦 Installation et Développement

### Démarrage rapide

```bash
# Cloner et installer
git clone [url-du-repo]
cd bankin-analyzer
npm install

# Développement
npm run dev              # Serveur de développement (http://localhost:5173)

# Production
npm run build            # Build optimisé
npm run preview          # Prévisualisation du build

# Qualité
npm run check-all        # Vérifications complètes (TypeScript + ESLint)
npm run fix-all          # Corrections automatiques
npm run commit           # Commit interactif avec conventions
```

### Structure du projet

```
src/
├── components/
│   ├── AppHeader.vue               # Navigation principale
│   ├── DashboardPage.vue           # Dashboard avec graphiques
│   ├── BarChart.vue                # Graphique en barres (tooltips fixés)
│   ├── PieChart.vue                # Graphique en secteurs
│   ├── PersonsManager.vue          # Gestionnaire CRUD personnes
│   ├── CategoriesManager.vue       # Gestionnaire catégories
│   ├── ExpensesReimbursementManager.vue # Assignation remboursements
│   ├── FileUpload.vue              # Upload drag-and-drop
│   └── ValidationModal.vue         # Modale de validation
├── composables/
│   ├── useFileUpload.ts            # Logique parsing CSV
│   ├── usePersons.ts               # Gestion personnes
│   ├── useCategories.ts            # Gestion catégories
│   └── useReimbursements.ts        # Logique remboursements
└── types/
    └── index.ts                    # Interfaces TypeScript
```

## 🎯 Guide d'Utilisation

### 1. Import des données

1. **Exporter CSV depuis Bankin** (format standard supporté)
2. **Glisser-déposer le fichier** sur l'interface d'upload
3. **Valider les données** via la modale de confirmation
4. **Naviguer vers le dashboard** pour visualiser les analyses

### 2. Configuration des personnes

1. **Accéder au gestionnaire** de personnes
2. **Ajouter personnes** (nom requis, email optionnel avec validation)
3. **Utiliser la recherche** temps réel par nom ou email
4. **Import/Export JSON** pour sauvegarde externe

### 3. Gestion des catégories

1. **Utiliser les catégories prédéfinies** ou créer des personnalisées
2. **Configurer icônes et couleurs** pour personnalisation visuelle
3. **Synchronisation automatique** avec le gestionnaire de remboursements

### 4. Assignation des remboursements

1. **Sélectionner une transaction** dans la liste filtrée
2. **Choisir la personne** et la catégorie appropriées
3. **Utiliser les helpers** de calcul (50%, division équitable, etc.)
4. **Valider** - synchronisation immédiate avec dashboard

### 5. Analyse et export

1. **Consulter le dashboard** avec graphiques interactifs
2. **Appliquer des filtres** par compte, catégorie, période
3. **Vérifier les tooltips** positionnés correctement
4. **Exporter en PDF** avec détails complets formatés

## 🔧 Corrections Récentes (Décembre 2024)

### ✅ Fix Tooltips BarChart

**Problème** : Tooltips du graphique revenus ne s'affichaient pas correctement **Solution** :
Utilisation d'une ref locale (`chartContainerRef`) pour cibler le bon conteneur dans chaque instance
**Impact** : Comportement identique entre graphiques dépenses/revenus, positionnement contenu dans
le composant

### ✅ Export PDF Multi-pages

**Corrections** : Pagination intelligente avec propriétés CSS anti-coupure **Améliorations** :
Formatage français, gestion caractères spéciaux, détails transactions **Validation** : Tests manuels
confirmés avec fichiers de test dédiés

### ✅ Synchronisation Temps Réel

**Objectif** : Mise à jour immédiate entre PersonsManager ↔ ExpensesReimbursementManager
**Solution** : Système d'événements avec localStorage centralisé **Performance** : Latence < 500ms,
impact mémoire négligeable

## 📋 Tests et Validation

### Tests manuels recommandés

1. **Upload CSV** avec différents formats (test-bankin-real.csv, test-multiline.csv)
2. **CRUD Personnes** complet avec validation email
3. **Assignation remboursements** avec helpers de calcul
4. **Tooltips graphiques** sur dépenses et revenus
5. **Export PDF** avec vérification pagination et formatage
6. **Filtres dashboard** avec synchronisation temps réel

### Fichiers de test fournis

- `test-bankin-real.csv` - Format Bankin authentique
- `test-multiline.csv` - Descriptions multi-lignes
- `test-joint-accounts.csv` - Comptes joints
- `test-pointed-expenses.csv` - Dépenses pointées

### Checklist avant release

- [ ] Compilation TypeScript sans erreurs
- [ ] Build de production réussit
- [ ] Tooltips positionnés correctement sur tous graphiques
- [ ] Export PDF fonctionne avec pagination
- [ ] Synchronisation PersonsManager opérationnelle
- [ ] Import CSV valide différents formats
- [ ] Performance acceptable (>1000 transactions)

## 🎨 Conventions de Développement

### Commits

Suivre les [Conventional Commits](https://www.conventionalcommits.org/) :

```bash
feat: nouvelle fonctionnalité
fix: correction de bug
docs: mise à jour documentation
style: formatage code
refactor: refactoring
test: ajout/modification tests
chore: tâches maintenance

# Exemples
feat(persons): add email validation with regex
fix(charts): correct tooltip positioning in BarChart
docs: update installation guide
```

### Code Style

- **TypeScript strict** avec interfaces complètes
- **Composition API** pour la logique métier
- **Composables** pour la réutilisabilité
- **Props typing** rigoureux avec validation
- **CSS modulaire** avec variables personnalisées

## 📞 Support et Contribution

### En cas de problème

1. **Vérifier la console** du navigateur pour erreurs
2. **Consulter les notes techniques** dans le code source
3. **Tester avec les fichiers CSV fournis**
4. **Vérifier la version Node.js** (18+ requis)

### Développement

- Code source documenté avec JSDoc
- Architecture modulaire facilitant les extensions
- Tests manuels exhaustifs avec scripts automatisés
- Git hooks configurés pour la qualité de code

---

**Version actuelle** : Prête pour production avec corrections majeures appliquées **Dernière mise à
jour** : Décembre 2024 (Fix tooltips BarChart + documentation consolidée)

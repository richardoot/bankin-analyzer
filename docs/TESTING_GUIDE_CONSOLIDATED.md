# 🧪 Guide de Test - Bankin Analyzer

## 📋 Checklist de Validation Générale

### Avant Release

- [ ] Compilation TypeScript sans erreurs (`npm run type-check`)
- [ ] Build de production réussit (`npm run build`)
- [ ] ESLint sans erreurs (`npm run lint`)
- [ ] Tooltips positionnés correctement sur tous graphiques
- [ ] Export PDF fonctionne avec pagination
- [ ] Synchronisation PersonsManager ↔ ExpensesReimbursementManager
- [ ] Import CSV valide différents formats
- [ ] Performance acceptable (>1000 transactions)
- [ ] Design responsive (mobile/desktop)

### Après Modifications BarChart

- [ ] Tooltips identiques sur graphiques dépenses et revenus
- [ ] Positionnement contenu dans le composant (pas de débordement)
- [ ] Synchronisation avec filtres dashboard
- [ ] Pas de régression sur PieChart

## 🎯 Tests Fonctionnels par Module

### 1. Upload et Parsing CSV

#### Test Import Format Bankin

**Fichier** : `test-bankin-real.csv` **Étapes** :

1. Glisser-déposer le fichier sur la zone d'upload
2. Vérifier la modale de validation
3. Confirmer l'import

**Résultat Attendu** :

- ✅ Parsing réussi avec toutes les colonnes reconnues
- ✅ Dates converties correctement (ISO → DD/MM/YYYY)
- ✅ Montants formatés avec virgule décimale
- ✅ Comptes multiples détectés
- ✅ Navigation vers dashboard activée

#### Test Cas Limites CSV

**Fichiers** : `test-multiline.csv`, `test-joint-accounts.csv`, `test-pointed-expenses.csv`
**Validation** :

- Descriptions multi-lignes conservées
- Comptes joints traités séparément
- Dépenses pointées identifiées

### 2. Gestionnaire de Personnes (CRUD)

#### Test Création Personne

**Étapes** :

1. Cliquer "Ajouter une personne"
2. Saisir nom (requis) et email (optionnel)
3. Valider

**Validation** :

- ✅ Nom requis avec message d'erreur si vide
- ✅ Email validation regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`
- ✅ Détection doublons email avec message spécifique
- ✅ Sauvegarde automatique localStorage
- ✅ Mise à jour temps réel dans ExpensesReimbursementManager

#### Test Recherche Temps Réel

**Étapes** :

1. Ajouter plusieurs personnes
2. Utiliser le champ de recherche
3. Tester recherche par nom et email

**Résultat Attendu** :

- ✅ Filtrage instantané (debounce 300ms)
- ✅ Recherche insensible à la casse
- ✅ Mise en évidence des résultats
- ✅ Message "Aucun résultat" si nécessaire

#### Test Import/Export JSON

**Étapes** :

1. Exporter les données actuelles
2. Supprimer quelques personnes
3. Importer le fichier précédent

**Validation** :

- ✅ Export génère fichier JSON valide
- ✅ Import valide la structure et filtre données invalides
- ✅ Gestion erreurs avec messages informatifs
- ✅ Restauration complète des données

### 3. Gestionnaire de Catégories

#### Test Catégories Prédéfinies

**Validation** :

- 🚗 Transport
- 🍽️ Restauration
- 🏨 Hébergement
- 🖥️ Matériel
- 📚 Formation

#### Test Catégories Personnalisées

**Étapes** :

1. Créer nouvelle catégorie
2. Personnaliser icône et couleur
3. Utiliser dans assignation remboursement

**Résultat Attendu** :

- ✅ Création avec validation nom unique
- ✅ Sélection icône/couleur fonctionnelle
- ✅ Synchronisation immédiate avec ExpensesReimbursementManager
- ✅ Persistance localStorage

### 4. Assignation des Remboursements

#### Test Assignation Complète

**Étapes** :

1. Sélectionner une transaction
2. Choisir personne et catégorie
3. Utiliser helpers de calcul (50%, division)
4. Valider assignation

**Validation** :

- ✅ Interface réactive avec feedback visuel
- ✅ Helpers calculent montants corrects
- ✅ Validation montant dans limites transaction
- ✅ Sauvegarde immédiate
- ✅ Mise à jour dashboard en temps réel

#### Test Synchronisation PersonsManager

**Étapes** :

1. Ouvrir ExpensesReimbursementManager
2. Dans autre onglet, ajouter personne via PersonsManager
3. Retour à ExpensesReimbursementManager

**Résultat Attendu** :

- ✅ Nouvelle personne apparaît immédiatement dans la liste
- ✅ Assignations existantes préservées
- ✅ Aucun rechargement page nécessaire

### 5. Dashboard et Graphiques

#### Test Tooltips BarChart

**Étapes** :

1. Naviguer vers dashboard avec données
2. Survoler barres du graphique "Dépenses"
3. Survoler barres du graphique "Revenus"

**Validation Critique** :

- ✅ Tooltip apparaît sur les deux graphiques
- ✅ Positionnement identique et précis
- ✅ Contenu dans les limites du composant
- ✅ Suivi fluide de la souris
- ✅ Formatage cohérent des montants

#### Test Filtres Dynamiques

**Étapes** :

1. Appliquer filtre par compte
2. Appliquer filtre par catégorie
3. Appliquer filtre par période

**Résultat Attendu** :

- ✅ Graphiques se mettent à jour immédiatement
- ✅ Données cohérentes entre BarChart et PieChart
- ✅ Messages appropriés si aucune donnée
- ✅ Réinitialisation filtres fonctionnelle

#### Test Filtrage par Mois PieChart

**Étapes** :

1. Naviguer vers dashboard avec données multi-mois
2. Localiser la liste déroulante "Période" dans l'en-tête du graphique
3. Sélectionner un mois spécifique
4. Vérifier mise à jour du graphique

**Validation** :

- ✅ Liste déroulante affiche les mois disponibles en français
- ✅ Sélection "Tous les mois" affiche données complètes
- ✅ Sélection mois spécifique filtre les données correctement
- ✅ Graphique se met à jour immédiatement
- ✅ Légende reflète les nouvelles proportions
- ✅ Tooltips affichent montants filtrés
- ✅ Filtres indépendants entre dépenses et revenus

### 6. Export PDF

#### Test Export Complet

**Préparation** : Données avec assignations variées, plusieurs personnes et catégories

**Étapes** :

1. Aller dans "Résumé des Remboursements"
2. Cliquer "Exporter PDF"
3. Vérifier le PDF généré

**Points de Validation** :

**Structure Générale**

- [ ] PDF contient sections habituelles (Résumé, Détails par Personne)
- [ ] Mise en page professionnelle préservée
- [ ] Pagination automatique sans coupures inappropriées

**Détails de Transactions**

- [ ] Chaque catégorie affiche liste des transactions
- [ ] Format : Date | Description | Note (si présente)
- [ ] Montants : Montant de base → Montant remboursé
- [ ] Dates au format français (DD/MM/YYYY)
- [ ] Montants au format français (€ avec virgule)

**Corrections Techniques**

- [ ] Aucun "Invalid Date" visible
- [ ] Caractères spéciaux (accents) affichés correctement
- [ ] Sections non coupées entre pages
- [ ] Hiérarchie visuelle claire avec indentation

## 📊 Tests de Performance

### Test Volume Important

**Objectif** : Valider performance avec >1000 transactions

**Étapes** :

1. Importer fichier CSV volumineux
2. Effectuer assignations multiples
3. Générer dashboard et PDF

**Métriques** :

- ✅ Chargement initial < 2 secondes
- ✅ Recherche temps réel < 500ms
- ✅ Génération PDF < 10 secondes
- ✅ Interface reste réactive

### Test Mémoire

**Validation** :

- Pas de fuite mémoire lors navigation
- localStorage n'excède pas 5MB
- Nettoyage automatique données orphelines

## 🎮 Tests d'Interaction Utilisateur

### Test Navigation Multi-Pages

**Étapes** :

1. Navigation entre toutes les pages
2. Retour arrière navigateur
3. Actualisation page

**Validation** :

- ✅ État persistant entre pages
- ✅ URLs correctement gérées
- ✅ Pas de perte de données
- ✅ Navigation breadcrumb

### Test Responsive Design

**Dispositifs** : Mobile (375px), Tablette (768px), Desktop (1024px+)

**Points de Contrôle** :

- ✅ Graphiques redimensionnés correctement
- ✅ Menu navigation adaptatif
- ✅ Formulaires utilisables sur mobile
- ✅ Tooltips positionnés sans débordement

## 🔧 Tests Techniques

### Test Validation des Données

**Scénarios** :

- Upload CSV corrompu
- Données localStorage invalides
- Assignations avec références cassées

**Comportement Attendu** :

- ✅ Messages d'erreur explicites
- ✅ Récupération gracieuse
- ✅ Pas de crash application
- ✅ Nettoyage automatique données incohérentes

### Test Compatibilité Navigateurs

**Cibles** : Chrome 90+, Firefox 88+, Safari 14+, Edge 90+

**Fonctionnalités Critiques** :

- localStorage disponible
- CSS Grid supporté
- ES2020 features compatibles
- Performance Chart.js acceptable

## 📁 Fichiers de Test Fournis

### Données CSV

- `test-bankin-real.csv` - Format Bankin authentique
- `test-multiline.csv` - Descriptions multi-lignes
- `test-joint-accounts.csv` - Comptes joints multiples
- `test-pointed-expenses.csv` - Dépenses pointées
- `test-backward-compatibility.csv` - Ancien format

### Données JSON

- `test-data-persons.json` - Personnes valides pour import
- `test-data-invalid.json` - Données corrompues pour test validation

## 🚨 Actions en Cas de Problème

### Debugging

1. **Ouvrir console navigateur** pour erreurs JavaScript
2. **Vérifier localStorage** avec outils développeur
3. **Tester avec fichiers fournis** pour reproduire
4. **Nettoyer cache** et localStorage si nécessaire

### Validation Automatique

```bash
# Script de validation complète
npm run build         # Compilation
npm run type-check    # TypeScript
npm run lint         # Code quality
npm run preview      # Test build local
```

### Reset Complet

```javascript
// Dans console navigateur
localStorage.clear()
location.reload()
```

---

**Ce guide remplace** : `TESTING_GUIDE.md`, `TEST_GUIDE.md`, `TEST_EXPORT_PDF_MANUEL.md`,
`TEST_FINAL_CORRECTIONS_PDF.md`, et tous les guides de test spécifiques dans
`docs/archive-20250620/`

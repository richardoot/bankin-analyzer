# 🧪 Guide de Test

## 📋 Stratégie de Test

### Types de Tests

1. **Tests Manuels** - Validation fonctionnelle par scénarios utilisateur
2. **Tests de Validation** - Vérification de la cohérence des données
3. **Tests d'Intégration** - Synchronisation entre composants
4. **Tests de Régression** - Non-régression après corrections

### Environnement de Test

```bash
# Préparation de l'environnement
npm install
npm run dev

# Données de test
# Utiliser les fichiers CSV de démonstration dans /docs/test-data/
```

## 🎯 Tests Fonctionnels par Module

### PersonsManager - CRUD Complet

#### Scénario 1 : Création de Personne

**Objectif** : Valider l'ajout d'une nouvelle personne

**Étapes** :

1. Naviguer vers "Gestionnaire de Personnes"
2. Cliquer sur "Ajouter une personne"
3. Saisir nom : "Jean Dupont"
4. Saisir email : "jean.dupont@example.com"
5. Cliquer "Ajouter"

**Résultat Attendu** :

- ✅ Personne ajoutée à la liste
- ✅ Formulaire réinitialisé
- ✅ Compteur mis à jour
- ✅ Sauvegarde automatique

#### Scénario 2 : Validation Email

**Objectif** : Tester la validation des emails

**Étapes** :

1. Ajouter personne avec email invalide : "email-invalide"
2. Tenter la soumission

**Résultat Attendu** :

- ❌ Erreur "Email invalide"
- ❌ Bouton "Ajouter" désactivé
- ❌ Aucune sauvegarde

#### Scénario 3 : Email Optionnel

**Étapes** :

1. Créer personne avec nom uniquement : "Marie Martin"
2. Laisser email vide
3. Valider

**Résultat Attendu** :

- ✅ Personne créée sans email
- ✅ Affichage correct dans la liste

#### Scénario 4 : Recherche Temps Réel

**Étapes** :

1. Créer plusieurs personnes
2. Saisir "jean" dans la recherche

**Résultat Attendu** :

- ✅ Filtrage instantané
- ✅ Compteur "X / Y personnes trouvées"
- ✅ Recherche insensible à la casse

#### Scénario 5 : Import/Export

**Étapes** :

1. Créer quelques personnes
2. Exporter via "Exporter JSON"
3. Effacer localStorage
4. Importer le fichier JSON

**Résultat Attendu** :

- ✅ Export télécharge un fichier JSON valide
- ✅ Import restaure toutes les données
- ✅ Aucune perte d'information

### Gestionnaire de Catégories

#### Scénario 6 : Catégories par Défaut

**Étapes** :

1. Premier lancement de l'application
2. Naviguer vers les catégories

**Résultat Attendu** :

- ✅ 5 catégories par défaut présentes
- ✅ Chaque catégorie a icône, couleur, description
- ✅ Sauvegarde automatique

#### Scénario 7 : Création Catégorie Personnalisée

**Étapes** :

1. Cliquer "Ajouter une catégorie"
2. Nom : "Loisirs"
3. Sélectionner icône : 🎮
4. Couleur : #9333ea
5. Description : "Jeux et divertissements"

**Résultat Attendu** :

- ✅ Catégorie créée avec tous les attributs
- ✅ Aperçu en temps réel
- ✅ Disponible dans les sélecteurs

### Gestionnaire de Remboursements

#### Scénario 8 : Assignation Simple

**Préparation** :

- Importer un fichier CSV avec transactions
- Avoir au moins 2 personnes créées
- Avoir des catégories disponibles

**Étapes** :

1. Sélectionner une transaction de 50€
2. Personne : "Jean Dupont"
3. Catégorie : "Restauration"
4. Montant : 25€ (moitié)
5. Valider l'assignation

**Résultat Attendu** :

- ✅ Assignation créée et sauvegardée
- ✅ Transaction marquée comme assignée partiellement
- ✅ Compteurs mis à jour

#### Scénario 9 : Helpers de Calcul

**Étapes** :

1. Transaction de 120€
2. Tester bouton "Total" → 120€
3. Tester bouton "Moitié" → 60€
4. Tester "Diviser par 3" → 40€

**Résultat Attendu** :

- ✅ Calculs automatiques corrects
- ✅ Mise à jour instantanée du champ montant
- ✅ Validation des limites (pas plus que le total)

#### Scénario 10 : Validation des Limites

**Étapes** :

1. Transaction de 100€ déjà assignée à 80€
2. Tenter d'assigner 30€ supplémentaires

**Résultat Attendu** :

- ❌ Erreur "Montant dépasse le disponible"
- ❌ Impossible de valider
- ✅ Message informatif clair

### Dashboard et Graphiques

#### Scénario 11 : Synchronisation Graphiques

**Préparation** :

- Données avec assignations sur plusieurs catégories
- Transactions de revenus ET dépenses

**Étapes** :

1. Observer les graphiques BarChart (dépenses/revenus)
2. Modifier un filtre de catégorie
3. Observer la mise à jour

**Résultat Attendu** :

- ✅ Synchronisation instantanée
- ✅ Graphiques cohérents entre eux
- ✅ Tooltips positionnés correctement

#### Scénario 12 : Tooltips BarChart

**Étapes** :

1. Survoler une barre du graphique des dépenses
2. Survoler une barre du graphique des revenus
3. Vérifier le comportement des tooltips

**Résultat Attendu** :

- ✅ Tooltips apparaissent au bon endroit
- ✅ Comportement identique entre les deux graphiques
- ✅ Tooltips restent dans leur composant respectif
- ✅ Aucun débordement ou positionnement erroné

### Export PDF

#### Scénario 13 : Export Résumé Complet

**Préparation** :

- Données complètes avec assignations variées
- Plusieurs personnes et catégories

**Étapes** :

1. Aller dans "Résumé des Remboursements"
2. Cliquer "Exporter PDF"
3. Vérifier le PDF généré

**Résultat Attendu** :

- ✅ PDF se télécharge automatiquement
- ✅ Contient résumé par personne
- ✅ Détails des transactions correctement formatés
- ✅ Dates affichées en français (DD/MM/YYYY)
- ✅ Pas de "Invalid Date"

### Import CSV

#### Scénario 14 : Import Bankin Standard

**Fichier de test** : `test-data/bankin-export-demo.csv`

**Étapes** :

1. Naviguer vers "Import CSV"
2. Glisser-déposer le fichier de test
3. Vérifier le parsing

**Résultat Attendu** :

- ✅ Toutes les transactions importées
- ✅ Dates converties correctement
- ✅ Montants positifs/négatifs respectés
- ✅ Comptes multiples supportés
- ✅ Dépenses pointées détectées

#### Scénario 15 : Gestion Erreurs Import

**Étapes** :

1. Tenter d'importer un fichier .txt
2. Tenter d'importer un CSV malformé

**Résultat Attendu** :

- ❌ Erreur claire "Format non supporté"
- ❌ Aucune donnée corrompue
- ✅ Application reste stable

## 🔍 Tests de Régression

### Après Modifications BarChart

1. **Vérifier tooltips** sur les deux graphiques
2. **Tester responsivité** sur mobile
3. **Valider données** avec filtres actifs

### Après Ajouts de Fonctionnalités

1. **Tests d'intégration** entre modules
2. **Persistance** des nouvelles données
3. **Performance** avec gros volumes

### Après Corrections de Bugs

1. **Reproduction** du bug original
2. **Validation** de la correction
3. **Tests connexes** pour éviter effets de bord

## 📊 Validation des Données

### Cohérence Base de Données

```javascript
// Script de validation à exécuter en console
function validateDataIntegrity() {
  const persons = JSON.parse(localStorage.getItem('bankin-analyzer-persons') || '[]')
  const assignments = JSON.parse(localStorage.getItem('bankin-analyzer-assignments') || '[]')
  const transactions = JSON.parse(localStorage.getItem('bankin-analyzer-transactions') || '[]')

  // Vérifier les assignations orphelines
  const personIds = new Set(persons.map(p => p.id))
  const transactionIds = new Set(transactions.map(t => t.id))

  const orphanedAssignments = assignments.filter(
    a => !personIds.has(a.personId) || !transactionIds.has(a.transactionId)
  )

  console.log('🔍 Validation des données:')
  console.log(`Personnes: ${persons.length}`)
  console.log(`Transactions: ${transactions.length}`)
  console.log(`Assignations: ${assignments.length}`)
  console.log(`Assignations orphelines: ${orphanedAssignments.length}`)

  return orphanedAssignments.length === 0
}

// Exécuter la validation
validateDataIntegrity()
```

### Performance

```javascript
// Test de performance avec gros volume
function testPerformanceWithLargeDataset() {
  const start = performance.now()

  // Simuler 1000 transactions
  const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
    id: `tx_${i}`,
    date: '2024-01-01',
    amount: Math.random() * 200 - 100,
    description: `Transaction ${i}`,
    account: 'Compte Courant',
  }))

  localStorage.setItem('bankin-analyzer-transactions', JSON.stringify(largeDataset))

  const end = performance.now()
  console.log(`Traitement 1000 transactions: ${end - start}ms`)

  // Nettoyer
  localStorage.removeItem('bankin-analyzer-transactions')
}
```

## 📋 Checklist de Validation

### Avant Release

- [ ] Tous les tests manuels passent
- [ ] Aucune erreur console
- [ ] Build de production réussit
- [ ] Export PDF fonctionne
- [ ] Import CSV valide différents formats
- [ ] Responsive design vérifié
- [ ] Tooltips positionnés correctement
- [ ] Persistance données OK
- [ ] Performance acceptable (>1000 transactions)

### Après Modification BarChart

- [ ] Tooltips identiques sur dépenses et revenus
- [ ] Positionnement contenu dans le composant
- [ ] Synchronisation avec filtres
- [ ] Pas de régression sur PieChart

### Tests Spécifiques par Navigateur

**Chrome/Edge** :

- [ ] LocalStorage illimité
- [ ] PDF download automatique
- [ ] Drag & drop fichiers

**Firefox** :

- [ ] Compatibilité CSS Grid
- [ ] Performance charts
- [ ] Export/import JSON

**Safari** :

- [ ] Variables CSS
- [ ] Gestionnaires d'événements
- [ ] localStorage mobile

## 🐛 Procédure de Debug

1. **Reproduire** le problème en suivant les étapes exactes
2. **Console** : vérifier les erreurs JavaScript
3. **Network** : s'assurer qu'aucune requête réseau n'est faite
4. **localStorage** : vérifier l'intégrité des données
5. **Performance** : identifier les goulots d'étranglement
6. **Documenter** : ajouter le bug et sa correction aux notes techniques

# 🧪 Guide de Test - Gestion des Dépenses Pointées

## 🎯 Objectif des Tests

Valider que l'implémentation de la colonne "Pointée" fonctionne correctement :

- ✅ Import CSV avec extraction de la colonne "Pointée"
- ✅ Filtrage automatique des dépenses pointées
- ✅ Affichage uniquement des dépenses non pointées
- ✅ Compatibilité avec les anciens formats CSV

## 📋 Scénarios de Test

### Test 1 : Création d'un Fichier CSV de Test

Créer un fichier `test-pointed-expenses.csv` avec des dépenses pointées et non pointées :

```csv
Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
01/12/2024;Restaurant Le Gourmet;Compte Courant;-45.80;Restauration;;Déjeuner client;Non
02/12/2024;Taxi aéroport;Compte Courant;-35.50;Transport;;Transfert aéroport;Oui
03/12/2024;Hôtel Business;Compte Courant;-185.00;Hébergement;;Conférence Paris;Non
04/12/2024;Train Paris-Lyon;Compte Courant;-89.00;Transport;;Mission Lyon;Non
05/12/2024;Essence autoroute;Compte Courant;-62.30;Transport;;Frais kilométriques;Oui
06/12/2024;Matériel bureau;Compte Courant;-125.90;Matériel;;Fournitures équipe;Non
07/12/2024;Parking aéroport;Compte Courant;-28.00;Transport;;Stationnement;Oui
08/12/2024;Repas équipe;Compte Courant;-95.40;Restauration;;Team building;Non
```

### Test 2 : Import et Vérification du Parsing

1. **Lancer l'application** : http://localhost:5174
2. **Importer le fichier** `test-pointed-expenses.csv`
3. **Vérifier l'analyse** :
   - 8 transactions au total dans le fichier
   - Types correctement identifiés (toutes des dépenses)
   - Catégories extraites : Restauration, Transport, Hébergement, Matériel

### Test 3 : Validation du Filtrage des Dépenses Pointées

**Dans le gestionnaire de dépenses, vérifier que SEULES ces transactions apparaissent :**

✅ **Dépenses NON pointées (doivent apparaître) :**

- Restaurant Le Gourmet (-45.80€) - Restauration
- Hôtel Business (-185.00€) - Hébergement
- Train Paris-Lyon (-89.00€) - Transport
- Matériel bureau (-125.90€) - Matériel
- Repas équipe (-95.40€) - Restauration

❌ **Dépenses pointées (NE doivent PAS apparaître) :**

- ~~Taxi aéroport (-35.50€) - Transport~~
- ~~Essence autoroute (-62.30€) - Transport~~
- ~~Parking aéroport (-28.00€) - Transport~~

**Comptage attendu :** 5 dépenses visibles sur 8 du fichier

### Test 4 : Test d'Assignation

1. **Assigner des personnes** aux dépenses visibles
2. **Vérifier** qu'aucune dépense pointée ne peut être assignée
3. **Contrôler dans le résumé** que seules les assignations des dépenses non pointées apparaissent

### Test 5 : Test de Compatibilité Ascendante

Créer un fichier CSV **SANS** la colonne "Pointée" :

```csv
Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note
01/12/2024;Restaurant Test;Compte Courant;-50.00;Restauration;;Test ancien format
02/12/2024;Transport Test;Compte Courant;-30.00;Transport;;Test ancien format
```

**Vérifier que :**

- ✅ L'import fonctionne normalement
- ✅ Toutes les dépenses apparaissent (pas de filtrage)
- ✅ Les assignations fonctionnent normalement

### Test 6 : Test des Valeurs Edge Cases

Créer un fichier avec différentes valeurs dans la colonne "Pointée" :

```csv
Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
01/12/2024;Test Oui majuscule;Compte;-10.00;Test;;;OUI
02/12/2024;Test oui minuscule;Compte;-10.00;Test;;;oui
03/12/2024;Test Non majuscule;Compte;-10.00;Test;;;NON
04/12/2024;Test non minuscule;Compte;-10.00;Test;;;non
05/12/2024;Test vide;Compte;-10.00;Test;;;
06/12/2024;Test autre valeur;Compte;-10.00;Test;;;Peut-être
```

**Résultats attendus :**

- ✅ "OUI" et "oui" → masquées
- ✅ "NON", "non", vide, "Peut-être" → visibles

## 🔍 Points de Contrôle Détaillés

### Dans l'Interface CSV Analysis

- [ ] Le nombre de transactions correspond au fichier
- [ ] Les catégories sont correctement extraites
- [ ] Aucune erreur d'import

### Dans le Gestionnaire de Dépenses

- [ ] Seules les dépenses non pointées apparaissent
- [ ] Le comptage de pagination est correct
- [ ] Les filtres par catégorie fonctionnent sur les dépenses filtrées

### Dans le Résumé des Remboursements

- [ ] Seules les assignations de dépenses non pointées apparaissent
- [ ] Les totaux sont calculés correctement
- [ ] Les catégories affichées correspondent aux dépenses non pointées

## 🐛 Tests d'Erreurs et Limites

### Test avec CSV Malformé

```csv
Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointée
01/12/2024;Test;Compte;-10.00;Test;;;
```

(Ligne sans valeur dans "Pointée")

**Résultat attendu :** Traité comme non pointé (visible)

### Test avec Colonne "Pointée" Mal Nommée

```csv
Date;Description;Compte;Montant;Catégorie;Sous-Catégorie;Note;Pointed
```

**Résultat attendu :** Toutes les dépenses visibles (colonne ignorée)

## 📊 Validation des Performances

### Avec Fichier Volumineux

- Créer un CSV avec 1000+ transactions
- Mélanger dépenses pointées/non pointées
- Vérifier que :
  - [ ] L'import reste fluide
  - [ ] Le filtrage est instantané
  - [ ] La pagination fonctionne correctement

## ✅ Checklist de Validation Finale

- [ ] **Import CSV** : Colonne "Pointée" correctement extraite
- [ ] **Filtrage** : Dépenses pointées masquées automatiquement
- [ ] **Interface** : Seules les dépenses non pointées visibles
- [ ] **Assignations** : Fonctionnent uniquement sur les dépenses visibles
- [ ] **Résumé** : Calculs corrects basés sur les dépenses filtrées
- [ ] **Compatibilité** : Anciens CSV fonctionnent toujours
- [ ] **Edge Cases** : Valeurs variées de "Pointée" gérées correctement
- [ ] **Performance** : Pas de dégradation avec gros volumes

## 🎯 Critères de Succès

La fonctionnalité est validée si :

1. **Seules les dépenses NON pointées** apparaissent dans le gestionnaire
2. **Aucune dépense pointée** ne peut être assignée
3. **Les calculs et résumés** reflètent uniquement les dépenses non pointées
4. **La compatibilité** avec les anciens formats est préservée
5. **L'interface reste fluide** même avec de gros volumes

## 🚀 Workflow Utilisateur Final

1. **Export Bankin** → CSV avec colonne "Pointée"
2. **Import dans l'application** → Parsing automatique
3. **Filtrage intelligent** → Seules les dépenses à traiter sont visibles
4. **Assignation efficace** → Focus sur ce qui nécessite attention
5. **Résumé pertinent** → Calculs sur les vraies données à traiter

Cette approche optimise le workflow en évitant le bruit des dépenses déjà validées.

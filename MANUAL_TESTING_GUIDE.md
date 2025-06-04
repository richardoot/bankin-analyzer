# Guide de Test Manuel - Email Optionnel PersonsManager

## État des Tests

**Date**: 1 juin 2025 **Application**: http://localhost:5176/ **Statut**: ✅ Compilation sans
erreur, application accessible

## Tests à Effectuer Manuellement

### 1. Test de Création de Personne SANS Email

**Objectif**: Vérifier qu'on peut créer une personne avec seulement un nom

**Étapes**:

1. Aller sur http://localhost:5176/
2. Cliquer sur "Ajouter une personne"
3. Remplir uniquement le champ "Nom complet" (ex: "Jean Dupont")
4. Laisser le champ "Email (optionnel)" vide
5. Cliquer sur "Ajouter"

**Résultat attendu**:

- ✅ La personne est créée avec succès
- ✅ Elle apparaît dans la liste avec "Aucun email renseigné"
- ✅ Pas d'erreur de validation

### 2. Test de Création de Personne AVEC Email

**Objectif**: Vérifier que la création avec email fonctionne toujours

**Étapes**:

1. Cliquer sur "Ajouter une personne"
2. Remplir "Nom complet" (ex: "Marie Martin")
3. Remplir "Email (optionnel)" (ex: "marie.martin@email.com")
4. Cliquer sur "Ajouter"

**Résultat attendu**:

- ✅ La personne est créée avec succès
- ✅ Elle apparaît dans la liste avec l'email affiché
- ✅ Pas d'erreur de validation

### 3. Test de Validation Email Invalide

**Objectif**: Vérifier que la validation fonctionne si email fourni

**Étapes**:

1. Cliquer sur "Ajouter une personne"
2. Remplir "Nom complet" (ex: "Paul Durand")
3. Remplir "Email (optionnel)" avec email invalide (ex: "email-invalide")
4. Tenter de cliquer sur "Ajouter"

**Résultat attendu**:

- ✅ Message d'erreur: "Veuillez entrer une adresse email valide"
- ✅ Bouton "Ajouter" désactivé
- ✅ Aucune personne créée

### 4. Test de Duplication Email

**Objectif**: Vérifier que les emails en double sont détectés

**Étapes**:

1. Créer une personne avec email (ex: "test@email.com")
2. Essayer de créer une autre personne avec le même email
3. Observer le comportement

**Résultat attendu**:

- ✅ Message d'erreur: "Cette adresse email est déjà utilisée"
- ✅ Bouton "Ajouter" désactivé
- ✅ Aucune duplication créée

### 5. Test d'Édition - Ajout d'Email

**Objectif**: Ajouter un email à une personne qui n'en avait pas

**Étapes**:

1. Créer une personne sans email
2. Cliquer sur "Modifier" pour cette personne
3. Ajouter un email valide
4. Sauvegarder

**Résultat attendu**:

- ✅ L'email est ajouté avec succès
- ✅ L'affichage passe de "Aucun email renseigné" à l'email affiché

### 6. Test d'Édition - Suppression d'Email

**Objectif**: Supprimer l'email d'une personne qui en avait un

**Étapes**:

1. Créer une personne avec email
2. Cliquer sur "Modifier" pour cette personne
3. Vider le champ email
4. Sauvegarder

**Résultat attendu**:

- ✅ L'email est supprimé avec succès
- ✅ L'affichage passe à "Aucun email renseigné"

### 7. Test de Recherche - Personne Sans Email

**Objectif**: Vérifier que la recherche fonctionne pour les personnes sans email

**Étapes**:

1. Avoir des personnes avec et sans emails
2. Rechercher par nom d'une personne sans email
3. Observer les résultats

**Résultat attendu**:

- ✅ La recherche trouve la personne par son nom
- ✅ Pas d'erreur JavaScript dans la console

### 8. Test de Recherche - Par Email

**Objectif**: Vérifier que la recherche par email fonctionne toujours

**Étapes**:

1. Rechercher par partie d'un email existant
2. Observer les résultats

**Résultat attendu**:

- ✅ La recherche trouve les personnes correspondantes
- ✅ Les personnes sans email ne génèrent pas d'erreur

### 9. Test d'Import - Données Mixtes

**Objectif**: Importer des données avec des personnes avec et sans emails

**Étapes**:

1. Cliquer sur "Importer"
2. Sélectionner le fichier `test-persons-mixed.json`
3. Observer le résultat

**Résultat attendu**:

- ✅ Message: "5 personne(s) importée(s) avec succès"
- ✅ Les personnes avec emails s'affichent normalement
- ✅ Les personnes sans emails affichent "Aucun email renseigné"

### 10. Test d'Export

**Objectif**: Vérifier que l'export inclut correctement les données

**Étapes**:

1. Avoir des personnes avec et sans emails
2. Cliquer sur "Exporter"
3. Examiner le fichier téléchargé

**Résultat attendu**:

- ✅ Fichier JSON valide téléchargé
- ✅ Personnes avec emails: propriété `email` présente
- ✅ Personnes sans emails: propriété `email` absente ou `undefined`

## Validation Technique

### Console JavaScript

- ✅ Aucune erreur JavaScript dans la console du navigateur
- ✅ Aucun warning TypeScript

### Interface Utilisateur

- ✅ Label "Email (optionnel)" visible
- ✅ Placeholder "Entrez l'adresse email (optionnel)"
- ✅ Pas d'attribut `required` sur le champ email
- ✅ Affichage conditionnel "Aucun email renseigné" avec style approprié

### Persistance

- ✅ Les données sont sauvegardées dans localStorage
- ✅ Les données persistent après rechargement de page
- ✅ Import/Export fonctionne avec données mixtes

## Fichiers de Test Disponibles

- `test-persons-mixed.json` - Personnes avec et sans emails
- `test-data-optional-emails.json` - Données existantes pour tests

## Commandes de Validation

```bash
# Vérifier l'application
curl -s -o /dev/null -w "%{http_code}" http://localhost:5176/

# Vérifier la compilation
npm run build

# Tests de lint (optionnel)
npm run lint
```

## Notes

- **Interface intuitive**: Le champ email est clairement marqué comme optionnel
- **Compatibilité**: Toutes les fonctionnalités existantes sont préservées
- **Robustesse**: Gestion sûre des valeurs undefined/null
- **UX cohérente**: Messages d'erreur appropriés et validation conditionnelle

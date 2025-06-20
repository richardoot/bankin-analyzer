# Plan de Test Fonctionnel - PersonsManager

## Objectif

Validation complète des fonctionnalités CRUD, recherche, et import/export du composant
PersonsManager.

## Tests à effectuer

### 1. Tests de Base - localStorage

- [ ] Vérifier que les données se chargent au démarrage
- [ ] Vérifier que les données se sauvegardent automatiquement
- [ ] Tester la récupération après corruption des données

### 2. Tests CRUD - Créer

- [ ] Ajouter une personne avec des données valides
- [ ] Tentative d'ajout avec email invalide (doit échouer)
- [ ] Tentative d'ajout avec email dupliqué (doit échouer)
- [ ] Tentative d'ajout avec nom vide (doit échouer)
- [ ] Vérifier l'auto-génération des IDs uniques

### 3. Tests CRUD - Lire

- [ ] Affichage correct de la liste des personnes
- [ ] Compteur de personnes accurate
- [ ] Messages contextuels (liste vide, aucun résultat)

### 4. Tests CRUD - Modifier

- [ ] Éditer une personne existante
- [ ] Modification avec email dupliqué (doit échouer)
- [ ] Annulation de l'édition
- [ ] Vérifier la persistance des modifications

### 5. Tests CRUD - Supprimer

- [ ] Suppression avec confirmation
- [ ] Annulation de la suppression
- [ ] Vérifier la mise à jour du localStorage

### 6. Tests de Recherche

- [ ] Recherche par nom (insensible à la casse)
- [ ] Recherche par email (insensible à la casse)
- [ ] Recherche avec terme partiel
- [ ] Effacement de la recherche
- [ ] Compteur de résultats de recherche

### 7. Tests Import/Export

- [ ] Export de données vers fichier JSON
- [ ] Import de fichier JSON valide
- [ ] Import de fichier JSON invalide (gestion d'erreur)
- [ ] Import de fichier non-JSON (gestion d'erreur)

### 8. Tests d'Intégration

- [ ] Intégration avec ReimbursementManager
- [ ] Navigation dans l'application
- [ ] Cohérence des données entre composants

### 9. Tests UI/UX

- [ ] Responsive design (mobile/desktop)
- [ ] Mode sombre/clair
- [ ] Accessibilité (navigation clavier)
- [ ] Messages d'erreur clairs

## Données de Test

### Personnes de Test

```json
[
  {
    "id": "test1",
    "name": "Jean Dupont",
    "email": "jean.dupont@email.com"
  },
  {
    "id": "test2",
    "name": "Marie Martin",
    "email": "marie.martin@company.fr"
  },
  {
    "id": "test3",
    "name": "Pierre Durand",
    "email": "pierre.durand@domain.org"
  }
]
```

### Cas d'Erreur à Tester

- Email invalide: "email-invalide"
- Email vide: ""
- Nom vide: ""
- JSON invalide pour import
- Fichier non-JSON pour import

## Critères de Succès

- Toutes les opérations CRUD fonctionnent correctement
- La validation empêche les données invalides
- La recherche fonctionne en temps réel
- L'import/export préserve l'intégrité des données
- La persistance localStorage est fiable
- L'interface est intuitive et responsive

# Guide d'utilisation - Division Rapide des Remboursements

## Vue d'ensemble de la fonctionnalité

La fonctionnalité de division rapide permet de calculer facilement des montants de remboursement
personnalisés en divisant automatiquement le montant original d'une transaction.

## Interface utilisateur

### Nouvel interface dans l'onglet "Associer"

```
┌─────────────────────────────────────────────────────────────┐
│  TRANSACTION: Resto Pizza Palace -45.60€                   │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Sélectionner une personne: [Marie ▼]                   │ │
│  │                                                         │ │
│  │ Montant à rembourser:                                  │ │
│  │ [22.80] €                                              │ │
│  │ sur 45.60 €                                            │ │
│  │                                                         │ │
│  │ [÷ 2] [÷ N] [🔄]                                       │ │
│  │                                                         │ │
│  │                               [Associer]               │ │
│  └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Boutons de division

1. **[÷ 2]** - Division par 2

   - Tooltip: "Diviser par 2"
   - Action: Divise automatiquement le montant par 2

2. **[÷ N]** - Division personnalisée

   - Tooltip: "Division personnalisée"
   - Action: Ouvre une popup pour saisir le diviseur

3. **[🔄]** - Reset
   - Tooltip: "Remettre le montant original"
   - Action: Remet le montant au montant original

## Exemples d'utilisation

### Scénario 1: Restaurant à 2 personnes

```
Transaction: Restaurant -50.00€
Action: Clic sur [÷ 2]
Résultat: 25.00€
Usage: Partage équitable entre 2 personnes
```

### Scénario 2: Taxi partagé à 3 personnes

```
Transaction: Taxi -36.00€
Action: Clic sur [÷ N] → Saisie "3"
Résultat: 12.00€
Usage: Partage équitable entre 3 personnes
```

### Scénario 3: Location Airbnb à 4 personnes

```
Transaction: Airbnb -200.00€
Action: Clic sur [÷ N] → Saisie "4"
Résultat: 50.00€
Usage: Partage équitable entre 4 personnes
```

### Scénario 4: Montant avec reste

```
Transaction: Restaurant -50.00€
Action: Clic sur [÷ N] → Saisie "3"
Résultat: 16.67€ (arrondi automatique)
Usage: Gestion automatique des arrondis
```

## Popup de division personnalisée

```
┌──────────────────────────────────────────────────┐
│ Par combien voulez-vous diviser le montant ?     │
│                                                  │
│ Exemples :                                       │
│ - 2 pour diviser par 2                          │
│ - 3 pour diviser par 3                          │
│ - 4 pour diviser par 4, etc.                    │
│                                                  │
│ [2                    ] [OK] [Annuler]          │
└──────────────────────────────────────────────────┘
```

## Validations et messages d'erreur

### Validation du diviseur

- ❌ **Diviseur = 0** → "Veuillez saisir un nombre valide supérieur à 0"
- ❌ **Diviseur = 1** → "La division par 1 ne change pas le montant"
- ❌ **Texte non numérique** → "Veuillez saisir un nombre valide supérieur à 0"

### Validation du montant résultant

- ✅ **Montant minimum** : Le résultat est automatiquement arrondi à 0.01€ minimum
- ✅ **Arrondi** : Tous les résultats sont arrondis à 2 décimales

## Workflow complet

1. **Sélection de la transaction** dans l'onglet "Associer"
2. **Sélection de la personne** dans le dropdown
3. **Calcul du montant** :
   - Option A: Saisie manuelle dans le champ
   - Option B: Utilisation de la division rapide
     - Clic sur [÷ 2] pour diviser par 2
     - Clic sur [÷ N] pour division personnalisée
     - Clic sur [🔄] pour revenir au montant original
4. **Validation** automatique du montant
5. **Association** en cliquant sur "Associer"

## Avantages de la fonctionnalité

### Rapidité

- ⚡ Division par 2 en un clic
- ⚡ Plus besoin de calculer manuellement

### Précision

- 🎯 Arrondi automatique à 2 décimales
- 🎯 Gestion des montants minimums

### Flexibilité

- 🔧 Division par n'importe quel nombre
- 🔧 Possibilité de revenir au montant original
- 🔧 Saisie manuelle toujours possible

### Expérience utilisateur

- 🎨 Interface intuitive avec tooltips
- 🎨 Boutons visuellement distincts
- 🎨 Feedback immédiat

## Cas d'usage typiques

| Situation        | Action          | Résultat             |
| ---------------- | --------------- | -------------------- |
| Resto à 2        | [÷ 2]           | Montant ÷ 2          |
| Courses à 3      | [÷ N] → "3"     | Montant ÷ 3          |
| Taxi à 4         | [÷ N] → "4"     | Montant ÷ 4          |
| Erreur de calcul | [🔄]            | Montant original     |
| Partage inégal   | Saisie manuelle | Montant personnalisé |

---

**Cette fonctionnalité simplifie considérablement la gestion des remboursements partagés !**

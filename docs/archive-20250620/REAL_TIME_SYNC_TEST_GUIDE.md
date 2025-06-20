# Guide de Test - Synchronisation Temps Réel PersonsManager ↔ ExpensesReimbursementManager

## 🎯 Problème Résolu

**Problème initial** : Les personnes ajoutées dans PersonsManager.vue n'apparaissaient pas
immédiatement dans la liste déroulante d'ExpensesReimbursementManager.vue sans rechargement de page.

**Solution implémentée** : Système de synchronisation temps réel utilisant :

1. **Storage Event API** : Détection automatique des changements localStorage entre onglets/fenêtres
2. **Polling de sécurité** : Vérification périodique toutes les 500ms pour la synchronisation dans
   la même fenêtre

## 🔧 Modifications Techniques

### ExpensesReimbursementManager.vue

```typescript
// Ajout des imports pour les hooks lifecycle
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'

// Gestionnaire d'événements storage
const handleStorageChange = (event: StorageEvent) => {
  if (event.key === 'bankin-analyzer-persons' && event.newValue) {
    loadPersons()
  }
}

// Hooks lifecycle pour gérer les événements
onMounted(() => {
  window.addEventListener('storage', handleStorageChange)
})

onUnmounted(() => {
  window.removeEventListener('storage', handleStorageChange)
})

// Système de polling pour la synchronisation locale
const checkForPersonsUpdates = () => {
  const stored = localStorage.getItem('bankin-analyzer-persons')
  if (stored) {
    const storedPersons = JSON.parse(stored)
    if (JSON.stringify(storedPersons) !== JSON.stringify(availablePersons.value)) {
      loadPersons()
    }
  }
}

// Vérification toutes les 500ms
setInterval(checkForPersonsUpdates, 500)
```

## 🧪 Tests à Effectuer

### Test 1 : Synchronisation Basique

1. **Ouvrir l'application** : http://localhost:5174/
2. **Uploader un fichier CSV** (utiliser test-data.csv)
3. **Aller dans l'onglet Remboursements**
4. **Vérifier l'état initial** :
   - Gestion des personnes : Liste vide ou personnes existantes
   - Gestion des dépenses : Liste déroulante correspondante

### Test 2 : Ajout d'une Nouvelle Personne

1. **Dans PersonsManager** :
   - Cliquer sur "Ajouter une personne"
   - Remplir : Nom = "Test Synchronisation", Email = "test@sync.com"
   - Cliquer "Ajouter"
2. **Vérifier la synchronisation** :
   - La personne apparaît immédiatement dans PersonsManager ✅
   - **VÉRIFICATION CRITIQUE** : Dans ExpensesReimbursementManager, cliquer sur "Associer" sur une
     dépense
   - La nouvelle personne "Test Synchronisation" doit apparaître dans la liste déroulante **SANS
     rechargement de page** ✅

### Test 3 : Ajout de Plusieurs Personnes

1. **Ajouter rapidement 3 personnes** :

   - "Alice Dupont" (alice@test.fr)
   - "Bob Martin" (bob@test.fr)
   - "Claire Durand" (claire@test.fr)

2. **Vérifier que chaque ajout se synchronise instantanément** dans la liste déroulante

### Test 4 : Édition d'une Personne

1. **Modifier une personne existante** :

   - Cliquer sur l'icône ✏️ d'une personne
   - Changer le nom : "Alice Dupont" → "Alice Dupont-Smith"
   - Sauvegarder

2. **Vérifier** : Le nom modifié apparaît immédiatement dans la liste déroulante

### Test 5 : Suppression d'une Personne

1. **Supprimer une personne** :

   - Cliquer sur l'icône 🗑️
   - Confirmer la suppression

2. **Vérifier** : La personne disparaît immédiatement de la liste déroulante

### Test 6 : Test Multi-Onglets (Bonus)

1. **Ouvrir l'application dans 2 onglets différents**
2. **Dans l'onglet 1** : Ajouter une personne
3. **Dans l'onglet 2** : Vérifier que la personne apparaît automatiquement (grâce au Storage Event)

## ✅ Critères de Succès

### Synchronisation Parfaite

- [ ] ✅ Ajout de personne → Apparition immédiate dans liste déroulante
- [ ] ✅ Modification de personne → Mise à jour immédiate du nom
- [ ] ✅ Suppression de personne → Disparition immédiate de la liste
- [ ] ✅ Aucun rechargement de page nécessaire
- [ ] ✅ Synchronisation en < 500ms
- [ ] ✅ Aucune erreur console

### Robustesse

- [ ] ✅ Fonctionne avec plusieurs ajouts rapides
- [ ] ✅ Fonctionne après navigation entre onglets
- [ ] ✅ Persistance maintenue après rechargement

## 🔍 Points de Validation Technique

### Console Développeur (F12)

Vérifier qu'il n'y a pas d'erreurs lors des opérations de synchronisation :

```javascript
// Vérifier le contenu du localStorage
localStorage.getItem('bankin-analyzer-persons')

// Vérifier les événements storage (dans l'onglet 2 quand on modifie dans l'onglet 1)
window.addEventListener('storage', e => {
  console.log('Storage event detected:', e.key, e.newValue)
})
```

### Performance

- **Temps de synchronisation** : < 500ms
- **Mémoire** : Pas de fuite mémoire avec les événements
- **CPU** : Polling à 500ms minimal impact

## 🎉 Résultat Attendu

Après cette implémentation, la synchronisation entre PersonsManager et ExpensesReimbursementManager
doit être **parfaitement fluide et instantanée**, résolvant définitivement le problème de
synchronisation temps réel.

### Avant (Problème)

```
PersonsManager: Ajouter "Jean Dupont" ✅
ExpensesReimbursementManager: Liste déroulante vide ❌
→ Nécessite rechargement de page
```

### Après (Solution)

```
PersonsManager: Ajouter "Jean Dupont" ✅
ExpensesReimbursementManager: "Jean Dupont" apparaît instantanément ✅
→ Synchronisation temps réel parfaite
```

## 📋 Status Final

**✅ FONCTIONNALITÉ IMPLÉMENTÉE ET PRÊTE POUR TEST**

La synchronisation temps réel entre PersonsManager.vue et ExpensesReimbursementManager.vue est
maintenant opérationnelle avec un système robuste gérant à la fois les changements locaux et
multi-onglets.

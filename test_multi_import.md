# 🧪 Test Plan - Système Multi-Import

## Test Manual - Étapes à suivre

### 1. **Démarrage de l'application**

```bash
npm run dev
```

➜ L'application devrait démarrer sur http://localhost:5174

### 2. **Initialisation des données de test**

- Appuyer sur `Ctrl+Shift+D` pour ouvrir les DevTools
- Cliquer sur "🧪 Initialiser données test"
- Vérifier que 3 sessions sont créées

### 3. **Test Navigation Page d'Accueil → Analyses**

- Aller sur page d'accueil
- Cliquer "Commencer l'analyse" ou "Analyses" dans le header
- ➜ Devrait afficher la section "Imports existants" avec 3 sessions

### 4. **Test Sélection d'un Import Existant**

- Dans la section "Imports existants", cliquer sur une session
- ➜ Devrait naviguer vers le tableau de bord de cette session
- ➜ Le header devrait maintenant afficher le sélecteur compact

### 5. **Test Navigation entre Imports (Header)**

- Dans le header, utiliser le dropdown du sélecteur compact
- Changer vers un autre import
- ➜ Le tableau de bord devrait se mettre à jour avec les nouvelles données

### 6. **Test Upload Nouveau CSV**

- Cliquer "Nouvel upload" ou naviguer vers la page d'upload
- Uploader un fichier CSV de test (utiliser un des fichiers dans /docs/test-data/)
- ➜ Devrait créer une nouvelle session et naviguer vers l'analyse
- ➜ Le sélecteur compact devrait maintenant afficher 4 sessions

### 7. **Test Gestion des Sessions (CRUD)**

- Dans ImportSelector mode complet, tester :
  - ✅ **Renommer** : Clic droit ou bouton edit → changer le nom
  - ✅ **Supprimer** : Bouton delete → confirmer suppression
  - ✅ **Navigation** : Clic sur session → basculer vers cette analyse

### 8. **Test Onglets Dashboard/Remboursements**

- Dans l'analyse, basculer entre "Tableau de bord" et "Remboursements"
- ➜ Les deux onglets devraient fonctionner avec les données de la session active

### 9. **Test Persistance**

- Rafraîchir la page (F5)
- ➜ La session active devrait être restaurée
- ➜ Toutes les sessions devraient être présentes

### 10. **Test Responsive**

- Tester sur mobile/tablette
- ➜ Le sélecteur compact devrait s'adapter
- ➜ L'interface devrait rester fonctionnelle

## ✅ Résultats Attendus

### Interface Utilisateur

- [ ] Section "Imports existants" visible quand il y a des sessions
- [ ] ImportSelector compact dans le header (seulement si 2+ sessions)
- [ ] Navigation fluide entre les sessions
- [ ] Mise à jour en temps réel des données d'analyse

### Fonctionnalités

- [ ] Création automatique de session lors de l'upload
- [ ] Switching entre sessions fonctionne
- [ ] CRUD des sessions (renommer, supprimer)
- [ ] Persistance localStorage
- [ ] Compatibilité avec l'ancien système

### Performance

- [ ] Pas de lag lors du changement de session
- [ ] Données chargées instantanément
- [ ] Mémoire utilisée raisonnablement

### Erreurs à surveiller

- [ ] Pas d'erreurs console
- [ ] TypeScript content (pas d'erreurs de types)
- [ ] Props passées correctement entre composants

## 🐛 Problèmes Potentiels & Solutions

### 1. "Session non trouvée"

**Cause**: Session ID invalide **Solution**: Vérifier useImportManager.switchToSession()

### 2. "Dashboard vide"

**Cause**: analysisResult non passé correctement **Solution**: Vérifier DashboardPage props
(importSession vs analysisResult)

### 3. "Sélecteur ne s'affiche pas"

**Cause**: hasMultipleSessions = false **Solution**: Vérifier le computed dans useImportManager

### 4. "Données perdues après refresh"

**Cause**: LocalStorage non sauvegardé **Solution**: Vérifier watch() dans useImportManager

### 5. "Upload ne crée pas de session"

**Cause**: UploadSection n'émet pas sessionId **Solution**: Vérifier handleValidationConfirm() et
createSession()

## 📊 Métriques de Succès

- ✅ **Workflow complet**: Upload → Session → Analyse → Navigation
- ✅ **Multi-sessions**: Minimum 3 sessions actives simultanément
- ✅ **Performance**: < 100ms pour switching entre sessions
- ✅ **UX**: Interface intuitive, feedback visuel clair
- ✅ **Robustesse**: Pas d'erreurs, gestion des edge cases

---

**🎯 Objectif**: Valider que le système multi-import fonctionne de bout en bout, avec une expérience
utilisateur fluide et des performances optimales.

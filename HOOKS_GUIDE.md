# Git Hooks Configuration

Ce projet utilise Husky pour gérer les hooks Git avec les meilleures pratiques 2025.

## 🪝 Hooks configurés

### pre-commit

- ✅ Exécute `lint-staged` sur les fichiers modifiés
- ✅ Vérifie les types TypeScript (seulement si des fichiers TS/Vue sont modifiés)
- ✅ Détecte les commentaires TODO/FIXME
- ✅ Affichage coloré des résultats
- ✅ Optimisé pour la performance (skip si aucun fichier staged)

### commit-msg

- ✅ Vérifie le format des messages de commit avec commitlint
- ✅ Suit les conventions Conventional Commits
- ✅ Validation des types, scopes, et format

### prepare-commit-msg

- ✅ Génère automatiquement des templates de message basés sur le nom de la branche
- ✅ Détecte les numéros de tickets dans les noms de branches
- ✅ Suggère le type de commit approprié

### pre-push

- ✅ Vérifications complètes avant push
- ✅ Type checking TypeScript
- ✅ Linting ESLint
- ✅ Vérification du formatage
- ✅ Build check (mode strict pour main/master)
- ✅ Détection de fichiers volumineux
- ✅ Scan de sécurité pour informations sensibles
- ✅ Protection des branches principales

### post-commit

- ✅ Affiche un résumé du commit
- ✅ Suggère les prochaines étapes
- ✅ Message de bienvenue pour le premier commit

## 🚀 Scripts disponibles

```bash
# Commits interactifs avec commitizen
npm run commit

# Test des hooks
npm run hooks:test
npm run hooks:test:pre-commit
npm run hooks:test:commit-msg

# Réinstallation des hooks
npm run hooks:install

# Releases automatiques
npm run release:patch   # 1.0.0 -> 1.0.1
npm run release:minor   # 1.0.0 -> 1.1.0
npm run release:major   # 1.0.0 -> 2.0.0
```

## 📝 Convention de commit

Format: `type(scope): description`

### Types autorisés:

- `feat`: Nouvelle fonctionnalité
- `fix`: Correction de bug
- `docs`: Documentation uniquement
- `style`: Formatage, espaces, etc.
- `refactor`: Refactoring sans ajout de fonctionnalité
- `perf`: Amélioration des performances
- `test`: Ajout ou correction de tests
- `build`: Système de build, dépendances
- `ci`: Configuration CI/CD
- `chore`: Maintenance, tâches diverses
- `revert`: Annulation d'un commit précédent

### Scopes suggérés:

- `api`, `auth`, `components`, `config`, `deps`, `docs`
- `router`, `store`, `styles`, `tests`, `types`, `utils`
- `ui`, `core`

### Exemples:

```
feat(auth): add JWT token validation
fix(components): resolve button click issue
docs(readme): update installation instructions
style(components): improve button spacing
refactor(utils): extract common validation logic
```

## 🔧 Configuration personnalisée

### Variables d'environnement:

- `BUILD_CHECK=true`: Force la vérification de build sur toutes les branches
- `SKIP_HOOKS=true`: Bypass tous les hooks (usage d'urgence uniquement)

### Modes stricts:

Les branches `main` et `master` ont des vérifications renforcées:

- Build obligatoire
- Détection stricte des fichiers volumineux
- Alertes de sécurité renforcées

## 🛠️ Dépannage

### Bypass temporaire des hooks:

```bash
git commit --no-verify -m "fix: urgent hotfix"
git push --no-verify
```

### Réinstaller les hooks:

```bash
npm run hooks:install
```

### Tester la configuration:

```bash
npm run hooks:test
```

## 📚 Ressources

- [Conventional Commits](https://www.conventionalcommits.org/)
- [Commitlint](https://commitlint.js.org/)
- [Husky](https://typicode.github.io/husky/)
- [Lint-staged](https://github.com/okonet/lint-staged)

# Conventions de Commit

Ce projet utilise les [Conventional Commits](https://www.conventionalcommits.org/) pour maintenir un
historique de commits lisible et générer automatiquement les changelogs.

## Format

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types autorisés

- **feat**: Nouvelle fonctionnalité
- **fix**: Correction de bug
- **docs**: Changements de documentation uniquement
- **style**: Changements qui n'affectent pas le sens du code (espacement, formatage, point-virgules
  manquants, etc.)
- **refactor**: Changement de code qui ne corrige pas un bug ni n'ajoute une fonctionnalité
- **perf**: Changement de code qui améliore les performances
- **test**: Ajout de tests manquants ou correction de tests existants
- **build**: Changements qui affectent le système de build ou les dépendances externes
- **ci**: Changements dans les fichiers et scripts de configuration CI
- **chore**: Autres changements qui ne modifient pas les fichiers src ou test
- **revert**: Annule un commit précédent

## Exemples

### Commits simples

```bash
feat: add user authentication
fix: resolve login button styling issue
docs: update README with installation instructions
style: format code with prettier
refactor: extract user validation logic
perf: improve database query performance
test: add unit tests for user service
```

### Commits avec scope

```bash
feat(auth): add OAuth2 integration
fix(ui): resolve button hover states
docs(api): add endpoint documentation
```

### Commits avec breaking changes

```bash
feat!: redesign authentication system

BREAKING CHANGE: The authentication API has been redesigned.
Users will need to re-authenticate after this update.
```

## Hooks Git configurés

### Pre-commit

- Vérifie et corrige automatiquement le code avec ESLint
- Formate le code avec Prettier
- Vérifie les types TypeScript

### Commit-msg

- Valide le format du message de commit selon les conventions

### Pre-push

- Exécute tous les checks (types, linting, formatage)
- Teste le build du projet

## Scripts utiles

```bash
# Vérifier tout avant un commit
npm run check-all

# Corriger automatiquement le formatage et le linting
npm run fix-all
```

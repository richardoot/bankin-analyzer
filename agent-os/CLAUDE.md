# Instructions Claude - Finance Analyzer

## Workflow de Developpement

### Tests obligatoires

Apres chaque implementation d'une nouvelle feature (frontend ou backend), tu DOIS systematiquement :

1. **Creer les tests** correspondants a la feature implementee
2. **Executer les tests** pour verifier qu'ils passent tous
3. **Ne passer a la suite** qu'une fois les tests valides

Cela s'applique a :

- Nouveaux endpoints API (backend)
- Nouveaux composants Vue (frontend)
- Nouvelles pages/vues (frontend)
- Nouveaux services/composables (frontend et backend)
- Modifications significatives de logique existante

### Structure des tests

- **Backend** : Tests dans des fichiers `*.spec.ts` a cote des fichiers sources
- **Frontend** : Tests dans des fichiers `*.spec.ts` dans le meme dossier que le composant

### Commandes de test

```bash
# Backend
pnpm --filter backend test

# Frontend
pnpm --filter frontend test
```

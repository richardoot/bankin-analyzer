# Roadmap - Axes d'amelioration

## Haute priorite

- [x] **[Backend] Ajouter ValidationPipe global** - Les decorateurs class-validator ne sont pas appliques sans pipe global dans main.ts
- [x] **[Backend] Ajouter un filtre d'exception global** - Pas de gestion centralisee des erreurs non gerees (Prisma, erreurs internes)
- [x] **[Backend] Remplacer les Error generiques par des HttpException** - supabase.service.ts et ai-suggestions.service.ts lancent des Error() au lieu de HttpException
- [x] **[Backend] Extraire le mapping transaction dans une methode** - Le meme bloc de 20 lignes est repete 3 fois dans transactions.controller.ts

## Moyenne priorite

- [ ] **[Frontend] Creer un composable useAsyncAction()** - Le pattern try/catch/finally avec isLoading+error est duplique dans tous les stores
- [ ] **[Frontend] Extraire formatCurrency() dans un utilitaire** - Intl.NumberFormat duplique dans 3 fichiers
- [ ] **[Backend] Ajouter des tests pour TransactionsService** - Service critique (~520 lignes) sans couverture de tests
- [ ] **[Frontend] Ameliorer l'accessibilite (ARIA)** - Ajouter aria-label sur les elements interactifs et formulaires
- [ ] **[Backend] Ajouter rate limiting** - Pas de protection contre les abus (express-rate-limit ou @nestjs/throttler)
- [ ] **[Backend] Ajouter helmet pour les headers securite** - Headers HTTP de securite manquants

## Basse priorite

- [ ] **[Frontend] Systeme de toast/notifications** - Pas de feedback visuel coherent pour les erreurs/succes API
- [ ] **[Frontend] Decouper les vues longues** - TransactionsPage (1988 lignes), BudgetPage (1248 lignes) en sous-composants
- [ ] **[Frontend] Ajouter data-testid** - Seulement 2 attributs data-testid dans toute la codebase
- [ ] **[Frontend] Augmenter la couverture de tests** - ~40% couverture, viser 70%+
- [ ] **[Backend] Gestion des erreurs Prisma** - Pas de catch pour UniqueConstraintViolation, RecordNotFound

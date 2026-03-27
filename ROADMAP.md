# Roadmap - Axes d'amelioration

## Haute priorite

- [x] **[Backend] Ajouter ValidationPipe global** - Les decorateurs class-validator ne sont pas appliques sans pipe global dans main.ts
- [x] **[Backend] Ajouter un filtre d'exception global** - Pas de gestion centralisee des erreurs non gerees (Prisma, erreurs internes)
- [x] **[Backend] Remplacer les Error generiques par des HttpException** - supabase.service.ts et ai-suggestions.service.ts lancent des Error() au lieu de HttpException
- [x] **[Backend] Extraire le mapping transaction dans une methode** - Le meme bloc de 20 lignes est repete 3 fois dans transactions.controller.ts

## Moyenne priorite

- [x] **[Frontend] Creer un composable useAsyncAction()** - Le pattern try/catch/finally avec isLoading+error est duplique dans tous les stores
- [x] **[Frontend] Extraire formatCurrency() dans un utilitaire** - Intl.NumberFormat duplique dans 8 fichiers
- [x] **[Backend] Ajouter des tests pour TransactionsService** - 51 tests couvrant findOne, findAll, pagination, previewImport, importTransactions, update, delete, hash
- [x] **[Frontend] Ameliorer l'accessibilite (ARIA)** - role=dialog sur les modales, aria-label sur inputs/boutons, role=menu sur dropdown
- [x] **[Backend] Ajouter rate limiting** - @nestjs/throttler configure (100 req/min par IP)
- [x] **[Backend] Ajouter helmet pour les headers securite** - Headers HTTP de securite configures

## Basse priorite

- [x] **[Frontend] Systeme de toast/notifications** - Composable useToast + ToastContainer avec animations, integre dans useAsyncAction
- [x] **[Frontend] Decouper les vues longues** - 3 composants extraits : TransactionReimbursementModal, BulkCategoryModal, BudgetSavingsSummary
- [x] **[Frontend] Ajouter data-testid** - LoginPage, Navbar, TransactionsPage, DashboardPage
- [x] **[Frontend] Augmenter la couverture de tests** - 34 tests ajoutes (formatters, useToast, useAsyncAction, persons store, accounts store)
- [x] **[Backend] Gestion des erreurs Prisma** - P2002 (conflict 409), P2025 (not found 404), P2003 (bad request 400)

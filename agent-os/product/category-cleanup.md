# Nettoyage après la migration des catégories

Branche : `chore/category-cleanup`, depuis `main`.

Ce chantier retire ce que le cadre des catégories
(`agent-os/product/category-framework.md`) a rendu inutile, maintenant que les
deux comptes de production sont migrés. Il ne change aucun comportement visible,
sauf le retrait du masquage de catégories (lot 2), décidé par Richard le
2026-10-10 : « maintenant que tout est catégorisé correctement, il n'y a plus
besoin de masquer des catégories ».

## Ordre et dépendances

- **Après la fusion du chantier Récurrences** (`agent-os/product/recurrences.md`,
  branche `feat/recurrences`). Il modifie `dashboard.service.ts`, son DTO de
  réponse et `SpendingStructureCard.vue`, que le lot 2 touche aussi. Démarrer
  depuis un `main` qui contient les Récurrences.
- **Lot 1 avant lot 3** : le lot 1 déplace des exports que des fichiers du
  lot 3 ne doivent plus chercher à l'ancien endroit.
- **Lot 2 seul, dans son propre commit et son propre déploiement** : il porte une
  migration de base qui supprime des colonnes.
- Lot 4 en dernier, il ne touche que du texte et des mocks.

## État de la production (relevé du 2026-10-09, lecture seule)

| Compte  | Catégories | Héritées (sans clé) | Sous-catégories sans clé | À classer | Transferts |
| ------- | ---------: | ------------------: | -----------------------: | --------: | ---------: |
| Richard |         23 |                   0 |                        0 |         2 |        376 |
| Chloé   |         23 |                   0 |                        0 |         1 |        126 |

- Aucune catégorie héritée, aucune sous-catégorie personnelle : les deux comptes
  n'ont plus que les 23 catégories du catalogue.
- Listes de catégories masquées vides pour les deux comptes, tableau de bord et
  global.
- La table `category_associations` n'existe plus en production (migration
  `20260821140000_drop_category_associations`) ; `reimbursement_requests` n'a plus
  de colonne de catégorie.
- La préférence `deduct_pending_reimbursements` est à vrai pour les deux comptes.

La condition de départ du chantier est donc remplie. Avant chaque suppression,
on refait la requête qui la justifie (section « Contrôles »).

## Hors périmètre, trouvé pendant le relevé — corrigé

Les remboursements d'avant 2025 de Richard (ancienne catégorie « Remboursements (non actif) »)
avaient été migrés en revenus. Corrigé le 2026-10-10 par le MCP, une fois livré
`mcp-category-framework.md` : 18 lignes, 2 105,56 €, passées en **Régularisation**. Deux lignes
portant le même tag sont restées en Remboursements parce qu'elles règlent une demande présente
dans le système (mutuelle 305,56 € du 04/02/2025, Amazon 134 € du 23/09/2026) : c'est leur tag
qui est faux, à retirer à la main.

## Ce qui se supprime

### Lot 1 — l'ancienne migration de catégorie

Avant le cadre, une catégorie se migrait vers une autre catégorie de l'utilisateur.
L'assistant du cadre l'a remplacée ; plus rien dans l'interface n'y mène.

- Backend : `src/categories/category-migration.service.ts`,
  `src/categories/dto/category-migration.dto.ts` (et son export dans
  `dto/index.ts`), les routes `POST /categories/:id/migration-preview` et
  `POST /categories/:id/migrate` de `categories.controller.ts`, le fournisseur dans
  `categories.module.ts`, `test/category-migration.e2e-spec.ts`, les cas
  correspondants de `categories.controller.spec.ts`.
- Frontend : `components/settings/MigrateCategoryModal.vue` et son spec. La modale
  n'est plus importée nulle part ailleurs que par son spec. Dans `lib/api.ts`,
  les deux méthodes qui appellent `/categories/:id/migration-preview` et
  `/categories/:id/migrate` (vers les lignes 1600 et 1616 sur `main` au
  2026-10-10), et leurs types de requête et de réponse.
- **Ne pas toucher `router/index.ts`** : sa seule route de migration,
  `settings/categories/migration`, est celle de l'assistant du cadre, qui reste.
- **Attention :** `category-migration.plan.ts` ne disparaît pas entièrement.
  L'assistant du cadre en importe `MigrationPlanError` et `NO_SUBCATEGORY`
  (`legacy-migration.plan.ts`, `legacy-migration.service.ts`,
  `scripts/migrate-legacy-categories.ts`). Déplacer ces deux exports dans
  `legacy-migration.plan.ts`, mettre à jour les quatre imports, puis supprimer
  `category-migration.plan.ts` et son spec.

### Lot 2 — le masquage de catégories

Le masquage contournait l'absence du type transfert. Depuis le cadre, les
mouvements à neutraliser sont des transferts et sortent des totaux par leur type ;
les listes sont vides en production.

Décision : **retirer le masquage entièrement**, global et tableau de bord. Ce
qui disparaît à l'écran :

- dans Réglages > Catégories (`CategoriesSettingsPage.vue`), l'action
  « masquer / démasquer » par catégorie, le filtre « Masquées » et le message
  « « X » masquée » ;
- dans le panneau de filtres du dashboard (`AdvancedFiltersPanel.vue`), la
  possibilité de cacher une catégorie de dépense ou de revenu des graphiques ;
  toutes les catégories y apparaissent, triées par nom ;
- dans l'assistant, le badge « Masquée » ;
- dans la modale de suppression de catégorie, la mention de la préférence
  oubliée.

- Base : migration qui supprime les colonnes `hidden_expense_category_ids`,
  `hidden_income_category_ids`, `global_hidden_expense_category_ids`,
  `global_hidden_income_category_ids` de `filter_preferences`.
- Backend : les champs dans `filter-preferences` (DTO, service, contrôleur) ;
  `hiddenExpenseCategoryIds` / `hiddenIncomeCategoryIds` des filtres du dashboard
  (`dashboard-summary-request.dto.ts`, `dashboard.service.ts`) ;
  `isGloballyHidden` dans `categories.service.ts` et `category-deletion.dto.ts` ;
  `forget-in-preferences.ts` et ses appels (suppression de catégorie, assistant) ;
  `isHidden` et `dropsHiddenPreference` dans l'assistant (`legacy-migration.apply.ts`,
  DTO) ; le seed.
- Frontend : `stores/filters.ts` (listes, bascules, synchronisation, cache local ;
  garder la période et la préférence de déduction), `AdvancedFiltersPanel.vue`,
  `useDashboardData.ts`, `DeleteCategoryModal.vue`, `CategoriesSettingsPage.vue`,
  `LegacyMigrationPage.vue` (badge « Masquée »), `lib/api.ts`, et les specs.
- Le cache local du store change de forme : monter la clé `localStorage` d'une
  version pour ne pas relire l'ancienne.

### Lot 3 — les scripts et le dictionnaire de l'avant

- `src/scripts/suggest-refund-targets.ts` : lisait les sous-catégories « R … »
  pour reconstruire les liens remboursement-dépense. Elles n'existent plus en
  production. À supprimer.
- `src/scripts/categorise-synced.ts` et `src/bank-sync/categorisation.ts` (avec
  son spec) : l'index de marchands propre à un utilisateur, remplacé par les
  règles en clés et la mémoire partagée du lot 5 du cadre. Vérifié le
  2026-10-10 : `categorisation.ts` n'est importé que par ce script et son spec,
  et aucun script de package, cron ni workflow n'appelle `categorise-synced.ts`.
  Refaire ces deux recherches avant de supprimer.
- Le dictionnaire de l'assistant (`legacy-migration.dictionary.ts`) : il traduit
  les intitulés Bankin' en clés. Aucun nouveau compte n'en aura, le catalogue est
  posé à la création. **Ne pas le supprimer** : l'assistant reste (voir plus bas)
  et ses suggestions restent utiles après une révision du catalogue. Le réduire
  aux entrées génériques (« Autre », « Divers », préfixe « R ») est optionnel et
  peut attendre.

### Lot 4 — les restes de texte

Commentaires et descriptions d'API qui décrivent un mécanisme disparu, et qui
tromperaient un lecteur :

- `CategoryAssociation` dans les descriptions d'API de
  `budgets.controller.ts`, `budget.dto.ts`, `dashboard-summary-request.dto.ts` ;
  les commentaires de `budgets.service.ts`, `dashboard.service.ts`,
  `reimbursement-credit.sql.ts` peuvent rester s'ils expliquent l'histoire, ils
  sont corrects.
- Les mocks `categoryAssociation` des specs (`budgets.service.spec.ts`,
  `dashboard.service.spec.ts`, `dashboard.controller.spec.ts`,
  `useDashboardData.spec.ts`).

## Ce qui reste, volontairement

- **L'assistant de migration** (page, routes `legacy`, plan, application, CLI,
  bandeau). Une révision du catalogue qui retire une clé rend la ligne à
  l'utilisateur, qui redevient héritée ; sans l'assistant, aucune révision n'est
  possible.
- **Le provisionnement** et son rafraîchissement : ils servent à chaque
  nouvelle version du catalogue.
- **La colonne dénormalisée `transactions.subcategory`**, que le dashboard
  utilise pour grouper. La retirer est un chantier à part.
- **La résolution par nom du catégoriseur** : le modèle répond par des noms.
- **`isExcludedFromBudget` sur les comptes** : c'est une propriété de compte,
  sans rapport avec l'ancien drapeau de catégorie.
- **Le libellé « À migrer »** de la carte de structure des dépenses : il ne
  s'affiche que s'il reste des lignes sans nature ni rythme, ce qui redevient
  possible après une révision du catalogue.

## Contrôles en production avant chaque lot

À lancer avec `scripts/prod-psql-read.sh` ; chaque requête doit répondre zéro.

```sql
-- Lot 1 et 3 : plus aucune catégorie héritée
SELECT count(*) FROM app.categories WHERE catalog_key IS NULL;

-- Lot 2 : listes de masquage vides
SELECT count(*) FROM app.filter_preferences
 WHERE cardinality(hidden_expense_category_ids)
     + cardinality(hidden_income_category_ids)
     + cardinality(global_hidden_expense_category_ids)
     + cardinality(global_hidden_income_category_ids) > 0;
```

Les sous-catégories sans clé ne sont pas contrôlées : depuis le cadre,
l'utilisateur peut en créer sous une catégorie du catalogue, et elles sont
légitimes.

## Vérification

- Chaque lot : `pnpm lint`, `pnpm typecheck`, `pnpm test` dans `backend/` et
  `frontend/` ; les tests des fonctions retirées partent avec elles, aucun autre
  test ne doit changer d'attendu, sauf :
  - lot 1 : `legacy-migration.plan.spec.ts` importe `MigrationPlanError` depuis
    son nouvel emplacement ;
  - lot 2 : les specs du store de filtres, de `useDashboardData`, de
    `DashboardPage`, de `CategoriesSettingsPage`, de `DeleteCategoryModal`, de
    `LegacyMigrationPage`, des préférences de filtre et du dashboard perdent
    leurs cas de masquage ; le golden master des remboursements
    (`reimbursement-baseline.e2e-spec.ts`) ne doit pas bouger, il n'envoie
    aucune catégorie masquée ;
  - lot 3 et 4 : aucun attendu ne change.
- Lot 2 : la migration se vérifie avec `prisma migrate diff --from-empty
--to-schema-datamodel prisma/schema.prisma --script` contre la migration
  écrite à la main ; sauvegarde de la production (`scripts/backup-prod-db.sh`)
  avant de pousser, puisque des colonnes disparaissent.
- Après déploiement : le dashboard, le budget et la page Réglages > Catégories
  s'ouvrent pour les deux comptes, l'assistant affiche « Tout est dans le
  catalogue ».

## Avancement

Branche `chore/category-cleanup` (depuis `main` 1fc8ce9), quatre commits le 2026-10-15,
fusionnés et poussés sur `main` le 2026-10-17 (03ffca0) en un seul déploiement. Contrôles de production refaits le 2026-10-15 : 0 catégorie héritée, 0 liste de
masquage non vide.

- **Lot 1** (816e02f) : migration catégorie vers catégorie retirée ; `MigrationPlanError` et
  `NO_SUBCATEGORY` déplacés dans `legacy-migration.plan.ts`.
- **Lot 3** (aa42eb7), passé avant le lot 2 : `suggest-refund-targets.ts` lisait les colonnes
  de masquage que le lot 2 supprime. Recherches refaites : `categorisation.ts` n'était importé
  que par le script et son spec, aucun cron ni workflow n'appelait `categorise-synced.ts`.
- **Lot 2** (8ece345) : masquage retiré, migration `20261015120000_drop_hidden_categories`.
  Le panneau « Filtres avancés » du dashboard est supprimé en entier : il ne contenait que le
  masquage. Retirés aussi, hors de la liste ci-dessus, les filtrages côté client du budget, de
  la modale de nouveau plan et de la page Remboursements, et la phrase de la page d'accueil
  sur les catégories « à masquer ». Le cache local passe en `bankin-analyzer-filters-v3`.
  Les colonnes `is_panel_expanded` ne servent plus à rien côté écran ; laissées en place.
  Un onglet ouvert avant le déploiement reçoit un 400 sur le dashboard jusqu'au rechargement
  (`forbidNonWhitelisted`).
- **Lot 4** (4b8a6ff) : descriptions d'API et mocks `categoryAssociation`.

Vérifié à chaque lot : lint, typecheck, unitaires et e2e backend et frontend. Le
`prisma migrate diff --from-empty` ne produit aucune sortie dans ce dépôt ; la migration est
couverte par l'e2e, qui rejoue toutes les migrations. Le golden master des remboursements n'a
pas bougé. Sauvegarde de la production prise avant le push
(`backups/bankin-20261017-011913.sql.gz`) ; la migration est passée en production le
2026-10-16 à 23:20 UTC, colonnes absentes. Reste : ouvrir dashboard, budget et
Réglages > Catégories pour les deux comptes.

# MCP et cadre des catégories : viser par clé, basculer le type

Branche : à créer depuis `main` une fois fusionnés le cadre des catégories
(`feat/category-framework`, plan `agent-os/product/category-framework.md`) et les outils
d'écriture du MCP (`feat/mcp-write-tools`, plan `agent-os/product/mcp-write-tools.md`). Ce plan
ne démarre pas avant : il n'a rien à adapter tant que l'un des deux manque. Richard commite
lui-même.

## Objectif

Les outils d'écriture du MCP ont été construits sur `main`, avec des catégories libres : une
cible se désigne par nom ou par identifiant, le type d'une transaction ne bouge jamais. Le cadre
des catégories change trois choses que le MCP doit suivre :

1. chaque catégorie et sous-catégorie du catalogue porte une **clé stable** (`housing`,
   `housing.rent`), unique par utilisateur, et des attributs (nature, rythme) ;
2. le type **TRANSFER** existe, et le classement sous une catégorie de transfert fait basculer
   le type ; déclasser (`categoryId: null`) rend le type que le signe implique ;
3. les catégories du catalogue sont **verrouillées**, et les catégories d'avant le cadre
   (« héritées », sans clé) attendent l'assistant de migration.

Au bout de ce chantier, le document `agent-os/local/erreurs-recategorisation.md` (122
transactions de production, cibles par clé de catalogue, non versionné) est exécutable par un
agent, et c'est son test de réception.

## Ce qui change dans le code fusionné

- `Category.catalogKey`, `defaultNature`, `defaultRhythm` ; `Subcategory.catalogKey`,
  `nature`, `rhythm`. `toCategoryResponse` et `toSubcategoryResponse` exposent `catalogKey`,
  `isLocked`, les attributs. `isExcludedFromBudget` n'existe plus.
- `TransactionType` a `TRANSFER`. `TransactionsService.update` accepte `categoryId: null` et
  pose `type = category.type`, ou le type du signe quand la ligne est déclassée. `bulkUpdate`
  pose le type aussi.
- `TransactionFilters.type` accepte `TRANSFER`.
- Le catalogue vit dans `backend/src/categories/catalog.data.json`, lu par `catalog.ts`
  (`catalogCategory(key)`, `catalogSubcategory(key)`). `normalizeName` est dans
  `category-catalog.plan.ts` ; `filing-target.ts` du MCP en a une copie à remplacer par un
  import.

## Lot 0 : la lecture parle en clés

- `get_transactions` :
  - le filtre `type` accepte `TRANSFER` ;
  - nouveau filtre `categoryKey`, résolu en `categoryId` chez l'utilisateur, à côté de
    `categoryName` qui reste ;
  - chaque ligne renvoie en plus `categoryKey` et `subcategoryKey` (null pour une catégorie
    héritée ou une sous-catégorie créée par l'utilisateur).
- `get_transaction` : idem, plus `nature` et `rhythm` effectifs (ceux de la sous-catégorie, ou
  les défauts de la catégorie quand la ligne est classée à la catégorie seule).
- `get_categories` : chaque catégorie renvoie `catalogKey`, `isLocked`, `defaultNature`,
  `defaultRhythm` ; chaque sous-catégorie `catalogKey`, `nature`, `rhythm`, `isLocked`. Les
  catégories héritées sont marquées `isLegacy: true` (clé nulle) pour qu'un agent ne les vise
  pas par erreur.
- `get_budget_statistics` et `get_dashboard_summary` : rien à changer, les services excluent
  déjà les transferts ; vérifier que la description des outils le dit.

Tests : spec du contrôleur (`categoryKey` résolu, clé inconnue refusée, TRANSFER transmis,
champs présents).

## Lot 1 : reclasser par clé, et laisser le type suivre

`resolveFilingTarget` accepte en plus `categoryKey` et `subcategoryKey`, exclusifs du nom et de
l'identifiant pour le même niveau. Règles ajoutées :

- une clé inconnue chez l'utilisateur est refusée en nommant la clé ; une clé connue du
  catalogue mais absente chez l'utilisateur dit « catalogue non provisionné » (le script
  `provision-category-catalog.ts` est la réponse) ;
- `subcategoryKey` doit appartenir à `categoryKey` (`housing.rent` sous `housing`) ;
- le refus du type croisé devient : une dépense ou un revenu peut aller dans une catégorie de
  son type **ou dans un transfert** ; jamais de dépense vers un revenu ni l'inverse.

`set_transaction_category` et `set_transactions_category` :

- paramètres ajoutés `categoryKey`, `subcategoryKey` ; `categoryKey: null` (ou
  `categoryId: null`) déclasse la ligne, désormais possible ;
- la réponse `before` / `after` porte `type`, `categoryKey`, `subcategoryKey` en plus des noms :

```json
{
  "before": {
    "type": "EXPENSE",
    "category": "Erreurs",
    "categoryKey": null,
    "subcategory": "Erreurs - Autres"
  },
  "after": {
    "type": "TRANSFER",
    "category": "Virement interne",
    "categoryKey": "internal-transfer",
    "subcategory": null
  }
}
```

- le garde-fou `expectedCategoryName` reste (une catégorie héritée n'a pas de clé, le nom est
  le seul repère) ; `expectedCategoryKey` s'ajoute pour les lignes déjà dans le catalogue.

Tests : `filing-target.spec.ts` (clé, clé plus nom refusés ensemble, clé sous la mauvaise
catégorie, transfert accepté, type croisé refusé, `null`) ; spec du contrôleur (type basculé
dans la réponse, `null` transmis au service).

## Lot 2 : remboursements et cadre

- `create_reimbursement_request` refuse une transaction de type TRANSFER, comme il refuse un
  revenu.
- `settle_reimbursements` : rien à changer, un revenu reste un revenu.
- La sous-catégorie « Prêt à un proche » (`family.loan`) est le cas d'usage visé : une dépense
  classée là plus une demande de remboursement au nom de la personne. `docs/mcp.md` donne la
  séquence en deux appels.

## Lot 3 : exécuter le document « Erreurs »

Procédure, à suivre par l'agent exécutant, après déploiement en production et provisionnement
du catalogue chez Richard :

1. `get_categories` : vérifier que chaque clé de cible du document existe, et que les deux
   catégories « Erreurs » (dépense, revenu) sont encore là, marquées héritées.
2. `get_transactions` filtrées sur chacune des deux « Erreurs » : compter 122 au total,
   comparer les identifiants à ceux du document ; tout écart arrête.
3. Par groupe de cible, `set_transactions_category` par lots de 50 au plus, avec
   `categoryKey`, `subcategoryKey` s'il y en a une, et `expectedCategoryName: "Erreurs"`. Les
   trois lignes « À vérifier » ne sont pas envoyées.
4. Relire les deux « Erreurs » : il ne doit rester que ces trois lignes.
5. Vérifier sur trois lignes de types différents (`get_transaction`) que le type a suivi :
   un virement interne est devenu TRANSFER, un achat réel est resté EXPENSE, un avoir est
   resté INCOME.
6. Rendre compte : par cible, lignes mises à jour, inchangées, refusées, avec la raison.
7. Richard tranche les trois dernières, puis supprime les deux « Erreurs » dans l'assistant de
   migration (`/settings/categories/migration`), qui nettoie les préférences.

`docs/mcp.md` est mis à jour : clés, TRANSFER, déclassement, la procédure ci-dessus en version
générale.

## Vérification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` dans `backend/`.
- En local, stack sur la prod restaurée (`scripts/docker-start.sh --prod`), catalogue
  provisionné (`pnpm ts-node src/scripts/provision-category-catalog.ts`), puis par appel
  JSON-RPC direct sur `POST /mcp` : un `set_transaction_category` d'une ligne « Erreurs » vers
  `internal-transfer`, lecture du type TRANSFER, retour arrière vers la catégorie héritée par
  `categoryName: "Erreurs"`, lecture du type EXPENSE. Puis le document entier, en local, avant
  toute exécution en production.

## Points ouverts

- **Les comptes d'épargne** (Livret A, LEP, PEA) doivent être exclus des statistiques avant
  l'exécution, sinon la lecture de l'épargne du dashboard compte deux fois les mouvements. C'est
  un réglage de compte, pas un outil MCP ; à faire dans l'interface.
- **Les deux revenus de 2 000 € du 2025-03-31** sont dans la catégorie héritée « Virements
  internes », pas dans « Erreurs » ; ils suivent l'assistant de migration, pas ce document.
- **Créer une sous-catégorie depuis le MCP** sous une catégorie du catalogue (nature et rythme
  hérités du parent par `SubcategoriesService.create`) : à ajouter si un document le demande.

## Avancement

À démarrer après la fusion des deux branches.

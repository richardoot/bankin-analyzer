# MCP en écriture : reclasser, demander, régler

Branche : `feat/mcp-write-tools`, créée depuis `main`. Ce plan ne dépend pas du cadre des
catégories (`feat/category-framework`) : il travaille avec les catégories telles qu'elles sont
sur `main`, un nom et un identifiant. L'adaptation au cadre (clés de catalogue, type TRANSFER,
déclassement) est un chantier à part, `agent-os/product/mcp-category-framework.md`, à lancer une
fois les deux branches fusionnées. Richard commite lui-même.

## Objectif

Permettre à un agent connecté au MCP de l'application de faire, au nom de l'utilisateur, trois
choses que seule l'interface permet aujourd'hui :

1. changer la catégorie et la sous-catégorie d'une transaction ;
2. créer une demande de remboursement sur une dépense, au nom d'une personne ;
3. régler des demandes avec une transaction de revenu.

Le premier usage prévu est un document de reclassement : une liste fermée de transactions avec,
pour chacune, sa cible et la raison. Un tel document existe déjà pour les 122 transactions des
catégories héritées « Erreurs » (`agent-os/local/erreurs-recategorisation.md`, non versionné,
données personnelles), mais ses cibles sont des catégories du cadre : il ne s'exécute qu'après la
fusion du cadre et son adaptation. Ce chantier-ci livre les outils ; le document attend.

## Ce qui existe

- `backend/src/mcp/mcp.controller.ts` : un serveur MCP par requête (mode sans session), quatre
  outils de lecture `get_transactions`, `get_categories`, `get_budget_statistics`,
  `get_dashboard_summary`. Les réponses sont du JSON dans une balise `<user_financial_data>`.
  Les commentaires disent « nos outils sont tous en lecture seule » ; ils seront faux.
- `backend/src/mcp/mcp-auth.guard.ts` : jeton Supabase, l'agent agit avec tous les droits de
  l'utilisateur. Aucune portée (scope) ne distingue lecture et écriture.
- `backend/src/mcp/mcp.controller.spec.ts` : un shim remplace `McpServer` et capture chaque
  `server.tool(...)`, les tests appellent les gestionnaires directement avec des services simulés.
  C'est le modèle à suivre pour les nouveaux outils.
- Services à réutiliser, jamais à contourner :
  - `TransactionsService.update(id, userId, { categoryId?, subcategoryId?: string | null })` :
    vérifie la propriété, pose le classement. Sur `main`, `categoryId` n'accepte pas `null` :
    on ne déclasse pas une transaction par ce chemin (le cadre l'apportera).
  - `TransactionsService.findOne(id, userId)`, `findAllByUserPaginated(userId, pagination,
filters)` avec `TransactionFilters` (`type`, `categoryId`, `subcategoryId`, `account`,
    `search`, dates, montants).
  - `CategoriesService.findAllByUser(userId)` ; `SubcategoriesService.findAllByUser(userId)`,
    `findByCategoryId(categoryId, userId)`.
  - `ReimbursementsService.create(userId, { transactionId, personId, amount, note? })`,
    `findByTransaction(transactionId, userId)`, `findAllByUser(userId, { status })`.
  - `SettlementsService.create(userId, { personId, incomeTransactionId, reimbursements:
[{ reimbursementId, amountSettled, forceComplete? }], note? })` : refuse une transaction qui
    n'est pas un revenu, une personne inconnue, une demande d'une autre personne, un montant
    au-delà du disponible. `getAvailableAmount(incomeTransactionId, userId)`.
  - `PersonsService.findAllByUser(userId)`.

## Principes

- **Les cibles se désignent par nom**, `categoryName` et `subcategoryName`, comparés sans casse,
  sans accents et sans espaces superflus, ou par identifiant quand l'agent en a un. Un nom qui
  ne correspond à rien, ou à plusieurs lignes, est refusé : l'outil ne devine pas.
- **Une écriture passe par le service existant.** Pas de Prisma dans le contrôleur MCP, pas de
  chemin parallèle.
- **Un garde-fou optimiste sur chaque écriture.** L'agent dit ce qu'il croit voir
  (`expectedCategoryName` sur un reclassement, `expectedAmount` sur une demande) ; si la base
  dit autre chose, l'outil refuse sans écrire et explique. C'est ce qui protège d'un agent qui
  rejoue un lot ou se trompe de ligne.
- **Chaque réponse d'écriture renvoie l'avant et l'après.** L'agent, ou Richard, peut annuler
  ligne à ligne avec le même outil.
- **Aucun outil de suppression.** Reclasser, demander, régler : trois écritures réversibles. Les
  suppressions restent dans l'interface.
- **Les erreurs sont des réponses MCP `isError: true`** avec un message en français, pas des
  exceptions HTTP : le transport les transformerait en 500 et l'agent ne saurait rien.
- **Un lot est borné et séquentiel.** Au plus 50 lignes par appel, chaque ligne appliquée et
  rapportée indépendamment ; pas de tout-ou-rien, puisque chaque ligne est réversible et que
  l'agent voit ce qui a été fait.
- **Chaque écriture est journalisée** côté serveur (`Logger` Nest, niveau `log`) : outil,
  utilisateur, identifiants, avant et après. Les montants et libellés n'y figurent pas.

## Lot 0 : la lecture qu'un agent qui écrit doit avoir

Sans identifiants, un agent ne peut pas écrire ; sans la liste des sous-catégories, il ne peut
pas viser.

- `get_transactions` :
  - nouveaux filtres `subcategoryId`, `search` (libellé), `categoryName` (résolu en
    `categoryId` par la même règle de nom que les écritures) ;
  - chaque ligne renvoie en plus `id`, `accountId`, `categoryId`, `subcategoryId` ;
  - le paramètre `limit` reste plafonné à 100.
- `get_transaction` (nouveau) : une transaction par `id`, avec son classement complet, ses
  tags, et les demandes de remboursement qui la portent (via `findByTransaction`). C'est
  l'outil de vérification avant et après une écriture.
- `get_categories` : chaque catégorie embarque ses sous-catégories (`id`, `name`, `icon`). Un
  seul appel pour tout ; pas d'outil `get_subcategories` séparé.
- `get_persons` (nouveau) : `id`, `name`, pour le lot 2.
- Les commentaires « read-only » du contrôleur sont réécrits : le mode sans session reste
  valable, chaque appel d'outil est une requête HTTP complète et authentifiée.

Tests : le spec du contrôleur, cas par cas (`categoryName` résolu, nom inconnu ou ambigu
refusé, champs présents dans la sortie).

## Lot 1 : reclasser

Nouveau fichier `backend/src/mcp/filing-target.ts`, fonction pure
`resolveFilingTarget(categories, subcategories, target)` où `target` est
`{ categoryId?, categoryName?, subcategoryId?, subcategoryName? }`. Elle renvoie
`{ categoryId, subcategoryId: string | null }` ou une erreur nommée :

- ni identifiant ni nom de catégorie ;
- identifiant et nom donnés ensemble, pour la catégorie ou la sous-catégorie ;
- catégorie inconnue chez l'utilisateur, ou nom porté par plusieurs catégories (le nom n'est
  unique que par type sur `main`) ;
- sous-catégorie absente, ou qui n'appartient pas à cette catégorie.

La normalisation des noms (`normalizeName`) vit dans ce fichier : minuscules, sans diacritiques,
espaces réduits. Une sous-catégorie n'est jamais créée ici : la création reste
`POST /subcategories` dans l'interface. (Point ouvert plus bas.)

### `set_transaction_category`

Paramètres :

| Nom                    | Type              | Rôle                                                       |
| ---------------------- | ----------------- | ---------------------------------------------------------- |
| `transactionId`        | uuid              | la ligne à reclasser                                       |
| `categoryId`           | uuid, optionnel   | la cible, par identifiant                                  |
| `categoryName`         | string, optionnel | la cible, par nom ; l'un des deux est requis               |
| `subcategoryId`        | uuid, optionnel   | sous-catégorie, par identifiant                            |
| `subcategoryName`      | string, optionnel | sous-catégorie, par nom ; aucun des deux = catégorie seule |
| `expectedCategoryName` | string, optionnel | garde-fou : nom de la catégorie actuelle de la ligne       |

Déroulé : `findOne` → garde-fou → `resolveFilingTarget` → refus si la cible n'est pas du type
de la transaction (une dépense ne va pas dans une catégorie de revenu, le signe n'est jamais
croisé) → `TransactionsService.update` → réponse :

```json
{
  "transaction": {
    "id": "…",
    "date": "2025-03-30",
    "amount": -2000,
    "description": "…"
  },
  "before": {
    "category": "Erreurs",
    "categoryId": "…",
    "subcategory": "Erreurs - Autres",
    "subcategoryId": "…"
  },
  "after": {
    "category": "Virements internes",
    "categoryId": "…",
    "subcategory": null,
    "subcategoryId": null
  }
}
```

Un reclassement vers une cible identique à l'actuelle ne fait rien et le dit.

### `set_transactions_category`

Mêmes paramètres de cible et de garde-fou, `transactionIds` à la place de `transactionId`
(1 à 50). La cible est résolue une fois ; chaque ligne est ensuite traitée comme ci-dessus,
dans l'ordre. La réponse est la liste
`{ transactionId, status: 'updated' | 'unchanged' | 'refused', reason?, before?, after? }`
et un compte par statut. Une ligne refusée n'arrête pas les suivantes.

Tests :

- `filing-target.spec.ts` : chaque erreur nommée, résolution par nom, par identifiant,
  catégorie seule, normalisation.
- `mcp.controller.spec.ts` : garde-fou qui refuse et n'appelle pas `update` ; refus du type
  croisé ; `update` appelé avec le bon couple d'identifiants ; réponse avant/après ; lot avec
  une ligne refusée au milieu ; erreur rendue en `isError` et non levée.
- Pas de nouveau test e2e : `TransactionsService.update` est couvert par
  `transactions.service.spec.ts`, et le contrôleur n'ajoute que de la résolution et des refus.

## Lot 2 : demander et régler

### `create_reimbursement_request`

| Nom              | Type              | Rôle                                         |
| ---------------- | ----------------- | -------------------------------------------- |
| `transactionId`  | uuid              | la dépense                                   |
| `personId`       | uuid              | la personne qui doit (voir `get_persons`)    |
| `amount`         | number > 0        | ce qu'elle doit, au plus la dépense          |
| `note`           | string, optionnel |                                              |
| `expectedAmount` | number, optionnel | garde-fou : montant absolu de la transaction |

Appelle `ReimbursementsService.create`. Refuse si la transaction n'est pas une dépense, et si
une demande existe déjà pour cette personne sur cette transaction (sinon un lot rejoué double
la dette). Réponse : la demande créée (`id`, `amount`, `status`, `person`) et la transaction.

### `settle_reimbursements`

| Nom                   | Type                                                   | Rôle               |
| --------------------- | ------------------------------------------------------ | ------------------ |
| `incomeTransactionId` | uuid                                                   | le revenu qui paie |
| `personId`            | uuid                                                   |                    |
| `reimbursements`      | `[{ reimbursementId, amountSettled, forceComplete? }]` | 1 à 50             |
| `note`                | string, optionnel                                      |                    |

Appelle `SettlementsService.create`, qui porte déjà tous les contrôles. L'outil ajoute avant
l'appel un rappel du disponible (`getAvailableAmount`) dans le message d'erreur quand la somme
dépasse. Réponse : le règlement (`id`, `settledAt`, lignes réglées avec leur nouveau statut) et
le disponible restant sur le revenu.

### `get_reimbursements`

Lecture, par `transactionId` ou par `status` (`PENDING`, `PARTIAL`, `COMPLETED`), pour que
l'agent retrouve les identifiants de demandes à régler.

Tests : spec du contrôleur pour chaque refus et chaque appel de service ; aucun nouveau e2e,
les services sont couverts (`reimbursement-baseline.e2e-spec.ts`, `settlement-ledger.e2e-spec.ts`,
`settlements.e2e-spec.ts`).

## Lot 3 : mode d'emploi et contrôle

- `docs/mcp.md` (nouveau dossier, versionné ; aucun document ne décrit le connecteur MCP
  aujourd'hui) : les outils, leurs paramètres, les garde-fous, et la procédure générale
  d'exécution d'un document de reclassement. Pas de données personnelles.
- Procédure générale, à suivre par l'agent exécutant un document de reclassement :
  1. `get_categories` : vérifier que chaque cible du document existe chez l'utilisateur, par
     nom ou par identifiant.
  2. `get_transactions` sur la catégorie de départ : compter, comparer les identifiants à ceux
     du document ; tout écart arrête.
  3. Par cible, `set_transactions_category` par lots de 50 au plus, avec
     `expectedCategoryName` égal à la catégorie de départ. Les lignes marquées « à vérifier »
     dans le document ne sont pas envoyées.
  4. Relire la catégorie de départ : il ne doit rester que ces lignes-là.
  5. Rendre compte : par cible, lignes mises à jour, inchangées, refusées, avec la raison.

## Vérification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` dans `backend/`.
- En local, stack sur la prod restaurée (`scripts/docker-start.sh --prod`), puis un appel
  JSON-RPC direct sur `POST /mcp` avec un jeton Supabase local : `tools/list`, puis un
  `set_transaction_category` sur une ligne quelconque et son retour arrière avec le même outil.
  Le connecteur « Bankin » de claude.ai pointe sur la production ; ne pas l'utiliser pour tester.

## Points ouverts

- **Portée d'écriture dans le jeton.** Le garde accepte tout jeton Supabase valide. Un agent de
  lecture seule a aujourd'hui, de fait, les droits d'écriture. Un en-tête ou un scope OAuth
  réservé aux écritures serait propre ; hors périmètre ici, à noter dans `docs/mcp.md`.
- **Déclasser une transaction** (`categoryId: null`) : impossible par le service sur `main`. Le
  cadre des catégories l'apporte ; l'outil l'exposera à ce moment-là.
- **Créer une sous-catégorie ou une personne depuis le MCP.** À ajouter si un document de
  reclassement le demande, avec le même modèle (trouver ou créer, jamais dupliquer).
- **Tout-ou-rien sur un lot.** Écarté pour l'instant : chaque ligne est réversible et rapportée.
  À revoir si un agent doit un jour reclasser des milliers de lignes.
- **Annulation.** L'avant/après rendu permet d'annuler ligne à ligne ; pas de journal persistant
  ni d'outil d'annulation groupée.

## Avancement

À démarrer.

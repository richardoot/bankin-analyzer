# MCP en écriture : reclasser, demander, régler

Branche : `feat/mcp-write-tools`, créée depuis `main`.

Prérequis : le cadre des catégories (`feat/category-framework`) fusionné sur `main` avant de
commencer le lot 1. Les outils reposent sur le type TRANSFER, les clés de catalogue et le
classement qui suit la catégorie, livrés par ce cadre ; sans lui, `categoryKey` ne résout rien
et `set_transaction_category` ne saurait pas basculer le type. Si le cadre tarde, seul le lot 0
peut avancer (identifiants et filtres), et le plan est rebasé sur `main` après la fusion.

## Objectif

Permettre à un agent connecté au MCP de l'application de faire, au nom de l'utilisateur, trois
choses que seule l'interface permet aujourd'hui :

1. changer la catégorie et la sous-catégorie d'une transaction ;
2. créer une demande de remboursement sur une dépense, au nom d'une personne ;
3. régler des demandes avec une transaction de revenu.

Le premier usage est fermé et documenté : exécuter `agent-os/local/erreurs-recategorisation.md`,
122 transactions de production à sortir des catégories héritées « Erreurs ». Ce fichier n'est pas
versionné (données personnelles) ; il donne pour chaque transaction son identifiant, la clé de
catalogue de la cible et une note. Il ne demande aucun remboursement : le lot 1 suffit à
l'exécuter, le lot 2 sert aux prêts à un proche et aux usages suivants.

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
  - `TransactionsService.update(id, userId, { categoryId, subcategoryId })` : vérifie la
    propriété, fait suivre le type à la catégorie (TRANSFER inclus), `categoryId: null` déclasse.
  - `TransactionsService.findOne(id, userId)`, `findAllByUserPaginated(userId, pagination,
filters)` avec `TransactionFilters` (`type`, `categoryId`, `subcategoryId`, `account`,
    `search`, dates, montants).
  - `CategoriesService.findAllByUser`, `SubcategoriesService.findAllByUser` /
    `findByCategoryId` ; les lignes portent `catalogKey`, unique par utilisateur.
  - `ReimbursementsService.create(userId, { transactionId, personId, amount, note? })`,
    `findByTransaction`, `findAllByUser({ status })`.
  - `SettlementsService.create(userId, { personId, incomeTransactionId, reimbursements:
[{ reimbursementId, amountSettled, forceComplete? }], note? })` : refuse une transaction qui
    n'est pas un revenu, une personne inconnue, une demande d'une autre personne, un montant
    au-delà du disponible. `getAvailableAmount(incomeTransactionId, userId)`.
  - `PersonsService.findAllByUser`, `create`.

## Principes

- **Les cibles se désignent par clé de catalogue**, `categoryKey` et `subcategoryKey`
  (`joint-contribution`, `joint-contribution.mine`). L'outil résout l'identifiant chez
  l'utilisateur. Un agent se trompe sur un uuid, pas sur une clé. Les identifiants restent
  acceptés pour les sous-catégories créées par l'utilisateur, qui n'ont pas de clé.
- **Une écriture passe par le service existant.** Pas de Prisma dans le contrôleur MCP, pas de
  chemin parallèle qui oublierait le type ou les préférences.
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

Sans identifiants, un agent ne peut pas écrire ; sans clés, il ne peut pas viser.

- `get_transactions` :
  - le filtre `type` accepte `TRANSFER` ;
  - nouveaux filtres `subcategoryId`, `search` (libellé), `categoryKey` (résolu en
    `categoryId`) ;
  - chaque ligne renvoie en plus `id`, `accountId`, `categoryId`, `categoryKey`,
    `subcategoryId`, `subcategoryKey` ;
  - le paramètre `limit` reste plafonné à 100.
- `get_transaction` (nouveau) : une transaction par `id`, avec son classement complet, ses
  tags, et les demandes de remboursement qui la portent (via `findByTransaction`). C'est
  l'outil de vérification avant et après une écriture.
- `get_categories` : chaque catégorie embarque ses sous-catégories (`id`, `name`,
  `catalogKey`, `nature`, `rhythm`, `isLocked`). Un seul appel pour tout le catalogue de
  l'utilisateur ; pas d'outil `get_subcategories` séparé.
- `get_persons` (nouveau) : `id`, `name`, pour le lot 2.
- Les commentaires « read-only » du contrôleur sont réécrits : le mode sans session reste
  valable, chaque appel d'outil est une requête HTTP complète et authentifiée.

Tests : le spec du contrôleur, cas par cas (filtre TRANSFER transmis, `categoryKey` résolu,
clé inconnue refusée, champs présents dans la sortie).

## Lot 1 : reclasser

Nouveau fichier `backend/src/mcp/filing-target.ts`, fonction pure
`resolveFilingTarget(categories, subcategories, { categoryKey, subcategoryKey?, subcategoryId? })`
qui renvoie `{ categoryId, subcategoryId }` ou une erreur nommée :

- clé de catégorie inconnue chez l'utilisateur ;
- sous-catégorie absente, ou qui n'appartient pas à cette catégorie ;
- `subcategoryKey` et `subcategoryId` donnés ensemble.

Une sous-catégorie n'est jamais inventée ici : l'outil de création reste `POST /subcategories`
dans l'interface. (Point ouvert plus bas.)

### `set_transaction_category`

Paramètres :

| Nom                    | Type              | Rôle                                                                                                                    |
| ---------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `transactionId`        | uuid              | la ligne à reclasser                                                                                                    |
| `categoryKey`          | string ou `null`  | la cible ; `null` renvoie la ligne « à classer »                                                                        |
| `subcategoryKey`       | string, optionnel | sous-catégorie du catalogue sous cette catégorie                                                                        |
| `subcategoryId`        | uuid, optionnel   | sous-catégorie créée par l'utilisateur, à défaut de clé                                                                 |
| `expectedCategoryName` | string, optionnel | garde-fou : nom de la catégorie actuelle, comparé sans casse ni accents (`normalizeName` de `category-catalog.plan.ts`) |

Déroulé : `findOne` → garde-fou → `resolveFilingTarget` → `TransactionsService.update` →
réponse :

```json
{
  "transaction": {
    "id": "…",
    "date": "2025-03-30",
    "amount": -2000,
    "description": "…"
  },
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

Un reclassement vers une cible identique à l'actuelle ne fait rien et le dit.

### `set_transactions_category`

Mêmes paramètres de cible et de garde-fou, `transactionIds` à la place de `transactionId`
(1 à 50). Chaque ligne est traitée comme ci-dessus, dans l'ordre ; la réponse est la liste
`{ transactionId, status: 'updated' | 'unchanged' | 'refused', reason?, before?, after? }`
et un compte par statut. Une ligne refusée n'arrête pas les suivantes.

Tests :

- `filing-target.spec.ts` : chaque erreur nommée, résolution par clé, par identifiant, catégorie
  seule, `null`.
- `mcp.controller.spec.ts` : garde-fou qui refuse et n'appelle pas `update` ; `update` appelé
  avec le bon couple d'identifiants ; `null` transmis tel quel ; réponse avant/après ; lot avec
  une ligne refusée au milieu ; erreur rendue en `isError` et non levée.
- Pas de nouveau test e2e : le basculement de type dans `TransactionsService.update` est couvert
  par `transactions.service.spec.ts` et, de bout en bout, par `category-catalog.e2e-spec.ts` ;
  le contrôleur n'ajoute que de la résolution.

## Lot 2 : demander et régler

### `create_reimbursement_request`

| Nom              | Type              | Rôle                                         |
| ---------------- | ----------------- | -------------------------------------------- |
| `transactionId`  | uuid              | la dépense                                   |
| `personId`       | uuid              | la personne qui doit (voir `get_persons`)    |
| `amount`         | number > 0        | ce qu'elle doit, au plus la dépense          |
| `note`           | string, optionnel |                                              |
| `expectedAmount` | number, optionnel | garde-fou : montant absolu de la transaction |

Appelle `ReimbursementsService.create`. Refuse si la transaction est un revenu ou un transfert,
si une demande existe déjà pour cette personne sur cette transaction (sinon un lot rejoué
double la dette). Réponse : la demande créée (`id`, `amount`, `status`, `person`) et la
transaction.

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
  aujourd'hui) : les outils, leurs paramètres, les garde-fous, et la procédure d'exécution d'un
  document de reclassement. Pas de données personnelles.
- Procédure pour `erreurs-recategorisation.md`, à suivre par l'agent exécutant :
  1. `get_categories` : vérifier que chaque clé de cible du document existe chez l'utilisateur.
  2. `get_transactions` filtrées sur chaque catégorie « Erreurs » (dépense, revenu) : compter
     122, comparer les identifiants à ceux du document ; tout écart arrête.
  3. Par groupe de cible, `set_transactions_category` par lots de 50 au plus, avec
     `expectedCategoryName: "Erreurs"`. Les trois lignes « À vérifier » ne sont pas envoyées.
  4. Relire les deux « Erreurs » : il ne doit rester que les trois lignes marquées.
  5. Rendre compte : par cible, lignes mises à jour, inchangées, refusées, avec la raison.
  6. Richard supprime les catégories « Erreurs » dans l'assistant de migration quand il a
     tranché les trois dernières.

## Vérification

- `pnpm lint`, `pnpm typecheck`, `pnpm test` dans `backend/`.
- En local, stack sur la prod restaurée (`scripts/docker-start.sh --prod`), catalogue
  provisionné (`pnpm ts-node src/scripts/provision-category-catalog.ts`), puis un appel JSON-RPC
  direct sur `POST /mcp` avec un jeton Supabase local : `tools/list`, puis un
  `set_transaction_category` sur une ligne « Erreurs » et son retour arrière avec le même outil.
  Le connecteur « Bankin » de claude.ai pointe sur la production ; ne pas l'utiliser pour tester.
- En production, seulement après fusion et déploiement du cadre des catégories et provisionnement
  du catalogue chez Richard ; sinon aucune clé ne résout.

## Points ouverts

- **Portée d'écriture dans le jeton.** Le garde accepte tout jeton Supabase valide. Un agent de
  lecture seule a aujourd'hui, de fait, les droits d'écriture. Un en-tête ou un scope OAuth
  réservé aux écritures serait propre ; hors périmètre ici, à noter dans `docs/mcp.md`.
- **Créer une sous-catégorie ou une personne depuis le MCP.** Pas nécessaire pour « Erreurs ».
  À ajouter si un document de reclassement le demande, avec le même modèle (trouver ou créer,
  jamais dupliquer).
- **Tout-ou-rien sur un lot.** Écarté pour l'instant : chaque ligne est réversible et rapportée.
  À revoir si un agent doit un jour reclasser des milliers de lignes.
- **Annulation.** L'avant/après rendu permet d'annuler ligne à ligne ; pas de journal persistant
  ni d'outil d'annulation groupée.

## Avancement

À démarrer.

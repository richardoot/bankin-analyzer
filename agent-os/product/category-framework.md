# Cadre des catégories

Branche : `feat/category-framework`. Testée en local sur plusieurs jours avant toute fusion.

## Décisions

Chaque entité répond à une seule question sur une transaction.

| Entité                       | Question                                             | Qui définit                      |
| ---------------------------- | ---------------------------------------------------- | -------------------------------- |
| Type                         | Quel flux ? Dépense, revenu, transfert               | Système                          |
| Catégorie, sous-catégorie    | À quoi a servi l'argent ?                            | Catalogue système                |
| Nature (Essentiel / Plaisir) | Contraint ou choisi ?                                | Catalogue, sur la sous-catégorie |
| Rythme (Engagé / Variable)   | Continue tout seul ou dépend de ce que je fais ?     | Catalogue, sur la sous-catégorie |
| Tag                          | Dans quel contexte ? (événement daté, projet, thème) | Utilisateur                      |
| Tag exceptionnel             | Vie courante ou épisode ?                            | Utilisateur, par transaction     |

Règles :

- Les catégories décrivent la finalité et ne portent aucune sémantique de calcul. Si un calcul oblige à créer, fusionner ou scinder une catégorie, l'attribut est au mauvais niveau.
- Aucune catégorie ne nomme un contexte (pas de Vacances, Exceptionnel, Abonnements). Aucun tag ne nomme une finalité.
- Tous les calculs se font par sous-catégorie, puis s'agrègent par catégorie pour l'affichage.
- La base de référence d'un tag daté n'est déduite que pour les sous-catégories variables. Loyer, assurances, mutuelle ne sont jamais déduits.
- Les catégories sont imposées. L'utilisateur peut ajouter une sous-catégorie à l'intérieur d'une catégorie du catalogue, jamais une catégorie.
- Chaque catégorie possède une sous-catégorie « Autre » dont les attributs servent de défaut à une transaction classée à la catégorie seule.
- Le drapeau `isExcludedFromBudget` des catégories est retiré. Les statistiques de budget le lisaient en SQL (`c.is_excluded_from_budget`), mais elles lisent déjà le tag exceptionnel par transaction, qui fait ce travail. En production une seule catégorie le portait, « Prêts », deux transactions.

## Catalogue des dépenses (validé)

Révisé le 2026-09-30 après le premier passage de Richard dans l'assistant : Dons sortis de Famille (catégorie « Dons et solidarité »), Péage et Stationnement séparés, Train et Avion séparés, « Transports en commun ponctuels » nommé comme tel (le dictionnaire y envoie les « Transports en commun » d'un export Bankin', pas vers l'abonnement), « Concerts, festivals et spectacles » ajouté, « Cours, coaching et formation » renommé, « Famille » devenue « Famille et amis » avec la sous-catégorie « Prêt à un proche » : un prêt est une dépense de cette sous-catégorie plus une demande de remboursement au nom de la personne, que le registre neutralise (en attente si l'option de déduction est active, définitivement une fois réglée). Le transfert « Prêt à un proche » envisagé un moment a été écarté : il perdait l'axe personne que le registre porte.

| Catégorie                    | Sous-catégorie                     | Nature    | Rythme   |
| ---------------------------- | ---------------------------------- | --------- | -------- |
| Logement                     | Loyer ou crédit immobilier         | Essentiel | Engagé   |
|                              | Charges et copropriété             | Essentiel | Engagé   |
|                              | Électricité et gaz                 | Essentiel | Engagé   |
|                              | Eau                                | Essentiel | Engagé   |
|                              | Assurance habitation               | Essentiel | Engagé   |
|                              | Entretien et travaux               | Essentiel | Variable |
|                              | Laverie et pressing                | Essentiel | Variable |
|                              | Hébergement temporaire             | Plaisir   | Variable |
|                              | Autre                              | Essentiel | Variable |
| Alimentation                 | Supermarché                        | Essentiel | Variable |
|                              | Commerces de bouche et marché      | Essentiel | Variable |
|                              | Livraison de courses               | Essentiel | Variable |
|                              | Compléments alimentaires           | Essentiel | Variable |
|                              | Autre                              | Essentiel | Variable |
| Transport                    | Carburant                          | Essentiel | Variable |
|                              | Abonnement transports en commun    | Essentiel | Engagé   |
|                              | Transports en commun ponctuels     | Essentiel | Variable |
|                              | Train                              | Plaisir   | Variable |
|                              | Avion                              | Plaisir   | Variable |
|                              | Péage                              | Essentiel | Variable |
|                              | Stationnement                      | Essentiel | Variable |
|                              | Entretien et réparation            | Essentiel | Variable |
|                              | Assurance auto                     | Essentiel | Engagé   |
|                              | Crédit auto                        | Essentiel | Engagé   |
|                              | Taxi et VTC                        | Plaisir   | Variable |
|                              | Location de véhicule               | Plaisir   | Variable |
|                              | Achat de véhicule                  | Essentiel | Variable |
|                              | Autre                              | Essentiel | Variable |
| Santé                        | Médecin et spécialistes            | Essentiel | Variable |
|                              | Pharmacie                          | Essentiel | Variable |
|                              | Mutuelle                           | Essentiel | Engagé   |
|                              | Optique et dentaire                | Essentiel | Variable |
|                              | Autre                              | Essentiel | Variable |
| Télécom et outils numériques | Téléphone                          | Essentiel | Engagé   |
|                              | Internet                           | Essentiel | Engagé   |
|                              | Logiciels, applications et IA      | Essentiel | Engagé   |
|                              | Autre                              | Essentiel | Engagé   |
| Famille et amis              | Garde d'enfants                    | Essentiel | Engagé   |
|                              | Scolarité et cantine               | Essentiel | Engagé   |
|                              | Activités enfants                  | Essentiel | Variable |
|                              | Pension alimentaire                | Essentiel | Engagé   |
|                              | Aide à un proche                   | Essentiel | Variable |
|                              | Prêt à un proche                   | Essentiel | Variable |
|                              | Animaux                            | Essentiel | Variable |
|                              | Autre                              | Essentiel | Variable |
| Dons et solidarité           | Dons et associations               | Plaisir   | Variable |
|                              | Autre                              | Plaisir   | Variable |
| Impôts et taxes              | Impôt sur le revenu                | Essentiel | Engagé   |
|                              | Taxe foncière                      | Essentiel | Engagé   |
|                              | Autres taxes                       | Essentiel | Engagé   |
|                              | Amendes                            | Essentiel | Variable |
|                              | Autre                              | Essentiel | Engagé   |
| Banque et crédits            | Frais bancaires                    | Essentiel | Engagé   |
|                              | Crédit à la consommation           | Essentiel | Engagé   |
|                              | Retrait d'espèces                  | Plaisir   | Variable |
|                              | Autre                              | Essentiel | Variable |
| Restaurants et bars          | Restaurant                         | Plaisir   | Variable |
|                              | Fast-food et livraison             | Plaisir   | Variable |
|                              | Café et bar                        | Plaisir   | Variable |
|                              | Autre                              | Plaisir   | Variable |
| Loisirs et culture           | Streaming, musique et médias       | Plaisir   | Engagé   |
|                              | Salle, licences et applis de sport | Plaisir   | Engagé   |
|                              | Sport et activités ponctuelles     | Plaisir   | Variable |
|                              | Cours, coaching et formation       | Plaisir   | Variable |
|                              | Sorties et culture                 | Plaisir   | Variable |
|                              | Concerts, festivals et spectacles  | Plaisir   | Variable |
|                              | Jeux et hobbies                    | Plaisir   | Variable |
|                              | Livres et presse                   | Plaisir   | Variable |
|                              | Autre                              | Plaisir   | Variable |
| Shopping et soins            | Vêtements                          | Plaisir   | Variable |
|                              | High-tech                          | Plaisir   | Variable |
|                              | Sport et équipement de loisir      | Plaisir   | Variable |
|                              | Maison et déco                     | Plaisir   | Variable |
|                              | Beauté et coiffeur                 | Plaisir   | Variable |
|                              | Autre                              | Plaisir   | Variable |

Révisé le 2026-10-06 (version 4), après l'examen de neuf abonnements avec Richard : « Télécom et numérique » devient « Télécom et outils numériques » et sa description dit qu'un logiciel au service d'un loisir, d'un sport ou d'un travail va avec eux ; « Logiciels, applications et IA » devient la sous-catégorie résiduelle des outils généraux, en nature essentielle ; « Streaming et médias » devient « Streaming, musique et médias » ; « Salle de sport et licences » devient « Salle, licences et applis de sport ». Le provisionnement sait désormais rafraîchir le libellé et les attributs d'une ligne déjà à clé quand le catalogue change (`refreshCategories`, `refreshSubcategories`), puisqu'une ligne du catalogue ne peut pas avoir été renommée par l'utilisateur. Le regroupement des abonnements est un chantier à part, `agent-os/product/recurrences.md` : une vue calculée des récurrences, pas une catégorie ni un tag.

## Catalogue des revenus (à valider)

Les revenus n'ont ni nature ni rythme au départ. Un rythme (Engagé pour un salaire, Variable pour une vente) pourra être ajouté quand un calcul en aura besoin.

| Catégorie               | Sous-catégories                                                                                                   |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Revenus d'activité      | Salaire, Prime et bonus, Revenus indépendant, Indemnités et chômage, Autre                                        |
| Allocations et pensions | CAF, Retraite, Bourses, Autre                                                                                     |
| Revenus du patrimoine   | Loyers perçus, Intérêts et dividendes, Plus-values, Autre                                                         |
| Remboursements          | Sécu et mutuelle, Remboursement d'un proche, Avoir commerçant, Remboursement d'impôt, Frais pro remboursés, Autre |
| Ventes et occasionnel   | Vente d'occasion, Cadeaux reçus, Gains, Autre                                                                     |

## Catalogue des transferts (à valider)

Ni dépense ni revenu. Le sens vient du signe du montant.

| Catégorie              | Rôle                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Épargne de précaution  | Fonds d'urgence                                                                                                                                                                                                                                                                                                                                        |
| Épargne projet         | Réserve pour les enveloppes de tags                                                                                                                                                                                                                                                                                                                    |
| Investissement         | PEA, assurance vie, crypto                                                                                                                                                                                                                                                                                                                             |
| Virement interne       | Entre deux comptes de l'utilisateur, neutre                                                                                                                                                                                                                                                                                                            |
| Apport au compte joint | Versement sur le compte joint, neutre. Deux sous-catégories, « Mon apport » et « Apport du conjoint », répondent à « qui a alimenté le compte joint de combien ». La production compte environ 330 transactions et 85 k€ de ces apports, répartis aujourd'hui sur sept catégories héritées                                                             |
| Régularisation         | Aller-retour sans consommation : prélèvement à tort et son remboursement, double débit annulé, achat fait avec le mauvais compte et le virement qui l'a couvert. Les deux jambes sont des transferts et se neutralisent. Aussi le remboursement d'une dépense antérieure aux données, avec un tag pour le retrouver si la dépense est importée un jour |

Le masquage n'est pas une entité. Les catégories héritées aujourd'hui cachées par préférence (« Erreurs », « Richard », « Chloé », « Alimenter Compte Joint », « Alimenter Compte Courant ») contournaient l'absence du type Transfert. Une fois le type en place, elles disparaissent, et la préférence « catégories masquées » redevient un réglage d'affichage sans effet sur les totaux. Un tag ne masque jamais : neutraliser une transaction est structurel, automatique et unique, tout ce qu'un tag n'est pas.

Hors périmètre, noté pour plus tard : le rapprochement des deux jambes d'un virement interne (même montant, signes opposés, deux comptes de l'utilisateur, dates proches), qui détecterait les apports du conjoint et éviterait de compter deux fois un transfert dans les vues de solde.

## Modèle

Le catalogue est matérialisé par utilisateur : les lignes `Category` et `Subcategory` restent par utilisateur, ce qui laisse intacts tous les consommateurs par id (préférences de filtre, enveloppes de budget, analyses par tag, catégoriseur). Ce qui change :

- `Category.catalogKey` (nullable, unique par utilisateur). Non null : ligne du catalogue, verrouillée (ni renommage, ni suppression, ni changement d'icône). Null : catégorie héritée, à migrer.
- `Category.defaultNature`, `Category.defaultRhythm` : attributs de la sous-catégorie « Autre », dénormalisés pour les transactions sans sous-catégorie.
- `Subcategory.catalogKey` (nullable, unique par utilisateur), `Subcategory.nature`, `Subcategory.rhythm` (obligatoires). Une sous-catégorie personnalisée a `catalogKey` null et ses attributs choisis par l'utilisateur.
- `TransactionType.TRANSFER` et `Category.type = TRANSFER` pour les quatre catégories de transfert.
- Suppression de `Category.isExcludedFromBudget`.
- Le catalogue est un module TypeScript (`backend/src/categories/catalog.ts`), pas une table : il est versionné, testé, et sert de source aux libellés, icônes, attributs, descriptions pour le catégoriseur, et au dictionnaire de correspondance des noms hérités.

Les clés sont stables et lisibles (`housing`, `housing.rent`, `housing.other`). Un renommage de libellé ne change pas la clé.

## Migration des données existantes

Pilotée par l'utilisateur, parce que lui seul sait où vont ses catégories. Le moteur existant (`category-migration.plan.ts`, MOVE / MERGE / KEEP par sous-catégorie) est étendu, pas remplacé.

1. **Provisionnement.** `ensureCatalog(userId)`, idempotent, crée les lignes du catalogue manquantes. Quand une catégorie héritée porte déjà le même nom et le même type qu'une entrée du catalogue, elle est adoptée en place : on lui pose la `catalogKey` au lieu d'en créer une seconde, ses transactions et enveloppes ne bougent pas, seules ses sous-catégories restent à rapprocher. Appelé à la création de l'utilisateur et par un script pour les comptes existants.
2. **Assistant de migration.** Pour chaque catégorie héritée : ses sous-catégories, le nombre de transactions de chacune, les transactions sans sous-catégorie, et une cible proposée par sous-catégorie (catégorie et sous-catégorie du catalogue, ou nouvelle sous-catégorie personnalisée sous une catégorie du catalogue). La proposition vient d'un dictionnaire de noms courants (noms du seed, noms Bankin', variantes usuelles) avec repli sur le nom de la catégorie. L'utilisateur corrige, voit un aperçu chiffré, applique. Deux options par ligne, imposées par les données de production : une cible « à classer » pour les sous-catégories hétérogènes (les fourre-tout « Divers », « Virements ») dont les transactions repasseront une à une par le catégoriseur, et un tag optionnel posé sur les transactions migrées (« Cadeaux », « Vacances », « Parents », un événement sportif), puisque plusieurs catégories héritées sont en réalité des contextes.
3. **Application**, dans une seule transaction SQL : transactions (`categoryId`, `subcategoryId`, et la chaîne `subcategory` que le dashboard groupe encore), enveloppes de budget (re-pointées, sommées si plusieurs héritées convergent sur une cible), préférences de filtre (ids cachés remappés), puis suppression de la catégorie héritée si elle est vide. Une catégorie héritée « Épargne » migrée vers un transfert bascule le `type` de ses transactions.
4. **Mode transitoire.** Tant que des catégories héritées subsistent, tout fonctionne comme aujourd'hui, avec un bandeau invitant à terminer la migration. Les nouvelles transactions ne peuvent être classées que dans le catalogue.
5. **Ligne de commande** pour appliquer un fichier de correspondance JSON à un compte, utile pour rejouer la migration en local à chaque restauration de sauvegarde.

Rejeu en local : `scripts/restore-prod-to-local.sh` restaure la production dans le Docker local, le script applique la migration Prisma puis le provisionnement, et la correspondance JSON rejoue les choix. La production n'est pas touchée avant la fusion.

## Lots

**Lot 0, catalogue et schéma.** Module `catalog.ts` avec tests de cohérence (clés uniques, un « Autre » par catégorie, attributs présents). Migration Prisma : colonnes, enums, `TRANSFER`, retrait de `isExcludedFromBudget`. Service `ensureCatalog` et son appel à la création d'utilisateur. Seed réécrit sur le catalogue. Script de provisionnement des comptes existants.

**Lot 1, règles d'API.** Création de catégorie refusée. Renommage, icône, suppression refusés sur une ligne du catalogue. Création de sous-catégorie personnalisée avec nature et rythme obligatoires, suppression avec repli des transactions sur « Autre ». DTO exposant `catalogKey`, `nature`, `rhythm`, `isLocked`. Outil MCP `get_categories` aligné.

**Lot 2, assistant de migration, backend.** Extension du plan à une cible par sous-catégorie, dictionnaire de correspondance, aperçu chiffré, application transactionnelle incluant enveloppes et préférences de filtre, bascule de type pour les transferts, script en ligne de commande.

**Lot 2 bis, les sous-catégories que l'adoption laisse à côté.** Constaté sur la base locale de Richard le 2026-10-04, après sa migration : plus aucune catégorie héritée, mais 21 sous-catégories sans clé sous des catégories du catalogue (« Loyer » à côté de « Loyer ou crédit immobilier », « R Santé » à côté de « Sécu et mutuelle »), 159 transactions. L'adoption par nom exact a pris la catégorie et refusé de deviner pour ses sous-catégories, ce qui est voulu ; l'assistant ne les voyait pas, puisqu'il partait des catégories sans clé. Livré : une catégorie du catalogue est une source de l'assistant quand elle porte des sous-catégories sans clé, et ses lignes sont celles-là seulement (ses propres lignes et ses sous-catégories à clé ne sont pas des lignes) ; elle est rangée, jamais supprimée ; une ligne ne peut pas être classée sur elle-même. `GET /categories/legacy` les liste avec `isCatalog` et `catalogKey`, le dictionnaire propose la cible (« Loyer » → `housing.rent`, préfixe « R » → remboursement d'un proche), la page les marque « Sous-catégories à ranger », le bandeau les compte, le script en ligne de commande les accepte par nom.

**Lot 3, frontend.** Page de réglages : catalogue verrouillé avec badges nature et rythme, gestion des sous-catégories personnalisées. Assistant de migration en trois étapes (catégories héritées, cibles par sous-catégorie, aperçu). Bandeau tant qu'il reste des catégories héritées. Sélecteur de classement (modale de transaction, modale groupée, import, revue des doublons) : arbre du catalogue avec recherche, chaque sous-catégorie affichée avec sa catégorie.

**Lot 4, calculs consommateurs des attributs.** Base de référence des tags par sous-catégorie, déduction limitée aux sous-catégories variables. Transferts sortis des dépenses et des revenus. Dashboard : répartition Essentiel / Plaisir et total des engagements mensuels, en deux lectures nommées (réel du mois, vie courante hors exceptionnel).

**Lot 4 bis, un prêt n'est pas une dépense.** Demandé le 2026-10-03 : Richard prête 3 700 € à son père et ne veut pas les voir dans le dashboard ni dans le budget. Masquer la sous-catégorie « Prêt à un proche » serait l'ancien drapeau `isExcludedFromBudget` revenu un étage plus bas, aveugle (un prêt qu'on ne reverra pas est un don), cassant la paire au remboursement, et sans effet sur le budget. Le cadre a déjà le mécanisme, la demande de remboursement que le registre déduit de la dépense même ; seul son réglage manquait. Livré : la déduction des remboursements en attente devient une préférence utilisateur (`FilterPreferences.deductPendingReimbursements`, à oui par défaut), appliquée par le dashboard et le budget quand la requête ne dit rien, un seul interrupteur partagé par les deux écrans et mémorisé ; le dashboard renvoie `pendingReceivables`, ce qui est encore dû toutes dettes confondues, affiché « Avancé, en attente de retour » dans la carte de structure, pour que l'argent avancé sorte des dépenses sans sortir du champ ; la description de « Prêt à un proche » dit le cas limite, abandonner la dette la transforme en dépense. Aucune entité nouvelle.

**Lot 5, catégoriseur.** Prompt du modèle alimenté par le catalogue et ses descriptions, règles d'historique et de synchronisation bancaire exprimées en `catalogKey`, ce qui ouvre un dictionnaire de marchands partagé entre utilisateurs.

Chaque lot livre ses tests (`pnpm --filter backend test`, `pnpm --filter frontend test`) avant le suivant.

## Vérification sur la production (2026-09-27)

Deux utilisateurs, 63 catégories et 138 sous-catégories, presque toutes nommées comme chez Bankin'. Ce que la lecture a ajouté au catalogue : Laverie et pressing (environ 400 transactions de laverie, réparties entre une catégorie « Lessive » et « Logement - Autres »), Compléments alimentaires, Sport et équipement de loisir, Cours et coaching, et la catégorie de transfert Apport au compte joint. Ce qu'elle a confirmé : Vacances, Événement, Hébergement, Cadeaux, Parents et Abonnements existent chez les deux utilisateurs et se migrent vers des finalités plus un tag. Ce qu'elle a écarté : une catégorie « Erreurs » ou « Régularisation », car les 118 transactions ainsi classées sont des remboursements de mutuelle, des virements internes et des avoirs qui ont chacun une vraie cible.

Corrigé le 2026-10-02, après le traitement des « Erreurs » de Richard par le MCP. Cette lecture était fausse pour la plus grande part. Une fois sorties les vraies dettes (abonnements payés pour un proche, mutuelle reversée, achats remboursés par un marchand, 53 lignes passées au registre de remboursements), les 69 lignes restantes sont des jambes neutres : l'achat fait avec le mauvais compte et le virement qui l'a couvert, un virement rejeté et son retour. La vraie dépense est déjà classée ailleurs, sur le virement sorti du bon compte. Les déclasser, ou traiter la jambe revenu comme un remboursement, la compterait une seconde fois. Le dictionnaire propose donc **Régularisation** pour « Erreurs » et pour « R Erreurs », et la catégorie de transfert Régularisation, d'abord écartée, est bien celle qu'il fallait.

## Avancement

**Lot 0 livré le 2026-09-28** sur la branche, non fusionné. Contenu : `backend/src/categories/catalog.data.json` (source unique, lue aussi par le seed) et `catalog.ts` (validation au démarrage, index par clé) ; migration Prisma `20260928090000_category_catalog` (enums `CategoryNature`, `CategoryRhythm`, valeur `TRANSFER`, colonnes `catalog_key`, `default_nature`, `default_rhythm`, `nature`, `rhythm`, retrait de `is_excluded_from_budget`, index uniques `(user_id, catalog_key)`) ; planificateur pur `category-catalog.plan.ts` (adoption par nom normalisé, type identique) et exécuteur `category-catalog.provisioning.ts` (trois requêtes groupées, idempotent, rejoue sur collision) ; `CategoryCatalogService` appelé à la création d'un utilisateur ; script `src/scripts/provision-category-catalog.ts` (`--dry-run`, `--email`) ; seed réécrit sur le catalogue, avec des transferts (Livret A, PEA) et un tag « Gros achats » à la place de la catégorie exceptionnelle ; le catégoriseur ignore les transferts (`FilingKind`). Vérifié : unitaires backend et frontend, e2e (dont `test/category-catalog.e2e-spec.ts`), lint, typecheck, et le SQL que `prisma migrate diff --from-empty` génère depuis le schéma comparé à la migration écrite à la main (enums, colonnes, index identiques).

**Lot 1 livré le 2026-09-28.** `POST /categories` répond 403 avec l'explication : les catégories viennent du catalogue, on ajoute une sous-catégorie. `PATCH` et `DELETE /categories/:id` répondent 403 sur une ligne du catalogue, et fonctionnent encore sur une catégorie héritée. `POST /subcategories` prend nature et rythme en option sous une catégorie de dépense (défaut : ceux de l'« Autre » du parent), les refuse sous un revenu (400), refuse tout sous un transfert (403), et rend la sous-catégorie existante plutôt que d'en créer un doublon (la modale de classement en dépend). `DELETE /subcategories/:id` est nouveau : refusé sur une ligne du catalogue, sinon les transactions repartent sur l'« Autre » de la catégorie (ou sur la catégorie seule sous une héritée). Les réponses exposent `catalogKey`, `isLocked`, `nature`, `rhythm` et les défauts, sans `userId` ; l'outil MCP `get_categories` aussi. L'import CSV ne crée plus de catégorie : un nom que l'utilisateur n'a pas laisse la transaction à classer ; il adopte encore les sous-catégories du fichier, sous une catégorie existante, avec les défauts du parent. Vérifié : unitaires, e2e (dont `test/subcategories.e2e-spec.ts`), frontend, lint, typecheck.

**Lot 2 livré le 2026-09-28.** Trois routes : `GET /categories/legacy` (chaque catégorie héritée, ses lignes avec une suggestion et sa base, son état masqué, ses enveloppes), `POST /categories/:id/legacy-migration/preview` et `POST /categories/:id/legacy-migration`. Une décision par ligne (chaque sous-catégorie héritée, plus la ligne « catégorie seule ») : CATALOG (catégorie du catalogue, sous-catégorie optionnelle), CUSTOM (sous-catégorie personnelle par nom, existante, créée, ou la ligne héritée elle-même reparentée id intact), UNFILE (à classer), KEEP (partiel). Un tag optionnel par ligne. Le signe n'est jamais franchi, sauf vers un transfert, qui bascule le type des transactions. Les enveloppes suivent la catégorie qui reçoit le plus de lignes (sommées si elle en a déjà une dans le plan), la préférence de masquage est abandonnée, la catégorie héritée est supprimée dès que rien n'est gardé. Le dictionnaire (`legacy-migration.dictionary.ts`) connaît les noms Bankin', ceux du seed et ceux vus en production, avec une base par suggestion et le tag qu'un intitulé de contexte encodait. Le script `src/scripts/migrate-legacy-categories.ts` écrit un fichier de correspondance pré-rempli (`--suggest`), le rejoue en simulation ou pour de vrai (`--apply`, `--dry-run`). Vérifié : unitaires, e2e (dont `test/legacy-migration.e2e-spec.ts`), frontend, lint, typecheck, et une simulation complète sur la production restaurée : 31 catégories héritées, 88 lignes, 86 suggérées.

Pour le test local, après la stack et le provisionnement :

```
cd backend
pnpm ts-node src/scripts/migrate-legacy-categories.ts --email <email> --suggest mapping.json
# relire et corriger mapping.json, puis
pnpm ts-node src/scripts/migrate-legacy-categories.ts --email <email> --apply mapping.json --dry-run
pnpm ts-node src/scripts/migrate-legacy-categories.ts --email <email> --apply mapping.json
```

**Lot 3 livré le 2026-09-28.** Réglages : plus de bouton « Nouvelle catégorie » ; le catalogue est groupé en Dépenses, Revenus, Transferts, chaque ligne verrouillée porte un cadenas, son panneau montre les défauts nature et rythme, ses sous-catégories portent leurs badges ; une sous-catégorie personnelle s'ajoute avec nature et rythme (pré-remplis par les défauts du parent) et se supprime après confirmation, avec le nombre de transactions reclassées dans « Autre » ; une catégorie de transfert n'accepte pas de sous-catégorie ; les catégories héritées viennent en tête dans une section « À migrer », gardent renommage et suppression, et renvoient à l'assistant ; la recherche atteint les noms de sous-catégories. Assistant `/settings/categories/migration` en trois étapes (catégorie, décisions, aperçu) : décisions pré-remplies par les suggestions avec leur base, cibles de même signe plus les transferts, sous-catégorie personnelle nommée en ligne, tag par ligne avec création en un clic du tag suggéré, aperçu chiffré, application, retour à la liste. Bandeau sur le tableau de bord et les réglages tant qu'il reste des catégories héritées. Modale de classement : catalogue seul, recherche sur les deux niveaux avec classement en un clic depuis la sous-catégorie trouvée, catégories héritées grisées, sous-catégorie personnelle à la volée, plus de création de catégorie. Modale de classement groupé : catalogue par genre. Vérifié : frontend (tests, typecheck), lint.

**Le catalogue évolue sans perdre de données.** Le provisionnement retire les lignes dont la clé n'existe plus dans le catalogue : supprimées si elles ne portent aucune transaction, sinon rendues à l'utilisateur comme sous-catégorie (ou catégorie héritée) personnelle, clé effacée, libellé et attributs conservés. Une ligne retirée qui porte le libellé d'une nouvelle entrée est adoptée en place. Relancer `provision-category-catalog.ts` suffit après un changement de catalogue.

**Lot 4 livré le 2026-09-29.** Le type d'une transaction suit sa catégorie : la classer sous un transfert en fait un transfert, la classer ailleurs ou la renvoyer à classer (`categoryId: null`, désormais accepté) lui rend le type de son signe ; le classement groupé fait de même pour tout le lot. Les transferts sortent de tous les totaux : dashboard (dépenses, revenus, options de filtre), statistiques de budget, analyses par tag. La base de référence d'un tag daté ne compte plus que les sous-catégories variables (`COALESCE(sc.rhythm, c.default_rhythm) IS DISTINCT FROM 'COMMITTED'`) : loyer, assurances, abonnements ne sont plus déduits du surcoût d'un séjour ; une ligne sans rythme (héritée) compte comme variable, ce qu'elle était avant. Le dashboard porte deux nouvelles lectures : la structure des dépenses par nature et par rythme, en deux versions (réel de la période, vie courante hors exceptionnel), avec une part « à migrer » pour ce qui n'a pas encore d'attribut ; et la lecture d'épargne : « mis de côté » = somme des transferts vers Épargne de précaution, Épargne projet et Investissement sur les comptes couverts par les statistiques, net des retraits (la jambe sur un compte d'épargne exclu des stats n'est pas comptée, ce qui évite le double comptage tant que les deux jambes ne sont pas rapprochées), taux = mis de côté / revenus, reste à vivre = revenus − engagé de vie courante − mis de côté. À l'écran : carte « Structure des dépenses » sur le tableau de bord, filtre « Transferts » et rendu neutre (gris) des transferts dans la liste, catégories de transfert proposées dans les deux modales de classement. Vérifié : unitaires backend et frontend, e2e, typecheck, lint.

**Lot 4 bis livré le 2026-10-03.** Migration `20261003090000_deduct_pending_preference` : colonne `deduct_pending_reimbursements` sur les préférences de filtre, vraie par défaut. `FilterPreferencesService.deductsPendingByDefault(userId)` ; `DashboardService` et `BudgetsService` l'appliquent quand la requête ne porte pas `deductPendingReimbursements` (la requête gagne quand elle le dit, pour une comparaison en brut) ; descriptions des DTO et des outils MCP alignées. Le dashboard renvoie `pendingReceivables` (somme, toutes périodes, de ce qui reste dû sur les demandes PENDING et PARTIAL, en euros pleins, sans diviseur) et la carte de structure l'affiche sous « Avancé, en attente de retour ». Frontend : la préférence vit dans le store de filtres (`deductPendingReimbursements`, `setDeductPendingReimbursements` qui écrit tout de suite au backend), le dashboard et la page budget y lisent et y écrivent leur interrupteur au lieu d'un `ref` local remis à non à chaque visite, la modale de nouveau plan démarre de la préférence. Description de « Prêt à un proche » complétée. Vérifié : unitaires backend et frontend, e2e, lint, typecheck.

**Lot 5 livré le 2026-10-03.** Trois pièces, aucune entité nouvelle. (1) Le prompt lit le catalogue : `describeCatalog` donne à chaque catégorie sa description et à chaque sous-catégorie sa nature, son rythme et sa description (une sous-catégorie créée par l'utilisateur porte ses deux attributs sans description, une catégorie héritée son nom seul) ; le prompt système explique les deux axes et demande la sous-catégorie la plus précise avant « Autre ». (2) Les règles d'historique raisonnent en clés : `CategorizedHistoryRow` porte `categoryKey` et `subcategoryKey`, `filingKeyOf` compte ensemble deux lignes de même clé quels que soient leurs identifiants (avant et après une migration), avec repli sur l'identifiant pour une sous-catégorie personnalisée ; la synchronisation bancaire alimente ces clés. (3) Une mémoire de marchands partagée, `merchant-memory.ts` et `MerchantMemoryService` : un agrégat SQL de tout ce qui est classé sous une clé de catalogue, par libellé, signe et clé, avec un compte et un nombre d'utilisateurs, jamais un montant, une date ni un compte, mis en cache dix minutes ; le libellé est réduit au marchand (`merchantKey`, bruit bancaire retiré, mots triés), la recherche se fait par ressemblance comme pour les règles, et une proposition exige au moins deux utilisateurs, cinq classements et quatre cinquièmes d'accord ; `categorizeTransactions` la consulte avant le modèle et n'applique une clé que si l'utilisateur la porte, sinon la ligne va au modèle. `filingCategories` remplace le filtre de type dans les deux appelants. Vérifié : unitaires (`merchant-memory.spec.ts`, specs du catégoriseur, des règles, du service, de la synchro et de l'import), e2e, lint, typecheck. Le script `categorise-synced.ts` garde son index propre à l'utilisateur, il n'est pas touché.

**Lot 2 bis livré le 2026-10-04.** `LegacySource.isCatalog` ; `readLegacySource` accepte une catégorie du catalogue et ne garde que ses sous-catégories sans clé (404 s'il n'y en a aucune) ; `readLegacyOverview` liste les catégories sans clé et celles qui portent une sous-catégorie sans clé ; le plan ne supprime jamais une catégorie du catalogue et refuse une ligne classée sur elle-même ; DTO et type frontend portent `isCatalog` et `catalogKey` ; page et bandeau adaptés ; le CLI cherche la catégorie par nom et type sans exiger l'absence de clé. Vérifié : spec du plan (2 cas), e2e (3 cas : liste, rangement avec suppression de la sous-catégorie et conservation de la catégorie, refus du classement sur soi-même), spec de la page, suites complètes, lint, typecheck.

**Catalogue v4 livré le 2026-10-06.** Libellés et descriptions de Télécom, Logiciels, Streaming et Salle de sport ; nature de Logiciels en essentiel. Le planificateur compare les lignes à clé au catalogue et planifie un rafraîchissement du libellé, de l'icône et des attributs quand ils diffèrent ; l'exécuteur l'applique avant les adoptions ; le script l'affiche et le compte. Vérifié : spec du plan (2 cas), e2e (une ligne dont le libellé a dérivé revient en ligne), suites complètes. Appliqué en production par le script après déploiement.

Ce que le lot 3 laisse au lot 4 : classer une transaction dans un transfert depuis l'écran (le type de la transaction doit changer, et le dashboard doit savoir quoi en faire) ; les modales ne proposent donc pas encore les catégories de transfert.

Ce que le lot 1 change à l'écran avant le lot 3 : le bouton « Nouvelle catégorie » des réglages et de la modale de classement reçoit un 403 et affiche l'erreur générique. La stack locale doit être reconstruite pour embarquer le lot 1 (`scripts/docker-start.sh --none`, qui garde les données).

Ce que le lot 0 change déjà pour un utilisateur existant, avant le lot 3 : rien à l'écran tant que le script de provisionnement n'a pas tourné ; après, les catégories du catalogue apparaissent à côté des héritées dans les réglages et les sélecteurs, les catégories de transfert restent invisibles (le frontend ne connaît pas encore ce type), et la colonne « Budget » des réglages disparaît.

Pour le test local :

```
scripts/docker-start.sh --prod          # restaure la prod et rejoue les migrations
cd backend
pnpm ts-node src/scripts/provision-category-catalog.ts --dry-run
pnpm ts-node src/scripts/provision-category-catalog.ts
```

## Points à trancher pendant le test local

- La portée du type `TRANSFER` : le lot 0 l'introduit parce que la migration doit connaître sa cible. Son traitement dans le dashboard attend le lot 4.
- Le catalogue des revenus et des transferts n'a pas encore été discuté en détail.
- Surcharge des attributs par transaction : prévue par le modèle, pas implémentée au départ.
- Suggestion de tag exceptionnel quand un montant dépasse largement l'habitude de sa sous-catégorie : hors périmètre de ce chantier, noté pour le cadre suivant.

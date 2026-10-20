# Tendances de dépenses : ce qui change dans la vie courante

Rédigé le 2026-10-21. Aucune branche ouverte. Fait suite au [cadre des catégories](category-framework.md), au [cadre des achats lissés](amortization-framework.md), aux [récurrences](recurrences.md) et aux [familles d'étiquettes](tag-families.md), dont il reprend la règle : un calcul se pose sur l'entité qui porte la question, et un cadre ne dit que ce qu'il peut prouver sur le registre.

## Le problème

Le tableau de bord décrit un état : ce que la période a coûté, par mois et par catégorie, dans les deux lectures. Il ne dit pas ce qui **change**. Richard veut qu'une section lui remonte, sans qu'il ait à comparer douze graphiques à l'œil : « vous dépensez plus en restaurants qu'avant », « vous avez réduit la fréquence des livraisons », « un nouvel abonnement est apparu », « le panier moyen du supermarché a monté ».

Ce que l'application sait déjà comparer, et ce qu'elle ne sait pas :

| Lecture existante                               | Ce qu'elle compare                                                                          | Ce qui manque pour une tendance                                                            |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tableau de bord, `monthlyAmounts` par catégorie | Rien : des séries mensuelles à lire soi-même                                                | Une référence, un seuil, une phrase                                                        |
| Budget, « Comparer avec… » (3, 6, 12 mois, N-1) | La moyenne d'une fenêtre passée avec le plan en cours, par catégorie (`marginVsHistorical`) | Lit des montants, jamais une fréquence ; n'existe que dans un plan ; aucune sélection      |
| Récurrences                                     | Le rythme d'un marchand avec lui-même                                                       | Écarte volontairement les achats d'habitude (`isCredible`) : la fréquence n'est pas rendue |
| Suggestion de lissage                           | Une dépense avec l'habitude 12 mois de sa sous-catégorie (×3, 200 € au moins)               | Une ligne, jamais un mois                                                                  |
| Base de référence d'une étiquette datée         | Une édition avec les 12 mois qui la précèdent, sous-catégories variables seulement          | Attachée à un événement, pas à la vie courante                                             |
| Familles d'étiquettes                           | Les éditions entre elles, l'enveloppe annuelle                                              | L'exceptionnel seulement                                                                   |

Les briques existent, dispersées. Il manque un **moteur de comparaison** (une unité, une mesure, une référence, un seuil) et une **restitution** qui choisit quoi dire.

## Faisabilité

Faisable sans donnée nouvelle. Tout ce qu'une tendance lit est dans le registre : date, montant, compte (diviseur, exclusion des statistiques), catégorie et sous-catégorie avec leur nature et leur rythme, étiquette exceptionnelle, lissage, lignes de récurrence, remboursements. L'agrégation mois × catégorie × sous-catégorie du tableau de bord (`dashboard.service.ts`, requête 1) porte déjà les conventions : net des remboursements selon la préférence, part du compte joint, comptes exclus ignorés, exceptionnel marqué, rythme effectif, ligne de récurrence marquée.

Le volume est dérisoire : 1 242 dépenses sur 15 mois pour Richard au dry-run des récurrences. La détection des récurrences lit déjà toute l'histoire en mémoire à chaque recalcul ; un moteur de tendances peut faire pareil, sans cache au départ.

La difficulté n'est pas technique, elle est éditoriale : dire **peu** de choses, **vraies**, **actionnables**. Les pièges sont connus des cadres précédents et chacun a une réponse ci-dessous : le mois en cours incomplet, le bruit d'un mois à l'autre, une hausse de prix prise pour un changement de comportement, un remboursement qui arrive après coup, un épisode exceptionnel, un achat lissé, des lignes pas encore classées.

## IA ou pas

**Le calcul est déterministe, sans modèle.** Pour les raisons qui ont fait les récurrences et le lissage sans modèle :

- Un chiffre affiché doit être recalculable, testable sur un ledger, et ouvrir ses transactions par un lien. Un modèle ne garantit aucun des trois.
- La question « est-ce significatif ? » est un seuil, pas un jugement. Un seuil se discute, se règle, se teste ; une impression de modèle non.
- Le registre contient des libellés bancaires, donc du texte que le modèle ne doit pas prendre pour une instruction. Moins il en lit, mieux c'est.
- Le tableau de bord vient d'être optimisé pour son temps de chargement. Un appel de modèle dans sa page est une seconde et une panne possible de plus.

**Le modèle a trois places possibles, toutes facultatives et en aval du calcul :**

1. **Raconter.** Transformer la liste des tendances du mois en un paragraphe (« Septembre : la vie courante est stable, sauf les restaurants, plus fréquents. Les livraisons ont presque disparu, le supermarché a pris le relais »). Le modèle ne lit que les tendances calculées et quelques totaux, jamais les transactions ; il ne produit aucun chiffre que la liste ne contient pas.
2. **Relier.** Voir qu'une baisse et une hausse dans la même catégorie sont un report et pas une économie. Une règle le fait aussi (tendance « report », ci-dessous) ; le modèle le ferait avec plus de nuance, au prix de la vérifiabilité.
3. **Répondre.** « Pourquoi mes transports ont monté ? » Cette place existe déjà : le serveur MCP expose `get_dashboard_summary`, `get_transactions`, `get_recurrences`, et Richard parle à Claude dessus. Un outil `get_spending_trends` donne à cette conversation les tendances calculées, sans un appel de modèle dans l'application.

Décision proposée : **lots 0 à 4 sans modèle**, le MCP en lot 4 comme première couche « IA », et une **narration dans l'application en lot 5, optionnel**, décidée après avoir vu l'usage du lot 4.

Si le lot 5 se fait, ce qu'il coûte et ce qui l'encadre :

| Poste                        | Valeur                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Intégration                  | `AiSuggestionsService` existe (`@langchain/anthropic`, sortie structurée Zod, événement `ai_call` avec les jetons). Un nouvel usage `digest` dans le même service, même mesure.                                                                                                                                                             |
| Entrée                       | Le JSON des tendances du mois, les totaux vie courante et réel, le revenu, le taux d'épargne. Enveloppé dans une balise comme le fait le MCP (`<user_financial_data>`), pour que les noms de marchands restent des données.                                                                                                                 |
| Sortie                       | Trois à cinq phrases en français, vouvoiement comme l'application, aucun chiffre absent de l'entrée (consigne, et vérification par relecture : chaque nombre de la sortie doit figurer dans l'entrée, sinon la narration est rejetée et la carte montre la liste seule).                                                                    |
| Taille d'un appel            | ≈ 2 500 jetons en entrée (consigne 800, tendances 1 500), ≈ 400 en sortie.                                                                                                                                                                                                                                                                  |
| Coût par utilisateur et mois | Claude Haiku 5.5 (`claude-haiku-5-5`, 0,10 $ / 0,50 $ le million) : ≈ 0,0005 $. Claude Opus 5.5 (`claude-opus-5-5`, 4 $ / 20 $) : ≈ 0,02 $. Trois régénérations par mois restent sous 0,06 $. Le service de catégorisation tourne aujourd'hui sur `claude-haiku-4-5-20251001` (1 $ / 5 $), plus cher que Haiku 5.5 : à migrer à l'occasion. |
| Quand                        | À la première ouverture du mois clos, puis mémorisée (table `monthly_digests`) ; bouton « Régénérer ». Jamais pendant le chargement du résumé : requête séparée, la carte s'affiche sans elle.                                                                                                                                              |
| Mention                      | « Rédigé par l'IA à partir des tendances ci-dessus », le modèle et la date de génération.                                                                                                                                                                                                                                                   |
| Panne                        | Le modèle indisponible ou la relecture en échec : la liste seule, pas d'erreur visible. Comme les icônes : fire-and-forget, journalisé.                                                                                                                                                                                                     |

Ce que le modèle ne fait jamais : calculer un montant, décider qu'une variation compte, lire une transaction, classer, étiqueter.

## Les tendances à suivre

Une tendance se définit par trois choix. Le cadre les nomme pour que chaque tendance du catalogue soit une combinaison, jamais un cas spécial.

**Sur quoi** (l'unité observée) :

| Unité              | Ce qu'elle dit                               | Où elle est                                              |
| ------------------ | -------------------------------------------- | -------------------------------------------------------- |
| Total vie courante | Le niveau de vie                             | `everydayNetExpenses` par mois                           |
| Catégorie          | Un secteur (« Restaurants et bars »)         | `monthlyAmounts` du tableau de bord                      |
| Sous-catégorie     | L'usage précis (« Livraison de repas »)      | Agrégation mois × sous-catégorie                         |
| Axe de structure   | Part plaisir, part engagée                   | `SpendingStructureDto` par mois                          |
| Marchand           | Une enseigne (« Uber Eats », « Picard »)     | `merchantKey` et `isSameMerchant`, comme les récurrences |
| Récurrence         | Un abonnement, une charge                    | Table `recurrences`, statuts et dates                    |
| Épargne            | Ce qui part vers l'épargne, le reste à vivre | `savingsTransfers`, `remainingToLive`                    |

**Quoi mesurer** :

| Mesure       | Définition                                                             | Ce qu'elle révèle                             |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------- |
| Montant      | Somme nette du mois, part de l'utilisateur, lecture vie courante       | Combien                                       |
| Fréquence    | Nombre de lignes de dépense du mois (jours distincts pour un marchand) | Combien de fois                               |
| Panier moyen | Montant / fréquence                                                    | Combien à chaque fois                         |
| Part         | Montant de l'unité / total vie courante                                | Le mix, indépendant du niveau de revenu       |
| Pente        | Régression linéaire sur 6 mois                                         | Une dérive lente qu'aucun mois seul ne montre |
| Présence     | Mois ou semaines consécutifs sans aucune ligne                         | Une habitude abandonnée, une nouvelle         |
| Prix         | Montant d'une récurrence à fréquence constante                         | Une hausse subie, pas un comportement         |

**Par rapport à quoi** (la référence) :

| Référence                                           | Usage                                                   | Historique requis                                    |
| --------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------- |
| L'habitude : médiane des 6 mois complets précédents | Le défaut de toute tendance mensuelle                   | 3 mois complets au moins (sinon la tendance se tait) |
| Le même mois l'an dernier                           | Les secteurs saisonniers (cadeaux, chauffage, vacances) | 13 mois complets                                     |
| Les 6 mois précédents, en série                     | La pente                                                | 6 mois complets                                      |
| Le trimestre précédent                              | L'épargne, le reste à vivre                             | 6 mois complets                                      |

La médiane plutôt que la moyenne : un seul gros mois dans la fenêtre de référence ne doit pas faire passer le mois suivant pour une baisse. Six mois plutôt que douze : « avant » est ce que l'utilisateur ressent, et une habitude prise au printemps doit se voir à l'automne. Douze mois restent la fenêtre des lectures saisonnières, cohérente avec le lissage et la base de référence des étiquettes.

L'enveloppe du Budget n'est **pas** une référence de tendance : elle dit « par rapport à ce que j'ai décidé », pas « par rapport à ce que je faisais ». Les deux lectures restent dans leurs pages.

### Catalogue

| #   | Tendance                        | Unité × mesure × référence                       | Se tait si                                                                    | Exemple de phrase                                                                             | Lot |
| --- | ------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --- |
| 1   | Secteur en hausse ou en baisse  | Catégorie ou sous-catégorie × montant × habitude | Écart < 15 % ou < 30 €                                                        | « Restaurants et bars : 312 € en septembre, +38 % par rapport à l'habitude (226 €). »         | 0   |
| 2   | Plus ou moins souvent           | Sous-catégorie variable × fréquence × habitude   | Écart < 2 lignes ou < 30 %, ou le plus grand des deux < 4 lignes              | « Livraison de repas : 3 commandes en septembre, contre 9 par mois d'habitude. »              | 0   |
| 3   | Panier moyen                    | Sous-catégorie variable × panier × habitude      | Écart < 20 %, ou moins de 3 lignes d'un côté                                  | « Supermarché : autant de passages, mais 62 € en moyenne contre 48 €. »                       | 0   |
| 4   | Part plaisir, part engagée      | Axe de structure × part × habitude               | Écart < 5 points                                                              | « La part plaisir de la vie courante passe à 31 %, contre 26 % d'habitude. »                  | 0   |
| 5   | Lignes à classer                | Non classé × fréquence × mois                    | < 5 lignes et < 10 % des lignes du mois                                       | « 12 dépenses de septembre sont à classer : les tendances ne les lisent pas. »                | 1   |
| 6   | Marchand plus ou moins fréquent | Marchand × jours distincts × habitude            | Comme 2 ; lignes d'une récurrence active exclues                              | « Amazon : 11 commandes en septembre, contre 6 d'habitude. »                                  | 2   |
| 7   | Nouvelle habitude               | Marchand × présence                              | < 3 lignes sur les 2 derniers mois, ou déjà vu dans les 6 précédents          | « Nouveau : 5 passages chez Picard depuis août. »                                             | 2   |
| 8   | Habitude abandonnée             | Marchand ou sous-catégorie × présence            | Moins de 5 des 6 mois de référence avec une ligne, ou une ligne ce mois-ci    | « Plus aucune livraison de repas depuis 2 mois. »                                             | 2   |
| 9   | Abonnements apparus, arrêtés    | Récurrence × présence × 3 mois                   | Rien d'apparu ni d'arrêté                                                     | « Nouvel abonnement : Basic Fit, 29,99 € toutes les 4 semaines depuis juillet. »              | 2   |
| 10  | Prix d'une charge               | Récurrence × prix                                | Montant inchangé                                                              | « Orange fibre : 44,99 € depuis juillet, contre 39,99 €. »                                    | 2   |
| 11  | Report                          | Deux sous-catégories d'une catégorie × montant   | Les deux écarts ne sont pas de signes opposés, ou l'un n'est pas significatif | « Moins de livraisons (−6), plus de supermarché (+58 €) : un report plutôt qu'une économie. » | 3   |
| 12  | Dérive                          | Catégorie × pente × 6 mois                       | R² < 0,6, ou variation totale < 20 %                                          | « Alimentation en hausse régulière depuis 6 mois : +4 % par mois. »                           | 3   |
| 13  | Record                          | Catégorie × montant × 12 mois                    | Pas le plus haut ni le plus bas des 12, ou écart à la médiane < 25 %          | « Transport : le mois le plus bas depuis un an. »                                             | 3   |
| 14  | Même mois l'an dernier          | Catégorie × montant × N-1                        | Comme 1, et 13 mois requis                                                    | « Cadeaux : 210 € contre 180 € en décembre 2025. »                                            | 3   |
| 15  | Épargne                         | Taux d'épargne et reste à vivre × trimestre      | Écart < 3 points                                                              | « Épargne : 18 % du revenu sur le trimestre, contre 12 % sur le précédent. »                  | 3   |

Trois tendances ne sont **pas** dans le catalogue, parce qu'une autre page les porte déjà : une grosse dépense inhabituelle (suggestion de lissage), un épisode exceptionnel et son coût (étiquettes et familles), l'écart à l'enveloppe (Budget). La carte renvoie vers elles plutôt que de les redire.

## Règles de calcul

- **Lecture vie courante par défaut.** Les lignes exceptionnelles sortent, les achats lissés comptent par tranche : un comportement se lit hors épisode. La bascule « Tout » reste offerte, comme ailleurs, et change toutes les tendances d'un coup.
- **Mois complets seulement.** La carte lit le dernier mois clos ; le mois en cours n'est jamais comparé (un mois aux deux tiers est toujours « en baisse »). Une projection « à ce rythme » est hors périmètre.
- **Mêmes conventions que le tableau de bord**, jusqu'au centime : net des remboursements selon les deux bascules, division par le diviseur du compte, comptes exclus des statistiques ignorés, transferts hors des dépenses, lignes non classées dans le total mais dans aucune catégorie. Invariant : la somme des unités d'un mois égale `everydayNetExpenses` de ce mois.
- **Décomposition d'un écart de montant.** Pour une sous-catégorie variable, Δ montant = Δ fréquence × panier de référence + fréquence × Δ panier. Le terme dominant choisit la phrase : « plus souvent » ou « plus cher à chaque fois ». Une tendance de montant (1) et sa décomposition (2 ou 3) ne font qu'une ligne sur la carte.
- **Prix ou comportement.** Une sous-catégorie engagée, ou une ligne de récurrence, ne produit jamais de tendance de fréquence ni de panier : une charge qui monte à fréquence constante est une tendance de prix (10), nommée comme telle. Les lignes d'une récurrence active sont retirées des unités marchand (6, 7, 8) : un abonnement n'est pas une habitude.
- **Ton.** Nature et rythme viennent du catalogue, la phrase ne juge pas. Une baisse n'est dite comme une réussite (« vous avez réduit ») que sur une unité **plaisir et variable** ; sur l'essentiel (santé, alimentation), la phrase reste neutre (« en baisse »). Une hausse n'est jamais un reproche.
- **Marchands.** Regroupement par `merchantKey` puis `isSameMerchant`, comme la détection des récurrences ; la fréquence d'un marchand compte les jours distincts (deux lignes Amazon le même jour sont une commande). Trois lignes au moins d'un côté de la comparaison, sinon rien.
- **Sélection.** Toutes les tendances sont calculées et rendues ; la carte en montre cinq, classées par l'écart en euros (pour une fréquence, Δ lignes × panier de référence), toutes directions confondues. Une sous-catégorie et sa catégorie ne paraissent pas ensemble : la sous-catégorie si elle explique 70 % de l'écart de la catégorie, la catégorie sinon. Sous trois mois complets d'historique, la carte dit combien de mois il manque ; sans tendance qui passe les seuils, « Rien de notable en septembre : la vie courante est dans l'habitude. »
- **Chaque tendance porte ses deux fenêtres** (le mois, les mois de référence) et l'unité, pour que la carte ouvre les transactions des deux côtés, comme « Historique » et « Réel » du Budget le font avec `transactionsLink`.

Invariants à tester, sur des fixtures et sur les deux ledgers anonymisés des récurrences (`backend/src/recurrences/ledgers/`), étendus aux montants et aux dates :

- Un registre constant d'un mois à l'autre ne produit aucune tendance.
- Un mois exceptionnel dans la fenêtre de référence ne déplace pas la médiane ; le même mois déplacerait une moyenne (test de la raison du choix).
- Une ligne exceptionnelle ne produit jamais de tendance de catégorie ; lissée, elle compte par tranche.
- Un marchand dont toutes les lignes appartiennent à une récurrence active ne produit aucune tendance marchand.
- Une unité essentielle ne reçoit jamais la formulation « vous avez réduit ».
- La somme des unités d'un mois égale le mois du tableau de bord, dans chaque lecture (golden master contre `getSummary`).
- Déterministe : même registre, même instant, même liste.

## Modèle et API

Aucune table pour les lots 0 à 4 : tout se calcule à la lecture, comme la détection des récurrences, dans un module `trends` (`backend/src/trends/`).

- `trend.detection.ts`, **pur** : prend les lignes de dépense d'un utilisateur sur 13 mois (le mois lu et les douze qui le précèdent, ce que demandent le record et le même mois l'an dernier ; l'habitude et la pente en lisent six), les récurrences, les étiquettes exceptionnelles, les tranches de lissage, et l'instant ; rend la liste des tendances. Pas de base, pas d'horloge. Fixtures et snapshots comme `recurrence.detection.spec.ts`.
- `trends.service.ts` : lit le registre avec les mêmes fragments SQL que le tableau de bord (`netAmountSql`, `reimbursementCreditCtes`, `EFFECTIVE_RHYTHM`, `IS_RECURRING`, `AmortizedSlicesService.read`), appelle `RecurrencesService.refreshQuietly` avant, puis la détection.
- `POST /dashboard/trends` (ou `GET /trends?month=YYYY-MM`), filtres : `month` (défaut : dernier mois clos), `deductReimbursements`, `deductPendingReimbursements`, `reading` (`everyday` | `real`). Réponse `TrendsResponseDto` : `month`, `reading`, `completeMonths` (combien d'historique), `insights: TrendInsightDto[]` (`kind`, `unit` {`type`, `id`, `name`, `icon`}, `direction`, `tone` (`neutral` | `success`), `current`, `reference`, `delta`, `deltaPct`, `sentence`, `windows` {`current`, `reference`}, `series` (7 mois pour la sparkline), `score`), `digest` (lot 5, null sinon).
- Script `export-trends-ledger.ts` : dry-run en lecture seule sur une restauration de la production, rend les tendances des trois derniers mois clos en JSON, pour relecture par Richard avant tout écran. Le dry-run des récurrences a changé deux règles ; celui-ci en changera sûrement autant.
- Cache, seulement si la mesure le demande : la table `recurrence_states` et ses déclencheurs versionnent déjà le registre ; une table `trend_states` identique tiendrait un cache par mois lu. Pas avant d'avoir mesuré `timed('trends', …)` en production.
- Lot 5 : table `monthly_digests` (`user_id`, `month`, `reading`, `insights` JSON tel que lu, `text`, `model`, `input_tokens`, `output_tokens`, `generated_at`), unique (`user_id`, `month`, `reading`).

## Écrans

- **Tableau de bord, carte « Ce qui change »**, après les trois indicateurs et avant la structure des dépenses. En-tête : le mois lu et la référence (« Septembre 2026, vie courante, par rapport aux 6 mois précédents »), un sélecteur de mois (mois clos seulement). Cinq lignes au plus : icône de l'unité, phrase, badge de l'écart (signe et pourcentage, couleur par direction et ton), sparkline des 7 mois (`SparklineChart`, déjà dans le Budget), lien « voir les transactions » qui ouvre le mois et, en second lien, la référence. « Voir tout » déplie la liste complète sur place ; pas de page dédiée en première version.
- La carte suit les bascules de remboursement et la lecture (« Tout » / « Vie courante ») du tableau de bord, **pas** sa période : une tendance lit le dernier mois clos quelle que soit la fenêtre affichée au-dessus. L'en-tête le dit.
- États : moins de trois mois complets, « Encore N mois de transactions et les tendances apparaîtront » ; rien de notable, la phrase du calcul ; lignes à classer, la tendance 5 avec son lien vers les transactions non classées.
- Sur téléphone, la sparkline disparaît, la phrase et le badge restent.
- Le compte de démonstration (`backend/prisma/seed.mjs`) doit produire au moins trois tendances de lots différents, sinon la carte ne se voit pas en démonstration.
- Lot 5 : sous la liste, le paragraphe rédigé, sa mention, « Régénérer ».

## MCP

Un outil de lecture, `get_spending_trends` (`month`, `reading`), qui rend la même liste que l'écran, décrit dans `docs/mcp.md`. Il donne à la conversation ce que l'écran montre, et laisse `get_transactions` creuser. Aucune écriture : une tendance ne se corrige pas, le registre oui.

## Lots

**Lot 0, moteur et dry-run.** `trend.detection.ts` avec les tendances 1 à 4, fixtures et snapshots, invariants ci-dessus, `export-trends-ledger.ts` passé sur une restauration de la production. Relecture par Richard : chaque tendance est-elle vraie, et au moins trois sur cinq sont-elles utiles ? Les seuils se règlent ici, pas dans l'écran.

**Lot 1, écran.** Service, endpoint, DTO, carte « Ce qui change » avec ses états, liens, sparklines, tendance 5, seed. Tests du composant et du composable ; golden master contre `getSummary`.

**Lot 2, marchands et charges.** Tendances 6 à 10. Le regroupement par marchand réutilise `merchant-memory.ts` ; les lignes de récurrence sortent des habitudes. Nouveau dry-run.

**Lot 3, temps long.** Tendances 11 à 15, 13 mois d'historique requis pour la 14, ce que la carte dit quand ils manquent.

**Lot 4, MCP.** `get_spending_trends`, documentation, test du contrôleur.

**Lot 5, optionnel, narration.** `monthly_digests`, usage `digest` du service IA, relecture des nombres, paragraphe sous la carte, mention et régénération, événement `ai_call`. Décidé après usage du lot 4, et après avoir choisi le modèle.

Chaque lot livre ses tests (`pnpm --filter backend test`, `pnpm --filter frontend test`) avant le suivant. Lots 0 et 1 sur une branche `feat/spending-trends`, fusionnés ensemble ; les suivants un par un.

## Hors périmètre, noté pour plus tard

- **Objectifs.** « Réduire les restaurants de 20 % d'ici décembre » : une tendance plus une cible. C'est la suite naturelle de ce cadre, et c'est là que l'enveloppe du Budget et l'habitude se rejoignent. Attendre d'avoir vu quelles tendances Richard lit vraiment.
- **Projection du mois en cours** (« à ce rythme, 340 € »), **granularité hebdomadaire** des habitudes, **revenus** (la détection s'y appliquerait telle quelle, comme pour les récurrences).
- **Bilan envoyé** (courriel ou notification au début du mois). Le cron quotidien de la synchronisation bancaire (`backend/vercel.json`, 4 h 30) pourrait le porter ; aucune messagerie sortante n'existe aujourd'hui.
- **Lecture couple.** Deux comptes lisent chacun leur part ; une tendance du foyer touche au modèle d'utilisateur, comme l'étiquette partagée notée dans les familles.
- **Transactions en attente** (`booking_status` PDNG) : le tableau de bord les compte comme les autres, les tendances aussi. À revoir si un mois clos bouge encore après sa clôture.

## Points à trancher

- **La référence** : médiane des 6 mois complets précédents (proposé), ou moyenne des 12 comme le lissage et la base de référence des étiquettes. Le dry-run du lot 0 tranchera sur les données.
- **Les seuils** du catalogue sont des valeurs de départ, à régler au dry-run ; ils vivent dans un seul objet de constantes, comme `SUGGESTION_*` du lissage.
- **La lecture par défaut** : vie courante (proposé), parce qu'un comportement se lit hors épisode ; « Tout » en bascule.
- **La place de la carte** : après les indicateurs (proposé), ou en tête du tableau de bord puisque c'est la lecture la plus actionnable.
- **Le mois lu quand la période du tableau de bord s'arrête dans le passé** : le dernier mois clos de la période (proposé), ou toujours le dernier mois clos du registre.
- **Le lot 5** : le faire, et avec quel modèle. Le coût ne tranche pas (quelques centimes par mois dans les deux cas) ; la question est si un paragraphe rédigé apporte quelque chose que la liste et la conversation MCP ne donnent pas déjà.

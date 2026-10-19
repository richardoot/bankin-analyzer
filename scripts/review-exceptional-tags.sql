-- Read-only: sizes the review of the existing exceptional tags
-- (agent-os/product/amortization-framework.md, « Relecture des tags
-- exceptionnels existants »).
--
-- An exceptional tag hides a cost from the everyday reading for good. The
-- framework keeps it for episodes; a durable good (High-tech, Maison et déco,
-- Sport et équipement de loisir, Achat du véhicule) is smoothed, an
-- unforeseen cost (Entretien et réparation, Entretien et travaux, Optique et
-- dentaire, Amendes) stays in everyday life. This lists, per exceptional tag,
-- the expenses it carries that the framework would not call an episode, with
-- the duration the suggestion proposes (backend/src/transactions/
-- smoothing-suggestions.ts, SMOOTHING_PROFILES — keep the two in step).
--
-- Nothing is written. Against prod, through the read-only session:
--
--   scripts/prod-psql-read.sh "$(cat scripts/review-exceptional-tags.sql)"
--
-- Each row: user, tag (with its window and envelope), how the subcategory
-- reads (DURABLE / UNFORESEEN), how many expenses and how much, the
-- proposed duration, and up to five descriptions to recognise them.
-- A tag absent from the result carries no expense to review.

WITH profile(catalog_key, kind, months) AS (
  VALUES
    ('shopping.tech', 'DURABLE', 24),
    ('shopping.sports-gear', 'DURABLE', 24),
    ('shopping.home', 'DURABLE', 48),
    ('transport.vehicle-purchase', 'DURABLE', 60),
    ('transport.maintenance', 'UNFORESEEN', 12),
    ('housing.maintenance', 'UNFORESEEN', 12),
    ('health.optical-dental', 'UNFORESEEN', 12),
    ('taxes.fines', 'UNFORESEEN', 12)
),
tagged AS (
  SELECT
    u.email,
    tg.id AS tag_id,
    tg.name AS tag,
    tg.event_start_date,
    tg.event_end_date,
    tg.budget_amount,
    t.id AS transaction_id,
    t.date,
    t.description,
    -t.amount AS amount,
    sc.name AS subcategory,
    sc.catalog_key
  FROM app.tags tg
  JOIN app.users u ON u.id = tg.user_id
  JOIN app.transaction_tags tt ON tt.tag_id = tg.id
  JOIN app.transactions t ON t.id = tt.transaction_id
  LEFT JOIN app.subcategories sc ON sc.id = t.subcategory_id
  WHERE tg.is_exceptional = true
    AND t.type = 'EXPENSE'
    AND t.amount < 0
)
SELECT
  x.email,
  x.tag,
  x.event_start_date,
  x.event_end_date,
  x.budget_amount,
  x.subcategory,
  p.kind,
  p.months AS proposed_months,
  count(*) AS expenses,
  sum(x.amount) AS total,
  (array_agg(x.date::date || ' ' || x.description || ' ' || x.amount
     ORDER BY x.amount DESC))[1:5] AS largest
FROM tagged x
JOIN profile p ON p.catalog_key = x.catalog_key
GROUP BY x.email, x.tag_id, x.tag, x.event_start_date, x.event_end_date,
  x.budget_amount, x.subcategory, p.kind, p.months
ORDER BY x.email, sum(x.amount) DESC;

-- ============================================
-- FilterPreferences: hidden categories by id
-- ============================================
-- The four hidden-category lists stored category *names*. Two consequences:
--   1. Renaming a category silently un-hid it — the stale name matched nothing.
--   2. A name is only unique per user *and per type*, so the lists could not
--      tell an expense "Remboursements" from an income one.
-- They now hold Category ids.
--
-- The backfill resolves each name on (user_id, name, type) — the exact key the
-- old lookups used, so no row changes meaning. Names matching no category are
-- dropped: they already matched nothing at read time. Order is preserved via
-- WITH ORDINALITY so the UI listing order is unchanged.

-- Step 1: add the id columns
ALTER TABLE "app"."filter_preferences"
  ADD COLUMN "hidden_expense_category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "hidden_income_category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "global_hidden_expense_category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "global_hidden_income_category_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Step 2: backfill each list, name -> id
UPDATE "app"."filter_preferences" fp
SET "hidden_expense_category_ids" = COALESCE((
      SELECT array_agg(c."id" ORDER BY n."ord")
      FROM unnest(fp."hidden_expense_categories") WITH ORDINALITY AS n("name", "ord")
      JOIN "app"."categories" c
        ON c."user_id" = fp."user_id"
       AND c."name" = n."name"
       AND c."type" = 'EXPENSE'
    ), ARRAY[]::TEXT[]);

UPDATE "app"."filter_preferences" fp
SET "hidden_income_category_ids" = COALESCE((
      SELECT array_agg(c."id" ORDER BY n."ord")
      FROM unnest(fp."hidden_income_categories") WITH ORDINALITY AS n("name", "ord")
      JOIN "app"."categories" c
        ON c."user_id" = fp."user_id"
       AND c."name" = n."name"
       AND c."type" = 'INCOME'
    ), ARRAY[]::TEXT[]);

UPDATE "app"."filter_preferences" fp
SET "global_hidden_expense_category_ids" = COALESCE((
      SELECT array_agg(c."id" ORDER BY n."ord")
      FROM unnest(fp."global_hidden_expense_categories") WITH ORDINALITY AS n("name", "ord")
      JOIN "app"."categories" c
        ON c."user_id" = fp."user_id"
       AND c."name" = n."name"
       AND c."type" = 'EXPENSE'
    ), ARRAY[]::TEXT[]);

UPDATE "app"."filter_preferences" fp
SET "global_hidden_income_category_ids" = COALESCE((
      SELECT array_agg(c."id" ORDER BY n."ord")
      FROM unnest(fp."global_hidden_income_categories") WITH ORDINALITY AS n("name", "ord")
      JOIN "app"."categories" c
        ON c."user_id" = fp."user_id"
       AND c."name" = n."name"
       AND c."type" = 'INCOME'
    ), ARRAY[]::TEXT[]);

-- Step 3: drop the name columns
ALTER TABLE "app"."filter_preferences"
  DROP COLUMN "hidden_expense_categories",
  DROP COLUMN "hidden_income_categories",
  DROP COLUMN "global_hidden_expense_categories",
  DROP COLUMN "global_hidden_income_categories";

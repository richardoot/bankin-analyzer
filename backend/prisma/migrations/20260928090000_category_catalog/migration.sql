-- The category framework: categories stop being the user's to invent and
-- become a catalogue materialised per user (see src/categories/catalog.data.json).
--
-- Two attributes every calculation will read live on the subcategory, where
-- they are known; the category only denormalises the defaults of its "Autre"
-- entry for transactions filed at the category alone.
CREATE TYPE "app"."CategoryNature" AS ENUM ('ESSENTIAL', 'PLEASURE');
CREATE TYPE "app"."CategoryRhythm" AS ENUM ('COMMITTED', 'VARIABLE');

-- A third kind of movement: savings, investments, a top-up of the joint
-- account, a mistaken debit and its refund. Neither spending nor earning.
-- No row carries it yet — the migration assistant will file transfers into
-- it — so nothing that reads the enum changes meaning today.
ALTER TYPE "app"."TransactionType" ADD VALUE 'TRANSFER';

-- `catalog_key` ties a row to its catalogue entry. Null on a legacy row, which
-- is exactly how the migration assistant finds what is left to migrate.
ALTER TABLE "app"."categories"
  ADD COLUMN "catalog_key" TEXT,
  ADD COLUMN "default_nature" "app"."CategoryNature",
  ADD COLUMN "default_rhythm" "app"."CategoryRhythm";

-- Retired: no calculation ever read it. Keeping spending out of the budget
-- and the everyday averages is the exceptional tag's job, per transaction.
ALTER TABLE "app"."categories" DROP COLUMN "is_excluded_from_budget";

CREATE UNIQUE INDEX "categories_user_id_catalog_key_key"
  ON "app"."categories"("user_id", "catalog_key");

ALTER TABLE "app"."subcategories"
  ADD COLUMN "catalog_key" TEXT,
  ADD COLUMN "nature" "app"."CategoryNature",
  ADD COLUMN "rhythm" "app"."CategoryRhythm";

CREATE UNIQUE INDEX "subcategories_user_id_catalog_key_key"
  ON "app"."subcategories"("user_id", "catalog_key");

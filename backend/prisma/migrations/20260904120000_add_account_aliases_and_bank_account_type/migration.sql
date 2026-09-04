-- An account belongs to the user; each source keeps its own way of naming it.
--
-- Neither source's name can be the key. The export says whatever the user
-- typed into Bankin, which no bank has ever heard; the API says whatever the
-- bank calls it, and Boursorama says `Carte Visa Ultim - RICHARD BOILLEY` for
-- two distinct cards.
--
-- `bank_account_links` already pointed at an account from the API side.
-- `account_aliases` is the same thing from the CSV side, and its absence was a
-- defect older than the sync: `upsertByName` resolved an import by the account
-- name while the settings offered to rename an account. Renaming
-- `Perso Bourso` to `Bourso` made the next export — still saying
-- `Perso Bourso` — create a second account, STANDARD with divisor 1, and one
-- real account was computed two different ways from then on.

-- CreateTable
CREATE TABLE IF NOT EXISTS "app"."account_aliases" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "account_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
--
-- One label resolves to exactly one account. Two accounts claiming the same
-- export column is the ambiguity this table exists to prevent.
CREATE UNIQUE INDEX IF NOT EXISTS "account_aliases_user_id_label_key"
  ON "app"."account_aliases"("user_id", "label");
CREATE INDEX IF NOT EXISTS "account_aliases_account_id_idx"
  ON "app"."account_aliases"("account_id");

-- AddForeignKey
ALTER TABLE "app"."account_aliases" ADD CONSTRAINT "account_aliases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "app"."account_aliases" ADD CONSTRAINT "account_aliases_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
--
-- `cash_account_type` is ISO 20022, read from `/accounts/{uid}/details`: CACC
-- for a current account, CARD for a card account. It is the discriminator the
-- double counting needed — a card account reports the same money as the
-- account it settles onto, and no amount of transaction matching can discover
-- that, precisely because the two genuinely share their transactions.
ALTER TABLE "app"."bank_account_links"
  ADD COLUMN IF NOT EXISTS "cash_account_type" TEXT,
  ADD COLUMN IF NOT EXISTS "product" TEXT;

-- BACKFILL-START
-- Every account gets an alias for the name it answers to today, so imports
-- resolve exactly as they did before this migration — and keep resolving after
-- the account is renamed, which is the whole point.
INSERT INTO "app"."account_aliases" ("id", "user_id", "account_id", "label")
SELECT gen_random_uuid()::text, a."user_id", a."id", a."name"
  FROM "app"."accounts" a
 WHERE NOT EXISTS (
   SELECT 1 FROM "app"."account_aliases" x
    WHERE x."user_id" = a."user_id" AND x."label" = a."name"
 );

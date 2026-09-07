-- Which account at the bank is which account here, and what is read from it.
--
-- The mapping cannot be inferred. Boursorama returns two distinct card
-- accounts sharing the name `Carte Visa Ultim - RICHARD BOILLEY`, and the
-- names on this side ("Perso Bourso", "CJ Fixe") are the user's own words that
-- no bank has ever heard. So it is recorded once, deliberately.
--
-- `is_ingested` defaults to false, and that default is the defence against
-- double counting: Boursorama reports a card purchase on both the card account
-- and the current account it settles onto, so enabling everything a bank
-- offers is exactly the mistake to avoid. Nothing is read from an account
-- until someone says so.

-- CreateEnum
CREATE TYPE "app"."BankConnectionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'REVOKED');

-- CreateTable
CREATE TABLE IF NOT EXISTS "app"."bank_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "aspsp_name" TEXT NOT NULL,
    "aspsp_country" TEXT NOT NULL,
    "session_id" TEXT,
    "consent_valid_until" TIMESTAMP(3),
    "status" "app"."BankConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
--
-- `external_account_id` is the bank's handle within a session and is refreshed
-- on every authorization; `iban` and `identification_hash` are what survive
-- between them, the latter being all a card account has.
--
-- `account_id` is nullable on purpose: a known bank account that maps to
-- nothing yet is a resting state, not an error.
CREATE TABLE IF NOT EXISTS "app"."bank_account_links" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_id" TEXT,
    "external_account_id" TEXT NOT NULL,
    "iban" TEXT,
    "identification_hash" TEXT,
    "account_name" TEXT NOT NULL,
    "is_ingested" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bank_account_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bank_connections_user_id_idx" ON "app"."bank_connections"("user_id");
CREATE INDEX IF NOT EXISTS "bank_connections_user_id_status_idx" ON "app"."bank_connections"("user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bank_account_links_connection_id_external_account_id_key"
  ON "app"."bank_account_links"("connection_id", "external_account_id");
CREATE INDEX IF NOT EXISTS "bank_account_links_user_id_idx" ON "app"."bank_account_links"("user_id");
CREATE INDEX IF NOT EXISTS "bank_account_links_account_id_idx" ON "app"."bank_account_links"("account_id");

-- AddForeignKey
ALTER TABLE "app"."bank_connections" ADD CONSTRAINT "bank_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bank_account_links" ADD CONSTRAINT "bank_account_links_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "app"."bank_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bank_account_links" ADD CONSTRAINT "bank_account_links_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- SET NULL rather than CASCADE: deleting an account here must not erase the
-- knowledge that the bank account exists, only that it maps to nothing.
ALTER TABLE "app"."bank_account_links" ADD CONSTRAINT "bank_account_links_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

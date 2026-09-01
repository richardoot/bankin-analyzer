-- Give a transaction an identity the bank owns, beside the one we derive.
--
-- `hash` is computed from userId, date, amount, accountId and description. It
-- identifies a CSV row well enough, but every ingredient is something a bank
-- may restate: a pending transaction that settles changes its date and often
-- its wording, and the hash changes with it — orphaning a row that may already
-- carry a reimbursement, a tag or a hand-corrected category.
--
-- `external_id` holds `entry_reference`, which the API describes as unique and
-- immutable across authentication sessions. Phase 2 measured it at 100% on
-- Revolut, CIC and Boursorama — 3 368 transactions, not one missing.
--
-- Nothing writes these columns yet. This migration only makes the room.

-- CreateEnum
CREATE TYPE "app"."TransactionSource" AS ENUM ('BANKIN_CSV', 'BANK_API');

-- AlterTable
--
-- The default is the backfill: every row that exists today came from a Bankin
-- export, so declaring it as the default fills the column without an UPDATE
-- over the whole table, and without a moment where the column is nullable.
ALTER TABLE "app"."transactions"
  ADD COLUMN IF NOT EXISTS "source" "app"."TransactionSource" NOT NULL DEFAULT 'BANKIN_CSV',
  ADD COLUMN IF NOT EXISTS "external_id" TEXT,
  ADD COLUMN IF NOT EXISTS "booking_status" TEXT;

-- CreateIndex
--
-- One bank reference per account. Postgres treats NULLs as distinct in a
-- unique index, so the existing rows — all of them without a reference — never
-- collide with each other, and the constraint costs them nothing.
--
-- Not a guarantee against double counting: Boursorama reports one card
-- purchase on both the card account and the current account it settles onto,
-- with a different reference on each. This index has no objection to that, by
-- design; the rule that catches it compares across accounts.
CREATE UNIQUE INDEX IF NOT EXISTS "transactions_account_id_external_id_key"
  ON "app"."transactions"("account_id", "external_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "transactions_source_idx"
  ON "app"."transactions"("source");

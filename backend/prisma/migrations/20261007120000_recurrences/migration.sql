-- Recurrences: the charges that come back on their own, detected from the
-- expenses (src/recurrences/recurrence.detection.ts).
--
-- `recurrences` and `recurrence_transactions` are a cache, replaced for a
-- user on every recompute — after a sync, an import, a reclassification.
-- They exist as tables because the dashboard and the tag baseline decide in
-- SQL whether a line is committed, and a line belonging to an active
-- recurrence is, whatever its subcategory says.
--
-- `recurrence_decisions` is the only input: what the user confirmed or
-- dismissed, by merchant and amount bucket. It is never regenerated.
CREATE TYPE "app"."RecurrencePeriod" AS ENUM ('WEEKLY', 'FOUR_WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY');
CREATE TYPE "app"."RecurrenceStatus" AS ENUM ('ACTIVE', 'STOPPED', 'CANDIDATE');
CREATE TYPE "app"."RecurrenceDecisionKind" AS ENUM ('CONFIRMED', 'DISMISSED');

CREATE TABLE "app"."recurrences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "amount_bucket" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "category_id" TEXT,
    "subcategory_id" TEXT,
    "period" "app"."RecurrencePeriod" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "monthly_equivalent" DECIMAL(12,2) NOT NULL,
    "occurrences" INTEGER NOT NULL,
    "total_paid" DECIMAL(12,2) NOT NULL,
    "first_date" TIMESTAMP(3) NOT NULL,
    "last_date" TIMESTAMP(3) NOT NULL,
    "next_expected" TIMESTAMP(3) NOT NULL,
    "status" "app"."RecurrenceStatus" NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."recurrence_transactions" (
    "recurrence_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,

    CONSTRAINT "recurrence_transactions_pkey" PRIMARY KEY ("recurrence_id", "transaction_id")
);

CREATE TABLE "app"."recurrence_decisions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "amount_bucket" INTEGER,
    "decision" "app"."RecurrenceDecisionKind" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrence_decisions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurrences_user_id_idx" ON "app"."recurrences"("user_id");
CREATE UNIQUE INDEX "recurrences_user_id_merchant_key_amount_bucket_key"
    ON "app"."recurrences"("user_id", "merchant_key", "amount_bucket");
CREATE INDEX "recurrence_transactions_transaction_id_idx"
    ON "app"."recurrence_transactions"("transaction_id");
CREATE UNIQUE INDEX "recurrence_decisions_user_id_merchant_key_amount_bucket_key"
    ON "app"."recurrence_decisions"("user_id", "merchant_key", "amount_bucket");

ALTER TABLE "app"."recurrences"
    ADD CONSTRAINT "recurrences_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."recurrence_transactions"
    ADD CONSTRAINT "recurrence_transactions_recurrence_id_fkey"
    FOREIGN KEY ("recurrence_id") REFERENCES "app"."recurrences"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."recurrence_transactions"
    ADD CONSTRAINT "recurrence_transactions_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."recurrence_decisions"
    ADD CONSTRAINT "recurrence_decisions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

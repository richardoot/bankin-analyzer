-- One balance point per bank account per day, written at sync time.
--
-- The link keeps only the latest figure (balance_amount and friends); this
-- table keeps the series a future evolution chart will read. The collection
-- has to precede the visualisation by weeks for the chart to mean anything —
-- which is why the table ships now and the chart does not.
--
-- One row per (link, day): the sync quota allows three fetches a day and the
-- last figure of the day wins, so the series stays one clean point per day.
CREATE TABLE IF NOT EXISTS "app"."bank_account_balance_snapshots" (
    "id" TEXT NOT NULL,
    "link_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT,
    "reference_date" DATE NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_account_balance_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "bank_account_balance_snapshots_link_id_reference_date_key"
    ON "app"."bank_account_balance_snapshots"("link_id", "reference_date");

ALTER TABLE "app"."bank_account_balance_snapshots"
    ADD CONSTRAINT "bank_account_balance_snapshots_link_id_fkey"
    FOREIGN KEY ("link_id") REFERENCES "app"."bank_account_links"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."bank_account_balance_snapshots"
    ADD CONSTRAINT "bank_account_balance_snapshots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Somewhere to put what the bank sent, before deciding what it means.
--
-- Fetched transactions do not go straight into `app.transactions`. That table
-- is what reimbursements, settlements, tags and budget plans all hang off, and
-- a wrong row there is not a display bug — it silently moves totals the user
-- relies on.
--
-- Staging also buys the one thing the API will not give: another look. Most
-- ASPSPs allow four background fetches a day, so re-fetching to try a
-- different matching rule is not an option. What was fetched is kept, and the
-- rules are argued with offline.

-- CreateTable
CREATE TABLE IF NOT EXISTS "app"."bank_sync_runs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "aspsp_name" TEXT NOT NULL,
    "session_id" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
--
-- `date` is a DATE, not a timestamp. A booking date has no time of day, and
-- storing one is how the import previously drifted a day for every timezone
-- east of UTC — the drift `normalize-transaction-dates.ts` had to repair.
--
-- `raw` keeps the untouched payload: what the matcher ignores today may be
-- what it needs tomorrow, and the bank will not serve this window again.
CREATE TABLE IF NOT EXISTS "app"."bank_staged_transactions" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "external_account_id" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "external_id" TEXT,
    "booking_status" TEXT,
    "date" DATE NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "label" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_staged_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bank_sync_runs_user_id_idx" ON "app"."bank_sync_runs"("user_id");
CREATE INDEX IF NOT EXISTS "bank_sync_runs_user_id_fetched_at_idx" ON "app"."bank_sync_runs"("user_id", "fetched_at");

-- CreateIndex
--
-- One row per bank reference per account within a run, so replaying a fetch
-- upserts instead of stacking a second copy.
CREATE UNIQUE INDEX IF NOT EXISTS "bank_staged_transactions_identity_key"
  ON "app"."bank_staged_transactions"("run_id", "external_account_id", "external_id");
CREATE INDEX IF NOT EXISTS "bank_staged_transactions_user_id_idx" ON "app"."bank_staged_transactions"("user_id");
CREATE INDEX IF NOT EXISTS "bank_staged_transactions_run_id_idx" ON "app"."bank_staged_transactions"("run_id");
CREATE INDEX IF NOT EXISTS "bank_staged_transactions_user_id_date_idx" ON "app"."bank_staged_transactions"("user_id", "date");

-- AddForeignKey
ALTER TABLE "app"."bank_sync_runs" ADD CONSTRAINT "bank_sync_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bank_staged_transactions" ADD CONSTRAINT "bank_staged_transactions_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "app"."bank_sync_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."bank_staged_transactions" ADD CONSTRAINT "bank_staged_transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

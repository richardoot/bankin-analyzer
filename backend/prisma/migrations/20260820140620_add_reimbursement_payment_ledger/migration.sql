-- CreateEnum
CREATE TYPE "app"."PaymentKind" AS ENUM ('CASH', 'WRITE_OFF');

-- CreateTable
CREATE TABLE "app"."reimbursement_payments" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "reimbursement_id" TEXT NOT NULL,
    "income_transaction_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "kind" "app"."PaymentKind" NOT NULL,
    "settled_at" TIMESTAMP(3) NOT NULL,
    "settlement_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reimbursement_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reimbursement_payments_user_id_idx" ON "app"."reimbursement_payments"("user_id");

-- CreateIndex
CREATE INDEX "reimbursement_payments_reimbursement_id_idx" ON "app"."reimbursement_payments"("reimbursement_id");

-- CreateIndex
CREATE INDEX "reimbursement_payments_income_transaction_id_idx" ON "app"."reimbursement_payments"("income_transaction_id");

-- CreateIndex
CREATE INDEX "reimbursement_payments_settlement_id_idx" ON "app"."reimbursement_payments"("settlement_id");

-- AddForeignKey
ALTER TABLE "app"."reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_reimbursement_id_fkey" FOREIGN KEY ("reimbursement_id") REFERENCES "app"."reimbursement_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_income_transaction_id_fkey" FOREIGN KEY ("income_transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_payments" ADD CONSTRAINT "reimbursement_payments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "app"."settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- BACKFILL-START
-- Everything below this marker is replayed verbatim by
-- test/reimbursement-ledger-backfill.e2e-spec.ts against seeded data, so the
-- SQL that ships is the SQL that is tested. Keep the marker.
-- ---------------------------------------------------------------------------
-- Backfill: mirror every existing credit into the new ledger.
--
-- `settlement_reimbursements.amount_settled` records the credit applied to the
-- debt; `settlements.amount_used` records the cash the settlement actually drew
-- from the income transaction. When a settlement forgave a shortfall the first
-- exceeds the second, and the difference is a write-off.
--
-- Splitting that per line is only unambiguous when the settlement has a single
-- line: with several, nothing stored says which line the cash went to. The
-- production audit
-- (src/scripts/audit-reimbursement-migration.ts, run 2026-08-20) established
-- that no multi-line settlement ever forgave anything, which is what makes the
-- LEAST() below exact. That precondition is asserted rather than assumed — a
-- database where it does not hold must stop here instead of being silently
-- filled with invented numbers.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  ambiguous integer;
BEGIN
  SELECT count(*) INTO ambiguous FROM (
    SELECT s.id
    FROM "app"."settlements" s
    JOIN "app"."settlement_reimbursements" sr ON sr."settlement_id" = s."id"
    GROUP BY s."id", s."amount_used"
    HAVING count(*) > 1
       AND SUM(sr."amount_settled") > s."amount_used" + 0.005
  ) offending;

  IF ambiguous > 0 THEN
    RAISE EXCEPTION
      'Cannot backfill reimbursement_payments: % multi-line settlement(s) forgave a shortfall, so the cash cannot be attributed per line. Resolve them by hand first (see src/scripts/audit-reimbursement-migration.ts).',
      ambiguous;
  END IF;
END $$;

-- The cash half of every settled line.
INSERT INTO "app"."reimbursement_payments"
  ("id", "user_id", "reimbursement_id", "income_transaction_id", "amount", "kind", "settled_at", "settlement_id")
SELECT
  gen_random_uuid()::text,
  s."user_id",
  sr."reimbursement_id",
  s."income_transaction_id",
  LEAST(sr."amount_settled", s."amount_used"),
  'CASH',
  s."created_at",
  s."id"
FROM "app"."settlement_reimbursements" sr
JOIN "app"."settlements" s ON s."id" = sr."settlement_id"
WHERE LEAST(sr."amount_settled", s."amount_used") > 0.005;

-- The forgiven remainder, when the line credited more than the cash allowed.
INSERT INTO "app"."reimbursement_payments"
  ("id", "user_id", "reimbursement_id", "income_transaction_id", "amount", "kind", "settled_at", "settlement_id")
SELECT
  gen_random_uuid()::text,
  s."user_id",
  sr."reimbursement_id",
  NULL,
  sr."amount_settled" - LEAST(sr."amount_settled", s."amount_used"),
  'WRITE_OFF',
  s."created_at",
  s."id"
FROM "app"."settlement_reimbursements" sr
JOIN "app"."settlements" s ON s."id" = sr."settlement_id"
WHERE sr."amount_settled" - LEAST(sr."amount_settled", s."amount_used") > 0.005;

-- Credit recorded outside any settlement, by the removed
-- `PATCH /reimbursements/:id/receive`. It named no income transaction, so none
-- can be reconstructed; the settlement date falls back to the row's own last
-- update. The prod audit found none of these, but a developer database may
-- carry some and dropping them would silently change a displayed balance.
INSERT INTO "app"."reimbursement_payments"
  ("id", "user_id", "reimbursement_id", "income_transaction_id", "amount", "kind", "settled_at", "settlement_id")
SELECT
  gen_random_uuid()::text,
  rr."user_id",
  rr."id",
  NULL,
  rr."amount_received" - COALESCE(settled."total", 0),
  'CASH',
  rr."updated_at",
  NULL
FROM "app"."reimbursement_requests" rr
LEFT JOIN (
  SELECT "reimbursement_id", SUM("amount_settled") AS "total"
  FROM "app"."settlement_reimbursements"
  GROUP BY "reimbursement_id"
) settled ON settled."reimbursement_id" = rr."id"
WHERE rr."amount_received" - COALESCE(settled."total", 0) > 0.005;

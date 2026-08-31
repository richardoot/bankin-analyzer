-- Phase 6 of the reimbursement rework: drop what the payment ledger replaced.
--
-- `amount_received` and `status` were a cache of `reimbursement_payments`,
-- written alongside it in the same transaction since phase 3 so that a
-- rollback would still find the data it expected. Both are now read through
-- `creditedTotal` and `derivedStatusOf` on the way out. The API still reports
-- them; what goes away is the second copy, and with it the three code paths
-- that kept it in step by hand.
--
-- `category_id` was the income category the user hoped the money back on. It
-- drove no figure once the deduction moved onto the expense transaction
-- (9a1ebc5), and no row created since carries one. The category a debt reports
-- is the expense transaction's own, which is also what makes recategorising a
-- transaction move its debts with it.
--
-- Safe against production as it stands: reconcile-reimbursement-ledger cleared
-- all four invariants there on 2026-08-31, over 265 reimbursements, 168
-- settlements and 260 payments. Every figure these columns hold reconstructs
-- from the ledger to the cent.

-- Exists only to filter on a column that is going.
DROP INDEX IF EXISTS "app"."reimbursement_requests_status_idx";

ALTER TABLE "app"."reimbursement_requests"
  DROP COLUMN "amount_received",
  DROP COLUMN "status",
  DROP COLUMN "category_id";

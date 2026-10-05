-- Whether a debt still owed is read as money that will come back. On by
-- default: a reimbursement request says the money returns, and a loan to a
-- relative is not consumption. The dashboard and the budget used to ask
-- this on every visit, each with its own switch that forgot the answer.
ALTER TABLE "app"."filter_preferences"
  ADD COLUMN "deduct_pending_reimbursements" BOOLEAN NOT NULL DEFAULT true;

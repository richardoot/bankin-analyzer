-- Phase 6, step 1 of 4: let a category pairing be many-to-many.
--
-- ## Why
--
-- The bijection existed because a refund used to find its way back to an
-- expense *through* this table: each side had to name exactly one partner, or
-- the deduction would not have known where to go. Since the credit attaches to
-- the expense transaction, the pairing is only a hint — for the suggestion
-- engine and for pre-filling a form — and the constraint buys nothing.
--
-- What it cost: "Remboursement sante" could not feed both Sante and Pharmacie,
-- and a single expense category could not be repaid from two sources (Secu and
-- mutuelle). Users worked around it by inventing one dummy income category per
-- expense category.
--
-- ## Safety
--
-- Relaxing a constraint can never fail on existing data: every row that
-- satisfied the old rule satisfies the new one. This migration is reversible
-- by recreating the two indexes, *provided* no many-to-many row has been
-- created in the meantime — which is the point of the change, so treat it as
-- one-way once the feature is used.
--
-- The pair itself stays unique: recording the same pairing twice says nothing
-- new and would show the hint twice.

DROP INDEX "app"."category_associations_user_id_expense_category_id_key";

DROP INDEX "app"."category_associations_user_id_income_category_id_key";

CREATE UNIQUE INDEX "category_associations_user_id_expense_category_id_income_ca_key"
  ON "app"."category_associations"("user_id", "expense_category_id", "income_category_id");

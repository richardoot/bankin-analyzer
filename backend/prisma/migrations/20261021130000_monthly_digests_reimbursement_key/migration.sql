-- Monthly digests keyed on the dashboard's two reimbursement switches too.
--
-- The trends behind a paragraph are read with « remboursements reçus
-- déduits » and « remboursements en attente déduits »: each switch moves the
-- amounts the list shows. Keyed on (user, month, reading, window) alone, a
-- paragraph written with the reimbursements taken off came back once the
-- switch was off, citing figures the list no longer showed. Each pair of
-- switches now keeps its own paragraph, as each window does.
--
-- The columns hold the values the trends were read with, never an omission:
-- the service resolves an absent `deductPendingReimbursements` to the user's
-- preference before reading and before writing the row.
--
-- Defaults: both `true`, the service's defaults (received reimbursements are
-- taken off unless asked otherwise; pending ones follow the user's
-- preference, on when none is saved). Rows written before this migration
-- were most likely read that way; one that was not is at worst a paragraph
-- served under the wrong switches until « Régénérer » — the table holds
-- nothing else, and the branch has not reached production.

ALTER TABLE "app"."monthly_digests"
    ADD COLUMN "deduct_reimbursements" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "deduct_pending_reimbursements" BOOLEAN NOT NULL DEFAULT true;

DROP INDEX "app"."monthly_digests_user_id_month_reading_window_key";

CREATE UNIQUE INDEX "monthly_digests_user_id_month_reading_window_deduct_reimbur_key"
    ON "app"."monthly_digests"("user_id", "month", "reading", "window", "deduct_reimbursements", "deduct_pending_reimbursements");

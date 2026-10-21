-- Monthly digests keyed on a fingerprint of what the model read.
--
-- Keyed on (user, month, reading, window, deduct_reimbursements,
-- deduct_pending_reimbursements), a month could hold up to twelve
-- paragraphs per user, each a call to the model, and a paragraph stayed
-- stale when a line of its month was reclassified after it was written: the
-- key did not move, the figures did.
--
-- `input_hash` is the SHA-256 (hex) of the JSON the model reads, as
-- `buildDigestInput` builds it (trend.digest.ts, `digestInputHash`). A
-- paragraph is served only for the very input it was written from: views
-- that read the same figures share it, a figure that moves asks for a new
-- one. The four view columns stay, as information: they describe the view
-- the paragraph was last written for, and the service uses them to drop
-- the paragraphs of a view the figures have left behind.
--
-- The table is a cache and holds nothing else (see the first migration):
-- its rows are deleted rather than given a made-up hash, so the column can
-- be NOT NULL without a default. The next opening rewrites what it needs;
-- the branch has not reached production.

DELETE FROM "app"."monthly_digests";

ALTER TABLE "app"."monthly_digests"
    ADD COLUMN "input_hash" TEXT NOT NULL;

DROP INDEX "app"."monthly_digests_user_id_month_reading_window_deduct_reimbur_key";

CREATE UNIQUE INDEX "monthly_digests_user_id_month_input_hash_key"
    ON "app"."monthly_digests"("user_id", "month", "input_hash");

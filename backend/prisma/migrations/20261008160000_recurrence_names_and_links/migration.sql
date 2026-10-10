-- Names and hand-made links for recurring charges.
--
-- `recurrences.name`: the service a series pays for, read from its labels
-- ("CB Strava Ireland Li" is Strava) or given by the user. The table is a
-- cache; the default only covers the rows already there until the next
-- recompute fills them.
--
-- `recurrence_decisions.name`: the name the user gave, kept across
-- recomputes like every decision.
--
-- `recurrence_links`: an expense attached by hand to a series it does not
-- look like — a renewal paid another way, under another label, at another
-- price. The series is named by merchant and amount bucket, as decisions
-- name it, so the link survives the recompute that replaces its row.
ALTER TABLE "app"."recurrences" ADD COLUMN "name" TEXT NOT NULL DEFAULT '';

ALTER TABLE "app"."recurrence_decisions" ADD COLUMN "name" TEXT;

CREATE TABLE "app"."recurrence_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "merchant_key" TEXT NOT NULL,
    "amount_bucket" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurrence_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "recurrence_links_transaction_id_key"
    ON "app"."recurrence_links"("transaction_id");
CREATE INDEX "recurrence_links_user_id_idx"
    ON "app"."recurrence_links"("user_id");

ALTER TABLE "app"."recurrence_links"
    ADD CONSTRAINT "recurrence_links_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."recurrence_links"
    ADD CONSTRAINT "recurrence_links_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

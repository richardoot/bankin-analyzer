-- Subscriptions: a stable identity for the recurring charges the user has a
-- say about.
--
-- Until now what the user said about a series — followed, set aside, named,
-- given a rhythm, extended by hand — was keyed on (merchant key, amount
-- bucket): a key the series itself can outgrow when its label or its price
-- changes, leaving the user's word attached to nothing, unseen. A
-- subscription carries an id, the spellings and prices it recognises (which
-- detection widens as the series lives on), and is referenced by id from
-- the cache row of its series and from the payments attached to it.
--
-- `recurrence_decisions` and `recurrence_links` are folded into it.

ALTER TYPE "app"."RecurrenceDecisionKind" RENAME TO "SubscriptionState";

CREATE TABLE "app"."subscriptions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "state" "app"."SubscriptionState" NOT NULL,
    "name" TEXT,
    "period" "app"."RecurrencePeriod",
    "merchant_keys" TEXT[],
    "amount_buckets" INTEGER[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "app"."subscription_links" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "subscription_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_links_pkey" PRIMARY KEY ("id")
);

-- Every decision becomes a subscription, its key the first spelling and
-- price it recognises; a decision for every price recognises them all.
INSERT INTO "app"."subscriptions"
    ("id", "user_id", "state", "name", "period", "merchant_keys", "amount_buckets", "created_at", "updated_at")
SELECT
    d."id", d."user_id", d."decision", d."name", d."period",
    ARRAY[d."merchant_key"],
    CASE WHEN d."amount_bucket" IS NULL THEN ARRAY[]::INTEGER[] ELSE ARRAY[d."amount_bucket"] END,
    d."created_at", d."created_at"
FROM "app"."recurrence_decisions" d;

-- A payment attached to a series nobody had decided about yet: that series
-- becomes a followed subscription.
INSERT INTO "app"."subscriptions"
    ("id", "user_id", "state", "merchant_keys", "amount_buckets", "created_at", "updated_at")
SELECT
    gen_random_uuid()::text, l."user_id", 'CONFIRMED',
    ARRAY[l."merchant_key"], ARRAY[l."amount_bucket"],
    MIN(l."created_at"), MIN(l."created_at")
FROM "app"."recurrence_links" l
WHERE NOT EXISTS (
    SELECT 1 FROM "app"."subscriptions" s
    WHERE s."user_id" = l."user_id"
      AND l."merchant_key" = ANY(s."merchant_keys")
      AND (cardinality(s."amount_buckets") = 0 OR l."amount_bucket" = ANY(s."amount_buckets"))
)
GROUP BY l."user_id", l."merchant_key", l."amount_bucket";

INSERT INTO "app"."subscription_links"
    ("id", "user_id", "subscription_id", "transaction_id", "created_at")
SELECT
    l."id", l."user_id",
    (
        SELECT s."id" FROM "app"."subscriptions" s
        WHERE s."user_id" = l."user_id"
          AND l."merchant_key" = ANY(s."merchant_keys")
          AND (cardinality(s."amount_buckets") = 0 OR l."amount_bucket" = ANY(s."amount_buckets"))
        ORDER BY (s."state" = 'CONFIRMED') DESC, s."created_at"
        LIMIT 1
    ),
    l."transaction_id", l."created_at"
FROM "app"."recurrence_links" l;

DROP TABLE "app"."recurrence_links";
DROP TABLE "app"."recurrence_decisions";

-- The cache row of a subscription's series. Rebuilt on the next recompute.
ALTER TABLE "app"."recurrences" ADD COLUMN "subscription_id" TEXT;

CREATE INDEX "subscriptions_user_id_idx" ON "app"."subscriptions"("user_id");
CREATE UNIQUE INDEX "subscription_links_transaction_id_key"
    ON "app"."subscription_links"("transaction_id");
CREATE INDEX "subscription_links_user_id_idx" ON "app"."subscription_links"("user_id");
CREATE INDEX "subscription_links_subscription_id_idx"
    ON "app"."subscription_links"("subscription_id");
CREATE UNIQUE INDEX "recurrences_subscription_id_key"
    ON "app"."recurrences"("subscription_id");

ALTER TABLE "app"."subscriptions"
    ADD CONSTRAINT "subscriptions_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."subscription_links"
    ADD CONSTRAINT "subscription_links_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."subscription_links"
    ADD CONSTRAINT "subscription_links_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "app"."subscriptions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."subscription_links"
    ADD CONSTRAINT "subscription_links_transaction_id_fkey"
    FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."recurrences"
    ADD CONSTRAINT "recurrences_subscription_id_fkey"
    FOREIGN KEY ("subscription_id") REFERENCES "app"."subscriptions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

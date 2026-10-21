-- Monthly digests: the paragraph Claude writes under « Ce qui change », from
-- the trends of a closed month and nothing else (see
-- agent-os/product/spending-trends.md, lot 5).
--
-- Remembered rather than written on every opening: a closed month does not
-- change, so the model is asked once, at the first opening, and again only
-- when the user presses « Régénérer ».
--
-- One row per user, month, reading AND window. The plan keyed it on
-- (user, month, reading); the window is added because the card changes
-- window (3, 6 or 12 months) and every habit trend moves with it: a
-- paragraph written against 6 months would cite figures the 3-month list no
-- longer shows. Each window keeps its own paragraph.
--
-- `insights` holds the JSON the model read, as it read it, so a paragraph
-- can always be traced back to its figures. `input_tokens` and
-- `output_tokens` are the bill of the call that wrote it.
--
-- Nothing else depends on this table: dropping it (DROP TABLE
-- "app"."monthly_digests") loses only paragraphs the next opening rewrites.

CREATE TABLE "app"."monthly_digests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "reading" TEXT NOT NULL,
    "window" INTEGER NOT NULL,
    "insights" JSONB NOT NULL,
    "text" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "generated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monthly_digests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "monthly_digests_user_id_month_reading_window_key"
    ON "app"."monthly_digests"("user_id", "month", "reading", "window");

ALTER TABLE "app"."monthly_digests"
    ADD CONSTRAINT "monthly_digests_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

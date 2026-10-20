-- Tag families: a genre above the tag — « Voyages », « HYROX », « Concerts »
-- — so that editions of the same kind of event can be read together (see
-- agent-os/product/tag-families.md).
--
-- Defined by the user, one level only: a tag belongs to zero or one family.
-- The family changes no existing computation; every reading of a family is
-- the union of its tags. Nothing is seeded: a family exists once the user
-- has named one.
--
-- `annual_budget` is the family's envelope over a calendar year. The column
-- is laid now so the model is whole; it is read from lot 3 on.
--
-- Deleting a family leaves its tags without one (ON DELETE SET NULL), never
-- deletes them: the family is only a grouping, nothing depends on it.

CREATE TABLE "app"."tag_families" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "icon" TEXT,
    "annual_budget" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tag_families_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "tag_families_user_id_idx" ON "app"."tag_families"("user_id");
CREATE UNIQUE INDEX "tag_families_user_id_name_key"
    ON "app"."tag_families"("user_id", "name");

ALTER TABLE "app"."tag_families"
    ADD CONSTRAINT "tag_families_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "app"."tags" ADD COLUMN "family_id" TEXT;

CREATE INDEX "tags_family_id_idx" ON "app"."tags"("family_id");

ALTER TABLE "app"."tags"
    ADD CONSTRAINT "tags_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "app"."tag_families"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Whether an import adopts the categories written in the file.
--
-- Defaults to true, which is how every import has behaved so far: existing
-- rows keep their behaviour without a backfill, and a user who never opens the
-- setting sees no change.
ALTER TABLE "app"."filter_preferences"
  ADD COLUMN IF NOT EXISTS "import_categories_from_file" BOOLEAN NOT NULL DEFAULT true;

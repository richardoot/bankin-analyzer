-- Staleness of the recurrence cache, kept by the database itself.
--
-- The cache used to be recomputed by the application after the writes it
-- knew about — a sync, an import, a reclassification — and silently went
-- stale after the ones it did not: a category or an account deleted (their
-- transactions changed or removed by cascade), a sync or an import undone,
-- a script. Triggers on `transactions` now bump a per-user version on every
-- change that matters to detection; a reader recomputes when the version is
-- ahead of the one the cache was built from.
--
-- A version rather than a timestamp: a recompute records the version it
-- read before reading the ledger, so a change committed while it ran leaves
-- the cache stale rather than being lost.

CREATE TABLE "app"."recurrence_states" (
    "user_id" TEXT NOT NULL,
    "version" BIGINT NOT NULL DEFAULT 0,
    "computed_version" BIGINT,
    "computed_at" TIMESTAMP(3),

    CONSTRAINT "recurrence_states_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "app"."recurrence_states"
    ADD CONSTRAINT "recurrence_states_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "app"."users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Bump the version of every user a statement touched. Users being deleted
-- (their transactions go by cascade) are skipped: their state goes with them.
CREATE FUNCTION "app"."bump_recurrence_version"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "app"."recurrence_states" ("user_id", "version")
    SELECT DISTINCT c."user_id", 1
    FROM changed_rows c
    WHERE EXISTS (SELECT 1 FROM "app"."users" u WHERE u."id" = c."user_id")
    ON CONFLICT ("user_id")
    DO UPDATE SET "version" = "app"."recurrence_states"."version" + 1;
    RETURN NULL;
END;
$$;

-- An update only matters when it changes what detection reads: pointing a
-- line or writing a note does not.
CREATE FUNCTION "app"."bump_recurrence_version_on_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "app"."recurrence_states" ("user_id", "version")
    SELECT DISTINCT n."user_id", 1
    FROM changed_rows n
    JOIN old_rows o ON o."id" = n."id"
    WHERE (n."date", n."amount", n."description", n."type", n."category_id", n."subcategory_id")
          IS DISTINCT FROM
          (o."date", o."amount", o."description", o."type", o."category_id", o."subcategory_id")
      AND EXISTS (SELECT 1 FROM "app"."users" u WHERE u."id" = n."user_id")
    ON CONFLICT ("user_id")
    DO UPDATE SET "version" = "app"."recurrence_states"."version" + 1;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "transactions_bump_recurrence_version_insert"
    AFTER INSERT ON "app"."transactions"
    REFERENCING NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION "app"."bump_recurrence_version"();

CREATE TRIGGER "transactions_bump_recurrence_version_delete"
    AFTER DELETE ON "app"."transactions"
    REFERENCING OLD TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION "app"."bump_recurrence_version"();

CREATE TRIGGER "transactions_bump_recurrence_version_update"
    AFTER UPDATE ON "app"."transactions"
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION "app"."bump_recurrence_version_on_update"();

-- Recurrences show the user's share of a charge: a joint account's amounts
-- are divided by its divisor, as everywhere else. The cache now depends on
-- the account a line is on and on that account's divisor, so changing
-- either marks it stale.

-- A line moved to another account changes its share.
CREATE OR REPLACE FUNCTION "app"."bump_recurrence_version_on_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "app"."recurrence_states" ("user_id", "version")
    SELECT DISTINCT n."user_id", 1
    FROM changed_rows n
    JOIN old_rows o ON o."id" = n."id"
    WHERE (n."date", n."amount", n."description", n."type", n."category_id", n."subcategory_id", n."account_id")
          IS DISTINCT FROM
          (o."date", o."amount", o."description", o."type", o."category_id", o."subcategory_id", o."account_id")
      AND EXISTS (SELECT 1 FROM "app"."users" u WHERE u."id" = n."user_id")
    ON CONFLICT ("user_id")
    DO UPDATE SET "version" = "app"."recurrence_states"."version" + 1;
    RETURN NULL;
END;
$$;

-- A divisor changed in the settings changes every share on the account.
CREATE FUNCTION "app"."bump_recurrence_version_on_account_update"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO "app"."recurrence_states" ("user_id", "version")
    SELECT DISTINCT n."user_id", 1
    FROM changed_rows n
    JOIN old_rows o ON o."id" = n."id"
    WHERE n."divisor" IS DISTINCT FROM o."divisor"
      AND EXISTS (SELECT 1 FROM "app"."users" u WHERE u."id" = n."user_id")
    ON CONFLICT ("user_id")
    DO UPDATE SET "version" = "app"."recurrence_states"."version" + 1;
    RETURN NULL;
END;
$$;

CREATE TRIGGER "accounts_bump_recurrence_version_update"
    AFTER UPDATE ON "app"."accounts"
    REFERENCING OLD TABLE AS old_rows NEW TABLE AS changed_rows
    FOR EACH STATEMENT EXECUTE FUNCTION "app"."bump_recurrence_version_on_account_update"();

-- Every cache built so far holds the bank's amounts: rebuild them.
UPDATE "app"."recurrence_states" SET "version" = "version" + 1;

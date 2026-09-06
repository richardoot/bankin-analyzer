-- A bank connection was found again on `completeAuthorization` by
-- `aspsp_name` alone, read from `session.aspsp` — the bank's own echo, not
-- guaranteed to repeat the string this application asked `POST /auth` with.
-- Once, for real, it did not, and the lookup missed: a second connection was
-- created for a bank already connected.
--
-- `bank_authorization_attempts` carries the canonical name across that gap —
-- resolved against `GET /aspsps` when the authorization started, addressed by
-- `state`, the one value already threaded through the whole redirect. The
-- unique constraint on `bank_connections` is the backstop: once the lookup
-- trusts the canonical name, a real duplicate becomes a loud error instead of
-- a silent one.
--
-- (An earlier attempt at this used `psu_id_hash` instead. Measured against
-- the real API before committing to it: the same `psu_id` produces the same
-- hash for every bank, not one per bank, so it cannot tell two connections of
-- the same user apart. Abandoned for that reason.)

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "bank_connections_user_id_aspsp_country_aspsp_name_key"
  ON "app"."bank_connections"("user_id", "aspsp_country", "aspsp_name");

-- CreateTable
CREATE TABLE IF NOT EXISTS "app"."bank_authorization_attempts" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "aspsp_name" TEXT NOT NULL,
    "aspsp_country" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bank_authorization_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "bank_authorization_attempts_created_at_idx"
  ON "app"."bank_authorization_attempts"("created_at");

-- AddForeignKey
ALTER TABLE "app"."bank_authorization_attempts" ADD CONSTRAINT "bank_authorization_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

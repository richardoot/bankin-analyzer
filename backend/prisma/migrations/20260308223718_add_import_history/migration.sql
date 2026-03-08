-- CreateTable
CREATE TABLE "app"."import_histories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transactions_imported" INTEGER NOT NULL,
    "categories_created" INTEGER NOT NULL,
    "duplicates_skipped" INTEGER NOT NULL,
    "total_in_file" INTEGER NOT NULL,
    "date_range_start" TIMESTAMP(3) NOT NULL,
    "date_range_end" TIMESTAMP(3) NOT NULL,
    "accounts" TEXT[],
    "file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_histories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_histories_user_id_idx" ON "app"."import_histories"("user_id");

-- CreateIndex
CREATE INDEX "import_histories_user_id_created_at_idx" ON "app"."import_histories"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "app"."import_histories" ADD CONSTRAINT "import_histories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

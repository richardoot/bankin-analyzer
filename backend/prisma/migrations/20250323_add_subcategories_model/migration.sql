-- CreateTable
CREATE TABLE "app"."subcategories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subcategories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "subcategories_user_id_idx" ON "app"."subcategories"("user_id");

-- CreateIndex
CREATE INDEX "subcategories_category_id_idx" ON "app"."subcategories"("category_id");

-- CreateIndex
CREATE UNIQUE INDEX "subcategories_category_id_name_key" ON "app"."subcategories"("category_id", "name");

-- AddForeignKey
ALTER TABLE "app"."subcategories" ADD CONSTRAINT "subcategories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."subcategories" ADD CONSTRAINT "subcategories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: Add subcategory_id to transactions
ALTER TABLE "app"."transactions" ADD COLUMN "subcategory_id" TEXT;

-- CreateIndex
CREATE INDEX "transactions_subcategory_id_idx" ON "app"."transactions"("subcategory_id");

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_subcategory_id_fkey" FOREIGN KEY ("subcategory_id") REFERENCES "app"."subcategories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

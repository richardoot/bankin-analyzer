-- CreateTable
CREATE TABLE "app"."category_associations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expense_category_id" TEXT NOT NULL,
    "income_category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "category_associations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "category_associations_user_id_idx" ON "app"."category_associations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_associations_user_id_expense_category_id_key" ON "app"."category_associations"("user_id", "expense_category_id");

-- CreateIndex
CREATE UNIQUE INDEX "category_associations_user_id_income_category_id_key" ON "app"."category_associations"("user_id", "income_category_id");

-- AddForeignKey
ALTER TABLE "app"."category_associations" ADD CONSTRAINT "category_associations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."category_associations" ADD CONSTRAINT "category_associations_expense_category_id_fkey" FOREIGN KEY ("expense_category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."category_associations" ADD CONSTRAINT "category_associations_income_category_id_fkey" FOREIGN KEY ("income_category_id") REFERENCES "app"."categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

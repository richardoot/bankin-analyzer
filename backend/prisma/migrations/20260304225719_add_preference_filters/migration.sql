-- CreateTable
CREATE TABLE "filter_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joint_accounts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden_expense_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "hidden_income_categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_associations" JSONB NOT NULL DEFAULT '[]',
    "is_panel_expanded" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filter_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filter_preferences_user_id_key" ON "filter_preferences"("user_id");

-- AddForeignKey
ALTER TABLE "filter_preferences" ADD CONSTRAINT "filter_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

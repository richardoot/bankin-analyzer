-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "app";

-- CreateEnum
CREATE TYPE "app"."TransactionType" AS ENUM ('EXPENSE', 'INCOME');

-- CreateEnum
CREATE TYPE "app"."ReimbursementStatus" AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED');

-- CreateTable
CREATE TABLE "app"."users" (
    "id" TEXT NOT NULL,
    "supabase_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."transactions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category_id" TEXT,
    "hash" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "app"."TransactionType" NOT NULL,
    "account" TEXT NOT NULL,
    "subcategory" TEXT,
    "note" TEXT,
    "is_pointed" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."categories" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "app"."TransactionType" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."filter_preferences" (
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

-- CreateTable
CREATE TABLE "app"."persons" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app"."reimbursement_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "category_id" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "amount_received" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" "app"."ReimbursementStatus" NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reimbursement_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_supabase_id_key" ON "app"."users"("supabase_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "app"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_hash_key" ON "app"."transactions"("hash");

-- CreateIndex
CREATE INDEX "transactions_user_id_idx" ON "app"."transactions"("user_id");

-- CreateIndex
CREATE INDEX "transactions_user_id_date_idx" ON "app"."transactions"("user_id", "date");

-- CreateIndex
CREATE INDEX "transactions_type_idx" ON "app"."transactions"("type");

-- CreateIndex
CREATE UNIQUE INDEX "categories_user_id_name_type_key" ON "app"."categories"("user_id", "name", "type");

-- CreateIndex
CREATE UNIQUE INDEX "filter_preferences_user_id_key" ON "app"."filter_preferences"("user_id");

-- CreateIndex
CREATE INDEX "persons_user_id_idx" ON "app"."persons"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "persons_user_id_name_key" ON "app"."persons"("user_id", "name");

-- CreateIndex
CREATE INDEX "reimbursement_requests_user_id_idx" ON "app"."reimbursement_requests"("user_id");

-- CreateIndex
CREATE INDEX "reimbursement_requests_transaction_id_idx" ON "app"."reimbursement_requests"("transaction_id");

-- CreateIndex
CREATE INDEX "reimbursement_requests_person_id_idx" ON "app"."reimbursement_requests"("person_id");

-- CreateIndex
CREATE INDEX "reimbursement_requests_status_idx" ON "app"."reimbursement_requests"("status");

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."transactions" ADD CONSTRAINT "transactions_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."categories" ADD CONSTRAINT "categories_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."filter_preferences" ADD CONSTRAINT "filter_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."persons" ADD CONSTRAINT "persons_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_transaction_id_fkey" FOREIGN KEY ("transaction_id") REFERENCES "app"."transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "app"."persons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app"."reimbursement_requests" ADD CONSTRAINT "reimbursement_requests_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "app"."categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;


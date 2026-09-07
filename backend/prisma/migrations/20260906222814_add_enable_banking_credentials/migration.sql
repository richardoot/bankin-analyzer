-- CreateTable
CREATE TABLE "app"."enable_banking_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "application_id" TEXT NOT NULL,
    "encrypted_private_key" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enable_banking_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enable_banking_credentials_user_id_key" ON "app"."enable_banking_credentials"("user_id");

-- AddForeignKey
ALTER TABLE "app"."enable_banking_credentials" ADD CONSTRAINT "enable_banking_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

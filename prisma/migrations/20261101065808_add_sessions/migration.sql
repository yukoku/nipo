-- CreateTable
CREATE TABLE "sessions" (
    "id" SERIAL NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "sales_staff_id" INTEGER NOT NULL,
    "csrf_token" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_sales_staff_id_idx" ON "sessions"("sales_staff_id");

-- CreateIndex
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_sales_staff_id_fkey" FOREIGN KEY ("sales_staff_id") REFERENCES "sales_staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

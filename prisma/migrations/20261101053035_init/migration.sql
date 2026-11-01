-- CreateEnum
CREATE TYPE "role" AS ENUM ('sales', 'manager', 'admin');

-- CreateEnum
CREATE TYPE "report_status" AS ENUM ('draft', 'submitted');

-- CreateEnum
CREATE TYPE "comment_target" AS ENUM ('problem', 'plan');

-- CreateTable
CREATE TABLE "sales_staff" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "department" VARCHAR(50),
    "role" "role" NOT NULL DEFAULT 'sales',
    "manager_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" SERIAL NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "contact_person" VARCHAR(50),
    "phone" VARCHAR(20),
    "address" VARCHAR(200),
    "assigned_sales_id" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_reports" (
    "id" SERIAL NOT NULL,
    "sales_staff_id" INTEGER NOT NULL,
    "report_date" DATE NOT NULL,
    "problem" TEXT,
    "plan" TEXT,
    "status" "report_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_records" (
    "id" SERIAL NOT NULL,
    "daily_report_id" INTEGER NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "visited_at" TIME(0),
    "content" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visit_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" SERIAL NOT NULL,
    "daily_report_id" INTEGER NOT NULL,
    "commenter_id" INTEGER NOT NULL,
    "target" "comment_target" NOT NULL,
    "body" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sales_staff_email_key" ON "sales_staff"("email");

-- CreateIndex
CREATE INDEX "sales_staff_manager_id_idx" ON "sales_staff"("manager_id");

-- CreateIndex
CREATE INDEX "customers_assigned_sales_id_idx" ON "customers"("assigned_sales_id");

-- CreateIndex
CREATE INDEX "daily_reports_report_date_idx" ON "daily_reports"("report_date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_reports_sales_staff_id_report_date_key" ON "daily_reports"("sales_staff_id", "report_date");

-- CreateIndex
CREATE INDEX "visit_records_daily_report_id_sort_order_idx" ON "visit_records"("daily_report_id", "sort_order");

-- CreateIndex
CREATE INDEX "visit_records_customer_id_idx" ON "visit_records"("customer_id");

-- CreateIndex
CREATE INDEX "comments_daily_report_id_created_at_idx" ON "comments"("daily_report_id", "created_at");

-- CreateIndex
CREATE INDEX "comments_commenter_id_idx" ON "comments"("commenter_id");

-- AddForeignKey
ALTER TABLE "sales_staff" ADD CONSTRAINT "sales_staff_manager_id_fkey" FOREIGN KEY ("manager_id") REFERENCES "sales_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_assigned_sales_id_fkey" FOREIGN KEY ("assigned_sales_id") REFERENCES "sales_staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_reports" ADD CONSTRAINT "daily_reports_sales_staff_id_fkey" FOREIGN KEY ("sales_staff_id") REFERENCES "sales_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_records" ADD CONSTRAINT "visit_records_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_records" ADD CONSTRAINT "visit_records_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_daily_report_id_fkey" FOREIGN KEY ("daily_report_id") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_commenter_id_fkey" FOREIGN KEY ("commenter_id") REFERENCES "sales_staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

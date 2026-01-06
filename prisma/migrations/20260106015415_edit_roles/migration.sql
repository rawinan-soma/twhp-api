/*
  Warnings:

  - The values [Provicial] on the enum `Roles` will be removed. If these variants are still used in the database, this will fail.
  - You are about to drop the `ProvicialOfficers` table. If the table is not empty, all the data it contains will be lost.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "Roles_new" AS ENUM ('Factory', 'Provincial', 'Evaluator', 'DOED');
ALTER TABLE "Accounts" ALTER COLUMN "role" TYPE "Roles_new" USING ("role"::text::"Roles_new");
ALTER TYPE "Roles" RENAME TO "Roles_old";
ALTER TYPE "Roles_new" RENAME TO "Roles";
DROP TYPE "public"."Roles_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "ProvicialOfficers" DROP CONSTRAINT "ProvicialOfficers_account_id_fkey";

-- DropForeignKey
ALTER TABLE "ProvicialOfficers" DROP CONSTRAINT "ProvicialOfficers_province_id_fkey";

-- DropTable
DROP TABLE "ProvicialOfficers";

-- CreateTable
CREATE TABLE "ProvincialOfficers" (
    "account_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "province_id" INTEGER NOT NULL,

    CONSTRAINT "ProvincialOfficers_pkey" PRIMARY KEY ("account_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProvincialOfficers_account_id_key" ON "ProvincialOfficers"("account_id");

-- AddForeignKey
ALTER TABLE "ProvincialOfficers" ADD CONSTRAINT "ProvincialOfficers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvincialOfficers" ADD CONSTRAINT "ProvincialOfficers_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "Provinces"("province_id") ON DELETE RESTRICT ON UPDATE CASCADE;

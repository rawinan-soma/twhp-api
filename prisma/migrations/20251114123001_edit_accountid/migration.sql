/*
  Warnings:

  - The primary key for the `AdminsDoed` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `AdminsDoed` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "AdminsDoed" DROP CONSTRAINT "AdminsDoed_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "AdminsDoed_pkey" PRIMARY KEY ("account_id");

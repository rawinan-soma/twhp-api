/*
  Warnings:

  - The primary key for the `Evaluators` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Evaluators` table. All the data in the column will be lost.
  - The primary key for the `Factories` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `Factories` table. All the data in the column will be lost.
  - The primary key for the `ProvicialOfficers` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `id` on the `ProvicialOfficers` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Evaluators" DROP CONSTRAINT "Evaluators_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Evaluators_pkey" PRIMARY KEY ("account_id");

-- AlterTable
ALTER TABLE "Factories" DROP CONSTRAINT "Factories_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "Factories_pkey" PRIMARY KEY ("account_id");

-- AlterTable
ALTER TABLE "ProvicialOfficers" DROP CONSTRAINT "ProvicialOfficers_pkey",
DROP COLUMN "id",
ADD CONSTRAINT "ProvicialOfficers_pkey" PRIMARY KEY ("account_id");

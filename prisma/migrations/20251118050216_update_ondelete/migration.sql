-- DropForeignKey
ALTER TABLE "Evaluators" DROP CONSTRAINT "Evaluators_account_id_fkey";

-- DropForeignKey
ALTER TABLE "Factories" DROP CONSTRAINT "Factories_account_id_fkey";

-- DropForeignKey
ALTER TABLE "ProvicialOfficers" DROP CONSTRAINT "ProvicialOfficers_account_id_fkey";

-- AddForeignKey
ALTER TABLE "Evaluators" ADD CONSTRAINT "Evaluators_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvicialOfficers" ADD CONSTRAINT "ProvicialOfficers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factories" ADD CONSTRAINT "Factories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

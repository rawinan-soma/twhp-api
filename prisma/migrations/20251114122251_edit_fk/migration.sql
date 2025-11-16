-- DropForeignKey
ALTER TABLE "AdminsDoed" DROP CONSTRAINT "AdminsDoed_account_id_fkey";

-- AddForeignKey
ALTER TABLE "AdminsDoed" ADD CONSTRAINT "AdminsDoed_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "enrolls" ALTER COLUMN "safety_officer_email" DROP NOT NULL,
ALTER COLUMN "safety_officer_phone" DROP NOT NULL,
ALTER COLUMN "safety_officer_lineID" DROP NOT NULL;

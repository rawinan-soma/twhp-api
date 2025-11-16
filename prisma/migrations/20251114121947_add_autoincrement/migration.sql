-- AlterTable
CREATE SEQUENCE accounts_id_seq;
ALTER TABLE "Accounts" ALTER COLUMN "id" SET DEFAULT nextval('accounts_id_seq');
ALTER SEQUENCE accounts_id_seq OWNED BY "Accounts"."id";

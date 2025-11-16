-- AlterTable
CREATE SEQUENCE adminsdoed_id_seq;
ALTER TABLE "AdminsDoed" ALTER COLUMN "id" SET DEFAULT nextval('adminsdoed_id_seq');
ALTER SEQUENCE adminsdoed_id_seq OWNED BY "AdminsDoed"."id";

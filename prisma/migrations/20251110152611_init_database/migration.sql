-- CreateEnum
CREATE TYPE "Roles" AS ENUM ('Factory', 'Provicial', 'Evaluator', 'DOED');

-- CreateEnum
CREATE TYPE "EvaluatorLevels" AS ENUM ('Mental', 'DOH', 'ODPC');

-- CreateTable
CREATE TABLE "Accounts" (
    "id" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "role" "Roles" NOT NULL,

    CONSTRAINT "Accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdminsDoed" (
    "id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,

    CONSTRAINT "AdminsDoed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evaluators" (
    "id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "level" "EvaluatorLevels" NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "region" INTEGER NOT NULL,
    "phone_number" TEXT NOT NULL,

    CONSTRAINT "Evaluators_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProvicialOfficers" (
    "id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "province_id" INTEGER NOT NULL,

    CONSTRAINT "ProvicialOfficers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Factories" (
    "id" INTEGER NOT NULL,
    "account_id" INTEGER NOT NULL,
    "factory_type" INTEGER NOT NULL,
    "name_th" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "tsic_code" TEXT NOT NULL,
    "address_no" TEXT NOT NULL,
    "soi" TEXT NOT NULL,
    "road" TEXT NOT NULL,
    "zipcode" TEXT NOT NULL,
    "phone_number" TEXT NOT NULL,
    "fax_number" TEXT NOT NULL,
    "province_id" INTEGER NOT NULL,
    "district_id" INTEGER NOT NULL,
    "subdistrict_id" INTEGER NOT NULL,

    CONSTRAINT "Factories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provinces" (
    "province_id" INTEGER NOT NULL,
    "name_th" TEXT NOT NULL,
    "health_region" INTEGER NOT NULL,

    CONSTRAINT "Provinces_pkey" PRIMARY KEY ("province_id")
);

-- CreateTable
CREATE TABLE "Districts" (
    "district_id" INTEGER NOT NULL,
    "province_id" INTEGER NOT NULL,
    "name_th" TEXT NOT NULL,

    CONSTRAINT "Districts_pkey" PRIMARY KEY ("district_id")
);

-- CreateTable
CREATE TABLE "Subdistricts" (
    "subdistrict_id" INTEGER NOT NULL,
    "name_th" TEXT NOT NULL,
    "district_id" INTEGER NOT NULL,

    CONSTRAINT "Subdistricts_pkey" PRIMARY KEY ("subdistrict_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_id_key" ON "Accounts"("id");

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_username_key" ON "Accounts"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Accounts_email_key" ON "Accounts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AdminsDoed_account_id_key" ON "AdminsDoed"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Evaluators_account_id_key" ON "Evaluators"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "ProvicialOfficers_account_id_key" ON "ProvicialOfficers"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Factories_account_id_key" ON "Factories"("account_id");

-- CreateIndex
CREATE UNIQUE INDEX "Provinces_province_id_key" ON "Provinces"("province_id");

-- CreateIndex
CREATE UNIQUE INDEX "Districts_district_id_key" ON "Districts"("district_id");

-- CreateIndex
CREATE UNIQUE INDEX "Subdistricts_subdistrict_id_key" ON "Subdistricts"("subdistrict_id");

-- AddForeignKey
ALTER TABLE "AdminsDoed" ADD CONSTRAINT "AdminsDoed_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evaluators" ADD CONSTRAINT "Evaluators_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvicialOfficers" ADD CONSTRAINT "ProvicialOfficers_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProvicialOfficers" ADD CONSTRAINT "ProvicialOfficers_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "Provinces"("province_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factories" ADD CONSTRAINT "Factories_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "Accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factories" ADD CONSTRAINT "Factories_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "Provinces"("province_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factories" ADD CONSTRAINT "Factories_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "Districts"("district_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Factories" ADD CONSTRAINT "Factories_subdistrict_id_fkey" FOREIGN KEY ("subdistrict_id") REFERENCES "Subdistricts"("subdistrict_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Districts" ADD CONSTRAINT "Districts_province_id_fkey" FOREIGN KEY ("province_id") REFERENCES "Provinces"("province_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subdistricts" ADD CONSTRAINT "Subdistricts_district_id_fkey" FOREIGN KEY ("district_id") REFERENCES "Districts"("district_id") ON DELETE RESTRICT ON UPDATE CASCADE;

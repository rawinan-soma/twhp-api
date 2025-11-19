-- CreateTable
CREATE TABLE "enrolls" (
    "id" SERIAL NOT NULL,
    "enroll_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "factory_id" INTEGER NOT NULL,
    "eval_doh_id" INTEGER NOT NULL,
    "eval_odpc_id" INTEGER NOT NULL,
    "eval_mental_id" INTEGER NOT NULL,
    "employee_th_m" INTEGER NOT NULL,
    "employee_mm_m" INTEGER NOT NULL,
    "employee_kh_m" INTEGER NOT NULL,
    "employee_la_m" INTEGER NOT NULL,
    "employee_vn_m" INTEGER NOT NULL,
    "employee_cn_m" INTEGER NOT NULL,
    "employee_ph_m" INTEGER NOT NULL,
    "employee_jp_m" INTEGER NOT NULL,
    "employee_in_m" INTEGER NOT NULL,
    "employee_other_m" INTEGER NOT NULL,
    "employee_th_f" INTEGER NOT NULL,
    "employee_mm_f" INTEGER NOT NULL,
    "employee_kh_f" INTEGER NOT NULL,
    "employee_la_f" INTEGER NOT NULL,
    "employee_vn_f" INTEGER NOT NULL,
    "employee_cn_f" INTEGER NOT NULL,
    "employee_ph_f" INTEGER NOT NULL,
    "employee_jp_f" INTEGER NOT NULL,
    "employee_in_f" INTEGER NOT NULL,
    "employee_other_f" INTEGER NOT NULL,
    "standard_HC" BOOLEAN NOT NULL,
    "standard_SAN" BOOLEAN NOT NULL,
    "standard_wellness" BOOLEAN NOT NULL,
    "standard_safety" BOOLEAN NOT NULL,
    "standard_TIS18001" BOOLEAN NOT NULL,
    "standard_ISO45001" BOOLEAN NOT NULL,
    "standard_ISO14001" BOOLEAN NOT NULL,
    "standard_zero" BOOLEAN NOT NULL,
    "standard_5S" BOOLEAN NOT NULL,
    "standard_HAS" BOOLEAN NOT NULL,
    "safety_officer_prefix" TEXT NOT NULL,
    "safety_officer_first_name" TEXT NOT NULL,
    "safety_officer_last_name" TEXT NOT NULL,
    "safety_officer_position" TEXT NOT NULL,
    "safety_officer_email" TEXT NOT NULL,
    "safety_officer_phone" TEXT NOT NULL,
    "safety_officer_lineID" TEXT NOT NULL,

    CONSTRAINT "enrolls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrolls_id_key" ON "enrolls"("id");

-- AddForeignKey
ALTER TABLE "enrolls" ADD CONSTRAINT "enrolls_factory_id_fkey" FOREIGN KEY ("factory_id") REFERENCES "Factories"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolls" ADD CONSTRAINT "enrolls_eval_doh_id_fkey" FOREIGN KEY ("eval_doh_id") REFERENCES "Evaluators"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolls" ADD CONSTRAINT "enrolls_eval_odpc_id_fkey" FOREIGN KEY ("eval_odpc_id") REFERENCES "Evaluators"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enrolls" ADD CONSTRAINT "enrolls_eval_mental_id_fkey" FOREIGN KEY ("eval_mental_id") REFERENCES "Evaluators"("account_id") ON DELETE CASCADE ON UPDATE CASCADE;

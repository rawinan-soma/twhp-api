import { pgTable, timestamp, text, integer, uniqueIndex, boolean, serial, pgEnum } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const evaluatorLevels = pgEnum("EvaluatorLevels", ["Mental", "DOH", "ODPC"]);
export const roles = pgEnum("Roles", ["Factory", "Provincial", "Evaluator", "DOED"]);

export const evaluators = pgTable("Evaluators", {
  accountId: integer("account_id")
    .primaryKey()
    .notNull()
    .references(() => accounts.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    }),
  level: evaluatorLevels().notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  region: integer().notNull(),
  phoneNumber: text("phone_number").notNull(),
  isChangePassword: boolean().default(false).notNull(),
});

export const provinces = pgTable(
  "Provinces",
  {
    provinceId: integer("province_id").primaryKey().notNull(),
    nameTh: text("name_th").notNull(),
    healthRegion: integer("health_region").notNull(),
  },
  (table) => [
    uniqueIndex("Provinces_province_id_key").using("btree", table.provinceId.asc().nullsLast().op("int4_ops")),
  ],
);

export const districts = pgTable(
  "Districts",
  {
    districtId: integer("district_id").primaryKey().notNull(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.provinceId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    nameTh: text("name_th").notNull(),
  },
  (table) => [
    uniqueIndex("Districts_district_id_key").using("btree", table.districtId.asc().nullsLast().op("int4_ops")),
  ],
);

export const subdistricts = pgTable(
  "Subdistricts",
  {
    subdistrictId: integer("subdistrict_id").primaryKey().notNull(),
    nameTh: text("name_th").notNull(),
    districtId: integer("district_id")
      .notNull()
      .references(() => districts.districtId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("Subdistricts_subdistrict_id_key").using("btree", table.subdistrictId.asc().nullsLast().op("int4_ops")),
  ],
);

export const factories = pgTable("Factories", {
  accountId: integer("account_id")
    .primaryKey()
    .notNull()
    .references(() => accounts.id, {
      onUpdate: "cascade",
      onDelete: "cascade",
    }),
  factoryType: integer("factory_type").notNull(),
  nameTh: text("name_th").notNull(),
  nameEn: text("name_en").notNull(),
  tsicCode: text("tsic_code").notNull(),
  addressNo: text("address_no").notNull(),
  soi: text(),
  road: text(),
  zipcode: text().notNull(),
  phoneNumber: text("phone_number").notNull(),
  faxNumber: text("fax_number"),
  provinceId: integer("province_id")
    .notNull()
    .references(() => provinces.provinceId, {
      onUpdate: "cascade",
      onDelete: "restrict",
    }),
  districtId: integer("district_id")
    .notNull()
    .references(() => districts.districtId, {
      onUpdate: "cascade",
      onDelete: "restrict",
    }),
  subdistrictId: integer("subdistrict_id")
    .notNull()
    .references(() => subdistricts.subdistrictId, {
      onUpdate: "cascade",
      onDelete: "restrict",
    }),
  isValidate: boolean("is_validate").default(false).notNull(),
});

export const adminsDoed = pgTable(
  "AdminsDoed",
  {
    accountId: integer("account_id")
      .primaryKey()
      .notNull()
      .references(() => accounts.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phoneNumber: text("phone_number").notNull(),
  },
  (table) => [
    uniqueIndex("AdminsDoed_account_id_key").using("btree", table.accountId.asc().nullsLast().op("int4_ops")),
  ],
);

export const enrolls = pgTable(
  "Enrolls",
  {
    id: serial().primaryKey().notNull(),
    enrollDate: timestamp("enroll_date", { precision: 3, mode: "string" })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    factoryId: integer("factory_id")
      .notNull()
      .references(() => factories.accountId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    evalDohId: integer("eval_doh_id")
      .notNull()
      .references(() => evaluators.accountId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    evalOdpcId: integer("eval_odpc_id")
      .notNull()
      .references(() => evaluators.accountId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    evalMentalId: integer("eval_mental_id")
      .notNull()
      .references(() => evaluators.accountId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    employeeThM: integer("employee_th_m").notNull(),
    employeeMmM: integer("employee_mm_m").notNull(),
    employeeKhM: integer("employee_kh_m").notNull(),
    employeeLaM: integer("employee_la_m").notNull(),
    employeeVnM: integer("employee_vn_m").notNull(),
    employeeCnM: integer("employee_cn_m").notNull(),
    employeePhM: integer("employee_ph_m").notNull(),
    employeeJpM: integer("employee_jp_m").notNull(),
    employeeInM: integer("employee_in_m").notNull(),
    employeeOtherM: integer("employee_other_m").notNull(),
    employeeThF: integer("employee_th_f").notNull(),
    employeeMmF: integer("employee_mm_f").notNull(),
    employeeKhF: integer("employee_kh_f").notNull(),
    employeeLaF: integer("employee_la_f").notNull(),
    employeeVnF: integer("employee_vn_f").notNull(),
    employeeCnF: integer("employee_cn_f").notNull(),
    employeePhF: integer("employee_ph_f").notNull(),
    employeeJpF: integer("employee_jp_f").notNull(),
    employeeInF: integer("employee_in_f").notNull(),
    employeeOtherF: integer("employee_other_f").notNull(),
    standardHc: boolean("standard_HC").notNull(),
    fileStandardHcUrl: text("standard_HC_url"),
    standardSan: boolean("standard_SAN").notNull(),
    fileStandardSanUrl: text("standard_SAN_url"),
    standardSanPlus: boolean("standard_SAN_plus").notNull(),
    fileStandardSanPlusUrl: text("standard_SAN_plus_url"),
    standardWellness: boolean("standard_wellness").notNull(),
    fileStandardWellnessUrl: text("standard_wellness_url"),
    standardSafety: boolean("standard_safety").notNull(),
    fileStandardSafetyUrl: text("standard_safety_url"),
    standardTis18001: boolean("standard_TIS18001").notNull(),
    fileStandardTis18001Url: text("standard_TIS18001_url"),
    standardIso45001: boolean("standard_ISO45001").notNull(),
    fileStandardIso45001Url: text("standard_ISO45001_url"),
    standardIso14001: boolean("standard_ISO14001").notNull(),
    fileStandardIso14001Url: text("standard_ISO14001_url"),
    standardZero: boolean("standard_zero").notNull(),
    fileStandardZeroUrl: text("standard_zero_url"),
    standard5S: boolean("standard_5S").notNull(),
    fileStandard5SUrl: text("standard_5S_url"),
    standardHas: boolean("standard_HAS").notNull(),
    fileStandardHasUrl: text("standard_HAS_url"),
    safetyOfficerPrefix: text("safety_officer_prefix").notNull(),
    safetyOfficerFirstName: text("safety_officer_first_name").notNull(),
    safetyOfficerLastName: text("safety_officer_last_name").notNull(),
    safetyOfficerPosition: text("safety_officer_position").notNull(),
    safetyOfficerEmail: text("safety_officer_email"),
    safetyOfficerPhone: text("safety_officer_phone"),
    safetyOfficerLineId: text("safety_officer_lineID"),
  },
  (table) => [uniqueIndex("enrolls_id_key").using("btree", table.id.asc().nullsLast().op("int4_ops"))],
);

export const accounts = pgTable(
  "Accounts",
  {
    id: serial().primaryKey().notNull(),
    username: text().notNull(),
    password: text().notNull(),
    email: text().notNull(),
    role: roles().notNull(),
    hashedRefreshToken: text(),
  },
  (table) => [
    uniqueIndex("Accounts_email_key").using("btree", table.email.asc().nullsLast().op("text_ops")),
    uniqueIndex("Accounts_id_key").using("btree", table.id.asc().nullsLast().op("int4_ops")),
    uniqueIndex("Accounts_username_key").using("btree", table.username.asc().nullsLast().op("text_ops")),
  ],
);

export const provincialOfficers = pgTable(
  "ProvincialOfficers",
  {
    accountId: integer("account_id")
      .primaryKey()
      .notNull()
      .references(() => accounts.id, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phoneNumber: text("phone_number").notNull(),
    provinceId: integer("province_id")
      .notNull()
      .references(() => provinces.provinceId, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),
    isChangePassword: boolean().default(false).notNull(),
  },
  (table) => [
    uniqueIndex("ProvincialOfficers_account_id_key").using("btree", table.accountId.asc().nullsLast().op("int4_ops")),
  ],
);

export const covers = pgTable("Covers", {
  id: serial().primaryKey().notNull(),
  enrollId: integer("enroll_id")
    .references(() => enrolls.id, {
      onDelete: "cascade",
      onUpdate: "cascade",
    })
    .notNull(),
  startDate: timestamp("enroll_date", { precision: 3, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

export const coverStatus = pgEnum("coverStatus", ["finished", "in_progress", "in_review"]);
export const answerStatus = pgEnum("answerStatus", ["finished", "in_review", "rejected"]);

export const coverLogs = pgTable("CoverLogs", {
  id: serial().primaryKey().notNull(),
  coverId: integer("cover_id")
    .notNull()
    .references(() => covers.id, { onDelete: "no action" }),
  status: coverStatus().notNull(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  evaluatorId: integer("evaluator_id"),
});

export const questionCategories = pgEnum("QuestionCategories", [
  "Collaborate",
  "Disease",
  "Safety",
  "Mental",
  "Outcome",
]);

export const standardTypes = pgEnum("StandardTypes", [
  // add standard_
  "standardHC",
  "standardSAN",
  "standardSANPlus",
  "standardWellness",
  "standardSafety",
  "standardTIS18001",
  "standardISO45001",
  "standardISO14001",
  "standardZero",
  "standard5S",
  "standardHAS",
]);

export const questions = pgTable("Questions", {
  id: integer().primaryKey().notNull(),
  category: questionCategories().notNull(),
  questionText: text("question_text").notNull(),
  standard: standardTypes().array().notNull(),
  choice1: text("choice_1").notNull(),
  choice2: text("choice_2").notNull(),
  choice3: text("choice_3").notNull(),
  choiceNA: text("choice_na"),
  special: integer("special").notNull(),
});

export const choices = pgEnum("Choices", ["0", "1", "2", "3", "n/a"]);

export const answers = pgTable("Answers", {
  id: serial("id").primaryKey(),
  questionId: integer("question_id")
    .notNull()
    .references(() => questions.id, { onDelete: "no action" }),
  coverId: integer("cover_id")
    .references(() => covers.id, { onDelete: "no action" })
    .notNull(),
  fileUrl1_1: text("file_url_1_1"),
  fileUrl1_2: text("file_url_1_2"),
  fileUrl1_3: text("file_url_1_3"),
  fileUrl2_1: text("file_url_2_1"),
  fileUrl2_2: text("file_url_2_2"),
  fileUrl2_3: text("file_url_2_3"),
  fileUrl3_1: text("file_url_3_1"),
  fileUrl3_2: text("file_url_3_2"),
  fileUrl3_3: text("file_url_3_3"),
  selectedChoice: choices().notNull(),
});

export const answerLogs = pgTable("AnswerLogs", {
  id: serial("id").primaryKey(),
  answerId: integer("answer_id")
    .notNull()
    .references(() => answers.id, { onDelete: "restrict" }),
  status: answerStatus().notNull(),
  description: text(),
  updatedAt: timestamp("updated_at", { precision: 3, mode: "string" })
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  eval_id: integer("evaluation_id"),
});

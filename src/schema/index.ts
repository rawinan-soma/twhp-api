import { createInsertSchema, createSelectSchema, createUpdateSchema } from "drizzle-typebox";
import {
  accounts,
  adminsDoed,
  answerLogs,
  answers,
  coverLogs,
  covers,
  districts,
  enrolls,
  evaluators,
  factories,
  provinces,
  provincialOfficers,
  questions,
  subdistricts,
} from "../drizzle/schema";

// Accounts
export const BaseAccountSelect = createSelectSchema(accounts);
export const BaseAccountInsert = createInsertSchema(accounts);
export const BaseAccountUpdate = createUpdateSchema(accounts);

// Factories
export const BaseFactorySelect = createSelectSchema(factories);
export const BaseFactoryInsert = createInsertSchema(factories);
export const BaseFactoryUpdate = createUpdateSchema(factories);

// Evaluators
export const BaseEvaluatorSelect = createSelectSchema(evaluators);
export const BaseEvaluatorInsert = createInsertSchema(evaluators);
export const BaseEvaluatorUpdate = createUpdateSchema(evaluators);

// Provinces
export const BaseProvinceSelect = createSelectSchema(provinces);
export const BaseProvinceInsert = createInsertSchema(provinces);
export const BaseProvinceUpdate = createUpdateSchema(provinces);

// Districts
export const BaseDistrictSelect = createSelectSchema(districts);
export const BaseDistrictInsert = createInsertSchema(districts);
export const BaseDistrictUpdate = createUpdateSchema(districts);

// Subdistricts
export const BaseSubdistrictSelect = createSelectSchema(subdistricts);
export const BaseSubdistrictInsert = createInsertSchema(subdistricts);
export const BaseSubdistrictUpdate = createUpdateSchema(subdistricts);

// AdminsDoed
export const BaseAdminsDoedSelect = createSelectSchema(adminsDoed);
export const BaseAdminsDoedInsert = createInsertSchema(adminsDoed);
export const BaseAdminsDoedUpdate = createUpdateSchema(adminsDoed);

// Enrolls
export const BaseEnrollSelect = createSelectSchema(enrolls);
export const BaseEnrollInsert = createInsertSchema(enrolls);
export const BaseEnrollUpdate = createUpdateSchema(enrolls);

// ProvincialOfficers
export const BaseProvincialOfficerSelect = createSelectSchema(provincialOfficers);
export const BaseProvincialOfficerInsert = createInsertSchema(provincialOfficers);
export const BaseProvincialOfficerUpdate = createUpdateSchema(provincialOfficers);

// Covers
export const BaseCoverSelect = createSelectSchema(covers);
export const BaseCoverInsert = createInsertSchema(covers);
export const BaseCoverUpdate = createUpdateSchema(covers);

// CoverLogs
export const BaseCoverLogSelect = createSelectSchema(coverLogs);
export const BaseCoverLogInsert = createInsertSchema(coverLogs);
export const BaseCoverLogUpdate = createUpdateSchema(coverLogs);

// Questions
export const BaseQuestionSelect = createSelectSchema(questions);
export const BaseQuestionInsert = createInsertSchema(questions);
export const BaseQuestionUpdate = createUpdateSchema(questions);

// Answers
export const BaseAnswerSelect = createSelectSchema(answers);
export const BaseAnswerInsert = createInsertSchema(answers);
export const BaseAnswerUpdate = createUpdateSchema(answers);

// AnswerLogs
export const BaseAnswerLogSelect = createSelectSchema(answerLogs);
export const BaseAnswerLogInsert = createInsertSchema(answerLogs);
export const BaseAnswerLogUpdate = createUpdateSchema(answerLogs);

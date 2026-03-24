import { BaseEnrollInsert, BaseEnrollSelect, BaseEnrollUpdate } from ".";
import { t, Static } from "elysia";
import { FileOptions } from "elysia/type-system/types";

export const fileOption: FileOptions = { type: "image/png", maxSize: "5m" };

export const CreateEnrollSchema = t.Omit(BaseEnrollInsert, [
  "enrollDate",
  "factoryId",
  "evalDohId",
  "evalMentalId",
  "evalOdpcId",
  "id",
]);

export const CreateEnrollWithFilesSchema = t.Object({
  employeeThM: t.Number(),
  employeeMmM: t.Number(),
  employeeKhM: t.Number(),
  employeeLaM: t.Number(),
  employeeVnM: t.Number(),
  employeeCnM: t.Number(),
  employeePhM: t.Number(),
  employeeJpM: t.Number(),
  employeeInM: t.Number(),
  employeeOtherM: t.Number(),
  employeeThF: t.Number(),
  employeeMmF: t.Number(),
  employeeKhF: t.Number(),
  employeeLaF: t.Number(),
  employeeVnF: t.Number(),
  employeeCnF: t.Number(),
  employeePhF: t.Number(),
  employeeJpF: t.Number(),
  employeeInF: t.Number(),
  employeeOtherF: t.Number(),
  standardHc: t.Boolean(),
  standardSan: t.Boolean(),
  standardWellness: t.Boolean(),
  standardSafety: t.Boolean(),
  standardTis18001: t.Boolean(),
  standardIso45001: t.Boolean(),
  standardIso14001: t.Boolean(),
  standardZero: t.Boolean(),
  standard5S: t.Boolean(),
  standardHas: t.Boolean(),
  safetyOfficerPrefix: t.String(),
  safetyOfficerFirstName: t.String(),
  safetyOfficerLastName: t.String(),
  safetyOfficerPosition: t.String(),
  safetyOfficerEmail: t.Optional(t.String({ format: "email" })),
  safetyOfficerPhone: t.Optional(t.String()),
  safetyOfficerLineId: t.Optional(t.String()),
  fileStandardHc: t.Optional(t.File(fileOption)),
  fileStandardSan: t.Optional(t.File(fileOption)),
  fileStandardWellness: t.Optional(t.File(fileOption)),
  fileStandardSafety: t.Optional(t.File(fileOption)),
  fileStandardTis18001: t.Optional(t.File(fileOption)),
  fileStandardIso45001: t.Optional(t.File(fileOption)),
  fileStandardIso14001: t.Optional(t.File(fileOption)),
  fileStandardZero: t.Optional(t.File(fileOption)),
  fileStandard5S: t.Optional(t.File(fileOption)),
  fileStandardHas: t.Optional(t.File(fileOption)),
});

export type CreateEnrollWithFilesDto = Static<
  typeof CreateEnrollWithFilesSchema
>;

export const UpdateEnrollSchema = t.Omit(BaseEnrollUpdate, ["id"]);

export const UpdateEnrollWithFilesSchema = t.Object({
  employeeThM: t.Optional(t.Number()),
  employeeMmM: t.Optional(t.Number()),
  employeeKhM: t.Optional(t.Number()),
  employeeLaM: t.Optional(t.Number()),
  employeeVnM: t.Optional(t.Number()),
  employeeCnM: t.Optional(t.Number()),
  employeePhM: t.Optional(t.Number()),
  employeeJpM: t.Optional(t.Number()),
  employeeInM: t.Optional(t.Number()),
  employeeOtherM: t.Optional(t.Number()),
  employeeThF: t.Optional(t.Number()),
  employeeMmF: t.Optional(t.Number()),
  employeeKhF: t.Optional(t.Number()),
  employeeLaF: t.Optional(t.Number()),
  employeeVnF: t.Optional(t.Number()),
  employeeCnF: t.Optional(t.Number()),
  employeePhF: t.Optional(t.Number()),
  employeeJpF: t.Optional(t.Number()),
  employeeInF: t.Optional(t.Number()),
  employeeOtherF: t.Optional(t.Number()),
  standardHc: t.Optional(t.Boolean()),
  standardSan: t.Optional(t.Boolean()),
  standardWellness: t.Optional(t.Boolean()),
  standardSafety: t.Optional(t.Boolean()),
  standardTis18001: t.Optional(t.Boolean()),
  standardIso45001: t.Optional(t.Boolean()),
  standardIso14001: t.Optional(t.Boolean()),
  standardZero: t.Optional(t.Boolean()),
  standard5S: t.Optional(t.Boolean()),
  standardHas: t.Optional(t.Boolean()),
  safetyOfficerPrefix: t.Optional(t.String()),
  safetyOfficerFirstName: t.Optional(t.String()),
  safetyOfficerLastName: t.Optional(t.String()),
  safetyOfficerPosition: t.Optional(t.String()),
  safetyOfficerEmail: t.Optional(t.String({ format: "email" })),
  safetyOfficerPhone: t.Optional(t.String()),
  safetyOfficerLineId: t.Optional(t.String()),
  fileStandardHc: t.Optional(t.File(fileOption)),
  fileStandardSan: t.Optional(t.File(fileOption)),
  fileStandardWellness: t.Optional(t.File(fileOption)),
  fileStandardSafety: t.Optional(t.File(fileOption)),
  fileStandardTis18001: t.Optional(t.File(fileOption)),
  fileStandardIso45001: t.Optional(t.File(fileOption)),
  fileStandardIso14001: t.Optional(t.File(fileOption)),
  fileStandardZero: t.Optional(t.File(fileOption)),
  fileStandard5S: t.Optional(t.File(fileOption)),
  fileStandardHas: t.Optional(t.File(fileOption)),
});

export type UpdateEnrollDto = Static<typeof UpdateEnrollSchema>;
export type UpdateEnrollWithFilesDto = Static<
  typeof UpdateEnrollWithFilesSchema
>;

export type CreateEnrollDto = Static<typeof CreateEnrollSchema>;

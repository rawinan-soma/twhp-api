import { BaseEnrollInsert, BaseEnrollSelect, BaseEnrollUpdate } from ".";
import { t, Static } from "elysia";
import { FileOptions } from "elysia/type-system/types";

const fileOption: FileOptions = { type: "image/png", maxSize: "5m" };

export const CreateEnrollSchema = t.Omit(BaseEnrollInsert, [
  "enrollDate",
  "factoryId",
  "evalDohId",
  "evalMentalId",
  "evalOdpcId",
  "id",
]);

export const CreateEnrollWithFilesSchema = t.Composite([
  t.Omit(CreateEnrollSchema, [
    "fileStandardHcUrl",
    "fileStandardSanUrl",
    "fileStandardWellnessUrl",
    "fileStandardSafetyUrl",
    "fileStandardTis18001Url",
    "fileStandardIso45001Url",
    "fileStandardIso14001Url",
    "fileStandardZeroUrl",
    "fileStandard5SUrl",
    "fileStandardHasUrl",
  ]),
  t.Object({
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
  }),
]);

export type CreateEnrollWithFilesDto = Static<typeof CreateEnrollWithFilesSchema>;

export const UpdateEnrollSchema = t.Omit(BaseEnrollUpdate, ["id"]);

export const UpdateEnrollWithFilesSchema = t.Composite([
  t.Omit(UpdateEnrollSchema, [
    "fileStandardHcUrl",
    "fileStandardSanUrl",
    "fileStandardWellnessUrl",
    "fileStandardSafetyUrl",
    "fileStandardTis18001Url",
    "fileStandardIso45001Url",
    "fileStandardIso14001Url",
    "fileStandardZeroUrl",
    "fileStandard5SUrl",
    "fileStandardHasUrl",
  ]),
  t.Object({
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
  }),
]);

export type UpdateEnrollDto = Static<typeof UpdateEnrollSchema>;
export type UpdateEnrollWithFilesDto = Static<typeof UpdateEnrollWithFilesSchema>;

// export const createEnrollSchema = z.object({
//   employee_th_m: z.number(),
//   employee_mm_m: z.number(),
//   employee_kh_m: z.number(),
//   employee_la_m: z.number(),
//   employee_vn_m: z.number(),
//   employee_cn_m: z.number(),
//   employee_ph_m: z.number(),
//   employee_jp_m: z.number(),
//   employee_in_m: z.number(),
//   employee_other_m: z.number(),

//   employee_th_f: z.number(),
//   employee_mm_f: z.number(),
//   employee_kh_f: z.number(),
//   employee_la_f: z.number(),
//   employee_vn_f: z.number(),
//   employee_cn_f: z.number(),
//   employee_ph_f: z.number(),
//   employee_jp_f: z.number(),
//   employee_in_f: z.number(),
//   employee_other_f: z.number(),

//   standard_HC: z.boolean(),
//   standard_SAN: z.boolean(),
//   standard_wellness: z.boolean(),
//   standard_safety: z.boolean(),
//   standard_TIS18001: z.boolean(),
//   standard_ISO45001: z.boolean(),
//   standard_ISO14001: z.boolean(),
//   standard_zero: z.boolean(),
//   standard_5S: z.boolean(),
//   standard_HAS: z.boolean(),

//   safety_officer_prefix: z.string(),
//   safety_officer_first_name: z.string(),
//   safety_officer_last_name: z.string(),
//   safety_officer_position: z.string(),
//   safety_officer_email: z.email().optional(),
//   safety_officer_phone: z.string().optional(),
//   safety_officer_lineID: z.string().optional(),
// });

export type CreateEnrollDto = Static<typeof CreateEnrollSchema>;

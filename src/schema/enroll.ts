import {
  BaseDistrictSelect,
  BaseEnrollInsert,
  BaseEnrollSelect,
  BaseProvinceSelect,
  BaseSubdistrictSelect,
} from ".";
import { t, Static } from "elysia";

export const CreateEnrollSchema = t.Omit(BaseEnrollInsert, [
  "enrollDate",
  "factoryId",
  "evalDohId",
  "evalMentalId",
  "evalOdpcId",
  "id",
]);

export const EnrollResponseWithFactory = t.Composite([
  BaseEnrollSelect,
  t.Object({ factoryNameTh: t.Nullable(t.String()) }),
]);

export const EnrollResponseWithLocation = t.Composite([
  BaseEnrollSelect,
  t.Object({
    provinceNameTh: t.Nullable(t.String()),
    districtNameTh: t.Nullable(t.String()),
    subdistrictNameTh: t.Nullable(t.String()),
  }),
]);

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

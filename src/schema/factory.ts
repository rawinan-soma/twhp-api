import {
  BaseAccountSelect,
  BaseDistrictSelect,
  BaseFactoryInsert,
  BaseFactorySelect,
  BaseProvinceSelect,
  BaseSubdistrictSelect,
} from ".";
import { t, Static } from "elysia";

export const CreateFactorySchema = t.Composite([
  t.Omit(BaseFactoryInsert, [
    "accountId",
    "provinceId",
    "districtId",
    "isValidate",
  ]),
  t.Object({
    username: t.String(),
    password: t.String(),
    email: t.String({ format: "email" }),
  }),
]);

// export const createFactorySchema = z.object({
//   username: z.string(),
//   password: z.string(),
//   email: z.email(),
//   factory_type: z.number(),
//   name_th: z.string(),
//   name_en: z.string(),
//   tsic_code: z.string(),
//   address_no: z.string(),
//   soi: z.string().optional(),
//   road: z.string().optional(),
//   zipcode: z.string(),
//   phone_number: z.string(),
//   fax_number: z.string().optional(),
//   subdistrict_id: z.number(),
// });

export const UpdateFactorySchema = t.Partial(
  t.Omit(CreateFactorySchema, ["username"]),
);

export const AllFactoriesQueryParamsSchema = t.Object({
  validated: t.Boolean(),
  enrolled: t.Boolean(),
  provinceId: t.Optional(t.Number()),
  region: t.Optional(t.Number()),
});

export const AllFactoriesResponseSchema = t.Array(
  t.Object({
    factory: BaseFactorySelect,
    province: t.Nullable(BaseProvinceSelect),
    district: t.Nullable(BaseDistrictSelect),
    subdistrict: t.Nullable(BaseSubdistrictSelect),
  }),
);

export type CreateFactoryDto = Static<typeof CreateFactorySchema>;
export type UpdateFactoryDto = Static<typeof UpdateFactorySchema>;
export type AllFactoriesQueryParams = Static<
  typeof AllFactoriesQueryParamsSchema
>;

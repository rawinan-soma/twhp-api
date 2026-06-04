import { type Static, t } from "elysia";
import {
  BaseDistrictSelect,
  BaseFactoryInsert,
  BaseFactorySelect,
  BaseProvinceSelect,
  BaseSubdistrictSelect,
} from ".";

export const CreateFactorySchema = t.Composite([
  t.Omit(BaseFactoryInsert, ["accountId", "provinceId", "districtId", "isValidate"]),
  t.Object({
    username: t.String(),
    password: t.String(),
    email: t.String({ format: "email" }),
  }),
]);

export const UpdateFactorySchema = t.Partial(t.Omit(CreateFactorySchema, ["username"]));

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
export type AllFactoriesQueryParams = Static<typeof AllFactoriesQueryParamsSchema>;

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

/**
 * Factory list item, extracted verbatim from the three route files so they stop repeating a
 * sixteen-field inline object. Field names, casing, and nullability are unchanged.
 *
 * Note: the Provincial Officer route declares the three joined location names as non-nullable while
 * the Admin and Evaluator routes declare them nullable. All three queries innerJoin those tables so
 * a null cannot occur in practice, but the declarations differ. That inconsistency is preserved
 * here rather than silently unified — see ProvincialFactoryListItemSchema below.
 */
export const FactoryListItemSchema = t.Object({
  province_name_th: t.Nullable(t.String()),
  district_name_th: t.Nullable(t.String()),
  subdistrict_name_th: t.Nullable(t.String()),
  account_id: t.Number(),
  factory_type: t.Number(),
  name_th: t.String(),
  name_en: t.String(),
  tsic_code: t.String(),
  address_no: t.String(),
  soi: t.Nullable(t.String()),
  road: t.Nullable(t.String()),
  zipcode: t.String(),
  phone_number: t.String(),
  fax_number: t.Nullable(t.String()),
  is_validate: t.Boolean(),
  /**
   * Common Era fiscal year of this record. Optional because the Factory list with
   * `enrolled=false` disables fiscal-year filtering entirely, so its rows may span years and no
   * single value would be truthful. See docs/api-conventions.md.
   */
  fiscalYear: t.Optional(t.Number()),
});

/** Admin variant adds `username` from the accounts join. */
export const AdminFactoryListItemSchema = t.Composite([
  t.Object({ username: t.String() }),
  FactoryListItemSchema,
]);

/** Provincial Officer variant — location names declared non-nullable, as they are today. */
export const ProvincialFactoryListItemSchema = t.Composite([
  t.Omit(FactoryListItemSchema, ["province_name_th", "district_name_th", "subdistrict_name_th"]),
  t.Object({
    province_name_th: t.String(),
    district_name_th: t.String(),
    subdistrict_name_th: t.String(),
  }),
]);

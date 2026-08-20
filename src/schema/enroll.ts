import { type Static, t } from "elysia";
import type { FileOptions } from "elysia/type-system/types";
import { BaseEnrollInsert, BaseEnrollSelect, BaseEnrollUpdate } from ".";
import { Paginated } from "./pagination";

export const fileOption: FileOptions = {
  type: "application/pdf",
  maxSize: "10m",
};

const BooleanString = t
  .Transform(t.Union([t.Boolean(), t.Literal("true"), t.Literal("false")]))
  .Decode((v) => v === true || v === "true")
  .Encode((v) => v);

export const CreateEnrollSchema = t.Omit(BaseEnrollInsert, [
  "enrollDate",
  "factoryId",
  "evalDohId",
  "evalMentalId",
  "evalOdpcId",
  "id",
]);

export const CreateEnrollWithFilesSchema = t.Object({
  employeeThM: t.Numeric(),
  employeeMmM: t.Numeric(),
  employeeKhM: t.Numeric(),
  employeeLaM: t.Numeric(),
  employeeVnM: t.Numeric(),
  employeeCnM: t.Numeric(),
  employeePhM: t.Numeric(),
  employeeJpM: t.Numeric(),
  employeeInM: t.Numeric(),
  employeeOtherM: t.Numeric(),
  employeeThF: t.Numeric(),
  employeeMmF: t.Numeric(),
  employeeKhF: t.Numeric(),
  employeeLaF: t.Numeric(),
  employeeVnF: t.Numeric(),
  employeeCnF: t.Numeric(),
  employeePhF: t.Numeric(),
  employeeJpF: t.Numeric(),
  employeeInF: t.Numeric(),
  employeeOtherF: t.Numeric(),
  standardHc: BooleanString,
  standardSan: BooleanString,
  standardSanPlus: BooleanString,
  standardWellness: BooleanString,
  standardSafety: BooleanString,
  standardTis18001: BooleanString,
  standardIso45001: BooleanString,
  standardIso14001: BooleanString,
  standardZero: BooleanString,
  standard5S: BooleanString,
  standardHas: BooleanString,
  safetyOfficerPrefix: t.String(),
  safetyOfficerFirstName: t.String(),
  safetyOfficerLastName: t.String(),
  safetyOfficerPosition: t.String(),
  safetyOfficerEmail: t.Optional(t.String()),
  safetyOfficerPhone: t.Optional(t.String()),
  safetyOfficerLineId: t.Optional(t.String()),
  fileStandardHc: t.Optional(t.File(fileOption)),
  fileStandardSan: t.Optional(t.File(fileOption)),
  fileStandardSanPlus: t.Optional(t.File(fileOption)),
  fileStandardWellness: t.Optional(t.File(fileOption)),
  fileStandardSafety: t.Optional(t.File(fileOption)),
  fileStandardTis18001: t.Optional(t.File(fileOption)),
  fileStandardIso45001: t.Optional(t.File(fileOption)),
  fileStandardIso14001: t.Optional(t.File(fileOption)),
  fileStandardZero: t.Optional(t.File(fileOption)),
  fileStandard5S: t.Optional(t.File(fileOption)),
  fileStandardHas: t.Optional(t.File(fileOption)),
});

export type CreateEnrollWithFilesDto = Static<typeof CreateEnrollWithFilesSchema>;

export const UpdateEnrollSchema = t.Omit(BaseEnrollUpdate, ["id"]);

export const UpdateEnrollWithFilesSchema = t.Object({
  employeeThM: t.Optional(t.Numeric()),
  employeeMmM: t.Optional(t.Numeric()),
  employeeKhM: t.Optional(t.Numeric()),
  employeeLaM: t.Optional(t.Numeric()),
  employeeVnM: t.Optional(t.Numeric()),
  employeeCnM: t.Optional(t.Numeric()),
  employeePhM: t.Optional(t.Numeric()),
  employeeJpM: t.Optional(t.Numeric()),
  employeeInM: t.Optional(t.Numeric()),
  employeeOtherM: t.Optional(t.Numeric()),
  employeeThF: t.Optional(t.Numeric()),
  employeeMmF: t.Optional(t.Numeric()),
  employeeKhF: t.Optional(t.Numeric()),
  employeeLaF: t.Optional(t.Numeric()),
  employeeVnF: t.Optional(t.Numeric()),
  employeeCnF: t.Optional(t.Numeric()),
  employeePhF: t.Optional(t.Numeric()),
  employeeJpF: t.Optional(t.Numeric()),
  employeeInF: t.Optional(t.Numeric()),
  employeeOtherF: t.Optional(t.Numeric()),
  standardHc: t.Optional(BooleanString),
  standardSan: t.Optional(BooleanString),
  standardSanPlus: t.Optional(BooleanString),
  standardWellness: t.Optional(BooleanString),
  standardSafety: t.Optional(BooleanString),
  standardTis18001: t.Optional(BooleanString),
  standardIso45001: t.Optional(BooleanString),
  standardIso14001: t.Optional(BooleanString),
  standardZero: t.Optional(BooleanString),
  standard5S: t.Optional(BooleanString),
  standardHas: t.Optional(BooleanString),
  safetyOfficerPrefix: t.Optional(t.String()),
  safetyOfficerFirstName: t.Optional(t.String()),
  safetyOfficerLastName: t.Optional(t.String()),
  safetyOfficerPosition: t.Optional(t.String()),
  safetyOfficerEmail: t.Optional(t.String({ format: "email" })),
  safetyOfficerPhone: t.Optional(t.String()),
  safetyOfficerLineId: t.Optional(t.String()),
  fileStandardHc: t.Optional(t.File(fileOption)),
  fileStandardSan: t.Optional(t.File(fileOption)),
  fileStandardSanPlus: t.Optional(t.File(fileOption)),
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
export type UpdateEnrollWithFilesDto = Static<typeof UpdateEnrollWithFilesSchema>;

export type CreateEnrollDto = Static<typeof CreateEnrollSchema>;

// Optional cover-status filter for the staff enroll-list endpoints.
// `none` matches enrolls with no cover yet; the 3 real values match the latest coverLog status.
export const CoverStatusQuery = t.Optional(
  t.Union([
    t.Literal("finished"),
    t.Literal("in_progress"),
    t.Literal("in_review"),
    t.Literal("none"),
  ]),
);
export type CoverStatusQueryDto = Static<typeof CoverStatusQuery>;

// Shared enroll-list response item for admins/evaluators/provincialOfficers.
// Extends the base enroll columns with the joined factory/province fields plus
// the derived cover projection (null when the enroll has no cover).
export const EnrollWithCoverSelect = t.Composite([
  BaseEnrollSelect,
  t.Object({
    factory_name_th: t.String(),
    region: t.Number(),
    provinceId: t.Number(),
    coverId: t.Nullable(t.Number()),
    coverStatus: t.Nullable(
      t.Union([t.Literal("finished"), t.Literal("in_progress"), t.Literal("in_review")]),
    ),
  }),
]);
export const EnrollWithCoverListSchema = t.Array(EnrollWithCoverSelect);

/**
 * Paginated response for the staff enroll-list endpoints (intent 012).
 * The item schema above is unchanged; only the wrapper is new.
 * See docs/adr/0007-pagination-envelope-scoped-exception.md.
 */
export const EnrollWithCoverPageSchema = Paginated(EnrollWithCoverSelect);

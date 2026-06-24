import { and, desc, eq, getTableColumns, gte, inArray, lt, type SQL } from "drizzle-orm";
import { status } from "elysia";
import { db } from "../drizzle";
import {
  coverLogs,
  covers,
  districts,
  enrolls,
  evaluators,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import type { CreateEnrollWithFilesDto, UpdateEnrollWithFilesDto } from "../schema/enroll";
import { utilities } from "../utils";

/** Cover-status filter value. `none` = enroll has no cover yet. */
export type CoverStatusFilter = "finished" | "in_progress" | "in_review" | "none";

export const createEnrollService = (database: typeof db) => {
  /**
   * Enrich enroll rows with their cover projection (coverId + coverStatus) via
   * latest-log-wins, then optionally filter by cover status. ≤2 bounded queries,
   * no N+1 (mirrors score.ts buildScoreReports). Order is preserved.
   */
  const enrichAndFilterCovers = async <T extends { id: number }>(
    rows: T[],
    coverStatus?: CoverStatusFilter,
  ): Promise<
    (T & {
      coverId: number | null;
      coverStatus: "finished" | "in_progress" | "in_review" | null;
    })[]
  > => {
    if (rows.length === 0) return [];

    const enrollIds = rows.map((r) => r.id);

    // Query A: covers for these enrolls (≤1 cover per enroll) → enrollId → coverId
    const coverRows = await database
      .select({ id: covers.id, enrollId: covers.enrollId })
      .from(covers)
      .where(inArray(covers.enrollId, enrollIds));
    const coverByEnroll = new Map(coverRows.map((c) => [c.enrollId, c.id]));

    // Query B: latest coverLog per cover (latest-log-wins) → coverId → status
    const coverIds = coverRows.map((c) => c.id);
    const statusByCover =
      coverIds.length === 0
        ? new Map<number, "finished" | "in_progress" | "in_review">()
        : new Map(
            (
              await database
                .selectDistinctOn([coverLogs.coverId], {
                  coverId: coverLogs.coverId,
                  status: coverLogs.status,
                })
                .from(coverLogs)
                .where(inArray(coverLogs.coverId, coverIds))
                .orderBy(coverLogs.coverId, desc(coverLogs.id))
            ).map((l) => [l.coverId, l.status] as const),
          );

    const enriched = rows.map((r) => {
      const coverId = coverByEnroll.get(r.id) ?? null;
      const coverStatusVal = coverId === null ? null : (statusByCover.get(coverId) ?? null);
      return { ...r, coverId, coverStatus: coverStatusVal };
    });

    // AND-combined with the scope already applied by the caller's WHERE clause.
    if (coverStatus === "none") return enriched.filter((r) => r.coverId === null);
    if (coverStatus) return enriched.filter((r) => r.coverStatus === coverStatus);
    return enriched;
  };

  return {
    getAllEnrollsByRegion: async (region: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const results = await database
        .select({
          ...getTableColumns(enrolls),
          factory_name_th: factories.nameTh,
          region: provinces.healthRegion,
          provinceId: provinces.provinceId,
        })
        .from(enrolls)
        .innerJoin(factories, eq(enrolls.factoryId, factories.accountId))
        .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(
          and(
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
            eq(provinces.healthRegion, region),
          ),
        )
        .orderBy(desc(enrolls.enrollDate));

      return results;
    },
    getAllEnrollsByProvince: async (provinceId: number, coverStatus?: CoverStatusFilter) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const results = await database
        .select({
          ...getTableColumns(enrolls),
          factory_name_th: factories.nameTh,
          region: provinces.healthRegion,
          provinceId: provinces.provinceId,
        })
        .from(enrolls)
        .innerJoin(factories, eq(enrolls.factoryId, factories.accountId))
        .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(
          and(
            gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
            lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
            eq(provinces.provinceId, provinceId),
          ),
        )
        .orderBy(desc(enrolls.enrollDate));

      return enrichAndFilterCovers(results, coverStatus);
    },
    getAllEnrolls: async (
      region?: number,
      provinceId?: number,
      coverStatus?: CoverStatusFilter,
    ) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const filters: (SQL | undefined)[] = [
        gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
        lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
      ];

      if (region !== undefined) {
        filters.push(eq(provinces.healthRegion, region));
      }

      if (provinceId !== undefined) {
        filters.push(eq(provinces.provinceId, provinceId));
      }
      const results = await database
        .select({
          ...getTableColumns(enrolls),
          factory_name_th: factories.nameTh,
          region: provinces.healthRegion,
          provinceId: provinces.provinceId,
        })
        .from(enrolls)
        .innerJoin(factories, eq(enrolls.factoryId, factories.accountId))
        .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(and(...filters))
        .orderBy(desc(enrolls.enrollDate));

      return enrichAndFilterCovers(results, coverStatus);
    },

    getEnrollById: async (enrollId: number) => {
      const result = await database
        .select({
          ...getTableColumns(enrolls),
          province_name_th: provinces.nameTh,
          district_name_th: districts.nameTh,
          subdistrict_name_th: subdistricts.nameTh,
        })
        .from(enrolls)
        .leftJoin(factories, eq(enrolls.factoryId, factories.accountId))
        .leftJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .leftJoin(districts, eq(districts.districtId, factories.districtId))
        .leftJoin(subdistricts, eq(subdistricts.subdistrictId, factories.subdistrictId))
        .where(eq(enrolls.id, enrollId))
        .limit(1)
        .then((res) => res[0]);

      if (!result) {
        return status(404, { message: "enroll not found" });
      }

      return result;
    },

    create: async (dto: CreateEnrollWithFilesDto, factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      // Check if any standard is true but file is missing
      const standards = [
        { bool: dto.standardHc, file: dto.fileStandardHc, name: "HC" },
        { bool: dto.standardSan, file: dto.fileStandardSan, name: "SAN" },
        { bool: dto.standardSanPlus, file: dto.fileStandardSanPlus, name: "SANPlus" },
        {
          bool: dto.standardWellness,
          file: dto.fileStandardWellness,
          name: "Wellness",
        },
        {
          bool: dto.standardSafety,
          file: dto.fileStandardSafety,
          name: "Safety",
        },
        {
          bool: dto.standardTis18001,
          file: dto.fileStandardTis18001,
          name: "TIS18001",
        },
        {
          bool: dto.standardIso45001,
          file: dto.fileStandardIso45001,
          name: "ISO45001",
        },
        {
          bool: dto.standardIso14001,
          file: dto.fileStandardIso14001,
          name: "ISO14001",
        },
        { bool: dto.standardZero, file: dto.fileStandardZero, name: "Zero" },
        { bool: dto.standard5S, file: dto.fileStandard5S, name: "5S" },
        { bool: dto.standardHas, file: dto.fileStandardHas, name: "HAS" },
      ];

      for (const s of standards) {
        if (s.bool && !s.file) {
          return status(400, {
            message: `standard ${s.name} is issue but file is missing`,
          });
        }
      }

      const existingEnroll = await database
        .select()
        .from(enrolls)
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            and(
              gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
              lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
            ),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (existingEnroll) {
        return status(400, {
          message: "already make an enroll in fiscal year",
        });
      }

      const factoryData = await database
        .select({ region: provinces.healthRegion })
        .from(factories)
        .leftJoin(provinces, eq(provinces.provinceId, factories.provinceId))
        .where(eq(factories.accountId, factoryId))
        .limit(1);
      const region = factoryData[0]?.region;
      if (!region) {
        return status(400, { message: "invalid factory id" });
      }

      const evaluatorsList = await database
        .select({ level: evaluators.level, id: evaluators.accountId })
        .from(evaluators)
        .where(eq(evaluators.region, region));
      if (evaluatorsList.length === 0) {
        return status(400, { message: "evaluators not found" });
      }

      const extractedEvaluators = {
        evalDoh: evaluatorsList.filter((evaluator) => evaluator.level === "DOH")[0],
        evalMental: evaluatorsList.filter((evaluator) => evaluator.level === "Mental")[0],
        evalOdpc: evaluatorsList.filter((evaluator) => evaluator.level === "ODPC")[0],
      };

      const {
        fileStandardHc,
        fileStandardSan,
        fileStandardSanPlus,
        fileStandardWellness,
        fileStandardSafety,
        fileStandardTis18001,
        fileStandardIso45001,
        fileStandardIso14001,
        fileStandardZero,
        fileStandard5S,
        fileStandardHas,
        ...enrollData
      } = dto;

      const [
        fileStandardHcUrl,
        fileStandardSanUrl,
        fileStandardSanPlusUrl,
        fileStandardWellnessUrl,
        fileStandardSafetyUrl,
        fileStandardTis18001Url,
        fileStandardIso45001Url,
        fileStandardIso14001Url,
        fileStandardZeroUrl,
        fileStandard5SUrl,
        fileStandardHasUrl,
      ] = await Promise.all([
        fileStandardHc ? utilities().uploadFile(fileStandardHc) : Promise.resolve(null),
        fileStandardSan ? utilities().uploadFile(fileStandardSan) : Promise.resolve(null),
        fileStandardSanPlus ? utilities().uploadFile(fileStandardSanPlus) : Promise.resolve(null),
        fileStandardWellness ? utilities().uploadFile(fileStandardWellness) : Promise.resolve(null),
        fileStandardSafety ? utilities().uploadFile(fileStandardSafety) : Promise.resolve(null),
        fileStandardTis18001 ? utilities().uploadFile(fileStandardTis18001) : Promise.resolve(null),
        fileStandardIso45001 ? utilities().uploadFile(fileStandardIso45001) : Promise.resolve(null),
        fileStandardIso14001 ? utilities().uploadFile(fileStandardIso14001) : Promise.resolve(null),
        fileStandardZero ? utilities().uploadFile(fileStandardZero) : Promise.resolve(null),
        fileStandard5S ? utilities().uploadFile(fileStandard5S) : Promise.resolve(null),
        fileStandardHas ? utilities().uploadFile(fileStandardHas) : Promise.resolve(null),
      ]);

      await database
        .insert(enrolls)
        .values({
          ...enrollData,
          fileStandardHcUrl,
          fileStandardSanUrl,
          fileStandardSanPlusUrl,
          fileStandardWellnessUrl,
          fileStandardSafetyUrl,
          fileStandardTis18001Url,
          fileStandardIso45001Url,
          fileStandardIso14001Url,
          fileStandardZeroUrl,
          fileStandard5SUrl,
          fileStandardHasUrl,
          factoryId: factoryId,
          evalMentalId: extractedEvaluators.evalMental.id,
          evalOdpcId: extractedEvaluators.evalOdpc.id,
          evalDohId: extractedEvaluators.evalDoh.id,
        })
        .returning()
        .then((res) => res[0]);

      return {
        message: "create enrollment successfully",
      };
    },

    updateEnroll: async (factoryId: number, dto: UpdateEnrollWithFilesDto) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const existingEnroll = await database
        .select()
        .from(enrolls)
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            and(
              gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
              lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
            ),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!existingEnroll) {
        return status(404, {
          message: "Enroll not found for this fiscal year",
        });
      }

      const {
        fileStandardHc,
        fileStandardSan,
        fileStandardSanPlus,
        fileStandardWellness,
        fileStandardSafety,
        fileStandardTis18001,
        fileStandardIso45001,
        fileStandardIso14001,
        fileStandardZero,
        fileStandard5S,
        fileStandardHas,
        ...updateData
      } = dto;

      // Validation: If standard is true (from DTO or existing), must have file (from DTO or existing)
      const standards = [
        {
          bool: dto.standardHc ?? existingEnroll.standardHc,
          newFile: fileStandardHc,
          oldUrl: existingEnroll.fileStandardHcUrl,
          name: "HC",
        },
        {
          bool: dto.standardSan ?? existingEnroll.standardSan,
          newFile: fileStandardSan,
          oldUrl: existingEnroll.fileStandardSanUrl,
          name: "SAN",
        },
        {
          bool: dto.standardSanPlus ?? existingEnroll.standardSanPlus,
          newFile: fileStandardSanPlus,
          oldUrl: existingEnroll.fileStandardSanPlusUrl,
          name: "SANPlus",
        },
        {
          bool: dto.standardWellness ?? existingEnroll.standardWellness,
          newFile: fileStandardWellness,
          oldUrl: existingEnroll.fileStandardWellnessUrl,
          name: "Wellness",
        },
        {
          bool: dto.standardSafety ?? existingEnroll.standardSafety,
          newFile: fileStandardSafety,
          oldUrl: existingEnroll.fileStandardSafetyUrl,
          name: "Safety",
        },
        {
          bool: dto.standardTis18001 ?? existingEnroll.standardTis18001,
          newFile: fileStandardTis18001,
          oldUrl: existingEnroll.fileStandardTis18001Url,
          name: "TIS18001",
        },
        {
          bool: dto.standardIso45001 ?? existingEnroll.standardIso45001,
          newFile: fileStandardIso45001,
          oldUrl: existingEnroll.fileStandardIso45001Url,
          name: "ISO45001",
        },
        {
          bool: dto.standardIso14001 ?? existingEnroll.standardIso14001,
          newFile: fileStandardIso14001,
          oldUrl: existingEnroll.fileStandardIso14001Url,
          name: "ISO14001",
        },
        {
          bool: dto.standardZero ?? existingEnroll.standardZero,
          newFile: fileStandardZero,
          oldUrl: existingEnroll.fileStandardZeroUrl,
          name: "Zero",
        },
        {
          bool: dto.standard5S ?? existingEnroll.standard5S,
          newFile: fileStandard5S,
          oldUrl: existingEnroll.fileStandard5SUrl,
          name: "5S",
        },
        {
          bool: dto.standardHas ?? existingEnroll.standardHas,
          newFile: fileStandardHas,
          oldUrl: existingEnroll.fileStandardHasUrl,
          name: "HAS",
        },
      ];

      for (const s of standards) {
        if (s.bool && !s.newFile && !s.oldUrl) {
          return status(400, {
            message: `Standard ${s.name} is issue but file is missing`,
          });
        }
      }

      // Processing files: If standard is false, delete old file and return null.
      // If standard is true and new file provided, delete old and upload new.
      // Otherwise, keep old URL.
      const processFile = async (
        isTrue: boolean,
        newFile: File | undefined,
        oldUrl: string | null,
      ) => {
        if (!isTrue) {
          if (oldUrl) await utilities().deleteFile(oldUrl);
          return null;
        }
        if (newFile) {
          if (oldUrl) await utilities().deleteFile(oldUrl);
          return await utilities().uploadFile(newFile);
        }
        return oldUrl;
      };

      const [
        fileStandardHcUrl,
        fileStandardSanUrl,
        fileStandardSanPlusUrl,
        fileStandardWellnessUrl,
        fileStandardSafetyUrl,
        fileStandardTis18001Url,
        fileStandardIso45001Url,
        fileStandardIso14001Url,
        fileStandardZeroUrl,
        fileStandard5SUrl,
        fileStandardHasUrl,
      ] = await Promise.all([
        processFile(standards[0].bool, fileStandardHc, existingEnroll.fileStandardHcUrl),
        processFile(standards[1].bool, fileStandardSan, existingEnroll.fileStandardSanUrl),
        processFile(standards[2].bool, fileStandardSanPlus, existingEnroll.fileStandardSanPlusUrl),
        processFile(
          standards[3].bool,
          fileStandardWellness,
          existingEnroll.fileStandardWellnessUrl,
        ),
        processFile(standards[4].bool, fileStandardSafety, existingEnroll.fileStandardSafetyUrl),
        processFile(
          standards[5].bool,
          fileStandardTis18001,
          existingEnroll.fileStandardTis18001Url,
        ),
        processFile(
          standards[6].bool,
          fileStandardIso45001,
          existingEnroll.fileStandardIso45001Url,
        ),
        processFile(
          standards[7].bool,
          fileStandardIso14001,
          existingEnroll.fileStandardIso14001Url,
        ),
        processFile(standards[8].bool, fileStandardZero, existingEnroll.fileStandardZeroUrl),
        processFile(standards[9].bool, fileStandard5S, existingEnroll.fileStandard5SUrl),
        processFile(standards[10].bool, fileStandardHas, existingEnroll.fileStandardHasUrl),
      ]);

      await database
        .update(enrolls)
        .set({
          ...updateData,
          fileStandardHcUrl,
          fileStandardSanUrl,
          fileStandardSanPlusUrl,
          fileStandardWellnessUrl,
          fileStandardSafetyUrl,
          fileStandardTis18001Url,
          fileStandardIso45001Url,
          fileStandardIso14001Url,
          fileStandardZeroUrl,
          fileStandard5SUrl,
          fileStandardHasUrl,
        })
        .where(eq(enrolls.id, existingEnroll.id));

      return {
        message: "enrollment updated successfully",
      };
    },

    getEnrollByFactoryId: async (factoryId: number) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

      const selectedEnroll = await database
        .select()
        .from(enrolls)
        .where(
          and(
            eq(enrolls.factoryId, factoryId),
            and(
              gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
              lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
            ),
          ),
        )
        .limit(1)
        .then((res) => res[0]);

      if (!selectedEnroll) {
        return { message: "no enrollment found" };
      }

      return selectedEnroll;
    },
  };
};

export const enrollService = createEnrollService(db);

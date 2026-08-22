import { and, count, desc, eq, getTableColumns, gte, isNull, lt, type SQL, sql } from "drizzle-orm";
import type { PgSelectQueryBuilder } from "drizzle-orm/pg-core";
import { status } from "elysia";
import { db } from "../drizzle";
import {
  covers,
  districts,
  enrolls,
  evaluators,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import type { CreateEnrollWithFilesDto, UpdateEnrollWithFilesDto } from "../schema/enroll";
import { buildPage, type PaginationQueryDto, resolvePage } from "../schema/pagination";
import { utilities } from "../utils";
import { latestCoverLogLateral } from "./coverStatus";

/** Cover-status filter value. `none` = enroll has no cover yet. */
export type CoverStatusFilter = "finished" | "in_progress" | "in_review" | "none";

export const createEnrollService = (database: typeof db) => {
  /**
   * Shared join chain for every enrollment list read.
   *
   * Both the count query and the page query are built from this one function, so they cannot drift
   * apart. That pairing is what makes `meta.total` describe the same population as `items` — the
   * invariant the previous JavaScript-side filter could not satisfy, because it had no count query
   * at all.
   *
   * `covers` is a plain LEFT JOIN and cannot multiply rows: an enrollment has at most one cover.
   * `coverLogs` IS one-to-many, which is why it arrives through the shared lateral (whose `LIMIT 1`
   * collapses it) rather than as a join. See docs/adr/0010.
   */
  const withEnrollJoins = <Q extends PgSelectQueryBuilder>(
    query: Q,
    latest: ReturnType<typeof latestCoverLogLateral>,
  ) =>
    query
      .innerJoin(factories, eq(enrolls.factoryId, factories.accountId))
      .innerJoin(provinces, eq(provinces.provinceId, factories.provinceId))
      .leftJoin(covers, eq(covers.enrollId, enrolls.id))
      .leftJoinLateral(latest, sql`true`);

  /** Item projection — unchanged from the pre-pagination shape, field for field. */
  const enrollListColumns = (latest: ReturnType<typeof latestCoverLogLateral>) => ({
    ...getTableColumns(enrolls),
    factory_name_th: factories.nameTh,
    region: provinces.healthRegion,
    provinceId: provinces.provinceId,
    coverId: covers.id,
    coverStatus: latest.status,
  });

  /**
   * The four filter values are NOT four comparisons.
   *
   * `none` means "this enrollment has no cover at all" and is an ABSENCE test on the cover join.
   * It must never be written as `latest.status IS NULL`, which would also match an enrollment whose
   * cover exists but has no log yet — a different population.
   */
  const coverStatusPredicate = (
    latest: ReturnType<typeof latestCoverLogLateral>,
    coverStatus?: CoverStatusFilter,
  ): SQL | undefined => {
    if (!coverStatus) return undefined;
    if (coverStatus === "none") return isNull(covers.id);
    return eq(latest.status, coverStatus);
  };

  /**
   * Total order: enrollDate DESC then id DESC.
   *
   * The primary direction is unchanged so staff see the same order as before. The `id` tiebreaker is
   * required, not cosmetic: `enrollDate` is not unique, and OFFSET over a non-total order can repeat
   * or skip rows between pages (docs/adr/0009).
   */
  const enrollListOrder = [desc(enrolls.enrollDate), desc(enrolls.id)] as const;

  const listEnrolls = async ({
    region,
    provinceId,
    coverStatus,
    fiscalYear,
    page,
    limit,
  }: {
    region?: number;
    provinceId?: number;
    coverStatus?: CoverStatusFilter;
    fiscalYear?: number;
  } & PaginationQueryDto) => {
    const {
      fiscalYear: resolvedFiscalYear,
      fiscalYearStart,
      fiscalYearEnd,
    } = utilities().getFiscalYear(fiscalYear);
    const resolved = resolvePage({ page, limit });
    const latest = latestCoverLogLateral(database);

    const predicate = and(
      gte(enrolls.enrollDate, fiscalYearStart.toISOString()),
      lt(enrolls.enrollDate, fiscalYearEnd.toISOString()),
      region === undefined ? undefined : eq(provinces.healthRegion, region),
      provinceId === undefined ? undefined : eq(provinces.provinceId, provinceId),
      coverStatusPredicate(latest, coverStatus),
    );

    const [total, items] = await Promise.all([
      withEnrollJoins(database.select({ value: count() }).from(enrolls).$dynamic(), latest)
        .where(predicate)
        .then((rows) => rows[0]?.value ?? 0),
      withEnrollJoins(database.select(enrollListColumns(latest)).from(enrolls).$dynamic(), latest)
        .where(predicate)
        .orderBy(...enrollListOrder)
        .limit(resolved.limit)
        .offset(resolved.offset),
    ]);

    // Every row was selected by the resolved window, so its fiscal year is that year by
    // construction — no need to re-derive it per row from `enroll_date`.
    const withFiscalYear = items.map((item) => ({ ...item, fiscalYear: resolvedFiscalYear }));

    return buildPage(withFiscalYear, total, resolved.page, resolved.limit);
  };

  return {
    getAllEnrollsByProvince: async (
      provinceId: number,
      coverStatus?: CoverStatusFilter,
      pagination?: PaginationQueryDto & { fiscalYear?: number },
    ) => listEnrolls({ provinceId, coverStatus, ...pagination }),

    getAllEnrolls: async (
      region?: number,
      provinceId?: number,
      coverStatus?: CoverStatusFilter,
      pagination?: PaginationQueryDto & { fiscalYear?: number },
    ) => listEnrolls({ region, provinceId, coverStatus, ...pagination }),

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

    getEnrollByFactoryId: async (factoryId: number, fiscalYear?: number) => {
      const {
        fiscalYear: resolvedFiscalYear,
        fiscalYearStart,
        fiscalYearEnd,
      } = utilities().getFiscalYear(fiscalYear);

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

      return { ...selectedEnroll, fiscalYear: resolvedFiscalYear };
    },
  };
};

export const enrollService = createEnrollService(db);

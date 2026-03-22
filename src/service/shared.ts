import { db } from "../drizzle";
import {
  factories,
  accounts,
  districts,
  subdistricts,
  enrolls,
  provinces,
  evaluators,
} from "../drizzle/schema";
import { eq, and, gte, lt, SQL, asc, getTableColumns, desc } from "drizzle-orm";
import { status } from "elysia";
import bcrypt from "bcrypt";
import { UpdateFactoryDto } from "../schema/factory";
import { utilities } from "../utils";
import {
  CreateEnrollWithFilesDto,
  UpdateEnrollWithFilesDto,
} from "../schema/enroll";

export const createSharedService = (database: typeof db) => {
  return {
    enroll: {
      getAllEnrolls: async (region?: number, provinceId?: number) => {
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

        return results;
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
          .leftJoin(
            subdistricts,
            eq(subdistricts.subdistrictId, factories.subdistrictId),
          )
          .where(eq(enrolls.id, enrollId))
          .limit(1)
          .then((res) => res[0]);

        if (!result) {
          throw status(400, { message: "enroll not found" });
        }

        return result;
      },

      create: async (dto: CreateEnrollWithFilesDto, factoryId: number) => {
        const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();

        // Check if any standard is true but file is missing
        const standards = [
          { bool: dto.standardHc, file: dto.fileStandardHc, name: "HC" },
          { bool: dto.standardSan, file: dto.fileStandardSan, name: "SAN" },
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
            throw status(400, {
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
          throw status(400, {
            message: "already make an enroll in fiscal year",
          });
        }

        const region = (
          await database
            .select({ region: provinces.healthRegion })
            .from(factories)
            .leftJoin(provinces, eq(provinces.provinceId, factories.provinceId))
            .where(eq(factories.accountId, factoryId))
            .limit(1)
            .then((result) => result[0])
        ).region;
        if (region === null || !region) {
          throw status(400, { message: "invalid factory id" });
        }

        const evaluatorsList = await database
          .select({ level: evaluators.level, id: evaluators.accountId })
          .from(evaluators)
          .where(eq(evaluators.region, region));
        if (evaluatorsList.length === 0) {
          throw status(400, { message: "evaluators not found" });
        }

        const extractedEvaluators = {
          evalDoh: evaluatorsList.filter(
            (evaluator) => evaluator.level === "DOH",
          )[0],
          evalMental: evaluatorsList.filter(
            (evaluator) => evaluator.level === "Mental",
          )[0],
          evalOdpc: evaluatorsList.filter(
            (evaluator) => evaluator.level === "ODPC",
          )[0],
        };

        const {
          fileStandardHc,
          fileStandardSan,
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
          fileStandardWellnessUrl,
          fileStandardSafetyUrl,
          fileStandardTis18001Url,
          fileStandardIso45001Url,
          fileStandardIso14001Url,
          fileStandardZeroUrl,
          fileStandard5SUrl,
          fileStandardHasUrl,
        ] = await Promise.all([
          fileStandardHc
            ? utilities().uploadFile(fileStandardHc)
            : Promise.resolve(null),
          fileStandardSan
            ? utilities().uploadFile(fileStandardSan)
            : Promise.resolve(null),
          fileStandardWellness
            ? utilities().uploadFile(fileStandardWellness)
            : Promise.resolve(null),
          fileStandardSafety
            ? utilities().uploadFile(fileStandardSafety)
            : Promise.resolve(null),
          fileStandardTis18001
            ? utilities().uploadFile(fileStandardTis18001)
            : Promise.resolve(null),
          fileStandardIso45001
            ? utilities().uploadFile(fileStandardIso45001)
            : Promise.resolve(null),
          fileStandardIso14001
            ? utilities().uploadFile(fileStandardIso14001)
            : Promise.resolve(null),
          fileStandardZero
            ? utilities().uploadFile(fileStandardZero)
            : Promise.resolve(null),
          fileStandard5S
            ? utilities().uploadFile(fileStandard5S)
            : Promise.resolve(null),
          fileStandardHas
            ? utilities().uploadFile(fileStandardHas)
            : Promise.resolve(null),
        ]);

        await database
          .insert(enrolls)
          .values({
            ...enrollData,
            fileStandardHcUrl,
            fileStandardSanUrl,
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

      updateEnroll: async (
        factoryId: number,
        dto: UpdateEnrollWithFilesDto,
      ) => {
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
          throw status(400, {
            message: "Enroll not found for this fiscal year",
          });
        }

        const {
          fileStandardHc,
          fileStandardSan,
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
            throw status(400, {
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
          fileStandardWellnessUrl,
          fileStandardSafetyUrl,
          fileStandardTis18001Url,
          fileStandardIso45001Url,
          fileStandardIso14001Url,
          fileStandardZeroUrl,
          fileStandard5SUrl,
          fileStandardHasUrl,
        ] = await Promise.all([
          processFile(
            standards[0].bool,
            fileStandardHc,
            existingEnroll.fileStandardHcUrl,
          ),
          processFile(
            standards[1].bool,
            fileStandardSan,
            existingEnroll.fileStandardSanUrl,
          ),
          processFile(
            standards[2].bool,
            fileStandardWellness,
            existingEnroll.fileStandardWellnessUrl,
          ),
          processFile(
            standards[3].bool,
            fileStandardSafety,
            existingEnroll.fileStandardSafetyUrl,
          ),
          processFile(
            standards[4].bool,
            fileStandardTis18001,
            existingEnroll.fileStandardTis18001Url,
          ),
          processFile(
            standards[5].bool,
            fileStandardIso45001,
            existingEnroll.fileStandardIso45001Url,
          ),
          processFile(
            standards[6].bool,
            fileStandardIso14001,
            existingEnroll.fileStandardIso14001Url,
          ),
          processFile(
            standards[7].bool,
            fileStandardZero,
            existingEnroll.fileStandardZeroUrl,
          ),
          processFile(
            standards[8].bool,
            fileStandard5S,
            existingEnroll.fileStandard5SUrl,
          ),
          processFile(
            standards[9].bool,
            fileStandardHas,
            existingEnroll.fileStandardHasUrl,
          ),
        ]);

        await database
          .update(enrolls)
          .set({
            ...updateData,
            fileStandardHcUrl,
            fileStandardSanUrl,
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

        return selectedEnroll;
      },
    },

    factory: {
      getFactoryById: async (factoryId: number) => {
        const factory = await database
          .select({
            account_id: factories.accountId,
            factory_type: factories.factoryType,
            name_th: factories.nameTh,
            name_en: factories.nameEn,
            tsic_code: factories.tsicCode,
            address_no: factories.addressNo,
            soi: factories.soi,
            road: factories.road,
            zipcode: factories.zipcode,
            phone_number: factories.phoneNumber,
            fax_number: factories.faxNumber,
            province_id: factories.provinceId,
            district_id: factories.districtId,
            subdistrict_id: factories.subdistrictId,
            is_validate: factories.isValidate,
            username: accounts.username,
            province_name_th: provinces.nameTh,
            district_name_th: districts.nameTh,
            subdistrict_name_th: subdistricts.nameTh,
          })
          .from(factories)
          .innerJoin(accounts, eq(factories.accountId, accounts.id))
          .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
          .innerJoin(districts, eq(factories.districtId, districts.districtId))
          .innerJoin(
            subdistricts,
            eq(factories.subdistrictId, subdistricts.subdistrictId),
          )
          .where(eq(factories.accountId, factoryId))
          .limit(1)
          .then((res) => res[0]);

        if (!factory) {
          throw status(404, { message: "factory not found" });
        }
        return factory;
      },
      getAllFactories: async ({
        validated,
        enrolled = true,
        provinceId,
        region,
      }: {
        validated: boolean;
        enrolled?: boolean;
        provinceId?: number;
        region?: number;
      }) => {
        const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
        const filters: (SQL | undefined)[] = [];
        if (enrolled && fiscalYearStart && fiscalYearEnd) {
          filters.push(gte(enrolls.enrollDate, fiscalYearStart.toISOString()));
          filters.push(lt(enrolls.enrollDate, fiscalYearEnd.toISOString()));
        }
        if (provinceId) {
          filters.push(eq(factories.provinceId, provinceId));
        }

        if (region) {
          filters.push(eq(provinces.healthRegion, region));
        }

        return await database
          .select({
            province_name_th: provinces.nameTh,
            district_name_th: districts.nameTh,
            subdistrict_name_th: subdistricts.nameTh,
            account_id: factories.accountId,
            factory_type: factories.factoryType,
            name_th: factories.nameTh,
            name_en: factories.nameEn,
            tsic_code: factories.tsicCode,
            address_no: factories.addressNo,
            soi: factories.soi,
            road: factories.road,
            zipcode: factories.zipcode,
            phone_number: factories.phoneNumber,
            fax_number: factories.faxNumber,
            is_validate: factories.isValidate,
          })
          .from(factories)
          .innerJoin(enrolls, eq(factories.accountId, enrolls.factoryId))
          .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
          .innerJoin(districts, eq(factories.districtId, districts.districtId))
          .innerJoin(
            subdistricts,
            eq(factories.subdistrictId, subdistricts.subdistrictId),
          )
          .where(and(...filters, eq(factories.isValidate, validated)))
          .orderBy(asc(factories.accountId));
      },
      update: async (accountId: number, dto: UpdateFactoryDto) => {
        const existingFactory = await database
          .select({ existingFactory: factories.accountId })
          .from(factories)
          .where(eq(factories.accountId, accountId))
          .limit(1)
          .then((res) => res[0]);

        if (!existingFactory) {
          throw status(400, { message: "factory not found" });
        }

        if (dto.password) {
          dto.password = await bcrypt.hash(dto.password, 12);
        }

        if (dto.subdistrictId) {
          const location = await database
            .select({
              province_id: districts.provinceId,
              district_id: districts.districtId,
              subdistrict_id: subdistricts.subdistrictId,
            })
            .from(subdistricts)
            .innerJoin(
              districts,
              eq(subdistricts.districtId, districts.districtId),
            )
            .where(eq(subdistricts.subdistrictId, dto.subdistrictId))
            .limit(1)
            .then((res) => res[0]);
          if (!location) {
            throw status(400, { message: "invalid subdistrict id" });
          }

          await database
            .update(factories)
            .set({
              subdistrictId: location.subdistrict_id,
              districtId: location.district_id,
              provinceId: location.province_id,
            })
            .where(eq(factories.accountId, accountId))
            .returning()
            .then((res) => res[0]);
        }

        const { email, password, ...factoryData } = dto;
        const accountData = { email, password };

        await database.transaction(async (tx) => {
          Object.keys(factoryData).length > 0
            ? await tx
                .update(factories)
                .set(factoryData)
                .where(eq(factories.accountId, accountId))
                .returning()
                .then((res) => res[0])
            : undefined;

          Object.keys(accountData).length > 0
            ? await tx
                .update(accounts)
                .set(accountData)
                .where(eq(accounts.id, accountId))
                .returning()
                .then((res) => res[0])
            : undefined;
        });
        return { message: "factory updated successfully" };
      },
    },
  };
};

export const sharedService = createSharedService(db);

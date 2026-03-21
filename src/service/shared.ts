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
import { CreateEnrollDto } from "../schema/enroll";

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

      create: async (dto: CreateEnrollDto, factoryId: number) => {
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

        await database
          .insert(enrolls)
          .values({
            ...dto,
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
          .leftJoin(enrolls, eq(factories.accountId, enrolls.factoryId))
          .leftJoin(provinces, eq(factories.provinceId, provinces.provinceId))
          .leftJoin(districts, eq(factories.districtId, districts.districtId))
          .leftJoin(
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

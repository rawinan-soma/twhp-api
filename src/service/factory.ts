import * as bcrypt from "bcrypt";
import { and, asc, eq, gte, lt, or, type SQL } from "drizzle-orm";
import { status } from "elysia";
import { db } from "../drizzle";
import {
  accounts,
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import type { CreateFactoryDto, UpdateFactoryDto } from "../schema/factory";
import { utilities } from "../utils";

const createFactoryHelper = (database: typeof db) => {
  return {
    getFactoryLocation: async (subdistrictId: number) => {
      const location = await database
        .select({
          province_id: districts.provinceId,
          district_id: districts.districtId,
          subdistrict_id: subdistricts.subdistrictId,
        })
        .from(subdistricts)
        .innerJoin(districts, eq(subdistricts.districtId, districts.districtId))
        .where(eq(subdistricts.subdistrictId, subdistrictId))
        .limit(1)
        .then((res) => res[0]);

      return location;
    },
  };
};

export const createFactoryService = (database: typeof db) => {
  const helper = createFactoryHelper(database);
  return {
    register: async (dto: CreateFactoryDto) => {
      const factory = await database
        .select({ existingFactory: accounts.username })
        .from(factories)
        .leftJoin(accounts, eq(accounts.id, factories.accountId))
        .where(or(eq(accounts.username, dto.username), eq(accounts.email, dto.email)))
        .then((res) => res[0]);

      const existingFactory = factory?.existingFactory;

      if (existingFactory) {
        return status(400, { message: "factory already registered" });
      }
      const location = await helper.getFactoryLocation(dto.subdistrictId);

      if (!location) {
        return status(404, { message: "location not found" });
      }
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      await database.transaction(async (tx) => {
        const account = await tx
          .insert(accounts)
          .values({
            email: dto.email,
            password: hashedPassword,
            role: "Factory",
            username: dto.username,
          })
          .returning()
          .then((res) => res[0]);

        const { password, email, username, ...factoryData } = dto;
        await tx
          .insert(factories)
          .values({
            accountId: account.id,
            provinceId: location.province_id,
            districtId: location.district_id,
            ...factoryData,
          })
          .returning()
          .then((res) => res[0]);
      });
      return { message: "factory created successfully" };
    },

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
        .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
        .where(eq(factories.accountId, factoryId))
        .limit(1)
        .then((res) => res[0]);

      if (!factory) {
        return status(404, { message: "factory not found" });
      }
      return factory;
    },

    getAllFactoriesByProvinceId: async ({
      validated,
      enrolled = true,
      provinceId,
    }: {
      validated: boolean;
      enrolled?: boolean;
      provinceId: number;
    }) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const filters: (SQL | undefined)[] = [];
      if (enrolled && fiscalYearStart && fiscalYearEnd) {
        filters.push(gte(enrolls.enrollDate, fiscalYearStart.toISOString()));
        filters.push(lt(enrolls.enrollDate, fiscalYearEnd.toISOString()));
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
        .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
        .where(
          and(
            ...filters,
            eq(factories.isValidate, validated),
            eq(factories.provinceId, provinceId),
          ),
        )
        .orderBy(asc(factories.accountId));
    },

    getAllFactoriesByRegion: async ({
      validated,
      enrolled = true,
      region,
    }: {
      validated: boolean;
      enrolled?: boolean;
      region: number;
    }) => {
      const filters: (SQL | undefined)[] = [];
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      if (enrolled && fiscalYearStart && fiscalYearEnd) {
        filters.push(gte(enrolls.enrollDate, fiscalYearStart.toISOString()));
        filters.push(lt(enrolls.enrollDate, fiscalYearEnd.toISOString()));
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
        .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
        .where(
          and(...filters, eq(factories.isValidate, validated), eq(provinces.healthRegion, region)),
        )
        .orderBy(asc(factories.accountId));
    },

    getAllFactories: async ({
      validated,
      enrolled,
    }: {
      validated: boolean;
      enrolled?: boolean;
    }) => {
      const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
      const filters: (SQL | undefined)[] = [];
      if (enrolled && fiscalYearStart && fiscalYearEnd) {
        filters.push(gte(enrolls.enrollDate, fiscalYearStart.toISOString()));
        filters.push(lt(enrolls.enrollDate, fiscalYearEnd.toISOString()));
      }

      return await database
        .select({
          username: accounts.username,
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
        .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
        .innerJoin(districts, eq(factories.districtId, districts.districtId))
        .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
        .innerJoin(accounts, eq(factories.accountId, accounts.id))
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
        return status(404, { message: "factory not found" });
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
          .innerJoin(districts, eq(subdistricts.districtId, districts.districtId))
          .where(eq(subdistricts.subdistrictId, dto.subdistrictId))
          .limit(1)
          .then((res) => res[0]);
        if (!location) {
          return status(400, { message: "invalid subdistrict id" });
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
  };
};

export const factoryService = createFactoryService(db);

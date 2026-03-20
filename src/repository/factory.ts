import { db } from "../drizzle";
import {
  accounts,
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import { eq, gte, lt, or, SQL, and, asc } from "drizzle-orm";
import type { CreateFactoryDto, UpdateFactoryDto } from "../schema/factory";

export const createFactoryRepository = (database: typeof db) => ({
  findOneByAccountId: async (accountId: number) => {
    return await database
      .select()
      .from(factories)
      .leftJoin(accounts, eq(factories.accountId, accounts.id))
      .leftJoin(provinces, eq(factories.provinceId, provinces.provinceId))
      .leftJoin(districts, eq(factories.districtId, districts.districtId))
      .leftJoin(
        subdistricts,
        eq(factories.subdistrictId, subdistricts.subdistrictId),
      )
      .where(eq(factories.accountId, accountId))
      .limit(1)
      .then((res) => res[0]);
  },
  create: async (
    dto: CreateFactoryDto,
    hashedPassword: string,
    provinceId: number,
    districtId: number,
  ) => {
    const result = await database.transaction(async (tx) => {
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

      const factory = await tx
        .insert(factories)
        .values({
          accountId: account.id,
          provinceId: provinceId,
          districtId: districtId,
          ...dto,
        })
        .returning()
        .then((res) => res[0]);
      return { account, factory };
    });
    return result;
  },

  updateFactoryLocation: async (
    accountId: number,
    location: {
      selectedDistrict: number | undefined;
      selectedProvince: number | undefined;
      selectedSubdistrict: number;
    },
  ) => {
    const locationData = {
      subdistrictId: location.selectedSubdistrict,
      ...(location.selectedDistrict !== undefined && {
        districtId: location.selectedDistrict,
      }),
      ...(location.selectedProvince !== undefined && {
        provinceId: location.selectedProvince,
      }),
    };

    return await database
      .update(factories)
      .set(locationData)
      .where(eq(factories.accountId, accountId))
      .returning()
      .then((res) => res[0]);
  },

  updateFactoryData: async (accountId: number, dto: UpdateFactoryDto) => {
    const { email, password, ...factoryData } = dto;
    const accountData = { email, password };
    return await database.transaction(async (tx) => {
      // const factoryData = {
      //   ...(dto.nameTh !== undefined && { nameTh: dto.nameTh }),
      //   ...(dto.nameEn !== undefined && { nameEn: dto.nameEn }),
      //   ...(dto.factoryType !== undefined && {
      //     factoryType: dto.factoryType,
      //   }),
      //   ...(dto.tsicCode !== undefined && { tsicCode: dto.tsicCode }),
      //   ...(dto.addressNo !== undefined && { addressNo: dto.addressNo }),
      //   ...(dto.soi !== undefined && { soi: dto.soi }),
      //   ...(dto.road !== undefined && { road: dto.road }),
      //   ...(dto.zipcode !== undefined && { zipcode: dto.zipcode }),
      //   ...(dto.phoneNumber !== undefined && {
      //     phoneNumber: dto.phoneNumber,
      //   }),
      //   ...(dto.faxNumber !== undefined && { faxNumber: dto.faxNumber }),
      // };

      // const accountData = {
      //   ...(dto.email !== undefined && { email: dto.email }),
      //   ...(dto.password !== undefined && { password: dto.password }),
      // };

      const factoryResult =
        Object.keys(factoryData).length > 0
          ? await tx
              .update(factories)
              .set(factoryData)
              .where(eq(factories.accountId, accountId))
              .returning()
              .then((res) => res[0])
          : undefined;

      const accountResult =
        Object.keys(accountData).length > 0
          ? await tx
              .update(accounts)
              .set(accountData)
              .where(eq(accounts.id, accountId))
              .returning()
              .then((res) => res[0])
          : undefined;

      return { factory: factoryResult, account: accountResult };
    });
  },

  validate: async (factoryId: number) => {
    return await database
      .update(factories)
      .set({ isValidate: true })
      .where(eq(factories.accountId, factoryId))
      .returning()
      .then((res) => res[0]);
  },

  findAll: async ({
    validated,
    enrolled,
    provinceId,
    region,
    start,
    end,
  }: {
    validated: boolean;
    enrolled: boolean;
    provinceId?: number;
    region?: number;
    start?: Date;
    end?: Date;
  }) => {
    const filters: (SQL | undefined)[] = [];
    if (enrolled && start && end) {
      filters.push(gte(enrolls.enrollDate, start.toISOString()));
      filters.push(lt(enrolls.enrollDate, end.toISOString()));
    }
    if (provinceId) {
      filters.push(eq(factories.provinceId, provinceId));
    }

    if (region) {
      filters.push(eq(provinces.healthRegion, region));
    }

    return await database
      .select()
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
});

export const factoryRepository = createFactoryRepository(db);

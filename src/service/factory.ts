import * as bcrypt from "bcrypt";
import { and, asc, count, eq, exists, gte, lt, or, type SQL, sql } from "drizzle-orm";
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
import { buildPage, type PaginationQueryDto, resolvePage } from "../schema/pagination";
import { utilities } from "../utils";

/** Shared projection for every factory list variant. The Admin variant prepends `username`. */
const factoryListColumns = {
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
};

type FactoryListParams = { validated: boolean; enrolled?: boolean } & PaginationQueryDto;

/**
 * The `enrolled` filter as a correlated EXISTS rather than a join, so a factory with several
 * enrollments produces one row instead of one row per enrollment. Under pagination the old join
 * made `total` count join rows and let one factory straddle a page boundary.
 * See docs/adr/0008-exists-subquery-for-enrolled-filter.md.
 *
 * `withFiscalYear` narrows to the current fiscal year. When false the predicate asserts only that
 * at least one enrollment exists, which is what the previous innerJoin did on the region and
 * province variants.
 */
const enrollExists = (database: typeof db, withFiscalYear: boolean) => {
  const conditions: (SQL | undefined)[] = [eq(enrolls.factoryId, factories.accountId)];
  if (withFiscalYear) {
    const { fiscalYearStart, fiscalYearEnd } = utilities().getFiscalYear();
    conditions.push(gte(enrolls.enrollDate, fiscalYearStart.toISOString()));
    conditions.push(lt(enrolls.enrollDate, fiscalYearEnd.toISOString()));
  }
  return exists(
    database
      .select({ n: sql`1` })
      .from(enrolls)
      .where(and(...conditions)),
  );
};

/**
 * Counts under the SAME predicate as the page query and replicates its joins, so inner-join
 * exclusions apply identically. `total` and `items` must never be built from different predicates —
 * that is the one pagination invariant spanning two separate queries.
 */
const countFactories = async (
  database: typeof db,
  predicate: SQL | undefined,
  withAccounts = false,
) => {
  let query = database
    .select({ value: count() })
    .from(factories)
    .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
    .innerJoin(districts, eq(factories.districtId, districts.districtId))
    .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
    .$dynamic();
  if (withAccounts) {
    query = query.innerJoin(accounts, eq(factories.accountId, accounts.id));
  }
  const rows = await query.where(predicate);
  return rows[0]?.value ?? 0;
};

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

    /**
     * `provinceId`, when given, additionally constrains the row to that province — used by the
     * Provincial Officer route to scope the read without a second query or duplicated joins. A
     * factory that exists but is outside the given province is indistinguishable from a
     * non-existent one: both fall through to the same 404.
     */
    getFactoryById: async (factoryId: number, provinceId?: number) => {
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
        .where(
          and(
            eq(factories.accountId, factoryId),
            provinceId !== undefined ? eq(factories.provinceId, provinceId) : undefined,
          ),
        )
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
      page,
      limit,
    }: FactoryListParams & { provinceId: number }) => {
      const resolved = resolvePage({ page, limit });
      // Province variant previously used innerJoin(enrolls), so a factory with no enrollment was
      // excluded regardless of `enrolled`. EXISTS is therefore unconditional here; only the
      // fiscal-year window is conditional. See docs/adr/0008.
      const predicate = and(
        eq(factories.isValidate, validated),
        eq(factories.provinceId, provinceId),
        enrollExists(database, enrolled),
      );

      const [total, items] = await Promise.all([
        countFactories(database, predicate),
        database
          .select(factoryListColumns)
          .from(factories)
          .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
          .innerJoin(districts, eq(factories.districtId, districts.districtId))
          .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
          .where(predicate)
          .orderBy(asc(factories.accountId))
          .limit(resolved.limit)
          .offset(resolved.offset),
      ]);

      return buildPage(items, total, resolved.page, resolved.limit);
    },

    getAllFactoriesByRegion: async ({
      validated,
      enrolled = true,
      region,
      page,
      limit,
    }: FactoryListParams & { region: number }) => {
      const resolved = resolvePage({ page, limit });
      // Region variant previously used innerJoin(enrolls) — same reasoning as the province variant.
      const predicate = and(
        eq(factories.isValidate, validated),
        eq(provinces.healthRegion, region),
        enrollExists(database, enrolled),
      );

      const [total, items] = await Promise.all([
        countFactories(database, predicate),
        database
          .select(factoryListColumns)
          .from(factories)
          .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
          .innerJoin(districts, eq(factories.districtId, districts.districtId))
          .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
          .where(predicate)
          .orderBy(asc(factories.accountId))
          .limit(resolved.limit)
          .offset(resolved.offset),
      ]);

      return buildPage(items, total, resolved.page, resolved.limit);
    },

    getAllFactories: async ({ validated, enrolled, page, limit }: FactoryListParams) => {
      const resolved = resolvePage({ page, limit });
      // Admin variant previously used leftJoin(enrolls) with the fiscal-year predicate applied only
      // when `enrolled` is true — so an unfiltered call returned every factory, duplicated once per
      // enrollment row. EXISTS is applied only when `enrolled` is true, preserving which factories
      // are selected while removing the duplicates. See docs/adr/0008.
      const predicate = and(
        eq(factories.isValidate, validated),
        enrolled ? enrollExists(database, true) : undefined,
      );

      const [total, items] = await Promise.all([
        countFactories(database, predicate, true),
        database
          .select({ username: accounts.username, email: accounts.email, ...factoryListColumns })
          .from(factories)
          .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
          .innerJoin(districts, eq(factories.districtId, districts.districtId))
          .innerJoin(subdistricts, eq(factories.subdistrictId, subdistricts.subdistrictId))
          .innerJoin(accounts, eq(factories.accountId, accounts.id))
          .where(predicate)
          .orderBy(asc(factories.accountId))
          .limit(resolved.limit)
          .offset(resolved.offset),
      ]);

      return buildPage(items, total, resolved.page, resolved.limit);
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

import { getTableColumns, eq, and, gte, lt, desc } from "drizzle-orm";
import { db } from "../drizzle";
import {
  districts,
  enrolls,
  factories,
  provinces,
  subdistricts,
} from "../drizzle/schema";
import type { CreateEnrollDto } from "../schema/enroll";

export const createEnrollRepository = (database: typeof db) => ({
  findAllByEnrollDate: async (start: Date, end: Date) => {
    return database
      .select({
        ...getTableColumns(enrolls),
        factory_name_th: factories.nameTh,
        region: provinces.healthRegion,
        provinceId: provinces.provinceId,
      })
      .from(enrolls)
      .leftJoin(factories, eq(enrolls.factoryId, factories.accountId))
      .leftJoin(provinces, eq(provinces.provinceId, factories.provinceId))
      .where(
        and(
          gte(enrolls.enrollDate, start.toISOString()),
          lt(enrolls.enrollDate, end.toISOString()),
        ),
      )
      .orderBy(desc(enrolls.enrollDate));
  },

  findOneByFactoryId: async (factoryId: number, start: Date, end: Date) => {
    return await database
      .select()
      .from(enrolls)
      .where(
        and(
          eq(enrolls.factoryId, factoryId),
          and(
            gte(enrolls.enrollDate, start.toISOString()),
            lt(enrolls.enrollDate, end.toISOString()),
          ),
        ),
      )
      .limit(1)
      .then((res) => res[0]);
  },

  findOneByEnrollId: async (enrollId: number) => {
    return await database
      .select()
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
  },

  create: async (
    dto: CreateEnrollDto,
    factoryId: number,
    eval_mental: number,
    eval_odpc: number,
    eval_doh: number,
  ) => {
    return await database
      .insert(enrolls)
      .values({
        ...dto,
        factoryId: factoryId,
        evalMentalId: eval_mental,
        evalOdpcId: eval_odpc,
        evalDohId: eval_doh,
      })
      .returning()
      .then((res) => res[0]);
  },
});

export const enrollRepository = createEnrollRepository(db);

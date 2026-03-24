import { type CreateFactoryDto } from "../schema/factory";
import * as bcrypt from "bcrypt";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import {
  accounts,
  factories,
  districts,
  subdistricts,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

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
        .then((res) => res[0]);

      const existingFactory = factory?.existingFactory;
      console.log(existingFactory);
      if (existingFactory) {
        return status(400, { message: "factory already registered" });
      }
      const location = await helper.getFactoryLocation(dto.subdistrictId);
      const hashedPassword = await bcrypt.hash(dto.password, 12);

      if (!location) {
        return status(404, { message: "location not found" });
      }

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

        await tx
          .insert(factories)
          .values({
            accountId: account.id,
            provinceId: location.province_id,
            districtId: location.district_id,
            ...dto,
          })
          .returning()
          .then((res) => res[0]);
      });
      return { message: "factory created successfully" };
    },
  };
};

export const factoryService = createFactoryService(db);

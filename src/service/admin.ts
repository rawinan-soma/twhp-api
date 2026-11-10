import * as bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import { accounts, adminsDoed, awards, factories, provinces } from "../drizzle/schema";
import type { UpdateAdminDto } from "../schema/admin";
import type { PriorAwardDto } from "../schema/factory";
import { hasValues } from "./hasValues";

export const createAdminService = (database: typeof db) => {
  return {
    editAdminData: async (accountId: number, dto: UpdateAdminDto) => {
      const currentAdminId = await database
        .select({ currentAdminId: adminsDoed.accountId })
        .from(adminsDoed)
        .where(eq(adminsDoed.accountId, accountId))
        .limit(1)
        .then((res) => res[0]);

      if (!currentAdminId) {
        return status(400, { message: "admin not found" });
      }

      const adminPatch = {
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
      };
      const accountPatch = {
        email: dto.email,
        password: dto.password ? await bcrypt.hash(dto.password, 12) : undefined,
      };

      await database.transaction(async (tx) => {
        if (hasValues(adminPatch)) {
          await tx.update(adminsDoed).set(adminPatch).where(eq(adminsDoed.accountId, accountId));
        }

        if (hasValues(accountPatch)) {
          await tx.update(accounts).set(accountPatch).where(eq(accounts.id, accountId));
        }
      });

      return {
        message: "admin updated!",
      };
    },

    deleteFactory: async (factoryId: number) => {
      const existingFactory = await database
        .select({ id: accounts.id })
        .from(accounts)
        .where(eq(accounts.id, factoryId))
        .limit(1)
        .then((res) => res[0]);

      if (!existingFactory) {
        return status(404, { message: "factory not found" });
      }

      await database
        .delete(factories)
        .where(eq(factories.accountId, factoryId))
        .returning({ deletedId: factories.accountId })
        .then((res) => res[0]);

      return { message: "factory deleted!" };
    },
    approveFactoryRegister: async (accountId: number, priorAwards: PriorAwardDto[] = []) => {
      const years = priorAwards.map((award) => award.fiscalYear);
      const repeated = [...new Set(years.filter((year, i) => years.indexOf(year) !== i))];
      if (repeated.length > 0) {
        return status(400, { message: `fiscal year repeated: ${repeated.join(", ")}` });
      }

      try {
        return await database.transaction(async (tx) => {
          const factory = await tx
            .select({ isValidate: factories.isValidate })
            .from(factories)
            .where(eq(factories.accountId, accountId))
            .for("update")
            .then((res) => res[0]);
          if (!factory) {
            return status(404, { message: "factory not found" });
          }
          if (factory.isValidate) {
            return status(400, { message: "factory already validated" });
          }

          await tx
            .update(factories)
            .set({ isValidate: true })
            .where(eq(factories.accountId, accountId));

          if (priorAwards.length > 0) {
            const inserted = await tx
              .insert(awards)
              .values(priorAwards.map((award) => ({ ...award, factoryId: accountId })))
              .onConflictDoNothing({ target: [awards.factoryId, awards.fiscalYear] })
              .returning({ fiscalYear: awards.fiscalYear });
            const recorded = new Set(inserted.map((row) => row.fiscalYear));
            const conflicting = years.filter((year) => !recorded.has(year));
            if (conflicting.length > 0) {
              throw status(400, {
                message: `award already exists for fiscal year: ${conflicting.join(", ")}`,
              });
            }
          }

          return { message: "factory validated!" };
        });
      } catch (e) {
        if (e instanceof ElysiaCustomStatusResponse) return e;
        throw e;
      }
    },

    getPendingValidationData: async () => {
      const doedAdmins = await database
        .select({
          email: accounts.email,
          firstName: adminsDoed.firstName,
          lastName: adminsDoed.lastName,
        })
        .from(adminsDoed)
        .innerJoin(accounts, eq(accounts.id, adminsDoed.accountId));

      const pendingFactories = await database
        .select({
          accountId: factories.accountId,
          nameTh: factories.nameTh,
          nameEn: factories.nameEn,
          phoneNumber: factories.phoneNumber,
          provinceName: provinces.nameTh,
        })
        .from(factories)
        .innerJoin(provinces, eq(factories.provinceId, provinces.provinceId))
        .where(eq(factories.isValidate, false));

      return { doedAdmins, pendingFactories };
    },
  };
};

export const adminService = createAdminService(db);

import { db } from "../drizzle";
import { accounts, adminsDoed, credentials, factories, provinces } from "../drizzle/schema";
import type { UpdateAdminDto } from "../schema/admin";
import * as bcrypt from "bcrypt";
import { status } from "elysia";
import { eq } from "drizzle-orm";

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

      if (dto.password) {
        dto.password = await bcrypt.hash(dto.password, 12);
      }

      await database.transaction(async (tx) => {
        await tx
          .update(adminsDoed)
          .set({
            firstName: dto.firstName,
            lastName: dto.lastName,
            phoneNumber: dto.phoneNumber,
          })
          .where(eq(adminsDoed.accountId, accountId));

        if (dto.email !== undefined) {
          await tx.update(accounts).set({ email: dto.email }).where(eq(accounts.id, accountId));
        }

        if (dto.password !== undefined) {
          await tx
            .update(credentials)
            .set({ password: dto.password, updatedAt: new Date() })
            .where(and(eq(credentials.userId, accountId), eq(credentials.providerId, "credential")));
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
    approveFactoryRegister: async (accountId: number) => {
      const factory = await database
        .select({ isValidate: factories.isValidate, id: factories.accountId })
        .from(factories)
        .where(eq(factories.accountId, accountId))
        .limit(1)
        .then((res) => res[0]);
      if (!factory) {
        return status(404, { message: "factory not found" });
      }
      if (factory.isValidate) {
        return status(400, { message: "factory already validated" });
      }

      await database
        .update(factories)
        .set({ isValidate: true })
        .where(eq(factories.accountId, accountId))
        .returning()
        .then((res) => res[0]);
      return {
        message: "factory validated!",
      };
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

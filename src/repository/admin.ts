import { db } from "../drizzle";
import { accounts, adminsDoed } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import type { UpdateAdminDto } from "../schema/admin";

export const createAdminRepository = (database: typeof db) => ({
  findOneById: async (accountId: number) => {
    return await database
      .select({ id: accounts.id })
      .from(adminsDoed)
      .leftJoin(accounts, eq(adminsDoed.accountId, accounts.id))
      .where(eq(adminsDoed.accountId, accountId))
      .limit(1)
      .then((res) => res[0]);
  },
  update: async (accountId: number, dto: UpdateAdminDto) => {
    return await database.transaction(async (tx) => {
      const adminResult = await tx
        .update(adminsDoed)
        .set({
          firstName: dto.firstName,
          lastName: dto.lastName,
          phoneNumber: dto.phoneNumber,
        })
        .where(eq(adminsDoed.accountId, accountId))
        .returning()
        .then((res) => res[0]);

      const accountResult = await tx
        .update(accounts)
        .set({
          email: dto.email,
          password: dto.password,
        })
        .where(eq(accounts.id, accountId))
        .returning()
        .then((res) => res[0]);

      return { admin: adminResult, account: accountResult };
    });
  },
});

export const adminRepository = createAdminRepository(db);

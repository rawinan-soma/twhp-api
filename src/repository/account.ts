import { db } from "../drizzle";
import {
  accounts,
  adminsDoed,
  evaluators,
  factories,
  provincialOfficers,
} from "../drizzle/schema";
import { eq } from "drizzle-orm";

export const createAccountRepository = (database: typeof db) => ({
  findOneIdByUsername: async (username: string) => {
    return await database
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.username, username))
      .limit(1)
      .then((res) => res[0]);
  },

  findOneByEmail: async (email: string) => {
    return await database
      .select()
      .from(accounts)
      .where(eq(accounts.email, email))
      .limit(1)
      .then((res) => res[0]);
  },

  findOneByUsername: async (username: string) => {
    return await database
      .select()
      .from(accounts)
      .leftJoin(factories, eq(accounts.id, factories.accountId))
      .where(eq(accounts.username, username))
      .limit(1)
      .then((res) => res[0]);
  },

  delete: async (accountId: number) => {
    return await database.delete(accounts).where(eq(accounts.id, accountId));
  },

  findOneById: async (accountId: number) => {
    return await database
      .select({
        account: accounts,
        admin: adminsDoed,
        evaluator: evaluators,
        factory: factories,
        provincialOfficer: provincialOfficers,
      })
      .from(accounts)
      .leftJoin(adminsDoed, eq(accounts.id, adminsDoed.accountId))
      .leftJoin(evaluators, eq(accounts.id, evaluators.accountId))
      .leftJoin(factories, eq(accounts.id, factories.accountId))
      .leftJoin(
        provincialOfficers,
        eq(accounts.id, provincialOfficers.accountId),
      )
      .where(eq(accounts.id, accountId))
      .then((res) => res[0]);
  },

  updateRefreshToken: async (refreshToken: string, accountId: number) => {
    await database
      .update(accounts)
      .set({ hashedRefreshToken: refreshToken })
      .where(eq(accounts.id, accountId));
  },

  findRefreshTokenById: async (id: number) => {
    return await database
      .select({
        hashedRefreshToken: accounts.hashedRefreshToken,
        id: accounts.id,
      })
      .from(accounts)
      .where(eq(accounts.id, id))
      .then((res) => res[0]);
  },
  findIdByRefreshToken: async (refreshToken: string) => {
    return await database
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.hashedRefreshToken, refreshToken))
      .then((res) => res[0]);
  },

  updatePassword: async (email: string, password: string) => {
    return await database
      .update(accounts)
      .set({ password: password })
      .where(eq(accounts.email, email));
  },
});

export const accountRepository = createAccountRepository(db);

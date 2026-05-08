import * as bcrypt from "bcrypt";
import { randomBytes } from "crypto";
import { redisConnector } from "../utils";
import { emailQueue } from "../queue/email";
import { status } from "elysia";
import { db } from "../drizzle";
import {
  accounts,
  adminsDoed,
  credentials,
  evaluators,
  factories,
  provincialOfficers,
} from "../drizzle/schema";
import { and, eq, sql } from "drizzle-orm";

export enum Role {
  Factory = "Factory",
  Provincial = "Provincial",
  Evaluator = "Evaluator",
  DOED = "DOED",
}

const createAuthentocationService = (database: typeof db) => ({
  getAccountById: async (accountId: number) => {
    const selectedAccount = await database
      .select({
        id: accounts.id,
        username: accounts.username,
        role: accounts.role,
        change_pw:
          sql<boolean>`COALESCE(${evaluators.isChangePassword}, ${provincialOfficers.isChangePassword}, false)`.as(
            "change_pw",
          ),
        eval_level: evaluators.level,
        firstName: sql<string>`COALESCE(${provincialOfficers.firstName}, ${evaluators.firstName}, ${adminsDoed.firstName}, ${factories.nameTh})`,
        lastName: sql<string>`COALESCE(${provincialOfficers.lastName}, ${evaluators.lastName}, ${adminsDoed.lastName})`,
      })
      .from(accounts)
      .leftJoin(adminsDoed, eq(accounts.id, adminsDoed.accountId))
      .leftJoin(evaluators, eq(accounts.id, evaluators.accountId))
      .leftJoin(factories, eq(accounts.id, factories.accountId))
      .leftJoin(provincialOfficers, eq(accounts.id, provincialOfficers.accountId))
      .where(eq(accounts.id, accountId))
      .then((res) => res[0]);

    if (!selectedAccount) {
      return status(400, { message: "invalid credential" });
    }
    if (selectedAccount.role === "DOED" || selectedAccount.role === "Factory") {
      selectedAccount.change_pw = true;
    }

    return {
      ...selectedAccount,
      full_name:
        selectedAccount.role === "DOED"
          ? `${selectedAccount.firstName} ${selectedAccount.lastName}`
          : selectedAccount.role === "Factory"
            ? `${selectedAccount.firstName}`
            : `${selectedAccount.firstName}${selectedAccount.lastName}`,
    };
  },
});

export const createAuthenticationUsecase = (database: typeof db) => {
  const helper = createAuthentocationService(database);
  return {
    helper,
    sendPasswordResetEmail: async (email: string) => {
      const pending = await redisConnector.get(`reset_password_token:${email}`);
      if (pending) {
        return status(429, {
          message: "password reset email already sent, please wait before requesting again",
        });
      }

      const token = randomBytes(32).toString("hex");
      const [user] = await database
        .select()
        .from(accounts)
        .where(eq(accounts.email, email));
      if (!user) {
        return status(404, { message: "email not found" });
      }
      await redisConnector.set(`reset_password_token:${token}`, email, "EX", 300);
      await redisConnector.set(`reset_password_token:${email}`, token, "EX", 300);

      await emailQueue.add(
        "password-reset-request",
        { email, token },
        { attempts: 3, backoff: 5000, removeOnComplete: true, removeOnFail: { count: 10 } },
      );
      return { message: "sending password reset email" };
    },

    updatePassword: async (password: string, token: string) => {
      const email = await redisConnector.get(`reset_password_token:${token}`);
      if (!email) {
        return status(400, { message: "invalid token" });
      }

      const user = await database
        .select({ id: accounts.id, credPassword: credentials.password })
        .from(accounts)
        .innerJoin(
          credentials,
          and(eq(credentials.userId, accounts.id), eq(credentials.providerId, "credential")),
        )
        .where(eq(accounts.email, email))
        .limit(1)
        .then((res) => res[0]);

      if (!user) {
        return status(400, { message: "invalid token" });
      }

      if (await bcrypt.compare(password, user.credPassword!)) {
        return status(400, { message: "old password are not allowed" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await database
        .update(credentials)
        .set({ password: hashedPassword, updatedAt: new Date() })
        .where(and(eq(credentials.userId, user.id), eq(credentials.providerId, "credential")));

      await redisConnector.del(`reset_password_token:${token}`);
      await redisConnector.del(`reset_password_token:${email}`);
      return { message: "password changed!" };
    },

    editFirstPassword: async (
      accountId: number,
      password: string,
      email: string,
      userType: "Provincial" | "Evaluator",
    ) => {
      if (userType === "Evaluator") {
        const [user] = await database
          .select({ account: accounts, evaluator: evaluators })
          .from(accounts)
          .leftJoin(evaluators, eq(evaluators.accountId, accounts.id))
          .where(eq(accounts.id, accountId));

        if (!user || user.evaluator === null) {
          return status(404, { message: "user not found" });
        }
        if (user.evaluator.isChangePassword) {
          return status(400, { message: "password already changed" });
        }

        const [existingEmail] = await database.select().from(accounts).where(eq(accounts.email, email));
        if (existingEmail) {
          return status(400, { message: "email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await database.transaction(async (tx) => {
          const [account] = await tx
            .update(accounts)
            .set({ email })
            .where(eq(accounts.id, accountId))
            .returning();

          await tx.update(evaluators).set({ isChangePassword: true }).where(eq(evaluators.accountId, account.id));
          await tx
            .update(credentials)
            .set({ password: hashedPassword, updatedAt: new Date() })
            .where(and(eq(credentials.userId, account.id), eq(credentials.providerId, "credential")));
        });
      } else {
        const [user] = await database
          .select({ account: accounts, provincialOfficer: provincialOfficers })
          .from(accounts)
          .leftJoin(provincialOfficers, eq(provincialOfficers.accountId, accounts.id))
          .where(eq(accounts.id, accountId));

        if (!user || user.provincialOfficer === null) {
          return status(404, { message: "user not found" });
        }
        if (user.provincialOfficer.isChangePassword) {
          return status(400, { message: "password already changed" });
        }

        const [existingEmail] = await database.select().from(accounts).where(eq(accounts.email, email));
        if (existingEmail) {
          return status(400, { message: "email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await database.transaction(async (tx) => {
          const [account] = await tx
            .update(accounts)
            .set({ email })
            .where(eq(accounts.id, accountId))
            .returning();

          await tx
            .update(provincialOfficers)
            .set({ isChangePassword: true })
            .where(eq(provincialOfficers.accountId, account.id));
          await tx
            .update(credentials)
            .set({ password: hashedPassword, updatedAt: new Date() })
            .where(and(eq(credentials.userId, account.id), eq(credentials.providerId, "credential")));
        });
      }

      return { message: "password changed!" };
    },
  };
};

export const authenticationService = createAuthenticationUsecase(db);

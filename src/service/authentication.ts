import * as bcrypt from "bcrypt";
import { env } from "../config";
import { SignJWT } from "jose";
import { randomBytes } from "crypto";
import { redisConnector } from "../utils";
import { emailQueue } from "../queue/email";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { db } from "../drizzle";
import { accounts, adminsDoed, evaluators, factories, provincialOfficers } from "../drizzle/schema";
import { eq, sql } from "drizzle-orm";
import { evaluatorService } from "./evaluator";

export enum Role {
  Factory = "Factory",
  Provincial = "Provincial",
  Evaluator = "Evaluator",
  DOED = "DOED",
}

const createAuthentocationService = (database: typeof db) => ({
  setRefreshToken: async (refreshToken: string, accountId: number) => {
    await database.update(accounts).set({ hashedRefreshToken: refreshToken }).where(eq(accounts.id, accountId));
  },
  removeRefreshToken: async (id: number) => {
    await database.update(accounts).set({ hashedRefreshToken: "" }).where(eq(accounts.id, id));
  },
  issueToken: async (id: number, username: string, role: Role, tokenType: "Authentication" | "Refresh") => {
    let token: string = "";
    if (tokenType === "Authentication") {
      const payload: {
        username: string;
        role: Role;
      } = {
        username: username,
        role: role,
      };

      token = await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(id.toString())
        .setIssuedAt()
        .setExpirationTime(`${env.AUTH_TOKEN_EXP}s`)
        .sign(new TextEncoder().encode(env.AUTH_JWT_SECRET));
    }

    if (tokenType === "Refresh") {
      const payload: { username: string } = {
        username: username,
      };
      token = await new SignJWT(payload)
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(id.toString())
        .setIssuedAt()
        .setExpirationTime(`${env.REFRESH_TOKEN_EXP}s`)
        .sign(new TextEncoder().encode(env.REFRESH_JWT_SECRET));
    }
    if (token === "") {
      return status(500, { message: "cannot issue token" });
    }

    return token;
  },
  getCookieOption(tokenType: "Authentication" | "logout" | "Refresh") {
    if (tokenType === "logout") {
      return {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: "lax" as const,
        path: "/",
        maxAge: 0,
      };
    }

    if (tokenType === "Authentication") {
      return {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: "lax" as const,
        path: "/",
        maxAge: env.AUTH_TOKEN_EXP,
      };
    }

    if (tokenType === "Refresh") {
      return {
        httpOnly: true,
        secure: env.COOKIE_SECURE,
        sameSite: "lax" as const,
        path: "/",
        maxAge: env.REFRESH_TOKEN_EXP,
      };
    }
  },

  getUserFromRefreshToken: async (refreshToken: string) => {
    const hashedRefreshToken = Bun.SHA256.hash(refreshToken, "hex");
    const currentUser = await database
      .select({ id: accounts.id })
      .from(accounts)
      .where(eq(accounts.hashedRefreshToken, hashedRefreshToken))
      .then((res) => res[0]);

    if (!currentUser) {
      return status(401, { message: "invalid refresh token" });
    }

    return currentUser.id;
  },
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

    return selectedAccount;
  },
});

export const createAuthenticationUsecase = (database: typeof db) => {
  const helper = createAuthentocationService(database);
  return {
    helper,
    getAutheticatedAccount: async (username: string, password: string) => {
      const user = await database
        .select({
          username: accounts.username,
          role: accounts.role,
          id: accounts.id,
          isValidate: factories.isValidate,
          password: accounts.password,
        })
        .from(accounts)
        .leftJoin(factories, eq(accounts.id, factories.accountId))
        .where(eq(accounts.username, username))
        .limit(1)
        .then((res) => res[0]);

      if (!user || !(await bcrypt.compare(password, user.password))) {
        return status(401, {
          message: "invalid username or password",
        });
      }

      if (user.role === "Factory" && !user.isValidate) {
        return status(401, { message: "factory not validate" });
      }

      return {
        username: user.username,
        role: user.role,
        id: user.id,
      };
    },

    rotateToken: async (refreshToken: string) => {
      const id = await helper.getUserFromRefreshToken(refreshToken);

      if (id instanceof ElysiaCustomStatusResponse) {
        return id;
      }

      const currentUser = await helper.getAccountById(id);

      if (currentUser instanceof ElysiaCustomStatusResponse) {
        return currentUser;
      }

      const newAccessToken = await helper.issueToken(
        currentUser.id,
        currentUser.username,
        currentUser.role as Role,
        "Authentication",
      );

      if (newAccessToken instanceof ElysiaCustomStatusResponse) {
        return newAccessToken;
      }

      const newRefreshToken = await helper.issueToken(
        currentUser.id,
        currentUser.username,
        currentUser.role as Role,
        "Refresh",
      );

      if (newRefreshToken instanceof ElysiaCustomStatusResponse) {
        return newRefreshToken;
      }

      const hashedRefreshToken = Bun.SHA256.hash(newRefreshToken, "hex");

      await helper.setRefreshToken(hashedRefreshToken, currentUser.id);

      return { newAccessToken, newRefreshToken };
    },

    sendPasswordResetEmail: async (email: string) => {
      const pending = await redisConnector.get(`reset_password_token:${email}`);
      if (pending) {
        return status(429, { message: "password reset email already sent, please wait before requesting again" });
      }

      const token = randomBytes(32).toString("hex");
      const [user] = await database.select().from(accounts).where(eq(accounts.email, email));
      if (!user) {
        return status(404, { message: "email not found" });
      }
      await redisConnector.set(`reset_password_token:${token}`, email, "EX", 300);
      await redisConnector.set(`reset_password_token:${email}`, token, "EX", 300);

      await emailQueue.add(
        "password-reset-request",
        {
          email: email,
          token: token,
        },
        { attempts: 3, backoff: 5000 },
      );
      return { message: "sending password reset email" };
    },

    updatePassword: async (password: string, token: string) => {
      const email = await redisConnector.get(`reset_password_token:${token}`);
      if (!email) {
        return status(400, { message: "invalid token" });
      }

      const user = await database
        .select({ id: accounts.id, password: accounts.password })
        .from(accounts)
        .where(eq(accounts.email, email))
        .limit(1)
        .then((res) => res[0]);

      if (!user) {
        return status(400, { message: "invalid token" });
      }

      if (await bcrypt.compare(password, user.password)) {
        return status(400, { message: "old password are not allowed" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await database.update(accounts).set({ password: hashedPassword }).where(eq(accounts.email, email));

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
            .set({ password: hashedPassword, email })
            .where(eq(accounts.id, accountId))
            .returning();

          await tx.update(evaluators).set({ isChangePassword: true }).where(eq(evaluators.accountId, account.id));
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
            .set({ password: hashedPassword, email })
            .where(eq(accounts.id, accountId))
            .returning();

          await tx
            .update(provincialOfficers)
            .set({ isChangePassword: true })
            .where(eq(provincialOfficers.accountId, account.id));
        });
      }

      return { message: "password changed!" };
    },
  };
};

export const authenticationService = createAuthenticationUsecase(db);

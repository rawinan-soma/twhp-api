import { accountRepository } from "../repository/account";
import * as bcrypt from "bcrypt";
import { factoryRepository } from "../repository/factory";

import { env } from "../config";
import { SignJWT } from "jose";
import { randomBytes } from "crypto";
import { redisConnector } from "../utils";
import { emailQueue } from "../queue/email";
import { status } from "elysia";

export enum Role {
  Factory = "Factory",
  Provincial = "Provincial",
  Evaluator = "Evaluator",
  DOED = "DOED",
}

const createAuthentocationHelper = (account: typeof accountRepository) => ({
  setRefreshToken: async (refreshToken: string, accountId: number) => {
    await account.updateRefreshToken(refreshToken, accountId);
  },
  removeRefreshToken: async (id: number) => {
    await account.updateRefreshToken("", id);
  },
  issueToken: async (
    id: number,
    username: string,
    role: Role,
    tokenType: "Authentication" | "Refresh",
  ) => {
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
      throw status(500, { message: "cannot issue token" });
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
    const currentUser = await account.findIdByRefreshToken(hashedRefreshToken!);

    if (!currentUser) {
      throw status(401, { message: "invalid refresh token" });
    }

    return currentUser.id;
  },
  getAccountById: async (accountId: number) => {
    const selectedAccount = await account.findOneById(accountId);

    if (!selectedAccount) {
      throw status(404, { message: "invalid credential" });
    }

    return {
      id: selectedAccount.account.id,
      username: selectedAccount.account.username,
      role: selectedAccount.account.role,
      change_pw:
        selectedAccount.evaluator?.isChangePassword ||
        selectedAccount.provincialOfficer?.isChangePassword,
    };
  },
});

export const createAuthenticationUsecase = (
  account: typeof accountRepository,
) => {
  const helper = createAuthentocationHelper(account);
  return {
    helper,
    getAutheticatedAccount: async (username: string, password: string) => {
      const user = await account.findOneByUsername(username);

      if (!user || !(await bcrypt.compare(password, user.Accounts.password))) {
        throw status(401, {
          message: "invalid username or password",
        });
      }

      if (user.Accounts.role === "Factory" && !user.Factories?.isValidate) {
        throw status(401, { message: "factory not validate" });
      }

      return {
        username: user.Accounts.username,
        role: user.Accounts.role,
        id: user.Accounts.id,
      };
    },

    rotateToken: async (refreshToken: string) => {
      const id = await helper.getUserFromRefreshToken(refreshToken);

      const currentUser = await helper.getAccountById(id);

      const newAccessToken = await helper.issueToken(
        currentUser.id,
        currentUser.username,
        currentUser.role as Role,
        "Authentication",
      );
      const newRefreshToken = await helper.issueToken(
        currentUser.id,
        currentUser.username,
        currentUser.role as Role,
        "Refresh",
      );

      const hashedRefreshToken = Bun.SHA256.hash(newRefreshToken, "hex");

      await helper.setRefreshToken(hashedRefreshToken, currentUser.id);

      return { newAccessToken, newRefreshToken };
    },

    sendPasswordResetEmail: async (email: string) => {
      const token = randomBytes(32).toString("hex");
      await redisConnector.set(
        `reset_password_token:${token}`,
        email,
        "EX",
        300,
      );

      await emailQueue.add(
        "password-reset-token",
        {
          email: email,
          token: token,
        },
        { attempts: 3, backoff: 5000 },
      );
    },

    updatePassword: async (password: string, token: string) => {
      const email = await redisConnector.get(`reset_password_token${token}`);
      if (!email) {
        throw status(400, { message: "invalid token" });
      }

      const user = await account.findOneByEmail(email);
      if (!user) {
        throw status(400, { message: "invalid token" });
      }

      const hashedPassword = await bcrypt.hash(password, 12);
      await account.updatePassword(email, hashedPassword);

      await redisConnector.del(`reset_password_token:${token}`);
    },
  };
};

export const authenticationUsecase =
  createAuthenticationUsecase(accountRepository);

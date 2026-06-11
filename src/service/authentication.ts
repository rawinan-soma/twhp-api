import { randomBytes, randomInt } from "node:crypto";
import * as bcrypt from "bcrypt";
import { eq, sql } from "drizzle-orm";
import { ElysiaCustomStatusResponse, status } from "elysia";
import { decodeJwt, SignJWT } from "jose";
import { env } from "../config";
import { db } from "../drizzle";
import { accounts, adminsDoed, evaluators, factories, provincialOfficers } from "../drizzle/schema";
import { emailQueue } from "../queue/email";
import { redisConnector } from "../utils";

function maskEmailHelper(email: string): string {
  const atIndex = email.indexOf("@");
  if (atIndex <= 0) return `*${email.slice(atIndex)}`;
  const local = email.slice(0, atIndex);
  const domain = email.slice(atIndex);
  if (local.length === 1) return `*${domain}`;
  return `${local[0]}****${domain}`;
}

function generateOtp(): { code: string; codeHash: string } {
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const codeHash = Bun.SHA256.hash(code, "hex");
  return { code, codeHash };
}

export enum Role {
  Factory = "Factory",
  Provincial = "Provincial",
  Evaluator = "Evaluator",
  DOED = "DOED",
}

const createAuthentocationService = (database: typeof db) => ({
  setRefreshToken: async (refreshToken: string, accountId: number) => {
    await database
      .update(accounts)
      .set({ hashedRefreshToken: refreshToken })
      .where(eq(accounts.id, accountId));
  },
  removeRefreshToken: async (id: number) => {
    await database.update(accounts).set({ hashedRefreshToken: "" }).where(eq(accounts.id, id));
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
    getAutheticatedAccount: async (username: string, password: string) => {
      const user = await database
        .select({
          username: accounts.username,
          role: accounts.role,
          id: accounts.id,
          email: accounts.email,
          isValidate: factories.isValidate,
          password: accounts.password,
          isChangePassword:
            sql<boolean>`COALESCE(${evaluators.isChangePassword}, ${provincialOfficers.isChangePassword}, false)`.as(
              "isChangePassword",
            ),
          firstName: sql<string>`COALESCE(${evaluators.firstName}, ${provincialOfficers.firstName})`,
          lastName: sql<string>`COALESCE(${evaluators.lastName}, ${provincialOfficers.lastName})`,
        })
        .from(accounts)
        .leftJoin(factories, eq(accounts.id, factories.accountId))
        .leftJoin(provincialOfficers, eq(accounts.id, provincialOfficers.accountId))
        .leftJoin(evaluators, eq(accounts.id, evaluators.accountId))
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
        email: user.email,
        isChangePassword:
          user.role === Role.DOED || user.role === Role.Factory ? true : user.isChangePassword,
        full_name: `${user.firstName}${user.lastName}`,
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

      // Sliding-session rotation: renewing the access token must NOT rotate the
      // refresh token on every request. The refresh token is single-use (one hash
      // stored per account), so rotating it here would invalidate the copy still
      // held by concurrent in-flight requests, logging the user out at the first
      // access-token expiry (~AUTH_TOKEN_EXP). Instead, only rotate the refresh
      // token once it enters the back half of its own lifetime — keeping the
      // session sliding while making rotation rare.
      const rotateWhenRemainingUnder = Math.floor(env.REFRESH_TOKEN_EXP / 2);
      let shouldRotateRefresh = true;
      try {
        const { exp } = decodeJwt(refreshToken);
        if (typeof exp === "number") {
          const remaining = exp - Math.floor(Date.now() / 1000);
          shouldRotateRefresh = remaining <= rotateWhenRemainingUnder;
        }
      } catch {
        // Unreadable exp — fall back to rotating (safe; keeps the session alive).
        shouldRotateRefresh = true;
      }

      if (!shouldRotateRefresh) {
        return { newAccessToken, newRefreshToken: undefined };
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
        return status(429, {
          message: "password reset email already sent, please wait before requesting again",
        });
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
        {
          attempts: 3,
          backoff: 5000,
          removeOnComplete: true,
          removeOnFail: { count: 10 },
        },
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
      await database
        .update(accounts)
        .set({ password: hashedPassword })
        .where(eq(accounts.email, email));

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

        const [existingEmail] = await database
          .select()
          .from(accounts)
          .where(eq(accounts.email, email));
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
            .update(evaluators)
            .set({ isChangePassword: true })
            .where(eq(evaluators.accountId, account.id));
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

        const [existingEmail] = await database
          .select()
          .from(accounts)
          .where(eq(accounts.email, email));
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

    requiresOtp: (role: string, isChangePassword: boolean): boolean => {
      if (role === Role.Factory) return false;
      if (!isChangePassword) return false;
      return true;
    },

    maskEmail: (email: string): string => maskEmailHelper(email),

    createChallenge: async (accountId: number, email: string) => {
      const failKey = `2fa:fail:${accountId}`;
      const activeKey = `2fa:active:${accountId}`;

      const failCount = await redisConnector.get(failKey);
      if (failCount && Number.parseInt(failCount, 10) >= env.OTP_FAIL_THRESHOLD) {
        return status(429, { message: "too many failed attempts, please try again later" });
      }

      const existingChallengeId = await redisConnector.get(activeKey);
      if (existingChallengeId) {
        const throttled = await redisConnector.exists(`2fa:resend:${existingChallengeId}`);
        if (throttled) {
          return { challengeId: existingChallengeId };
        }
        await redisConnector.del(`2fa:challenge:${existingChallengeId}`);
        await redisConnector.del(activeKey);
      }

      const challengeId = randomBytes(32).toString("hex");
      const { code, codeHash } = generateOtp();

      await redisConnector.set(
        `2fa:challenge:${challengeId}`,
        JSON.stringify({ accountId, codeHash, attempts: 0 }),
        "EX",
        env.OTP_CHALLENGE_TTL,
      );
      await redisConnector.set(activeKey, challengeId, "EX", env.OTP_CHALLENGE_TTL);
      await redisConnector.set(`2fa:resend:${challengeId}`, "1", "EX", env.OTP_RESEND_THROTTLE);

      await emailQueue.add(
        "2fa-otp",
        { email, code },
        {
          priority: 1,
          attempts: 3,
          backoff: { type: "fixed", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: { count: 10 },
        },
      );

      return { challengeId };
    },

    verifyChallenge: async (challengeId: string, code: string) => {
      const challengeKey = `2fa:challenge:${challengeId}`;

      const raw = await redisConnector.get(challengeKey);
      if (!raw) {
        return status(400, { message: "invalid or expired challenge" });
      }

      let challenge: { accountId: number; codeHash: string; attempts: number };
      try {
        challenge = JSON.parse(raw);
      } catch {
        return status(400, { message: "invalid or expired challenge" });
      }

      const { accountId, codeHash, attempts } = challenge;
      const failKey = `2fa:fail:${accountId}`;
      const activeKey = `2fa:active:${accountId}`;

      const failCount = await redisConnector.get(failKey);
      if (failCount && Number.parseInt(failCount, 10) >= env.OTP_FAIL_THRESHOLD) {
        return status(429, { message: "too many failed attempts, please try again later" });
      }

      const candidateHash = Bun.SHA256.hash(code, "hex");
      if (candidateHash !== codeHash) {
        const newFailCount = await redisConnector.incr(failKey);
        if (newFailCount === 1) {
          await redisConnector.expire(failKey, env.OTP_FAIL_WINDOW);
        }

        const newAttempts = attempts + 1;
        if (newAttempts >= env.OTP_MAX_ATTEMPTS) {
          await redisConnector.del(challengeKey);
          await redisConnector.del(activeKey);
          return status(401, { message: "too many attempts, please restart login" });
        }

        const remainingTtl = await redisConnector.ttl(challengeKey);
        const effectiveTtl = remainingTtl > 0 ? remainingTtl : env.OTP_CHALLENGE_TTL;
        await redisConnector.set(
          challengeKey,
          JSON.stringify({ accountId, codeHash, attempts: newAttempts }),
          "EX",
          effectiveTtl,
        );

        return status(401, {
          message: "incorrect code",
          attemptsRemaining: env.OTP_MAX_ATTEMPTS - newAttempts,
        });
      }

      await redisConnector.del(challengeKey);
      await redisConnector.del(activeKey);
      await redisConnector.del(failKey);

      return helper.getAccountById(accountId);
    },

    resendOtp: async (challengeId: string) => {
      const challengeKey = `2fa:challenge:${challengeId}`;

      const raw = await redisConnector.get(challengeKey);
      if (!raw) {
        return status(400, { message: "invalid or expired challenge" });
      }

      let challenge: { accountId: number; codeHash: string; attempts: number };
      try {
        challenge = JSON.parse(raw);
      } catch {
        return status(400, { message: "invalid or expired challenge" });
      }

      const { accountId } = challenge;
      const failKey = `2fa:fail:${accountId}`;
      const throttleKey = `2fa:resend:${challengeId}`;

      const failCount = await redisConnector.get(failKey);
      if (failCount && Number.parseInt(failCount, 10) >= env.OTP_FAIL_THRESHOLD) {
        return status(429, { message: "too many failed attempts, please try again later" });
      }

      const throttled = await redisConnector.exists(throttleKey);
      if (throttled) {
        return status(429, { message: "please wait before requesting another code" });
      }

      const [account] = await database
        .select({ email: accounts.email })
        .from(accounts)
        .where(eq(accounts.id, accountId));

      if (!account?.email) {
        return status(400, { message: "invalid or expired challenge" });
      }

      const { code, codeHash } = generateOtp();

      await redisConnector.set(
        challengeKey,
        JSON.stringify({ accountId, codeHash, attempts: 0 }),
        "EX",
        env.OTP_CHALLENGE_TTL,
      );
      await redisConnector.set(throttleKey, "1", "EX", env.OTP_RESEND_THROTTLE);

      await emailQueue.add(
        "2fa-otp",
        { email: account.email, code },
        {
          priority: 1,
          attempts: 3,
          backoff: { type: "fixed", delay: 5000 },
          removeOnComplete: true,
          removeOnFail: { count: 10 },
        },
      );

      return { ok: true };
    },
  };
};

export const authenticationService = createAuthenticationUsecase(db);

import { APIError, betterAuth } from "better-auth";
import { createAuthMiddleware } from "@better-auth/core/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";
import * as bcrypt from "bcrypt";
import { db } from "./drizzle";
import { accounts, credentials, factories, sessions } from "./drizzle/schema";
import { env } from "./config";

export const auth = betterAuth({
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: accounts,
      session: sessions,
      account: credentials,
    },
  }),
  plugins: [username()],
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        input: false,
      },
    },
  },
  session: {
    expiresIn: 60 * 60,
    updateAge: 60,
  },
  emailAndPassword: {
    enabled: true,
    password: {
      hash: (password) => bcrypt.hash(password, 12),
      verify: ({ hash, password }) => bcrypt.compare(password, hash),
    },
  },
  advanced: {
    cookies: {
      session_token: {
        name: "Authentication",
        attributes: {
          httpOnly: true,
          secure: env.COOKIE_SECURE,
          sameSite: "lax" as const,
          path: "/",
        },
      },
    },
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-in/username") return;

      const body = ctx.body as { username?: string } | undefined;
      if (!body?.username) return;

      const [user] = await db
        .select({ role: accounts.role, isValidate: factories.isValidate })
        .from(accounts)
        .leftJoin(factories, eq(accounts.id, factories.accountId))
        .where(eq(accounts.username, body.username))
        .limit(1);

      if (user?.role === "Factory" && !user.isValidate) {
        throw new APIError("UNAUTHORIZED", { message: "factory not validate" });
      }
    }),
  },
});

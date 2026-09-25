import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import { env } from "./config";
import { createLogging } from "./logging";

const { globalLogger, requestLogging } = createLogging();

// Dev OTP bypass is hard-blocked in production (see ADR-4). Warn once if it is configured there.
if (env.DEV_SKIP_OTP && env.COOKIE_SECURE) {
  globalLogger.warn(
    "DEV_SKIP_OTP is enabled but ignored because COOKIE_SECURE=true (production). Staff OTP remains enforced.",
  );
}

const app = new Elysia({ prefix: "/twhp/api" })
  .use(openapi({ path: "document" }))
  .use(requestLogging)
  .use(
    await autoload({
      dir: "./routes",
      ignore: ["**/*.test.ts", "**/*.spec.ts"],
    }),
  );

export type App = typeof app;

app.listen({ port: env.APP_PORT, maxRequestBodySize: 130 * 1024 * 1024 });

globalLogger.info(`Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

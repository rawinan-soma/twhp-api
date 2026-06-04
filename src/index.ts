import { createPinoLogger, logger } from "@bogeychan/elysia-logger";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";
import { autoload } from "elysia-autoload";
import { env } from "./config";

const bangkokTimestamp = () =>
  `,"time":"${new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}"`;

const globalLogger = createPinoLogger({
  level: "info",
  timestamp: bangkokTimestamp,
});

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE", "PARSE"]);

const app = new Elysia({ prefix: "/twhp/api" })
  .use(openapi({ path: "document" }))
  .use(
    logger({
      level: "info",
      timestamp: bangkokTimestamp,
      serializers: {
        request: (req) => ({
          method: req?.method,
          url: req?.url,
          contentType: req?.headers?.get("content-type"),
          authorization: req?.headers?.has("authorization"),
          ip: req?.headers?.get("x-forwarded-for"),
          userAgent: req?.headers?.get("user-agent"),
        }),
      },
      customProps() {
        return {};
      },
      autoLogging: {
        ignore(ctx) {
          const url = new URL(ctx.request.url);
          if (url.pathname === "/twhp/api/health") return true;
          if (ctx.isError || (ctx.set?.status as number) >= 400) return true;
          return false;
        },
      },
    }),
  )
  .onError(({ code, error, set, request, log, store }) => {
    const activeLogger = log ?? globalLogger;
    const errorMessage = error instanceof Error ? error.message : "";
    (store as Record<string, unknown>).__logged = true;
    if (EXPECTED_CODES.has(code as string)) {
      set.status = 400;
      try {
        const parsed = JSON.parse(errorMessage);
        activeLogger.error(
          {
            status: 400,
            on: parsed.on,
            property: parsed.property,
            detail: parsed.message,
            summary: parsed.summary,
            request,
          },
          "Validation error",
        );
        return {
          message: parsed.message,
          on: parsed.on,
          property: parsed.property,
          summary: parsed.summary,
        };
      } catch {
        activeLogger.error({ status: 400, code, detail: errorMessage, request }, "Expected error");
        return { message: errorMessage };
      }
    }

    if (code === "NOT_FOUND") {
      set.status = 404;
      activeLogger.error({ status: 404, detail: "NOT_FOUND", request }, "Not found");
      return { message: "Not found" };
    }

    set.status = 500;
    activeLogger.error({ status: 500, detail: errorMessage, request }, "Unexpected error occurred");
    return { message: "Unexpected error" };
  })
  .onAfterResponse(({ set, request, log, responseValue, store }) => {
    if ((store as Record<string, unknown>).__logged) return;
    const status = typeof set.status === "number" ? set.status : 200;
    if (status >= 400) {
      const body =
        typeof responseValue === "object" && responseValue !== null
          ? (responseValue as Record<string, unknown>)
          : null;
      const detail = (body?.response as Record<string, unknown>)?.message ?? body?.message;
      (log ?? globalLogger).error({ status, detail, request }, "Client error");
    }
  })
  .use(
    await autoload({
      dir: "./routes",
      ignore: ["**/*.test.ts", "**/*.spec.ts"],
    }),
  );

export type App = typeof app;

app.listen({ port: env.APP_PORT, maxRequestBodySize: 130 * 1024 * 1024 });

console.log(`🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`);

import { createPinoLogger, logger, type pino } from "@bogeychan/elysia-logger";
import { Elysia } from "elysia";
import { isHealthPath } from "./routes";

const bangkokTimestamp = () =>
  `,"time":"${new Date().toLocaleString("en-GB", { timeZone: "Asia/Bangkok", hour12: false, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" })}"`;

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE", "PARSE"]);

/**
 * The API's pino logger plus the request-logging plugin: one auto-logged line per successful
 * request, error classification in `onError`, and a line for any unlogged 4xx/5xx in
 * `onAfterResponse`. Health routes are excluded from the request line and the 4xx/5xx line. `stream` defaults to stdout;
 * tests pass one to capture lines.
 */
export const createLogging = (stream?: pino.DestinationStream) => {
  const globalLogger = createPinoLogger({
    level: "info",
    timestamp: bangkokTimestamp,
    stream,
  });

  const requestLogging = new Elysia()
    .use(
      logger({
        level: "info",
        timestamp: bangkokTimestamp,
        stream,
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
            if (isHealthPath(new URL(ctx.request.url).pathname)) return true;
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
          activeLogger.error(
            { status: 400, code, detail: errorMessage, request },
            "Expected error",
          );
          return { message: errorMessage };
        }
      }

      if (code === "NOT_FOUND") {
        set.status = 404;
        activeLogger.error({ status: 404, detail: "NOT_FOUND", request }, "Not found");
        return { message: "Not found" };
      }

      set.status = 500;
      activeLogger.error(
        { status: 500, detail: errorMessage, request },
        "Unexpected error occurred",
      );
      return { message: "Unexpected error" };
    })
    .onAfterResponse(({ set, request, log, responseValue, store }) => {
      if ((store as Record<string, unknown>).__logged) return;
      // A 503 from /health/ready is a probe answer, not a client error.
      if (isHealthPath(new URL(request.url).pathname)) return;
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
    .as("global");

  return { globalLogger, requestLogging };
};

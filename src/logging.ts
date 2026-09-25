import { isContext, logger } from "@bogeychan/elysia-logger";
import { Elysia } from "elysia";
import {
  createLogger,
  createLoggerOptions,
  type LogMixin,
  type LogStream,
  logMixin,
  pathOf,
  scrubErrorMessage,
} from "./logger";
import { isHealthPath } from "./routes";

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE", "PARSE"]);

type RequestContext = {
  request: Request;
  route?: string;
  set: { status?: number | string };
  store: { responseTime?: number };
  jwtPayload?: { sub?: string };
};

const requestLine = (ctx: RequestContext) => ({
  method: ctx.request.method,
  path: pathOf(ctx.request),
  ...(ctx.route ? { route: ctx.route } : {}),
  status: typeof ctx.set.status === "number" ? ctx.set.status : 200,
  durationMs: Math.round((ctx.store.responseTime ?? 0) * 10) / 10,
  ...(ctx.jwtPayload?.sub ? { userId: ctx.jwtPayload.sub } : {}),
});

/**
 * The API's logger plus the request-logging plugin `src/index.ts` mounts, both on the shared pino
 * configuration in `src/logger.ts`:
 * - one light line per successful request (method, path, route, status, durationMs, userId);
 * - error classification in `onError`;
 * - a line for any 4xx/5xx `onError` didn't log, in `onAfterResponse`.
 * Health routes are excluded from all three. `stream` defaults to stdout and `mixin` to
 * `logMixin`; tests pass their own.
 */
export const createLogging = (stream?: LogStream, mixin: LogMixin = logMixin) => {
  const globalLogger = createLogger("twhp-api", { stream, mixin });

  const requestLogging = new Elysia()
    .use(
      logger({
        ...createLoggerOptions("twhp-api", { mixin, stream }),
        // The plugin logs the whole Elysia context. pino has already merged the mixin into it, but
        // the plugin's default formatter would throw those fields away, so rebuild the line here.
        formatters: {
          log: (object: Record<string, unknown>) =>
            isContext(object)
              ? { ...mixin(), ...requestLine(object as unknown as RequestContext) }
              : object,
        },
        autoLogging: {
          ignore(ctx) {
            if (isHealthPath(pathOf(ctx.request))) return true;
            return ctx.isError || (ctx.set?.status as number) >= 400;
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
        { status: 500, detail: scrubErrorMessage(errorMessage), request },
        "Unexpected error occurred",
      );
      return { message: "Unexpected error" };
    })
    .onAfterResponse(({ set, request, log, responseValue, store }) => {
      if ((store as Record<string, unknown>).__logged) return;
      // A 503 from /health/ready is a probe answer, not a client error.
      if (isHealthPath(pathOf(request))) return;
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

import { createPinoLogger, isContext, logger, pino } from "@bogeychan/elysia-logger";

/**
 * The one pino configuration shared by the API's request logger, the API's standalone logger and
 * the worker. Lines are JSON for Loki, stamped in Bangkok ISO time, and tagged with `service`.
 *
 * No secrets and no personal data in logs: people are referred to by internal IDs only
 * (`userId`, `factoryId`). `redact` below is a safety net, not permission to log objects that
 * carry emails, names, tokens or bodies.
 */

type Service = "twhp-api" | "twhp-worker";
type LogMixin = () => Record<string, unknown>;
type LogStream = { write: (line: string) => void };
export type Logger = pino.Logger<never, boolean>;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `2026-09-25T14:30:05.123+07:00` — Bangkok has no DST, so a fixed offset is exact. */
export const toBangkokIso = (date: Date) =>
  `${new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, -1)}+07:00`;

const bangkokTimestamp = () => `,"time":"${toBangkokIso(new Date())}"`;

/**
 * Fields merged into every log line. Issue 05 fills this with the active span's
 * `trace_id`/`span_id`; `requestLogger`'s formatter re-applies it to the plugin's request line.
 */
export const logMixin: LogMixin = () => ({});

const REDACTED_KEYS = [
  "authorization",
  "cookie",
  '["set-cookie"]',
  "password",
  "otp",
  "token",
  "email",
  "to",
  "cc",
  "bcc",
];
// pino redaction has no recursive wildcard, so enumerate depths explicitly.
const REDACT_MAX_DEPTH = 6;
const redactPaths = REDACTED_KEYS.flatMap((key) =>
  Array.from({ length: REDACT_MAX_DEPTH + 1 }, (_, depth) => {
    const prefix = "*".repeat(depth).split("").join(".");
    if (!prefix) return key;
    return key.startsWith("[") ? `${prefix}${key}` : `${prefix}.${key}`;
  }),
);

/** A request is logged as its method and path — never the query string, headers or body. */
const serializeRequest = (request?: Request) =>
  request ? { method: request.method, path: new URL(request.url).pathname } : request;

const createLoggerOptions = (
  service: Service,
  { mixin = logMixin, stream }: { mixin?: LogMixin; stream?: LogStream },
) => ({
  level: "info",
  timestamp: bangkokTimestamp,
  base: { service },
  mixin,
  redact: redactPaths,
  serializers: { request: serializeRequest, err: pino.stdSerializers.err },
  formatters: { log: (object: Record<string, unknown>) => object },
  ...(stream ? { stream } : {}),
});

export const createLogger = (
  service: Service,
  options: { mixin?: LogMixin; stream?: LogStream } = {},
): Logger => createPinoLogger(createLoggerOptions(service, options));

type RequestContext = {
  request: Request;
  route?: string;
  set: { status?: number | string };
  store: { responseTime?: number };
  jwtPayload?: { sub?: string };
};

const requestLine = (ctx: RequestContext) => ({
  method: ctx.request.method,
  path: new URL(ctx.request.url).pathname,
  ...(ctx.route ? { route: ctx.route } : {}),
  status: typeof ctx.set.status === "number" ? ctx.set.status : 200,
  durationMs: Math.round((ctx.store.responseTime ?? 0) * 10) / 10,
  ...(ctx.jwtPayload?.sub ? { userId: ctx.jwtPayload.sub } : {}),
});

/**
 * The API's request logger: one light line per successful request. 4xx/5xx lines are written by
 * `onError`/`onAfterResponse` in `src/index.ts` so their classification stays in one place.
 */
export const requestLogger = ({
  mixin = logMixin,
  stream,
}: {
  mixin?: LogMixin;
  stream?: LogStream;
} = {}) =>
  logger({
    ...createLoggerOptions("twhp-api", { mixin, stream }),
    // The plugin logs the whole Elysia context. pino has already merged the mixin into it, but the
    // plugin's default formatter would throw those fields away, so rebuild the line here.
    formatters: {
      log: (object: Record<string, unknown>) =>
        isContext(object)
          ? { ...mixin(), ...requestLine(object as unknown as RequestContext) }
          : object,
    },
    autoLogging: {
      ignore(ctx) {
        if (new URL(ctx.request.url).pathname.startsWith("/twhp/api/health")) return true;
        return ctx.isError || (ctx.set?.status as number) >= 400;
      },
    },
  });

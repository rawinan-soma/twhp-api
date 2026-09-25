import { createPinoLogger, pino } from "@bogeychan/elysia-logger";
import { isSpanContextValid, trace } from "@opentelemetry/api";

/**
 * The one pino configuration shared by the API (its logger and the request plugin in
 * `src/logging.ts`) and the worker. It must not import routes or services: the worker loads it. Lines are JSON for Loki, stamped in Bangkok ISO time, and tagged with `service`.
 *
 * No secrets and no personal data in logs: people are referred to by internal IDs only
 * (`userId`, `factoryId`). `redact` below is a safety net, not permission to log objects that
 * carry emails, names, tokens or bodies.
 */

export type Service = "twhp-api" | "twhp-worker";
export type LogMixin = () => Record<string, unknown>;
export type LogStream = { write: (line: string) => void };
type LoggerSetup = { mixin?: LogMixin; stream?: LogStream };
export type Logger = pino.Logger<never, boolean>;

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;

/** `2026-09-25T14:30:05.123+07:00` — Bangkok has no DST, so a fixed offset is exact. */
export const toBangkokIso = (date: Date) =>
  `${new Date(date.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, -1)}+07:00`;

const bangkokTimestamp = () => `,"time":"${toBangkokIso(new Date())}"`;

/**
 * Fields merged into every log line: the active span's `trace_id`/`span_id`, so Loki lines link to
 * Tempo. Nothing outside a span. The request plugin in `src/logging.ts` re-applies it to the
 * plugin's request line.
 */
export const logMixin: LogMixin = () => {
  const spanContext = trace.getActiveSpan()?.spanContext();
  if (!spanContext || !isSpanContextValid(spanContext)) return {};
  return { trace_id: spanContext.traceId, span_id: spanContext.spanId };
};

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
// pino redaction has no recursive wildcard, so enumerate depths explicitly: a key nested deeper
// than REDACT_MAX_DEPTH objects is NOT redacted.
const REDACT_MAX_DEPTH = 6;
const redactPaths = REDACTED_KEYS.flatMap((key) =>
  Array.from({ length: REDACT_MAX_DEPTH + 1 }, (_, depth) => {
    const prefix = Array(depth).fill("*").join("."); // depth 2 → "*.*"
    if (!prefix) return key;
    return key.startsWith("[") ? `${prefix}${key}` : `${prefix}.${key}`;
  }),
);

export const pathOf = (request: Request) => new URL(request.url).pathname;

/**
 * Drizzle appends the query's bound values (`\nparams: …`) to its error message, and those are
 * request data such as email addresses. Keep the SQL, drop the values.
 */
export const scrubErrorMessage = (message: string) => message.split("\nparams:")[0];

/** A request is logged as its method and path — never the query string, headers or body. */
const serializeRequest = (request?: Request) =>
  request ? { method: request.method, path: pathOf(request) } : request;

export const createLoggerOptions = (
  service: Service,
  { mixin = logMixin, stream }: LoggerSetup,
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

export const createLogger = (service: Service, options: LoggerSetup = {}): Logger =>
  createPinoLogger(createLoggerOptions(service, options));

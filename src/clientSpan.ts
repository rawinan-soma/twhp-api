import { type Attributes, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

// Only `@opentelemetry/api` here: the MinIO helpers and the BullMQ telemetry load this, and the worker
// loads those. The SDK stays in `src/telemetry.ts`.

export const errorType = (error: unknown) => {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && code) return code;
    if (typeof name === "string" && name) return name;
  }
  return "Error";
};

/**
 * A hand-written CLIENT span for a call Bun cannot auto-instrument (MinIO, SMTP, the worker's DB
 * reads). Pass only non-identifying attributes — an operation, a bucket, counts — never object
 * names, URLs or addresses. A
 * failure is recorded as its `error.type` (code or class), never its message. `fn` receives the
 * span to add result attributes, e.g. counts.
 */
export const withClientSpan = <T>(
  name: string,
  attributes: Attributes,
  fn: (span: Span) => Promise<T>,
): Promise<T> =>
  trace
    .getTracer("twhp")
    .startActiveSpan(name, { kind: SpanKind.CLIENT, attributes }, async (span) => {
      try {
        return await fn(span);
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute("error.type", errorType(error));
        throw error;
      } finally {
        span.end();
      }
    });

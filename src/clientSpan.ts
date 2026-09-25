import { type Attributes, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";

// Only `@opentelemetry/api` here: the MinIO helpers and the email queue load this, and the worker
// loads those. The SDK stays in `src/telemetry.ts`.

const errorType = (error: unknown) => {
  if (error && typeof error === "object") {
    const { code, name } = error as { code?: unknown; name?: unknown };
    if (typeof code === "string" && code) return code;
    if (typeof name === "string" && name) return name;
  }
  return "Error";
};

/**
 * A hand-written CLIENT span for a call Bun cannot auto-instrument (MinIO, the email queue). Pass
 * only non-identifying attributes: an operation and a bucket, never object names or URLs. A
 * failure is recorded as its `error.type` (code or class), never its message.
 */
export const withClientSpan = <T>(
  name: string,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> =>
  trace
    .getTracer("twhp")
    .startActiveSpan(name, { kind: SpanKind.CLIENT, attributes }, async (span) => {
      try {
        return await fn();
      } catch (error) {
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.setAttribute("error.type", errorType(error));
        throw error;
      } finally {
        span.end();
      }
    });

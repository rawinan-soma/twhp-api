import { type Attributes, type Context, SpanStatusCode, trace } from "@opentelemetry/api";
import type { Telemetry } from "bullmq";
import { BullMQOTelSpan, BullMQOtel } from "bullmq-otel";
import { errorType } from "./clientSpan";

/**
 * BullMQ's span helpers put a failed job's `err.message` (and a completed job's return value) on
 * the `process` span, as event attributes and via `recordException`. Nodemailer messages quote
 * recipient addresses, so this span keeps event names and job IDs only, and records an exception
 * as its `error.type` like `withClientSpan` does. BullMQ still keeps the message as the job's
 * `failedReason` in Redis.
 */
class ScrubbedSpan extends BullMQOTelSpan {
  override addEvent(name: string, attributes?: Attributes) {
    const jobId = attributes?.["bullmq.job.id"];
    super.addEvent(name, jobId === undefined ? {} : { "bullmq.job.id": jobId });
  }

  override recordException(exception: unknown) {
    this.span.setStatus({ code: SpanStatusCode.ERROR });
    this.span.setAttribute("error.type", errorType(exception));
  }
}

/**
 * The `telemetry` option for the email queue and its worker: `bullmq-otel`'s W3C context
 * propagation, so a job's `process` span continues the trace that enqueued it, with scrubbed spans.
 */
export const bullmqTelemetry = (): Telemetry<Context> => {
  const tracer = trace.getTracer("twhp");
  return {
    tracer: {
      startSpan: (name, options, ctx) => new ScrubbedSpan(tracer.startSpan(name, options, ctx)),
    },
    contextManager: new BullMQOtel("twhp").contextManager,
  };
};

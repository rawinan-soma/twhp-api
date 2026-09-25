import { describe, expect, it } from "bun:test";
import {
  BatchSpanProcessor,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-node";
import { createTracerProvider, exportProcessorsFor } from "./telemetry";

// `createTracerProvider` is exercised on providers of its own; the global one belongs to the test
// preload (`src/test/setup.ts`).

describe("exportProcessorsFor", () => {
  it("exports nothing when no OTLP endpoint is configured", () => {
    expect(exportProcessorsFor(null)).toEqual([]);
  });

  it("batches to OTLP when an endpoint is configured", () => {
    const processors = exportProcessorsFor("http://alloy:4318");
    expect(processors).toHaveLength(1);
    expect(processors[0]).toBeInstanceOf(BatchSpanProcessor);
  });
});

describe("createTracerProvider", () => {
  it("stamps service.name and deployment.environment on every span", () => {
    const exporter = new InMemorySpanExporter();
    const provider = createTracerProvider({
      service: "twhp-api",
      environment: "staging",
      endpoint: null,
      spanProcessors: [new SimpleSpanProcessor(exporter)],
    });
    provider.getTracer("test").startSpan("x").end();
    const [span] = exporter.getFinishedSpans();
    expect(span.resource.attributes["service.name"]).toBe("twhp-api");
    expect(span.resource.attributes["deployment.environment"]).toBe("staging");
  });

  it("does not slow spans down or throw when the collector port is closed", () => {
    const provider = createTracerProvider({
      service: "twhp-api",
      environment: "test",
      endpoint: "http://127.0.0.1:1",
    });
    const tracer = provider.getTracer("test");
    const started = performance.now();
    for (let i = 0; i < 1000; i++) tracer.startSpan(`span ${i}`).end();
    expect(performance.now() - started).toBeLessThan(250);
    // Ending a span only queues it; export (and its retries against the closed port) runs on the
    // processor's unref'd timer, off every request's path.
  });
});

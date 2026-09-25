import { InMemorySpanExporter } from "@opentelemetry/sdk-trace-node";

/** Every span finished in a test run, via the provider `src/test/setup.ts` registers. */
export const testSpans = new InMemorySpanExporter();

import { describe, expect, it } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { withClientSpan } from "./clientSpan";
import { testSpans } from "./test/spans";

describe("withClientSpan", () => {
  it("records a CLIENT span with only the attributes it was given", async () => {
    testSpans.reset();
    expect(
      await withClientSpan("minio uploadFile", { "minio.bucket": "twhp" }, async () => 1),
    ).toBe(1);
    const [span] = testSpans.getFinishedSpans();
    expect(span.name).toBe("minio uploadFile");
    expect(span.kind).toBe(SpanKind.CLIENT);
    expect(span.attributes).toEqual({ "minio.bucket": "twhp" });
  });

  it("marks the span failed by error type only, never the message, and rethrows", async () => {
    testSpans.reset();
    const failure = Object.assign(new Error("No such key: 3f2c-secret.pdf"), { code: "NoSuchKey" });
    await expect(
      withClientSpan("minio deleteFile", {}, async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    const [span] = testSpans.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.status.message).toBeUndefined();
    expect(span.attributes["error.type"]).toBe("NoSuchKey");
    expect(span.events).toEqual([]);
    expect(JSON.stringify(span.attributes)).not.toContain("secret");
  });
});

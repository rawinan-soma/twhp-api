import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { testSpans } from "./test/spans";
import { minioClient, utilities } from "./utils";

// The MinIO helpers each get one hand-written CLIENT span (ADR-0014: Bun can't auto-instrument the
// client). It names the operation and bucket only — never the object name, a presigned URL or its
// signature. The client's methods are stubbed; nothing reaches MinIO.

const OBJECT = "3f2c9a10-secret-object.pdf";
const client = minioClient as unknown as Record<string, unknown>;
const originals = new Map<string, unknown>();
const stub = (method: string, fn: (...args: unknown[]) => unknown) => {
  if (!originals.has(method)) originals.set(method, client[method]);
  client[method] = fn;
};

beforeEach(() => testSpans.reset());
afterEach(() => {
  for (const [method, fn] of originals) client[method] = fn;
  originals.clear();
});

const onlySpan = () => {
  const spans = testSpans.getFinishedSpans();
  expect(spans).toHaveLength(1);
  const [span] = spans;
  expect(span.kind).toBe(SpanKind.CLIENT);
  const exported = JSON.stringify({ name: span.name, a: span.attributes, e: span.events });
  for (const leak of [OBJECT, "secret", "X-Amz-Signature", "http"])
    expect(exported).not.toContain(leak);
  return span;
};

describe("MinIO helper spans", () => {
  it("uploadFile", async () => {
    stub("bucketExists", async () => true);
    stub("putObject", async () => ({}));

    const name = await utilities().uploadFile(new File(["x"], "secret-report.pdf"));

    const span = onlySpan();
    expect(span.name).toBe("minio uploadFile");
    expect(span.attributes).toEqual({ "minio.operation": "uploadFile", "minio.bucket": "twhp" });
    expect(JSON.stringify(span.attributes)).not.toContain(name);
  });

  it("getPresignedUrl", async () => {
    stub(
      "presignedGetObject",
      async () => `http://minio:9000/twhp/${OBJECT}?X-Amz-Signature=abc123`,
    );

    const url = await utilities().getPresignedUrl(OBJECT);

    expect(url).toContain("X-Amz-Signature");
    expect(onlySpan().attributes).toEqual({
      "minio.operation": "getPresignedUrl",
      "minio.bucket": "twhp",
    });
  });

  it("deleteFileStrict records the failure by error code and rethrows", async () => {
    const failure = Object.assign(new Error(`The specified key does not exist: ${OBJECT}`), {
      code: "NoSuchKey",
    });
    stub("removeObject", async () => {
      throw failure;
    });

    await expect(utilities().deleteFileStrict(OBJECT)).rejects.toBe(failure);

    const span = onlySpan();
    expect(span.name).toBe("minio deleteFileStrict");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.attributes["error.type"]).toBe("NoSuchKey");
  });

  it("deleteFile still swallows the failure, but its span shows it", async () => {
    stub("removeObject", async () => {
      throw Object.assign(new Error(`gone: ${OBJECT}`), { code: "NoSuchKey" });
    });

    await expect(utilities().deleteFile(OBJECT)).resolves.toBeUndefined();

    const span = onlySpan();
    expect(span.name).toBe("minio deleteFile");
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
  });

  it("deleteFile with no file name makes no call and no span", async () => {
    await utilities().deleteFile(null);
    expect(testSpans.getFinishedSpans()).toEqual([]);
  });
});

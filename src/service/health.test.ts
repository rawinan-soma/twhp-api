import { afterAll, describe, expect, it } from "bun:test";
import * as Minio from "minio";
import { createHealthService } from "./health";

// The MinIO probe runs through the real minio-js client against local HTTP servers, so these tests
// pin how actual responses are classified — not how a fake chooses to throw. `bucketExists` alone
// could not tell MinIO from another server: any 200 read as "exists" and an empty 404 as "missing".

const S3_HEADERS = { "x-amz-request-id": "17A0C0FFEE", server: "MinIO" };

const servers: ReturnType<typeof Bun.serve>[] = [];
const serve = (respond: () => Response) => {
  const server = Bun.serve({ port: 0, fetch: respond });
  servers.push(server);
  return server;
};
afterAll(() => {
  for (const server of servers) server.stop(true);
});

const minioProbe = async (respond: () => Response) => {
  const server = serve(respond);
  const client = new Minio.Client({
    endPoint: "127.0.0.1",
    port: server.port,
    useSSL: false,
    accessKey: "access",
    secretKey: "secret",
  });
  const health = createHealthService(
    // biome-ignore lint/suspicious/noExplicitAny: the fake exposes only the `execute` the probe calls
    { execute: async () => ({}) } as any,
    { status: "ready", ping: async () => "PONG" },
    { client, bucket: "twhp" },
  );
  return (await health.checkReadiness()).minio;
};

describe("MinIO readiness probe (real minio-js client)", () => {
  it("is up when MinIO reports the bucket exists", async () => {
    expect(await minioProbe(() => new Response(null, { status: 200, headers: S3_HEADERS }))).toBe(
      "up",
    );
  });

  it("is up when MinIO reports the bucket does not exist yet (the first upload creates it)", async () => {
    expect(await minioProbe(() => new Response(null, { status: 404, headers: S3_HEADERS }))).toBe(
      "up",
    );
  });

  it("is down when the credentials are rejected", async () => {
    expect(await minioProbe(() => new Response(null, { status: 403, headers: S3_HEADERS }))).toBe(
      "down",
    );
  });

  it.each([
    ["an empty 404", () => new Response(null, { status: 404 })],
    ["an HTML 404", () => new Response("<html>Not Found</html>", { status: 404 })],
    ["a plain 200", () => new Response("hello", { status: 200 })],
  ])("is down when a non-S3 server answers with %s", async (_, respond) => {
    expect(await minioProbe(respond)).toBe("down");
  });
});

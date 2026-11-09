import { mock } from "bun:test";
import { resolve } from "node:path";
import { Elysia } from "elysia";
import type { QueuedEmail, RunnerJob } from "./authenticated-request";
import type { RouteDefinition } from "./route-query";

const job = JSON.parse(process.argv[2] ?? "") as RunnerJob;

const queuedEmails: QueuedEmail[] = [];
mock.module("../queue/email", () => ({
  emailQueue: {
    add: async (name: string, data: QueuedEmail["data"], opts?: QueuedEmail["opts"]) => {
      queuedEmails.push({ name, data, opts });
    },
  },
}));

const define = (await import(resolve(job.routeModule))).default as RouteDefinition;
const app = new Elysia().use(define);

const headers = new Headers();
const cookies = [
  job.token && `Authentication=${job.token}`,
  job.refreshToken && `Refresh=${job.refreshToken}`,
].filter(Boolean);
if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
if (job.body !== undefined) headers.set("content-type", "application/json");
const response = await app.handle(
  new Request(job.url, {
    method: job.method,
    headers,
    body: job.body === undefined ? undefined : JSON.stringify(job.body),
  }),
);

process.stdout.write(
  JSON.stringify({
    status: response.status,
    body: await response.text(),
    setCookies: response.headers.getSetCookie(),
    queuedEmails,
  }),
);
process.exit(0);

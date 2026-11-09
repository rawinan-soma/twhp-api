import { resolve } from "node:path";
import { Elysia } from "elysia";
import type { RouteDefinition } from "./route-query";

type Job = { routeModule: string; url: string; token?: string; refreshToken?: string };

const job = JSON.parse(process.argv[2] ?? "") as Job;
const define = (await import(resolve(job.routeModule))).default as RouteDefinition;
const app = new Elysia().use(define);

const headers = new Headers();
const cookies = [
  job.token && `Authentication=${job.token}`,
  job.refreshToken && `Refresh=${job.refreshToken}`,
].filter(Boolean);
if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
const response = await app.handle(new Request(job.url, { headers }));

process.stdout.write(
  JSON.stringify({
    status: response.status,
    body: await response.text(),
    setCookies: response.headers.getSetCookie(),
  }),
);
process.exit(0);

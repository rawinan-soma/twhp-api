import { resolve } from "node:path";
import { Elysia } from "elysia";
import type { RouteDefinition } from "./route-query";

type Job = {
  routeModule: string;
  url: string;
  token?: string;
  refreshToken?: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
};

const EXPECTED_CODES = new Set(["VALIDATION", "INVALID_FILE_TYPE", "PARSE"]);

const job = JSON.parse(process.argv[2] ?? "") as Job;
const define = (await import(resolve(job.routeModule))).default as RouteDefinition;
const app = new Elysia()
  .onError(({ code, set }) => {
    if (EXPECTED_CODES.has(code as string)) {
      set.status = 400;
      return { message: "validation" };
    }
  })
  .use(define);

const headers = new Headers(job.headers);
const cookies = [
  job.token && `Authentication=${job.token}`,
  job.refreshToken && `Refresh=${job.refreshToken}`,
].filter(Boolean);
if (cookies.length > 0) headers.set("cookie", cookies.join("; "));
const response = await app.handle(
  new Request(job.url, { headers, method: job.method, body: job.body }),
);

process.stdout.write(
  JSON.stringify({
    status: response.status,
    body: await response.text(),
    setCookies: response.headers.getSetCookie(),
  }),
);
process.exit(0);

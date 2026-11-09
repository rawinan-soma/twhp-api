import { resolve } from "node:path";
import { Elysia } from "elysia";
import type { RouteDefinition } from "./route-query";

type Job = { routeModule: string; url: string; token?: string };

const job = JSON.parse(process.argv[2] ?? "") as Job;
const define = (await import(resolve(job.routeModule))).default as RouteDefinition;
const app = new Elysia().use(define);

const headers = new Headers();
if (job.token) headers.set("cookie", `Authentication=${job.token}`);
const response = await app.handle(new Request(job.url, { headers }));

process.stdout.write(JSON.stringify({ status: response.status, body: await response.text() }));
process.exit(0);

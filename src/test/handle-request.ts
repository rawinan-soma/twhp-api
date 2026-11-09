import { resolve } from "node:path";
import { Elysia } from "elysia";

type Job = { routeModule: string; url: string; token?: string };

const job = JSON.parse(process.argv[2] ?? "") as Job;
// biome-ignore lint/suspicious/noExplicitAny: route modules are typed against the concrete App instance
const define = (await import(resolve(job.routeModule))).default as (app: any) => any;
const app = new Elysia().use(define);

const headers = new Headers();
if (job.token) headers.set("cookie", `Authentication=${job.token}`);
const response = await app.handle(new Request(job.url, { headers }));

process.stdout.write(JSON.stringify({ status: response.status, body: await response.text() }));
process.exit(0);

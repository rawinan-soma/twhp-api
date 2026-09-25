import { Elysia, t } from "elysia";
import type { App } from "..";
import { ReadinessSchema } from "../schema/health";
import { type HealthService, healthService } from "../service/health";

const HEALTH_PATHS = new Set([
  "/twhp/api/health",
  "/twhp/api/health/live",
  "/twhp/api/health/ready",
]);

/** The three health routes, all excluded from request and error logs. */
export const isHealthPath = (pathname: string) => HEALTH_PATHS.has(pathname);

const live = () => "Ready to work!!";
const liveResponse = t.String({ default: "Ready to work!!" });

// A factory, not the usual `(app) => app.group(...)`, so tests can inject a service built from fakes.
export const createHealthRoutes = (health: HealthService) =>
  new Elysia()
    .get("/health", live, {
      response: liveResponse,
      detail: {
        summary: "Liveness (alias of /health/live)",
        description: "Kept for existing callers. Checks no dependencies.",
      },
    })
    .get("/health/live", live, {
      response: liveResponse,
      detail: {
        summary: "Liveness",
        description:
          "200 whenever the API process is serving. Checks no dependencies; use for container healthchecks.",
      },
    })
    .get("/health/ready", () => health.getReadiness(), {
      response: { 200: ReadinessSchema, 503: ReadinessSchema },
      detail: {
        summary: "Readiness",
        description:
          "Checks PostgreSQL (`select 1`), Redis (`PING`) and MinIO (a signed HEAD on the bucket answered by S3, 200 or 404 — a bucket not created yet still counts as up) in parallel, each with a 1 s timeout. 200 when all are up, otherwise 503 with the failing ones marked `down`.",
      },
    });

export default (app: App) => app.use(createHealthRoutes(healthService));
